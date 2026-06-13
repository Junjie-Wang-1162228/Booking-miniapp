import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const apiSource = readFileSync('apps/miniapp/src/api.ts', 'utf8');

test('miniapp API requests use an explicit timeout for weak network handling', () => {
  assert.match(apiSource, /REQUEST_TIMEOUT_MS/);
  assert.match(apiSource, /timeout:\s*REQUEST_TIMEOUT_MS/);
});

test('miniapp normalizes timeout and network failures into user-readable Chinese copy', () => {
  assert.match(apiSource, /normalizeRequestError/);
  assert.match(apiSource, /errMsg/);
  assert.match(apiSource, /请求超时，请检查网络后重试/);
  assert.match(apiSource, /网络连接不稳定，请稍后重试/);
  assert.match(apiSource, /formatApiError[\s\S]*normalizeRequestError/);
});
