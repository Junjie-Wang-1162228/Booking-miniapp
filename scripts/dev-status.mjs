import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { findNextMissingDevice, verifyScreenshotMatrix } from './miniapp-visual-qa.mjs';

const DEFAULT_API_HEALTH_URL = 'http://localhost:4000/health';
const DEFAULT_ADMIN_PORTS = [5173, 5174, 5175];
const MINIAPP_DIST_PATH = 'apps/miniapp/dist';
const MINIAPP_REQUIRED_DIST_FILES = ['app.js', 'app.json', 'pages/classes/index.js'];

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

export function createDevStatusReport({ mysql, api, admin, miniapp, visualQa }) {
  const notes = [];

  if (!mysql.ok) notes.push('MySQL is not healthy. Run pnpm dev:db and wait for Docker health to become healthy.');
  if (!api.ok) notes.push('API is not reachable. Run pnpm api:dev and check http://localhost:4000/health.');
  if (!admin.ok) notes.push('管理端未找到可用预览页。Run pnpm admin:dev and check ports 5173/5174.');
  if (!miniapp.ok) notes.push('小程序 dist 或 watch 未就绪。Run pnpm miniapp:dev, then open apps/miniapp/dist in WeChat DevTools.');

  return {
    mode: 'dev-status',
    ok: mysql.ok && api.ok && admin.ok && miniapp.ok,
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
    notes
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
  return {
    ok: running && healthy,
    service: mysql.service,
    name: mysql.name,
    state: mysql.state,
    health: mysql.health,
    status: mysql.status
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
  const result = runCommand('ps', ['-axo', 'pid,command']);
  return result.ok ? summarizePreviewProcesses(result.stdout) : { apiWatch: false, adminVite: false, miniappWatch: false };
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
  const processes = readProcessSummary();
  const [api, admin] = await Promise.all([checkApi(), checkAdmin(readAdminPorts())]);
  const visualReport = verifyScreenshotMatrix();
  const report = createDevStatusReport({
    mysql: checkMysql(),
    api,
    admin,
    miniapp: checkMiniappDist(processes),
    visualQa: {
      complete: visualReport.complete,
      existingCount: visualReport.existingCount,
      requiredCount: visualReport.requiredCount,
      next: findNextMissingDevice(visualReport)
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
