import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const appConfigPath = 'apps/miniapp/src/app.config.ts';
const classesSourcePath = 'apps/miniapp/src/pages/classes/index.tsx';
const detailSourcePath = 'apps/miniapp/src/pages/class-detail/index.tsx';
const detailStylePath = 'apps/miniapp/src/pages/class-detail/index.scss';

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

test('miniapp registers a class detail page and links class cards to it', () => {
  const appConfig = readFileSync(appConfigPath, 'utf8');
  const classesSource = readFileSync(classesSourcePath, 'utf8');

  assert.match(appConfig, /pages\/class-detail\/index/);
  assert.match(classesSource, /showClassDetail/);
  assert.match(classesSource, /Taro\.navigateTo/);
  assert.match(classesSource, /\/pages\/class-detail\/index\?id=/);
  assert.match(classesSource, /branchId=/);
  assert.match(classesSource, /查看详情/);
});

test('class detail page shows operational booking information', () => {
  const detailSource = readIfExists(detailSourcePath);

  assert.match(detailSource, /useRouter/);
  assert.match(detailSource, /loadMemberSession/);
  assert.match(detailSource, /getClasses/);
  assert.match(detailSource, /训练内容/);
  assert.match(detailSource, /适合人群/);
  assert.match(detailSource, /装备要求/);
  assert.match(detailSource, /取消规则/);
  assert.match(detailSource, /门店信息/);
  assert.match(detailSource, /教练/);
  assert.match(detailSource, /PageState/);
  assert.match(detailSource, /课程不存在或暂不可预约/);
});

test('class detail page lets members copy branch address and call the branch', () => {
  const detailSource = readIfExists(detailSourcePath);
  const detailStyle = readIfExists(detailStylePath);

  assert.match(detailSource, /copyBranchAddress/);
  assert.match(detailSource, /callBranchPhone/);
  assert.match(detailSource, /Taro\.setClipboardData/);
  assert.match(detailSource, /Taro\.makePhoneCall/);
  assert.match(detailSource, /复制地址/);
  assert.match(detailSource, /拨打电话/);
  assert.match(detailStyle, /\.branch-action-row/);
  assert.match(detailStyle, /\.branch-action-button/);
  assert.match(detailStyle, /min-height:\s*72px/);
});

test('class detail page shows a coach profile card with avatar and intro', () => {
  const detailSource = readIfExists(detailSourcePath);
  const detailStyle = readIfExists(detailStylePath);

  assert.match(detailSource, /getCoachInitials/);
  assert.match(detailSource, /getCoachIntro/);
  assert.match(detailSource, /教练简介/);
  assert.match(detailSource, /coach-profile/);
  assert.match(detailSource, /coach-avatar/);
  assert.match(detailSource, /coach-name/);
  assert.match(detailSource, /coach-bio/);
  assert.match(detailSource, /coach-note/);
  assert.match(detailSource, /boxingClass\.coach/);
  assert.match(detailStyle, /\.coach-profile/);
  assert.match(detailStyle, /\.coach-avatar/);
  assert.match(detailStyle, /border-radius:\s*50%/);
  assert.match(detailStyle, /min-width:\s*72px/);
  assert.match(detailStyle, /word-break:\s*break-word/);
});

test('class detail page keeps mobile sections scan-friendly', () => {
  const detailStyle = readIfExists(detailStylePath);

  assert.match(detailStyle, /\.class-detail-page/);
  assert.match(detailStyle, /\.detail-section/);
  assert.match(detailStyle, /\.detail-action-row/);
  assert.match(detailStyle, /min-height:\s*88px/);
  assert.match(detailStyle, /word-break:\s*break-word/);
});
