import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarizePreviewProcesses } from './dev-status.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const previewServices = [
  { id: 'api', script: 'api:dev', processKey: 'apiWatch' },
  { id: 'admin', script: 'admin:dev', processKey: 'adminVite' },
  { id: 'miniapp', script: 'miniapp:dev', processKey: 'miniappWatch' }
];

export function createManagedPaths(root = PROJECT_ROOT) {
  const baseDir = path.join(root, '.dev', 'preview');
  return {
    baseDir,
    logDir: path.join(baseDir, 'logs'),
    pidDir: path.join(baseDir, 'pids')
  };
}

export function createStartPlan(processes) {
  return previewServices.map((service) => ({
    service,
    action: processes[service.processKey] ? 'skip' : 'start'
  }));
}

function readProcessSummary() {
  const output = execFileSync('ps', ['-axo', 'pid,ppid,command'], { encoding: 'utf8' });
  return summarizePreviewProcesses(output);
}

function ensureManagedDirs(paths) {
  mkdirSync(paths.logDir, { recursive: true });
  mkdirSync(paths.pidDir, { recursive: true });
}

function servicePaths(service, paths) {
  return {
    logPath: path.join(paths.logDir, `${service.id}.log`),
    pidPath: path.join(paths.pidDir, `${service.id}.pid`)
  };
}

function startService(service, paths) {
  const { logPath, pidPath } = servicePaths(service, paths);
  const logFd = openSync(logPath, 'a');
  const child = spawn('pnpm', [service.script], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: process.env
  });

  child.unref();
  closeSync(logFd);
  writeFileSync(pidPath, `${child.pid}\n`);
  return { service: service.id, pid: child.pid, logPath, pidPath };
}

function startPreview() {
  const paths = createManagedPaths();
  ensureManagedDirs(paths);
  const plan = createStartPlan(readProcessSummary());
  const started = [];
  const skipped = [];

  for (const item of plan) {
    if (item.action === 'skip') {
      skipped.push(item.service.id);
      continue;
    }

    started.push(startService(item.service, paths));
  }

  return { started, skipped, paths };
}

function stopPreview() {
  const paths = createManagedPaths();
  const stopped = [];
  const missing = [];

  for (const service of previewServices) {
    const { pidPath } = servicePaths(service, paths);
    if (!existsSync(pidPath)) {
      missing.push(service.id);
      continue;
    }

    const pid = Number(readFileSync(pidPath, 'utf8').trim());
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch (error) {
        if (error?.code !== 'ESRCH') throw error;
      }
    }

    rmSync(pidPath, { force: true });
    stopped.push(service.id);
  }

  return { stopped, missing, paths };
}

function printResult(result) {
  console.log(JSON.stringify(result, null, 2));
}

function main() {
  const command = process.argv[2] || 'start';
  if (command === 'start') {
    printResult(startPreview());
    return;
  }

  if (command === 'stop') {
    printResult(stopPreview());
    return;
  }

  throw new Error(`Unknown dev preview command: ${command}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
