import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const e2eSpec = readFileSync('apps/api/test/app.e2e-spec.ts', 'utf8');

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

test('api e2e database safety allows the local development database', () => {
  assert.doesNotThrow(() =>
    runSafetyHelper('mysql://booking_user:booking_pass@localhost:3307/boxing_booking')
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
