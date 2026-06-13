import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSourcePath = 'apps/admin/src/App.tsx';
const typesSourcePath = 'apps/admin/src/types.ts';
const e2eSourcePath = 'apps/api/test/app.e2e-spec.ts';

test('admin notification list distinguishes class reschedule notification jobs', () => {
  const source = readFileSync(appSourcePath, 'utf8');
  const typesSource = readFileSync(typesSourcePath, 'utf8');

  assert.match(
    typesSource,
    /NotificationJobType = 'BOOKING_CREATED' \| 'CLASS_REMINDER' \| 'CLASS_CANCELED' \| 'CLASS_RESCHEDULED'/
  );
  assert.match(source, /CLASS_RESCHEDULED[\s\S]*课程改期通知/);
  assert.match(source, /notificationTypeLabel\(record\.type\)/);
});

test('api e2e covers class reschedule notification tasks and reminder movement', () => {
  const e2eSource = readFileSync(e2eSourcePath, 'utf8');

  assert.match(e2eSource, /creates class reschedule notification jobs and moves pending reminders/);
  assert.match(e2eSource, /type: 'CLASS_RESCHEDULED'/);
  assert.match(e2eSource, /rescheduleNotificationJobCount/);
  assert.match(e2eSource, /reminderJobRescheduledCount/);
});
