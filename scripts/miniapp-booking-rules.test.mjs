import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const bookingsSourcePath = 'apps/miniapp/src/pages/bookings/index.tsx';
const bookingsStylePath = 'apps/miniapp/src/pages/bookings/index.scss';

test('cancel booking modal explains the cancellation rules before confirmation', () => {
  const source = readFileSync(bookingsSourcePath, 'utf8');

  assert.match(source, /cancelBookingRuleText/);
  assert.match(source, /开课前 2 小时/);
  assert.match(source, /截止后请联系拳馆工作人员/);
  assert.match(source, /停止该预约的待发送提醒/);
  assert.match(source, /Taro\.showModal\(\{[\s\S]*title: '取消预约？'[\s\S]*cancelText: '再想想'/);
});

test('cancel button keeps a touch-friendly hit target', () => {
  const style = readFileSync(bookingsStylePath, 'utf8');

  assert.match(style, /\.ghost-action/);
  assert.match(style, /min-height:\s*72px/);
});
