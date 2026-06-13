import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSourcePath = 'apps/admin/src/App.tsx';

test('admin dashboard can export the current booking roster as CSV', () => {
  const source = readFileSync(appSourcePath, 'utf8');

  assert.match(source, /function escapeCsvCell/);
  assert.match(source, /function statusText/);
  assert.match(source, /function createBookingRosterCsv/);
  assert.match(source, /function downloadBookingRosterCsv/);
  assert.match(source, /handleExportBookingRoster/);
  assert.match(source, /导出名单/);
  assert.match(source, /new Blob/);
  assert.match(source, /URL\.createObjectURL/);
  assert.match(source, /booking-roster-/);
});

test('booking CSV export includes business fields and avoids raw enum values', () => {
  const source = readFileSync(appSourcePath, 'utf8');

  assert.match(source, /课程/);
  assert.match(source, /上课时间/);
  assert.match(source, /门店/);
  assert.match(source, /会员/);
  assert.match(source, /手机号/);
  assert.match(source, /预约状态/);
  assert.match(source, /到课状态/);
  assert.match(source, /statusText\(booking\.status\)/);
  assert.match(source, /statusText\(booking\.attendanceStatus\)/);
});
