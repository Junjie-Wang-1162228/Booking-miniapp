import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const e2eSpec = readFileSync('apps/api/test/app.e2e-spec.ts', 'utf8');
const apiPackage = JSON.parse(readFileSync('apps/api/package.json', 'utf8'));
const dockerMysqlInit = readFileSync('docker/mysql/init/01-shadow-database.sql', 'utf8');
const prepareE2eDatabaseScript = readFileSync('apps/api/scripts/prepare-e2e-database.ts', 'utf8');
const runE2eScript = readFileSync('apps/api/scripts/run-e2e.ts', 'utf8');
const readme = readFileSync('README.md', 'utf8');
const optimizationChecklist = readFileSync('docs/optimization-checklist.md', 'utf8');

function runSafetyHelper(databaseUrl, allowReset = '') {
  return execFileSync(
    'pnpm',
    [
      '--filter',
      '@booking/api',
      'exec',
      'tsx',
      '-e',
      [
        "import { assertE2eDatabaseIsSafeToReset } from './test/e2e-database-safety';",
        `process.env.DATABASE_URL=${JSON.stringify(databaseUrl)};`,
        `process.env.E2E_ALLOW_DATABASE_RESET=${JSON.stringify(allowReset)};`,
        'assertE2eDatabaseIsSafeToReset();'
      ].join('')
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
}

function runApiTsx(source) {
  return execFileSync('pnpm', ['--filter', '@booking/api', 'exec', 'tsx', '-e', source], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

test('api e2e database safety rejects the local development database by default', () => {
  assert.throws(
    () => runSafetyHelper('mysql://booking_user:booking_pass@localhost:3307/boxing_booking'),
    /Refusing to reset an unsafe E2E database/
  );
});

test('api e2e database safety allows the isolated local e2e database', () => {
  assert.doesNotThrow(() =>
    runSafetyHelper('mysql://booking_user:booking_pass@localhost:3307/boxing_booking_e2e')
  );
});

test('api e2e database safety rejects production-like remote databases', () => {
  assert.throws(
    () => runSafetyHelper('mysql://booking_app:secret@db.example.com:3306/boxing_booking_prod'),
    /Refusing to reset an unsafe E2E database/
  );
});

test('api e2e database safety can be explicitly overridden for controlled CI databases', () => {
  assert.doesNotThrow(() =>
    runSafetyHelper('mysql://booking_app:secret@ci-mysql:3306/boxing_booking_e2e', 'true')
  );
});

test('api e2e reset calls the database safety guard before deleting data', () => {
  assert.match(e2eSpec, /assertE2eDatabaseIsSafeToReset/);
  assert.match(
    e2eSpec,
    /async function resetTestData\(\) \{[\s\S]*assertE2eDatabaseIsSafeToReset\(\);[\s\S]*prisma\.wechatBindingTicket\.deleteMany/
  );
});

test('api e2e package script prepares and uses an isolated database', () => {
  assert.equal(apiPackage.scripts['test:e2e'], 'tsx scripts/run-e2e.ts');
});

test('api e2e package script forwards targeted jest arguments', () => {
  assert.match(runE2eScript, /const jestArgs = process\.argv\.slice\(2\)/);
  assert.match(runE2eScript, /\['exec', 'jest', '--config', '\.\/test\/jest-e2e\.json', '--runInBand', \.\.\.jestArgs\]/);
});

test('api e2e default database url follows the local development database port', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'booking-e2e-env-'));
  const envPath = path.join(tempDir, '.env');
  writeFileSync(envPath, 'DATABASE_URL="mysql://booking_user:booking_pass@localhost:3308/boxing_booking"\n');

  try {
    const output = runApiTsx(`
      import { resolveE2eDatabaseUrl } from './scripts/prepare-e2e-database';
      console.log(resolveE2eDatabaseUrl({ env: {}, envPath: ${JSON.stringify(envPath)} }));
    `);

    assert.equal(output.trim(), 'mysql://booking_user:booking_pass@localhost:3308/boxing_booking_e2e');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('docs explain that local api e2e follows the configured development mysql port', () => {
  assert.match(readme, /默认会读取 `apps\/api\/\.env` 的 `DATABASE_URL`/);
  assert.match(readme, /本地开发库是 `localhost:3308\/boxing_booking` 时，E2E 库会自动变成 `localhost:3308\/boxing_booking_e2e`/);
  assert.match(readme, /pnpm --filter @booking\/api test:e2e -- --runTestsByPath test\/app\.e2e-spec\.ts -t/);
  assert.match(optimizationChecklist, /E2E 默认从 `apps\/api\/\.env` 的 `DATABASE_URL` 推导/);
  assert.match(optimizationChecklist, /API E2E 入口支持转发 Jest 定向参数/);
});

test('local mysql init grants the isolated e2e database to the app user', () => {
  assert.match(dockerMysqlInit, /CREATE DATABASE IF NOT EXISTS boxing_booking_e2e/);
  assert.match(dockerMysqlInit, /GRANT ALL PRIVILEGES ON `boxing\\_booking\\_e2e`\.\*/);
});

test('api e2e database preparation targets the mysql container that publishes the configured port', () => {
  assert.match(prepareE2eDatabaseScript, /docker', \['ps', '--filter', `publish=\$\{port\}`/);
  assert.match(prepareE2eDatabaseScript, /findContainerPublishingPort\(port\)/);
  assert.doesNotMatch(prepareE2eDatabaseScript, /docker', \['compose'.*'exec'/s);
});
