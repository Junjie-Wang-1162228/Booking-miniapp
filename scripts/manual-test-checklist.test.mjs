import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manualChecklistPath = 'docs/manual-test-checklist.md';
const packagePath = 'package.json';

function read(path) {
  return readFileSync(path, 'utf8');
}

test('manual test checklist uses strict local readiness before real WeChat checks', () => {
  const source = read(manualChecklistPath);

  assert.match(source, /pnpm dev:status:strict/);
  assert.match(source, /数据库端口漂移/);
});

test('manual test checklist opens the built miniapp dist and guards visual capture', () => {
  const source = read(manualChecklistPath);

  assert.match(source, /apps\/miniapp\/dist/);
  assert.doesNotMatch(source, /Open miniapp build in WeChat DevTools from `apps\/miniapp`/);
  assert.match(source, /MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture/);
  assert.match(source, /pnpm miniapp:visual-qa:check/);
});

test('package exposes the manual test checklist guard', () => {
  const packageJson = JSON.parse(read(packagePath));

  assert.equal(packageJson.scripts['ops:manual-test-checklist:test'], 'node --test scripts/manual-test-checklist.test.mjs');
});
