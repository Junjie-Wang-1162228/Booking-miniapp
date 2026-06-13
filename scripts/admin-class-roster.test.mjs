import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSourcePath = 'apps/admin/src/App.tsx';
const stylePath = 'apps/admin/src/styles.css';

test('admin dashboard exposes a today roster grouped by class', () => {
  const source = readFileSync(appSourcePath, 'utf8');

  assert.match(source, /type ClassRosterGroup/);
  assert.match(source, /function groupBookingsByClass/);
  assert.match(source, /todayRosterGroups/);
  assert.match(source, /applyTodayBookingRoster/);
  assert.match(source, /今日课程/);
  assert.match(source, /class-roster-list/);
  assert.match(source, /class-roster-card/);
  assert.match(source, /预约名单/);
  assert.match(source, /查看名单/);
  assert.match(source, /setExpandedRosterClassIds/);
});

test('admin class roster supports individual deduction from each class roster', () => {
  const source = readFileSync(appSourcePath, 'utf8');

  assert.match(source, /roster-member-list/);
  assert.match(source, /roster-member-item/);
  assert.match(source, /setDeductingBooking\(booking\)/);
  assert.match(source, /会扣减会员 1 节课时/);
  assert.match(source, /确认前请核对会员和课程/);
});

test('admin class roster styles are responsive and scan-friendly', () => {
  const style = readFileSync(stylePath, 'utf8');

  assert.match(style, /\.class-roster-list/);
  assert.match(style, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(18rem,\s*1fr\)\)/);
  assert.match(style, /\.class-roster-card/);
  assert.match(style, /\.roster-member-item/);
  assert.match(style, /overflow-wrap:\s*anywhere/);
  assert.match(style, /min-height:\s*2\.75rem/);
});
