import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createManualTestReadiness, createWechatConfigReadiness } from './manual-test-readiness.mjs';

const packagePath = 'package.json';
const readmePath = 'README.md';
const optimizationChecklistPath = 'docs/optimization-checklist.md';

function read(path) {
  return readFileSync(path, 'utf8');
}

function createDevStatus(overrides = {}) {
  return {
    mode: 'dev-status',
    ok: true,
    progress: {
      preview: { completed: 4, total: 4, percent: 100 },
      visualQa: { completed: 3, total: 12, percent: 25 },
      manualTest: { completed: 0, total: 41, percent: 0 },
      strict: { enabled: true, passed: true, failures: [] },
      nextAction:
        'Capture iPhone SE screenshots for classes, bookings, profile. After selecting that simulator in WeChat DevTools, run MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next.'
    },
    strict: { enabled: true, passed: true, failures: [] },
    visualQa: {
      complete: false,
      existingCount: 3,
      requiredCount: 12,
      captureCommand: 'MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next'
    },
    manualTest: {
      mode: 'manual-test-status',
      complete: false,
      completed: 0,
      total: 41,
      percent: 0,
      next: {
        section: '1. 本地环境准备',
        line: 5,
        text: '启动 MySQL：`pnpm dev:db`。'
      },
      sections: [
        { title: '1. 本地环境准备', completed: 0, total: 9, percent: 0 },
        {
          title: '2. 真实微信登录准备',
          completed: 0,
          total: 6,
          percent: 0,
          next: {
            section: '2. 真实微信登录准备',
            line: 17,
            text: '在 `apps/api/.env` 中配置当前微信开发者工具使用的 `MINIAPP_APP_ID`。'
          }
        }
      ]
    },
    ...overrides
  };
}

function createReadyWechatConfig() {
  const realLookingAppId = ['wx', '1234567890abcdef'].join('');

  return createWechatConfigReadiness({
    MINIAPP_APP_ID: realLookingAppId,
    MINIAPP_APP_SECRET: 'test-secret',
    WECHAT_LOGIN_MOCK_ENABLED: 'false',
    WECHAT_AUTO_PROVISION_ENABLED: 'false'
  });
}

test('wechat config readiness reports local real-login prerequisites without exposing secrets', () => {
  const realLookingAppId = ['wx', '1234567890abcdef'].join('');
  const readiness = createWechatConfigReadiness({
    MINIAPP_APP_ID: realLookingAppId,
    MINIAPP_APP_SECRET: 'test-secret',
    WECHAT_LOGIN_MOCK_ENABLED: 'false',
    WECHAT_AUTO_PROVISION_ENABLED: 'false'
  });

  assert.equal(readiness.ready, true);
  assert.equal(readiness.appIdConfigured, true);
  assert.equal(readiness.appIdPlaceholder, false);
  assert.equal(readiness.appSecretConfigured, true);
  assert.equal(readiness.mockLoginEnabled, false);
  assert.equal(readiness.autoProvisionEnabled, false);
  assert.deepEqual(readiness.failures, []);
  assert.doesNotMatch(JSON.stringify(readiness), new RegExp(realLookingAppId));
  assert.doesNotMatch(JSON.stringify(readiness), /test-secret/);
});

test('wechat config readiness points to the first incomplete manual checklist item', () => {
  assert.deepEqual(createWechatConfigReadiness({}).nextHumanAction, {
    section: '2. 真实微信登录准备',
    line: 17,
    text: '在 `apps/api/.env` 中配置当前微信开发者工具使用的 `MINIAPP_APP_ID`。'
  });

  assert.deepEqual(
    createWechatConfigReadiness({
      MINIAPP_APP_ID: 'touristappid',
      MINIAPP_APP_SECRET: 'test-secret',
      WECHAT_AUTO_PROVISION_ENABLED: 'false'
    }).nextHumanAction,
    {
      section: '2. 真实微信登录准备',
      line: 17,
      text: '在 `apps/api/.env` 中配置当前微信开发者工具使用的 `MINIAPP_APP_ID`。'
    }
  );

  const realLookingAppId = ['wx', '1234567890abcdef'].join('');
  assert.deepEqual(
    createWechatConfigReadiness({
      MINIAPP_APP_ID: realLookingAppId,
      WECHAT_AUTO_PROVISION_ENABLED: 'false'
    }).nextHumanAction,
    {
      section: '2. 真实微信登录准备',
      line: 18,
      text: '在 `apps/api/.env` 中配置微信小程序后台的 `MINIAPP_APP_SECRET`。'
    }
  );

  assert.deepEqual(
    createWechatConfigReadiness({
      MINIAPP_APP_ID: realLookingAppId,
      MINIAPP_APP_SECRET: 'test-secret',
      WECHAT_AUTO_PROVISION_ENABLED: 'true'
    }).nextHumanAction,
    {
      section: '2. 真实微信登录准备',
      line: 19,
      text: '确认接近生产的测试使用 `WECHAT_AUTO_PROVISION_ENABLED="false"`，未知微信账号必须由后台绑定会员。'
    }
  );
});

test('manual test readiness allows starting manual WeChat checks when strict local preview and WeChat config are healthy', () => {
  const readiness = createManualTestReadiness(createDevStatus(), {
    wechatConfig: createReadyWechatConfig()
  });

  assert.equal(readiness.mode, 'manual-test-readiness');
  assert.equal(readiness.opensDevTools, false);
  assert.equal(readiness.readyForManualWechat, true);
  assert.deepEqual(readiness.progress.preview, { completed: 4, total: 4, percent: 100 });
  assert.deepEqual(readiness.progress.visualQa, { completed: 3, total: 12, percent: 25 });
  assert.deepEqual(readiness.progress.manualTest, { completed: 0, total: 41, percent: 0 });
  assert.deepEqual(
    readiness.gates.map((gate) => ({ id: gate.id, ok: gate.ok, requiredFor: gate.requiredFor })),
    [
      { id: 'local-preview', ok: true, requiredFor: 'manual-start' },
      { id: 'strict-dev-status', ok: true, requiredFor: 'manual-start' },
      { id: 'wechat-login-config', ok: true, requiredFor: 'manual-start' },
      { id: 'visual-qa-matrix', ok: false, requiredFor: 'release' },
      { id: 'manual-checklist', ok: false, requiredFor: 'release' }
    ]
  );
  assert.equal(readiness.readyForRelease, false);
  assert.deepEqual(readiness.releaseBlockers, [
    {
      id: 'visual-qa-matrix',
      label: '多设备视觉截图矩阵',
      detail: '3/12'
    },
    {
      id: 'manual-checklist',
      label: '手工验收清单',
      detail: '0/41'
    }
  ]);
  assert.match(readiness.nextAction, /Capture iPhone SE screenshots/);
  assert.deepEqual(readiness.nextHumanAction, {
    section: '2. 真实微信登录准备',
    line: 17,
    text: '在 `apps/api/.env` 中配置当前微信开发者工具使用的 `MINIAPP_APP_ID`。'
  });
  assert.notEqual(readiness.nextHumanAction.text, readiness.manualTestNext.text);
  assert.equal(readiness.captureCommand, 'MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next');
});

test('manual test readiness blocks manual WeChat checks when local WeChat config is incomplete', () => {
  const readiness = createManualTestReadiness(createDevStatus(), {
    wechatConfig: createWechatConfigReadiness({})
  });

  assert.equal(readiness.readyForManualWechat, false);
  assert.equal(readiness.gates.find((gate) => gate.id === 'wechat-login-config')?.ok, false);
  assert.equal(readiness.gates.find((gate) => gate.id === 'wechat-login-config')?.detail, 'missing MINIAPP_APP_ID');
  assert.deepEqual(readiness.nextHumanAction, {
    section: '2. 真实微信登录准备',
    line: 17,
    text: '在 `apps/api/.env` 中配置当前微信开发者工具使用的 `MINIAPP_APP_ID`。'
  });
});

test('manual test readiness blocks manual start when strict local preview is not healthy', () => {
  const readiness = createManualTestReadiness(
    createDevStatus({
      ok: false,
      progress: {
        preview: { completed: 2, total: 4, percent: 50 },
        visualQa: { completed: 3, total: 12, percent: 25 },
        manualTest: { completed: 0, total: 41, percent: 0 },
        strict: { enabled: true, passed: false, failures: ['API preview is not ready.'] },
        nextAction: 'Run pnpm dev:preview:start to restore local preview services: API, miniapp.'
      },
      strict: { enabled: true, passed: false, failures: ['API preview is not ready.'] }
    }),
    {
      wechatConfig: createReadyWechatConfig()
    }
  );

  assert.equal(readiness.readyForManualWechat, false);
  assert.match(readiness.nextAction, /pnpm dev:preview:start/);
  assert.deepEqual(readiness.nextHumanAction, {
    section: '1. 本地环境准备',
    line: 5,
    text: '启动 MySQL：`pnpm dev:db`。'
  });
  assert.equal(readiness.gates.find((gate) => gate.id === 'local-preview')?.ok, false);
  assert.equal(readiness.gates.find((gate) => gate.id === 'strict-dev-status')?.ok, false);
});

test('manual test readiness marks release ready only when all release gates pass', () => {
  const readiness = createManualTestReadiness(
    createDevStatus({
      progress: {
        preview: { completed: 4, total: 4, percent: 100 },
        visualQa: { completed: 12, total: 12, percent: 100 },
        manualTest: { completed: 41, total: 41, percent: 100 },
        strict: { enabled: true, passed: true, failures: [] },
        nextAction: 'All local preview and visual QA checks are complete.'
      },
      visualQa: {
        complete: true,
        existingCount: 12,
        requiredCount: 12,
        captureCommand: 'MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next'
      },
      manualTest: {
        mode: 'manual-test-status',
        complete: true,
        completed: 41,
        total: 41,
        percent: 100,
        next: null,
        sections: []
      }
    }),
    {
      wechatConfig: createReadyWechatConfig()
    }
  );

  assert.equal(readiness.readyForManualWechat, true);
  assert.equal(readiness.readyForRelease, true);
  assert.deepEqual(readiness.releaseBlockers, []);
  assert.equal(readiness.nextHumanAction, null);
});

test('package exposes manual test readiness command', () => {
  const packageJson = JSON.parse(read(packagePath));

  assert.equal(packageJson.scripts['ops:manual-test:readiness'], 'node scripts/manual-test-readiness.mjs');
});

test('docs expose manual test readiness command', () => {
  const readme = read(readmePath);
  const optimizationChecklist = read(optimizationChecklistPath);

  assert.match(readme, /pnpm ops:manual-test:readiness/);
  assert.match(readme, /manual-test-readiness/);
  assert.match(readme, /wechatConfig/);
  assert.match(readme, /真实微信登录配置/);
  assert.match(optimizationChecklist, /pnpm ops:manual-test:readiness/);
  assert.match(optimizationChecklist, /真实微信登录配置门禁/);
});
