import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const readme = readFileSync('README.md', 'utf8');

test('package exposes a single safe project verification command', () => {
  const verify = packageJson.scripts.verify;

  assert.equal(typeof verify, 'string');
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
