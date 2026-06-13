import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const apiSource = readFileSync('apps/admin/src/api.ts', 'utf8');
const appSource = readFileSync('apps/admin/src/App.tsx', 'utf8');

test('admin API requests use an explicit timeout for weak network handling', () => {
  assert.match(apiSource, /REQUEST_TIMEOUT_MS/);
  assert.match(apiSource, /new AbortController\(\)/);
  assert.match(apiSource, /setTimeout\(\(\) => controller\.abort\(\), REQUEST_TIMEOUT_MS\)/);
  assert.match(apiSource, /signal:\s*controller\.signal/);
  assert.match(apiSource, /clearTimeout\(timeout\)/);
});

test('admin API normalizes timeout and network failures into Chinese copy', () => {
  assert.match(apiSource, /normalizeAdminRequestError/);
  assert.match(apiSource, /请求超时，请检查网络后重试/);
  assert.match(apiSource, /网络连接不稳定，请稍后重试/);
  assert.match(apiSource, /catch \(error\)[\s\S]*normalizeAdminRequestError/);
});

test('admin API marks 401 responses as expired login and dispatches an auth event', () => {
  assert.match(apiSource, /ADMIN_AUTH_EXPIRED_EVENT/);
  assert.match(apiSource, /class AdminApiError extends Error/);
  assert.match(apiSource, /readonly statusCode: number/);
  assert.match(apiSource, /response\.status === 401/);
  assert.match(apiSource, /登录已过期，请重新登录/);
  assert.match(apiSource, /window\.dispatchEvent\(new Event\(ADMIN_AUTH_EXPIRED_EVENT\)\)/);
});

test('admin app clears local login state when the auth-expired event fires', () => {
  assert.match(appSource, /ADMIN_AUTH_EXPIRED_EVENT/);
  assert.match(appSource, /window\.addEventListener\(ADMIN_AUTH_EXPIRED_EVENT/);
  assert.match(appSource, /window\.removeEventListener\(ADMIN_AUTH_EXPIRED_EVENT/);
  assert.match(appSource, /handleLogout\(\)/);
});

test('admin app safely handles corrupted persisted user JSON on startup', () => {
  assert.match(appSource, /function readStoredAdminUser/);
  assert.match(appSource, /JSON\.parse\(value\) as AuthUser/);
  assert.match(appSource, /catch/);
  assert.match(appSource, /localStorage\.removeItem\('admin_user'\)/);
  assert.match(appSource, /localStorage\.removeItem\('admin_token'\)/);
  assert.doesNotMatch(appSource, /useState<AuthUser \| null>\(storedUser \? \(JSON\.parse\(storedUser\) as AuthUser\) : null\)/);
});
