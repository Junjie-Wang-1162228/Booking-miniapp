import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const statusLabelsPath = 'apps/miniapp/src/status-labels.ts';
const bookingsSourcePath = 'apps/miniapp/src/pages/bookings/index.tsx';

test('miniapp status label helpers cover class, booking, and attendance enums in Chinese', () => {
  const source = readFileSync(statusLabelsPath, 'utf8');

  assert.match(source, /ClassStatus/);
  assert.match(source, /classStatusLabel/);
  assert.match(source, /SCHEDULED[\s\S]*可预约/);
  assert.match(source, /CANCELED[\s\S]*已取消/);
  assert.match(source, /BOOKED[\s\S]*已预约/);
  assert.match(source, /PENDING[\s\S]*待上课/);
  assert.match(source, /ATTENDED[\s\S]*已到课消课/);
});

test('bookings page renders status labels instead of raw English enum values', () => {
  const source = readFileSync(bookingsSourcePath, 'utf8');

  assert.match(source, /bookingStatusLabel\(item\.status\)/);
  assert.match(source, /attendanceStatusLabel\(item\.attendanceStatus\)/);
  assert.doesNotMatch(source, /\{item\.status\}/);
  assert.doesNotMatch(source, /\{item\.attendanceStatus\}/);
});
