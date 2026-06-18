import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createManualTestNextSummary,
  parseJsonFromCommandOutput
} from './manual-test-next.mjs';

const packagePath = 'package.json';
const readmePath = 'README.md';
const optimizationChecklistPath = 'docs/optimization-checklist.md';

function read(path) {
  return readFileSync(path, 'utf8');
}

test('createManualTestNextSummary extracts only the next human action and safe handoff details', () => {
  const summary = createManualTestNextSummary({
    readyForManualWechat: true,
    readyForRelease: false,
    progress: {
      manualTest: { completed: 14, total: 46, percent: 30 },
      visualQa: { completed: 3, total: 12, percent: 25 }
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
        title: '2. 真实微信登录准备',
        completed: 5,
        total: 7,
        percent: 71,
        next: {
          section: '2. 真实微信登录准备',
          line: 22,
          text: '在微信开发者工具中打开小程序构建目录 `apps/miniapp/dist`，不要打开源码目录 `apps/miniapp`；使用真机调试确认当前 AppID 可以进入小程序。'
        }
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
      invalidCount: 1,
      invalidReasons: ['screenshot is older than latest miniapp UI source']
    },
    miniappProject: {
      source: {
        dist: '/repo/apps/miniapp/dist'
      },
      distApiBaseUrlKind: 'device-reachable',
      distApiHealthOk: true
    },
    nextHumanAction: {
      section: '2. 真实微信登录准备',
      line: 22,
      text: '在微信开发者工具中打开小程序构建目录 `apps/miniapp/dist`，不要打开源码目录 `apps/miniapp`；使用真机调试确认当前 AppID 可以进入小程序。'
    },
    captureCommand: 'cross-env MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next',
    releaseBlockers: [
      { id: 'visual-qa-matrix', label: '多设备视觉截图矩阵', detail: '3/12' },
      { id: 'manual-checklist', label: '手工验收清单', detail: '14/46' }
    ]
  });

  assert.deepEqual(summary, {
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
      manualTest: { completed: 14, total: 46, percent: 30 },
      visualQa: { completed: 3, total: 12, percent: 25 }
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
        title: '2. 真实微信登录准备',
        completed: 5,
        total: 7,
        percent: 71,
        next: {
          section: '2. 真实微信登录准备',
          line: 22,
          text: '在微信开发者工具中打开小程序构建目录 `apps/miniapp/dist`，不要打开源码目录 `apps/miniapp`；使用真机调试确认当前 AppID 可以进入小程序。'
        }
      },
      {
        title: '3. 后台权限和排课',
        completed: 1,
        total: 9,
        percent: 11,
        next: {
          section: '3. 后台权限和排课',
          line: 28,
          text: '小程序账户页使用 `admin` / `[已隐藏]` 账号登录，确认可以看到“运营管理”入口。'
        }
      }
    ],
    visualQaDiagnostics: {
      presentCount: 3,
      invalidCount: 1,
      invalidReasons: ['screenshot is older than latest miniapp UI source']
    },
    releaseBlockers: [
      { id: 'visual-qa-matrix', label: '多设备视觉截图矩阵', detail: '3/12' },
      { id: 'manual-checklist', label: '手工验收清单', detail: '14/46' }
    ],
    captureCommand: 'cross-env MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next'
  });
  assert.doesNotMatch(JSON.stringify(summary), /AppSecret|MINIAPP_APP_SECRET|accessToken|Bearer|wx[0-9a-z]{16,}/i);
});

test('parseJsonFromCommandOutput reads JSON from pnpm command output', () => {
  assert.deepEqual(parseJsonFromCommandOutput('prefix\n{"ok":true}\n'), { ok: true });
  assert.throws(() => parseJsonFromCommandOutput('no json here'), /did not contain JSON/);
});

test('package and docs expose the concise manual-test next command', () => {
  const packageJson = JSON.parse(read(packagePath));
  const readme = read(readmePath);
  const optimizationChecklist = read(optimizationChecklistPath);

  assert.equal(packageJson.scripts['ops:manual-test:next'], 'node scripts/manual-test-next.mjs');
  assert.match(readme, /pnpm ops:manual-test:next/);
  assert.match(readme, /manual-test-next/);
  assert.match(readme, /manualTestSections/);
  assert.match(optimizationChecklist, /pnpm ops:manual-test:next/);
  assert.match(optimizationChecklist, /manualTestSections/);
});
