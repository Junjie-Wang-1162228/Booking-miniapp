import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSourcePath = 'apps/admin/src/App.tsx';
const apiSourcePath = 'apps/admin/src/api.ts';
const typesSourcePath = 'apps/admin/src/types.ts';
const e2eSourcePath = 'apps/api/test/app.e2e-spec.ts';

test('admin API exposes notification failure records and retry helpers', () => {
  const apiSource = readFileSync(apiSourcePath, 'utf8');
  const typesSource = readFileSync(typesSourcePath, 'utf8');

  assert.match(typesSource, /NotificationStatus = 'PENDING' \| 'SENT' \| 'FAILED' \| 'SKIPPED'/);
  assert.match(typesSource, /AdminNotificationJob/);
  assert.match(typesSource, /latestLog/);
  assert.match(apiSource, /getAdminNotifications/);
  assert.match(apiSource, /\/admin\/notifications/);
  assert.match(apiSource, /status\?: NotificationStatus/);
  assert.match(apiSource, /retryNotification/);
  assert.match(apiSource, /\/admin\/notifications\/\$\{id\}\/retry/);
});

test('admin notification tab can filter failures, show latest log, and retry failed jobs', () => {
  const source = readFileSync(appSourcePath, 'utf8');

  assert.match(source, /key: 'notifications'/);
  assert.match(source, /label: '通知任务'/);
  assert.match(source, /发送失败/);
  assert.match(source, /value: 'FAILED'/);
  assert.match(source, /notificationStatusTag\(record\.status\)/);
  assert.match(source, /record\.latestLog/);
  assert.match(source, /record\.latestLog\.message/);
  assert.match(source, /handleRetryNotification/);
  assert.match(source, /record\.status !== 'FAILED' && record\.status !== 'SKIPPED'/);
});

test('api e2e covers notification failure visibility and branch scoping', () => {
  const source = readFileSync(e2eSourcePath, 'utf8');

  assert.match(source, /lets admins list notification jobs with latest logs scoped by branch/);
  assert.match(source, /east notification failed/);
  assert.match(source, /west notification failed/);
  assert.match(source, /latestLog: \{ status: 'FAILED'/);
  assert.match(source, /admin\/notifications\?branchId=/);
  assert.match(source, /expect\(managerResponse\.body\.some/);
});
