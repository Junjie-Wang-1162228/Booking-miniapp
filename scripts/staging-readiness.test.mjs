import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const stagingRunbookPath = 'docs/staging-runbook.md';
const releaseChecklistPath = 'docs/release-checklist.md';
const commercialChecklistPath = 'docs/commercial-readiness-checklist.md';
const optimizationChecklistPath = 'docs/optimization-checklist.md';
const packagePath = 'package.json';

function read(path) {
  return readFileSync(path, 'utf8');
}

test('staging runbook documents environment separation and no-go gates', () => {
  assert.equal(existsSync(stagingRunbookPath), true);
  const source = read(stagingRunbookPath);

  for (const required of [
    'staging 和 production 必须分开',
    '独立数据库',
    '独立 API 域名',
    '独立管理后台域名',
    '独立小程序体验版',
    '不得使用 production AppSecret',
    '不得连接 production 数据库',
    'No-Go',
    'pnpm --filter @booking/api config:check',
    'pnpm miniapp:visual-qa'
  ]) {
    assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('release and readiness docs link the staging runbook', () => {
  const releaseSource = read(releaseChecklistPath);
  const commercialSource = read(commercialChecklistPath);
  const optimizationSource = read(optimizationChecklistPath);

  assert.match(releaseSource, /docs\/staging-runbook\.md/);
  assert.match(commercialSource, /docs\/staging-runbook\.md/);
  assert.match(optimizationSource, /docs\/staging-runbook\.md/);
});

test('package script exposes the staging readiness guard', () => {
  const packageJson = JSON.parse(read(packagePath));

  assert.equal(packageJson.scripts['ops:staging:test'], 'node --test scripts/staging-readiness.test.mjs');
});
