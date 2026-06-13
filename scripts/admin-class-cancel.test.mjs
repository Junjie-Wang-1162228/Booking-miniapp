import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSourcePath = 'apps/admin/src/App.tsx';
const apiSourcePath = 'apps/admin/src/api.ts';
const typesSourcePath = 'apps/admin/src/types.ts';
const e2eSourcePath = 'apps/api/test/app.e2e-spec.ts';

test('admin class cancel confirmation shows impacted members before canceling', () => {
  const source = readFileSync(appSourcePath, 'utf8');

  assert.match(source, /取消这节课？/);
  assert.match(source, /record\.bookedCount/);
  assert.match(source, /影响\s*\{record\.bookedCount\}\s*位已预约会员/);
  assert.match(source, /生成课程取消通知任务/);
});

test('admin notification list distinguishes class cancellation notification jobs', () => {
  const source = readFileSync(appSourcePath, 'utf8');
  const typesSource = readFileSync(typesSourcePath, 'utf8');

  assert.match(
    typesSource,
    /NotificationJobType = 'BOOKING_CREATED' \| 'CLASS_REMINDER' \| 'CLASS_CANCELED' \| 'CLASS_RESCHEDULED'/
  );
  assert.match(source, /notificationTypeLabel/);
  assert.match(source, /CLASS_CANCELED[\s\S]*课程取消通知/);
  assert.match(source, /notificationTypeLabel\(record\.type\)/);
});

test('admin class cancel API helper and e2e cover cancellation notification tasks', () => {
  const apiSource = readFileSync(apiSourcePath, 'utf8');
  const e2eSource = readFileSync(e2eSourcePath, 'utf8');

  assert.match(apiSource, /cancelClass/);
  assert.match(apiSource, /\/admin\/classes\/\$\{id\}\/cancel/);
  assert.match(e2eSource, /creates class cancellation notification jobs/);
  assert.match(e2eSource, /type: 'CLASS_CANCELED'/);
  assert.match(e2eSource, /affectedBookingCount/);
});
