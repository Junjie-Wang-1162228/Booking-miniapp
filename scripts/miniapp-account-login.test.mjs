import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const apiSource = readFileSync('apps/miniapp/src/api.ts', 'utf8');
const profileSource = readFileSync('apps/miniapp/src/pages/profile/index.tsx', 'utf8');
const profileStyle = readFileSync('apps/miniapp/src/pages/profile/index.scss', 'utf8');
const readme = readFileSync('README.md', 'utf8');
const manualChecklist = readFileSync('docs/manual-test-checklist.md', 'utf8');

test('miniapp API exposes account login and session clearing helpers', () => {
  assert.match(apiSource, /accountLogin\(username: string, password: string\)/);
  assert.match(apiSource, /\/auth\/account-login/);
  assert.match(apiSource, /clearStoredSession/);
  assert.match(apiSource, /Taro\.removeStorageSync\(TOKEN_KEY\)/);
  assert.match(apiSource, /Taro\.removeStorageSync\(BRANCH_KEY\)/);
});

test('profile page offers both WeChat authorization login and account login', () => {
  assert.match(profileSource, /accountLogin/);
  assert.match(profileSource, /wechatLogin/);
  assert.match(profileSource, /loginUsername/);
  assert.match(profileSource, /loginPassword/);
  assert.match(profileSource, /账号登录/);
  assert.match(profileSource, /微信授权登录/);
  assert.match(profileSource, /退出登录/);
  assert.doesNotMatch(profileSource, /setStorageSync\([^)]*password/i);
});

test('account login controls are touch-friendly and mobile-safe', () => {
  assert.match(profileStyle, /\.account-login-panel/);
  assert.match(profileStyle, /\.login-methods/);
  assert.match(profileStyle, /\.account-input/);
  assert.match(profileStyle, /\.logout-action/);
  assert.match(profileStyle, /min-height:\s*8[0-9]px/);
  assert.match(profileStyle, /grid-template-columns:\s*1fr/);
});

test('docs describe the MVP miniapp login accounts and WeChat member flow', () => {
  assert.match(readme, /小程序运营端账号登录/);
  assert.match(readme, /admin\/admin/);
  assert.match(readme, /test\/test/);
  assert.match(readme, /会员仍走微信授权登录和绑定码流程/);
  assert.match(manualChecklist, /小程序账户页使用 `admin` \/ `admin` 账号登录/);
  assert.match(manualChecklist, /小程序账户页使用 `test` \/ `test` 账号登录/);
  assert.match(manualChecklist, /会员微信号继续走微信授权登录和绑定码流程/);
});
