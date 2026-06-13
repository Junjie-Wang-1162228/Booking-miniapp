import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const classesSourcePath = 'apps/miniapp/src/pages/classes/index.tsx';

test('successful booking offers a direct path to my bookings', () => {
  const source = readFileSync(classesSourcePath, 'utf8');

  assert.match(source, /showBookingSuccessModal/);
  assert.match(source, /title: '预约成功'/);
  assert.match(source, /confirmText: '查看预约'/);
  assert.match(source, /cancelText: '继续约课'/);
  assert.match(source, /Taro\.switchTab\(\{\s*url: '\/pages\/bookings\/index'/);
});
