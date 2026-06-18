import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createManualTestHandoffMarkdown } from './manual-test-handoff.mjs';

const packagePath = 'package.json';
const readmePath = 'README.md';
const optimizationChecklistPath = 'docs/optimization-checklist.md';

function read(path) {
  return readFileSync(path, 'utf8');
}

function createSummary() {
  return {
    mode: 'manual-test-next',
    opensDevTools: false,
    readyForManualWechat: true,
    readyForRelease: false,
    nextHumanAction: {
      section: '2. 真实微信登录准备',
      line: 22,
      text: '在微信开发者工具中打开小程序构建目录 `apps/miniapp/dist`，不要打开源码目录 `apps/miniapp`；使用真机调试确认当前 AppID 可以进入小程序。'
    },
    devtoolsProjectPath: '/repo/apps/miniapp/dist',
    miniappDistApi: {
      kind: 'device-reachable',
      healthOk: true
    },
    progress: {
      manualTest: { completed: 16, total: 46, percent: 35 },
      visualQa: { completed: 0, total: 12, percent: 0 }
    },
    manualTestSections: [
      {
        title: '1. 本地环境准备',
        completed: 9,
        total: 9,
        percent: 100,
        next: null
      },
      {
        title: '3. 后台权限和排课',
        completed: 1,
        total: 9,
        percent: 11,
        next: {
          section: '3. 后台权限和排课',
          line: 28,
          text: '小程序账户页使用 `admin` / `admin` 账号登录，确认可以看到“运营管理”入口。'
        }
      }
    ],
    visualQaDiagnostics: {
      presentCount: 3,
      invalidCount: 3,
      invalidReasons: ['screenshot is older than latest miniapp UI source']
    },
    visualQaNext: {
      deviceName: 'iPhone SE',
      viewport: '375 x 667',
      missingLabels: ['classes', 'bookings', 'profile'],
      missingScreenshots: [
        {
          label: 'classes',
          pagePath: '/pages/classes/index',
          outputPath: '/repo/docs/manual-test-screenshots/iphone-se-classes.png'
        },
        {
          label: 'bookings',
          pagePath: '/pages/bookings/index',
          outputPath: '/repo/docs/manual-test-screenshots/iphone-se-bookings.png'
        },
        {
          label: 'profile',
          pagePath: '/pages/profile/index',
          outputPath: '/repo/docs/manual-test-screenshots/iphone-se-profile.png'
        }
      ]
    },
    releaseBlockers: [
      { id: 'visual-qa-matrix', label: '多设备视觉截图矩阵', detail: '0/12' },
      { id: 'manual-checklist', label: '手工验收清单', detail: '16/46' }
    ],
    captureCommand: 'cross-env MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next'
  };
}

test('createManualTestHandoffMarkdown renders a safe Chinese handoff report', () => {
  const markdown = createManualTestHandoffMarkdown(createSummary());

  assert.match(markdown, /^# 小程序真机验收交接/m);
  assert.match(markdown, /可以开始真机微信验收：是/);
  assert.match(markdown, /可以发布：否/);
  assert.match(markdown, /小程序打开目录：`\/repo\/apps\/miniapp\/dist`/);
  assert.match(markdown, /构建包 API：`device-reachable`，healthOk=`true`/);
  assert.match(markdown, /下一步：2\. 真实微信登录准备，第 22 行/);
  assert.match(markdown, /手工验收：16\/46，35%/);
  assert.match(markdown, /视觉截图：0\/12，0%/);
  assert.match(markdown, /1\. 本地环境准备：9\/9，100%，下一步：已完成/);
  assert.match(markdown, /3\. 后台权限和排课：1\/9，11%，下一步：第 28 行，小程序账户页使用 `admin` \/ `\[已隐藏\]` 账号登录/);
  assert.match(markdown, /已有截图：3；无效截图：3/);
  assert.match(markdown, /screenshot is older than latest miniapp UI source/);
  assert.match(markdown, /下一台设备：iPhone SE（375 x 667）/);
  assert.match(markdown, /classes：\/pages\/classes\/index -> `\/repo\/docs\/manual-test-screenshots\/iphone-se-classes\.png`/);
  assert.match(markdown, /bookings：\/pages\/bookings\/index -> `\/repo\/docs\/manual-test-screenshots\/iphone-se-bookings\.png`/);
  assert.match(markdown, /profile：\/pages\/profile\/index -> `\/repo\/docs\/manual-test-screenshots\/iphone-se-profile\.png`/);
  assert.match(markdown, /`cross-env MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next`/);
  assert.match(markdown, /多设备视觉截图矩阵：0\/12/);
  assert.match(markdown, /手工验收清单：16\/46/);
  assert.doesNotMatch(markdown, /`admin`\s*\/\s*`admin`/);
  assert.doesNotMatch(markdown, /AppSecret|MINIAPP_APP_SECRET|accessToken|Bearer|wx[0-9a-z]{16,}/i);
});

test('package and docs expose the manual test handoff command', () => {
  const packageJson = JSON.parse(read(packagePath));
  const readme = read(readmePath);
  const optimizationChecklist = read(optimizationChecklistPath);

  assert.equal(packageJson.scripts['ops:manual-test:handoff'], 'node scripts/manual-test-handoff.mjs');
  assert.match(readme, /pnpm ops:manual-test:handoff/);
  assert.match(readme, /小程序真机验收交接/);
  assert.match(readme, /visualQaNext/);
  assert.match(optimizationChecklist, /pnpm ops:manual-test:handoff/);
  assert.match(optimizationChecklist, /visualQaNext/);
});
