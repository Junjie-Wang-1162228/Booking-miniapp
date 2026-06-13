import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_E2E_DATABASE_URL = 'mysql://booking_user:booking_pass@localhost:3307/boxing_booking_e2e';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function apiRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function requireSafeIdentifier(value: string, label: string) {
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(`${label} must contain only letters, numbers, and underscores`);
  }

  return value;
}

function resolveDatabaseUrl() {
  return process.env.E2E_DATABASE_URL || DEFAULT_E2E_DATABASE_URL;
}

function parseDatabaseTarget(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  return {
    url: databaseUrl,
    host: parsed.hostname,
    database: requireSafeIdentifier(decodeURIComponent(parsed.pathname.replace(/^\//, '')), 'E2E database name'),
    user: requireSafeIdentifier(decodeURIComponent(parsed.username), 'E2E database user')
  };
}

function createDatabaseSql(database: string, user: string) {
  const grantDatabasePattern = database.replace(/([_%\\])/g, '\\$1');
  return [
    `CREATE DATABASE IF NOT EXISTS \`${database}\`;`,
    `GRANT ALL PRIVILEGES ON \`${grantDatabasePattern}\`.* TO '${user}'@'%';`,
    'FLUSH PRIVILEGES;'
  ].join(' ');
}

function findContainerPublishingPort(port: string) {
  const output = execFileSync('docker', ['ps', '--filter', `publish=${port}`, '--format', '{{.ID}}'], {
    encoding: 'utf8'
  });
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)[0];
}

function createLocalDatabase(target: ReturnType<typeof parseDatabaseTarget>) {
  if (!LOCAL_HOSTS.has(target.host)) {
    throw new Error('E2E database auto-create only supports local MySQL. Set E2E_SKIP_DATABASE_CREATE=true for CI-managed databases.');
  }

  const port = new URL(target.url).port || '3306';
  const containerId = findContainerPublishingPort(port);
  if (!containerId) {
    throw new Error(`No Docker MySQL container is publishing local port ${port}. Start the local database or set E2E_SKIP_DATABASE_CREATE=true.`);
  }

  execFileSync(
    'docker',
    [
      'exec',
      '-e',
      `MYSQL_PWD=${process.env.E2E_MYSQL_ROOT_PASSWORD || 'booking_root'}`,
      containerId,
      'mysql',
      '-uroot',
      '-e',
      createDatabaseSql(target.database, target.user)
    ],
    { cwd: apiRoot(), stdio: 'inherit' }
  );
}

function migrateDatabase(databaseUrl: string) {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: apiRoot(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit'
  });
}

async function main() {
  const target = parseDatabaseTarget(resolveDatabaseUrl());

  if (process.env.E2E_SKIP_DATABASE_CREATE !== 'true') {
    createLocalDatabase(target);
  }

  migrateDatabase(target.url);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
