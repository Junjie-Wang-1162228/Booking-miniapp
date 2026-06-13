import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSourcePath = 'apps/admin/src/App.tsx';
const apiSourcePath = 'apps/admin/src/api.ts';
const typesSourcePath = 'apps/admin/src/types.ts';

test('admin API exposes a booking cancel helper and audit action', () => {
  const apiSource = readFileSync(apiSourcePath, 'utf8');
  const typesSource = readFileSync(typesSourcePath, 'utf8');

  assert.match(typesSource, /BOOKING_CANCEL/);
  assert.match(apiSource, /cancelAdminBooking/);
  assert.match(apiSource, /\/admin\/bookings\/\$\{id\}\/cancel/);
  assert.match(apiSource, /reason/);
});

test('admin booking list can cancel an active booking with confirmation', () => {
  const source = readFileSync(appSourcePath, 'utf8');

  assert.match(source, /cancelAdminBooking/);
  assert.match(source, /cancelingBooking/);
  assert.match(source, /cancelBookingReason/);
  assert.match(source, /confirmCancelBooking/);
  assert.match(source, /确认取消预约/);
  assert.match(source, /取消预约/);
  assert.match(source, /释放名额/);
  assert.match(source, /不会扣减课时/);
  assert.match(source, /待发送提醒/);
  assert.match(source, /status !== 'BOOKED'/);
  assert.match(source, /Boolean\(record\.deductionId\)/);
});
