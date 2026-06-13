import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createManagedPaths, createStartPlan, previewServices } from './dev-preview.mjs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const gitignore = readFileSync('.gitignore', 'utf8');
const scriptSource = readFileSync('scripts/dev-preview.mjs', 'utf8');
const readme = readFileSync('README.md', 'utf8');
const manualChecklist = readFileSync('docs/manual-test-checklist.md', 'utf8');

test('package exposes detached local preview lifecycle commands', () => {
  assert.equal(packageJson.scripts['dev:preview:start'], 'node scripts/dev-preview.mjs start');
  assert.equal(packageJson.scripts['dev:preview:stop'], 'node scripts/dev-preview.mjs stop');
  assert.equal(packageJson.scripts['dev:preview:status'], 'pnpm dev:status:strict');
});

test('managed preview files stay under an ignored local directory', () => {
  const paths = createManagedPaths('/repo');

  assert.equal(paths.baseDir, '/repo/.dev/preview');
  assert.equal(paths.logDir, '/repo/.dev/preview/logs');
  assert.equal(paths.pidDir, '/repo/.dev/preview/pids');
  assert.match(gitignore, /^\.dev$/m);
});

test('start plan only launches preview services that are not already running', () => {
  const plan = createStartPlan({
    apiWatch: true,
    adminVite: false,
    miniappWatch: false
  });

  assert.deepEqual(
    plan.map((item) => ({ id: item.service.id, action: item.action, script: item.service.script })),
    [
      { id: 'api', action: 'skip', script: 'api:dev' },
      { id: 'admin', action: 'start', script: 'admin:dev' },
      { id: 'miniapp', action: 'start', script: 'miniapp:dev' }
    ]
  );
});

test('preview service commands match the user-facing dev scripts', () => {
  assert.deepEqual(
    previewServices.map((service) => ({ id: service.id, script: service.script, processKey: service.processKey })),
    [
      { id: 'api', script: 'api:dev', processKey: 'apiWatch' },
      { id: 'admin', script: 'admin:dev', processKey: 'adminVite' },
      { id: 'miniapp', script: 'miniapp:dev', processKey: 'miniappWatch' }
    ]
  );
});

test('preview launcher starts pnpm scripts detached and writes pid files', () => {
  assert.match(scriptSource, /detached:\s*true/);
  assert.match(scriptSource, /child\.unref\(\)/);
  assert.match(scriptSource, /writeFileSync\(.*pidPath/);
  assert.match(scriptSource, /spawn\('pnpm'/);
});

test('docs explain the detached local preview workflow', () => {
  assert.match(readme, /pnpm dev:preview:start/);
  assert.match(readme, /pnpm dev:preview:status/);
  assert.match(readme, /pnpm dev:preview:stop/);
  assert.match(readme, /\.dev\/preview/);
  assert.match(manualChecklist, /pnpm dev:preview:start/);
});
