import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appControllerPath = 'apps/api/src/app.controller.ts';
const apiPackagePath = 'apps/api/package.json';
const apiMainPath = 'apps/api/src/main.ts';
const e2eSourcePath = 'apps/api/test/app.e2e-spec.ts';
const readmePath = 'README.md';

test('api exposes a lightweight health endpoint with e2e coverage', () => {
  const controllerSource = readFileSync(appControllerPath, 'utf8');
  const e2eSource = readFileSync(e2eSourcePath, 'utf8');

  assert.match(controllerSource, /@Get\('health'\)/);
  assert.match(controllerSource, /return \{ ok: true \}/);
  assert.match(e2eSource, /returns API health/);
  assert.match(e2eSource, /\.get\('\/health'\)/);
});

test('production config check is available and wired into launch guidance', () => {
  const packageJson = JSON.parse(readFileSync(apiPackagePath, 'utf8'));
  const mainSource = readFileSync(apiMainPath, 'utf8');
  const readmeSource = readFileSync(readmePath, 'utf8');
  const e2eSource = readFileSync(e2eSourcePath, 'utf8');

  assert.equal(packageJson.scripts['config:check'], 'tsx scripts/check-production-config.ts');
  assert.match(mainSource, /assertProductionDatabaseConfig\(config\)/);
  assert.match(readmeSource, /pnpm --filter @booking\/api config:check/);
  assert.match(e2eSource, /rejects unsafe production database configuration/);
});
