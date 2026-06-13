import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const profileSourcePath = 'apps/miniapp/src/pages/profile/index.tsx';
const profileStylePath = 'apps/miniapp/src/pages/profile/index.scss';

test('profile page exposes privacy policy and booking rules entries', () => {
  const source = readFileSync(profileSourcePath, 'utf8');

  assert.match(source, /openPrivacyPolicy/);
  assert.match(source, /openBookingRules/);
  assert.match(source, /隐私政策/);
  assert.match(source, /约课规则/);
  assert.match(source, /Taro\.showModal\(\{[\s\S]*title: '隐私政策'/);
  assert.match(source, /Taro\.showModal\(\{[\s\S]*title: '约课规则'/);
});

test('booking rules explain branch-scoped lessons and no-show handling', () => {
  const source = readFileSync(profileSourcePath, 'utf8');

  assert.match(source, /课时按当前门店独立计算/);
  assert.match(source, /暂不支持跨门店通用课包/);
  assert.match(source, /截止后|爽约/);
  assert.match(source, /管理员确认消课/);
  assert.match(source, /误扣|课时调整/);
});

test('profile page exposes a support contact entry for member questions', () => {
  const source = readFileSync(profileSourcePath, 'utf8');

  assert.match(source, /contactSupport/);
  assert.match(source, /联系客服/);
  assert.match(source, /预约问题、取消异常、课时疑问/);
  assert.match(source, /selectedBranch\?\.phone/);
  assert.match(source, /Taro\.makePhoneCall/);
  assert.match(source, /Taro\.showModal\(\{[\s\S]*title: '联系客服'/);
  assert.match(source, /runLocked\('contact-support'/);
});

test('profile compliance entries have dedicated touch-friendly styles', () => {
  const style = readFileSync(profileStylePath, 'utf8');

  assert.match(style, /\.compliance-list/);
  assert.match(style, /\.compliance-action/);
  assert.match(style, /min-height:\s*84px/);
});
