import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appConfig = readFileSync('apps/miniapp/src/app.config.ts', 'utf8');
const apiSource = readFileSync('apps/miniapp/src/api.ts', 'utf8');
const typesSource = readFileSync('apps/miniapp/src/types.ts', 'utf8');
const profileSource = readFileSync('apps/miniapp/src/pages/profile/index.tsx', 'utf8');
const profileStyle = readFileSync('apps/miniapp/src/pages/profile/index.scss', 'utf8');
const opsSource = readFileSync('apps/miniapp/src/pages/ops/index.tsx', 'utf8');
const opsStyle = readFileSync('apps/miniapp/src/pages/ops/index.scss', 'utf8');

test('miniapp registers a non-tab ops page for mobile operations', () => {
  assert.match(appConfig, /pages\/ops\/index/);
  assert.doesNotMatch(appConfig, /tabBar:[\s\S]*pages\/ops\/index/);
  assert.match(opsSource, /运营管理/);
  assert.match(opsStyle, /\.ops-page/);
});

test('profile page exposes ops entry only for admin users', () => {
  assert.match(profileSource, /canOpenOps/);
  assert.match(profileSource, /user\?\.role === 'ADMIN'/);
  assert.match(profileSource, /\/pages\/ops\/index/);
  assert.match(profileSource, /运营管理/);
  assert.match(profileStyle, /\.ops-entry/);
});

test('miniapp API exposes admin operations used by the ops MVP', () => {
  for (const name of [
    'getAdminDailyMetrics',
    'getAdminClasses',
    'createAdminClass',
    'updateAdminClass',
    'cancelAdminClass',
    'getAdminBookings',
    'deductAdminBooking',
    'cancelAdminBooking',
    'getAdminMembers',
    'bindAdminMemberWechat'
  ]) {
    assert.match(apiSource, new RegExp(`function ${name}`));
  }

  assert.match(typesSource, /export type AdminClass/);
  assert.match(typesSource, /export type AdminBooking/);
  assert.match(typesSource, /export type AdminMember/);
  assert.match(typesSource, /export type StaffRole/);
});

test('ops page covers the first mobile operations workflow', () => {
  for (const copy of ['今日运营', '课程管理', '预约名单', '会员绑定', '创建课程', '消课', '取消课程']) {
    assert.match(opsSource, new RegExp(copy));
  }

  assert.match(opsSource, /Taro\.showModal/);
  assert.match(opsSource, /deductAdminBooking/);
  assert.match(opsSource, /bindAdminMemberWechat/);
  assert.match(opsStyle, /\.ops-action/);
  assert.match(opsStyle, /min-height:\s*72px/);
});
