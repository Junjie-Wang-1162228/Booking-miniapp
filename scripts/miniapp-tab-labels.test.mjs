import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appConfigPath = 'apps/miniapp/src/app.config.ts';

function readTabLabels() {
  const source = readFileSync(appConfigPath, 'utf8');
  return [...source.matchAll(/text:\s*'([^']+)'/g)].map((match) => match[1]);
}

test('miniapp tab labels are explicit and not ambiguous', () => {
  assert.deepEqual(readTabLabels(), ['约课', '预约', '账户']);
});
