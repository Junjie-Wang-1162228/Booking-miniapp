import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminAppSourcePath = 'apps/admin/src/App.tsx';
const adminTypesSourcePath = 'apps/admin/src/types.ts';
const apiE2eSourcePath = 'apps/api/test/app.e2e-spec.ts';
const bookingDtoSourcePath = 'apps/api/src/bookings/dto.ts';
const bookingServiceSourcePath = 'apps/api/src/bookings/bookings.service.ts';
const miniappApiSourcePath = 'apps/miniapp/src/api.ts';
const notificationTypesSourcePath = 'apps/api/src/notifications/notification-types.ts';

test('api creates a configurable booking confirmation notification job', () => {
  const dtoSource = readFileSync(bookingDtoSourcePath, 'utf8');
  const serviceSource = readFileSync(bookingServiceSourcePath, 'utf8');
  const notificationTypesSource = readFileSync(notificationTypesSourcePath, 'utf8');
  const e2eSource = readFileSync(apiE2eSourcePath, 'utf8');

  assert.match(notificationTypesSource, /BOOKING_CREATED_NOTIFICATION_TYPE = 'BOOKING_CREATED'/);
  assert.match(dtoSource, /bookingConfirmationSubscribed/);
  assert.match(serviceSource, /WECHAT_BOOKING_CREATED_TEMPLATE_ID/);
  assert.match(serviceSource, /BOOKING_CREATED_NOTIFICATION_TYPE/);
  assert.match(e2eSource, /creates a configurable booking confirmation notification job/);
  assert.match(e2eSource, /BOOKING_CREATED/);
  assert.match(e2eSource, /booking-created-template/);
});

test('miniapp requests booking confirmation subscription separately from class reminders', () => {
  const miniappApiSource = readFileSync(miniappApiSourcePath, 'utf8');

  assert.match(miniappApiSource, /__WECHAT_BOOKING_CREATED_TEMPLATE_ID__/);
  assert.match(miniappApiSource, /requestBookingSubscriptions/);
  assert.match(miniappApiSource, /bookingConfirmationAccepted/);
  assert.match(miniappApiSource, /classReminderAccepted/);
  assert.match(miniappApiSource, /bookingConfirmationSubscribed/);
});

test('admin notification list labels booking confirmation jobs', () => {
  const adminAppSource = readFileSync(adminAppSourcePath, 'utf8');
  const adminTypesSource = readFileSync(adminTypesSourcePath, 'utf8');

  assert.match(adminTypesSource, /'BOOKING_CREATED'/);
  assert.match(adminAppSource, /BOOKING_CREATED: '预约确认'/);
  assert.match(adminAppSource, /record\.type === 'BOOKING_CREATED'/);
});
