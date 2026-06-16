import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const releaseChecklistPath = 'docs/release-checklist.md';
const commercialChecklistPath = 'docs/commercial-readiness-checklist.md';
const optimizationChecklistPath = 'docs/optimization-checklist.md';
const packagePath = 'package.json';

function read(path) {
  return readFileSync(path, 'utf8');
}

test('release checklist covers build, migration, deployment, smoke test, and rollback gates', () => {
  const source = read(releaseChecklistPath);

  assert.match(source, /## Go \/ No-Go/);
  assert.match(source, /## 1\. 构建与自动化检查/);
  assert.match(source, /## 4\. 迁移/);
  assert.match(source, /## 5\. 部署/);
  assert.match(source, /## 6\. 烟测/);
  assert.match(source, /## 7\. 回滚/);
  assert.match(source, /任一条件不满足时，本次发布为 No-Go/);
});

test('release checklist uses the project verification and production safety commands', () => {
  const source = read(releaseChecklistPath);

  for (const command of [
    'pnpm verify',
    'pnpm lint',
    'pnpm --filter @booking/api test:e2e',
    'pnpm --filter @booking/api build',
    'pnpm --filter @booking/admin build',
    'cross-env TARO_APP_AUTH_MODE=wechat pnpm --filter @booking/miniapp build:weapp',
    'pnpm security:check',
    'pnpm --filter @booking/api config:check',
    'pnpm db:backup -- --dry-run',
    'pnpm db:backup',
    'pnpm --filter @booking/api exec prisma migrate deploy',
    'curl -fsS https://api.example.com/health',
    'pnpm db:restore'
  ]) {
    assert.ok(source.includes(command), `Expected release checklist to include: ${command}`);
  }
});

test('release checklist explicitly avoids the DevTools-opening visual capture command in automation', () => {
  const source = read(releaseChecklistPath);

  assert.match(source, /pnpm miniapp:visual-qa` 只输出截图矩阵状态，不打开 WeChat DevTools/);
  assert.match(source, /不要在自动发布流水线里使用 `pnpm miniapp:visual-qa:capture` 或 `pnpm miniapp:visual-qa:capture-next`/);
});

test('package script exposes the release checklist guard', () => {
  const packageJson = JSON.parse(read(packagePath));

  assert.equal(packageJson.scripts['ops:release-checklist:test'], 'node --test scripts/release-checklist.test.mjs');
});

test('commercial and optimization checklists link the release checklist evidence', () => {
  const commercialSource = read(commercialChecklistPath);
  const optimizationSource = read(optimizationChecklistPath);

  assert.match(commercialSource, /- \[x\] 准备发布清单：构建、迁移、部署、烟测、回滚。/);
  assert.match(commercialSource, /docs\/release-checklist\.md/);
  assert.match(commercialSource, /pnpm ops:release-checklist:test/);
  assert.match(optimizationSource, /docs\/release-checklist\.md/);
  assert.match(optimizationSource, /pnpm ops:release-checklist:test/);
});
