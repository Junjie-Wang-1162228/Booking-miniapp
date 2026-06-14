import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createManualTestReadiness } from './manual-test-readiness.mjs';

const packagePath = 'package.json';
const readmePath = 'README.md';
const optimizationChecklistPath = 'docs/optimization-checklist.md';

function read(path) {
  return readFileSync(path, 'utf8');
}

function createDevStatus(overrides = {}) {
  return {
    mode: 'dev-status',
    ok: true,
    progress: {
      preview: { completed: 4, total: 4, percent: 100 },
      visualQa: { completed: 3, total: 12, percent: 25 },
      manualTest: { completed: 0, total: 41, percent: 0 },
      strict: { enabled: true, passed: true, failures: [] },
      nextAction:
        'Capture iPhone SE screenshots for classes, bookings, profile. After selecting that simulator in WeChat DevTools, run MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next.'
    },
    strict: { enabled: true, passed: true, failures: [] },
    visualQa: {
      complete: false,
      existingCount: 3,
      requiredCount: 12,
      captureCommand: 'MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next'
    },
    manualTest: {
      mode: 'manual-test-status',
      complete: false,
      completed: 0,
      total: 41,
      percent: 0,
      next: {
        section: '1. 本地环境准备',
        line: 5,
        text: '启动 MySQL：`pnpm dev:db`。'
      }
    },
    ...overrides
  };
}

test('manual test readiness allows starting manual WeChat checks when strict local preview is healthy', () => {
  const readiness = createManualTestReadiness(createDevStatus());

  assert.equal(readiness.mode, 'manual-test-readiness');
  assert.equal(readiness.opensDevTools, false);
  assert.equal(readiness.readyForManualWechat, true);
  assert.deepEqual(readiness.progress.preview, { completed: 4, total: 4, percent: 100 });
  assert.deepEqual(readiness.progress.visualQa, { completed: 3, total: 12, percent: 25 });
  assert.deepEqual(readiness.progress.manualTest, { completed: 0, total: 41, percent: 0 });
  assert.deepEqual(
    readiness.gates.map((gate) => ({ id: gate.id, ok: gate.ok, requiredFor: gate.requiredFor })),
    [
      { id: 'local-preview', ok: true, requiredFor: 'manual-start' },
      { id: 'strict-dev-status', ok: true, requiredFor: 'manual-start' },
      { id: 'visual-qa-matrix', ok: false, requiredFor: 'release' },
      { id: 'manual-checklist', ok: false, requiredFor: 'release' }
    ]
  );
  assert.match(readiness.nextAction, /Capture iPhone SE screenshots/);
  assert.equal(readiness.captureCommand, 'MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next');
});

test('manual test readiness blocks manual start when strict local preview is not healthy', () => {
  const readiness = createManualTestReadiness(
    createDevStatus({
      ok: false,
      progress: {
        preview: { completed: 2, total: 4, percent: 50 },
        visualQa: { completed: 3, total: 12, percent: 25 },
        manualTest: { completed: 0, total: 41, percent: 0 },
        strict: { enabled: true, passed: false, failures: ['API preview is not ready.'] },
        nextAction: 'Run pnpm dev:preview:start to restore local preview services: API, miniapp.'
      },
      strict: { enabled: true, passed: false, failures: ['API preview is not ready.'] }
    })
  );

  assert.equal(readiness.readyForManualWechat, false);
  assert.match(readiness.nextAction, /pnpm dev:preview:start/);
  assert.equal(readiness.gates.find((gate) => gate.id === 'local-preview')?.ok, false);
  assert.equal(readiness.gates.find((gate) => gate.id === 'strict-dev-status')?.ok, false);
});

test('package exposes manual test readiness command', () => {
  const packageJson = JSON.parse(read(packagePath));

  assert.equal(packageJson.scripts['ops:manual-test:readiness'], 'node scripts/manual-test-readiness.mjs');
});

test('docs expose manual test readiness command', () => {
  const readme = read(readmePath);
  const optimizationChecklist = read(optimizationChecklistPath);

  assert.match(readme, /pnpm ops:manual-test:readiness/);
  assert.match(readme, /manual-test-readiness/);
  assert.match(optimizationChecklist, /pnpm ops:manual-test:readiness/);
});
