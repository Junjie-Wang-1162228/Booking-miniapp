import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findNextMissingDevice, verifyScreenshotMatrix } from './miniapp-visual-qa.mjs';

const DEFAULT_API_HEALTH_URL = 'http://localhost:4000/health';
const DEFAULT_ADMIN_PORTS = [5173, 5174, 5175];
const MINIAPP_DIST_PATH = 'apps/miniapp/dist';
const MINIAPP_REQUIRED_DIST_FILES = ['app.js', 'app.json', 'pages/classes/index.js'];
const API_ENV_PATH = 'apps/api/.env';
const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EMPTY_PRISMA_ENGINE_SUMMARY = { totalCount: 0, orphanCount: 0, orphanPids: [] };

export function parseDockerComposeServices(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        return items.map((item) => ({
          service: item.Service ?? item.service ?? '',
          name: item.Name ?? item.Names ?? item.name ?? '',
          state: item.State ?? item.state ?? '',
          health: item.Health ?? item.health ?? '',
          status: item.Status ?? item.status ?? ''
        }));
      } catch {
        return [];
      }
    });
}

export function parseDockerPublishedContainers(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line);
        return [
          {
            id: parsed.ID ?? parsed.Id ?? '',
            name: parsed.Names ?? parsed.Name ?? '',
            ports: parsed.Ports ?? ''
          }
        ];
      } catch {
        return [];
      }
    });
}

export function parseDatabaseUrlForStatus(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    const defaultPort = parsed.protocol === 'mysql:' ? 3306 : null;
    return {
      host: parsed.hostname,
      port: Number(parsed.port || defaultPort),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, ''))
    };
  } catch {
    return null;
  }
}

export function detectBookingAdminHtml(html) {
  return /<title>\s*拳馆约课后台\s*<\/title>/i.test(html);
}

export function summarizePreviewProcesses(output) {
  const lines = output.split('\n');
  return {
    apiWatch: lines.some((line) => /pnpm api:dev|Booking-miniapp\/apps\/api\/.*nest\.js start --watch/.test(line)),
    adminVite: lines.some((line) => /pnpm admin:dev|Booking-miniapp\/apps\/admin\/.*vite\/bin\/vite\.js/.test(line)),
    miniappWatch: lines.some((line) => /pnpm miniapp:dev|Booking-miniapp\/apps\/miniapp\/.*taro build --type weapp --watch/.test(line))
  };
}

export function summarizePrismaEngineProcesses(output, projectRoot = PROJECT_ROOT) {
  const root = path.resolve(projectRoot);
  const processes = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
      if (!match) return [];

      const pid = Number(match[1]);
      const ppid = Number(match[2]);
      const command = match[3];
      const projectEngine = command.includes(`${root}/`) && /\/\.prisma\/client\/query-engine/.test(command);
      if (!Number.isInteger(pid) || !Number.isInteger(ppid) || !projectEngine) return [];

      return [{ pid, ppid }];
    });
  const orphanPids = processes.filter((process) => process.ppid === 1).map((process) => process.pid);

  return {
    totalCount: processes.length,
    orphanCount: orphanPids.length,
    orphanPids
  };
}

export function createDevStatusReport({ strict = false, mysql, api, admin, miniapp, visualQa, diagnostics = {} }) {
  const notes = [];
  const strictFailures = [];

  if (!mysql.ok) notes.push('MySQL is not healthy. Run pnpm dev:db and wait for Docker health to become healthy.');
  if (mysql.warning) notes.push(mysql.warning);
  if (mysql.remediation) notes.push(mysql.remediation);
  if (!api.ok) notes.push('API is not reachable. Run pnpm api:dev and check http://localhost:4000/health.');
  if (!admin.ok) notes.push('管理端未找到可用预览页。Run pnpm admin:dev and check ports 5173/5174.');
  if (!miniapp.ok) notes.push('小程序 dist 或 watch 未就绪。Run pnpm miniapp:dev, then open apps/miniapp/dist in WeChat DevTools.');
  if (diagnostics.prismaEngines?.orphanCount > 0) {
    notes.push(
      `Found ${diagnostics.prismaEngines.orphanCount} orphaned Prisma query-engine process(es): PIDs ${diagnostics.prismaEngines.orphanPids.join(', ')}. These can make local API E2E flaky.`
    );
    notes.push('Confirm no test is running, then stop stale orphan PIDs manually with kill <pid>.');
  }

  if (strict && mysql.warning) {
    strictFailures.push('DATABASE_URL is served by a non-compose MySQL container.');
  }

  if (strict && diagnostics.prismaEngines?.orphanCount > 0) {
    strictFailures.push('Orphaned Prisma query-engine processes are present.');
  }

  if (strictFailures.length > 0) {
    notes.push(`Strict dev status failed: ${strictFailures.join(' ')}`);
  }

  const previewOk = mysql.ok && api.ok && admin.ok && miniapp.ok;

  return {
    mode: 'dev-status',
    ok: previewOk && strictFailures.length === 0,
    ...(strict
      ? {
          strict: {
            enabled: true,
            passed: strictFailures.length === 0,
            failures: strictFailures
          }
        }
      : {}),
    services: {
      mysql
    },
    preview: {
      api,
      admin,
      miniapp: {
        ...miniapp,
        openPath: miniapp.distPath
      }
    },
    visualQa,
    diagnostics,
    notes
  };
}

export function readOptions(argv) {
  return {
    strict: argv.includes('--strict')
  };
}

function runCommand(command, args) {
  try {
    return { ok: true, stdout: execFileSync(command, args, { encoding: 'utf8' }) };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? error.message
    };
  }
}

function readDatabaseTarget(envPath = API_ENV_PATH) {
  if (!existsSync(envPath)) return null;

  const envContent = readFileSync(envPath, 'utf8');
  const line = envContent
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.startsWith('DATABASE_URL='));
  if (!line) return null;

  const rawValue = line.slice('DATABASE_URL='.length).trim();
  const databaseUrl = rawValue.replace(/^['"]|['"]$/g, '');
  return parseDatabaseUrlForStatus(databaseUrl);
}

function containerPublishesPort(container, port) {
  return new RegExp(`(^|[\\s,])(?:0\\.0\\.0\\.0|127\\.0\\.0\\.1|\\[::\\]|\\*)?:${port}->`).test(container.ports);
}

function findPublishedContainerForDatabase(database) {
  if (!database || !LOCAL_DATABASE_HOSTS.has(database.host) || !database.port) return null;

  const result = runCommand('docker', ['ps', '--filter', `publish=${database.port}`, '--format', '{{json .}}']);
  if (!result.ok) return null;

  return parseDockerPublishedContainers(result.stdout).find((container) =>
    containerPublishesPort(container, database.port)
  );
}

function checkMysql() {
  const result = runCommand('docker', ['compose', 'ps', '--format', 'json']);
  if (!result.ok) {
    return { ok: false, service: 'mysql', status: 'docker compose ps failed', error: result.stderr };
  }

  const mysql = parseDockerComposeServices(result.stdout).find((service) => service.service === 'mysql');
  if (!mysql) {
    return { ok: false, service: 'mysql', status: 'mysql service not found' };
  }

  const running = mysql.state === 'running';
  const healthy = mysql.health === 'healthy' || (mysql.health === '' && /\bhealthy\b/i.test(mysql.status));
  const database = readDatabaseTarget();
  const publishedContainer = findPublishedContainerForDatabase(database);
  const warning =
    database && publishedContainer && mysql.name && publishedContainer.name !== mysql.name
      ? `DATABASE_URL ${database.host}:${database.port}/${database.database} is published by ${publishedContainer.name}, not compose mysql ${mysql.name}.`
      : undefined;
  const remediation = warning
    ? 'Run docker ps to confirm port ownership, then stop the conflicting container or update apps/api/.env DATABASE_URL to the intended MySQL.'
    : undefined;

  return {
    ok: running && healthy,
    service: mysql.service,
    name: mysql.name,
    state: mysql.state,
    health: mysql.health,
    status: mysql.status,
    database,
    publishedContainer,
    warning,
    remediation
  };
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (error) {
    return { ok: false, status: 0, text: '', error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkApi(url = DEFAULT_API_HEALTH_URL) {
  const response = await fetchText(url);
  if (!response.ok) {
    return { ok: false, url, status: response.status, error: response.error ?? response.text };
  }

  try {
    const body = JSON.parse(response.text);
    return { ok: body.ok === true, url, status: response.status, body };
  } catch {
    return { ok: false, url, status: response.status, error: 'health response is not JSON' };
  }
}

async function checkAdmin(ports = DEFAULT_ADMIN_PORTS) {
  const checked = [];
  for (const port of ports) {
    const url = `http://localhost:${port}`;
    const response = await fetchText(url);
    const bookingAdmin = response.ok && detectBookingAdminHtml(response.text);
    checked.push({ port, status: response.status, bookingAdmin });
    if (bookingAdmin) {
      return { ok: true, url, checkedPorts: ports, checked };
    }
  }

  return { ok: false, checkedPorts: ports, checked };
}

function readProcessSummary() {
  const result = runCommand('ps', ['-axo', 'pid,ppid,command']);
  if (!result.ok) {
    return { apiWatch: false, adminVite: false, miniappWatch: false, prismaEngines: EMPTY_PRISMA_ENGINE_SUMMARY };
  }

  return {
    ...summarizePreviewProcesses(result.stdout),
    prismaEngines: summarizePrismaEngineProcesses(result.stdout)
  };
}

function checkMiniappDist(processes, distPath = MINIAPP_DIST_PATH) {
  const files = MINIAPP_REQUIRED_DIST_FILES.map((file) => path.join(distPath, file));
  const existingFiles = files.filter((file) => existsSync(file));
  const missingFiles = files.filter((file) => !existsSync(file));
  const latestMtimeMs = existingFiles.reduce((latest, file) => Math.max(latest, statSync(file).mtimeMs), 0);

  return {
    ok: missingFiles.length === 0 && processes.miniappWatch,
    distPath,
    watchRunning: processes.miniappWatch,
    latestBuildAt: latestMtimeMs ? new Date(latestMtimeMs).toISOString() : null,
    missingFiles
  };
}

function readAdminPorts() {
  const raw = process.env.ADMIN_PREVIEW_PORTS;
  if (!raw) return DEFAULT_ADMIN_PORTS;

  const ports = raw
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  return ports.length > 0 ? ports : DEFAULT_ADMIN_PORTS;
}

async function main() {
  const options = readOptions(process.argv.slice(2));
  const processes = readProcessSummary();
  const [api, admin] = await Promise.all([checkApi(), checkAdmin(readAdminPorts())]);
  const visualReport = verifyScreenshotMatrix();
  const report = createDevStatusReport({
    strict: options.strict,
    mysql: checkMysql(),
    api,
    admin,
    miniapp: checkMiniappDist(processes),
    visualQa: {
      complete: visualReport.complete,
      existingCount: visualReport.existingCount,
      requiredCount: visualReport.requiredCount,
      next: findNextMissingDevice(visualReport)
    },
    diagnostics: {
      prismaEngines: processes.prismaEngines
    }
  });

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  });
}
