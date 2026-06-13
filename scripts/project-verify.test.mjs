import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const readme = readFileSync('README.md', 'utf8');
const verifyWorkflowPath = '.github/workflows/verify.yml';

test('package exposes a single safe project verification command', () => {
  const verify = packageJson.scripts.verify;

  assert.equal(typeof verify, 'string');
  assert.match(verify, /^pnpm --filter @booking\/api prisma:generate && pnpm lint/);
  assert.match(verify, /pnpm lint/);
  assert.match(verify, /pnpm --filter @booking\/api test:e2e/);
  assert.match(verify, /node --test scripts\/\*\.test\.mjs/);
  assert.match(verify, /pnpm security:check/);
  assert.match(verify, /pnpm build/);
  assert.doesNotMatch(verify, /miniapp:visual-qa:capture|miniapp:visual-qa:check/);
});

test('README documents pnpm verify as the pre-push quality gate', () => {
  assert.match(readme, /pnpm verify/);
  assert.match(readme, /统一质量门禁/);
  assert.match(readme, /不打开微信开发者工具/);
});

test('GitHub Actions verify workflow runs the same safe project gate', () => {
  assert.equal(existsSync(verifyWorkflowPath), true);
  const workflow = readFileSync(verifyWorkflowPath, 'utf8');

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24:\s*true/);
  assert.match(workflow, /actions\/checkout@v4/);
  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /corepack enable/);
  assert.match(workflow, /corepack prepare pnpm@9\.15\.9 --activate/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm verify/);
  assert.match(workflow, /mysql:8\.4/);
  assert.match(workflow, /3307:3306/);
  assert.match(workflow, /MYSQL_ROOT_PASSWORD:\s*booking_root/);
  assert.doesNotMatch(workflow, /miniapp:visual-qa:capture|miniapp:visual-qa:check/);
});
