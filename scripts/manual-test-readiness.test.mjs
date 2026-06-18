import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  classifyMiniappDistApiBase,
  createMiniappProjectReadiness,
  createManualTestDataReadiness,
  createManualTestReadiness,
  createWechatConfigReadiness
} from './manual-test-readiness.mjs';

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
        'Capture iPhone SE screenshots for classes, bookings, profile. After selecting that simulator in WeChat DevTools, run cross-env MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next.'
    },
    strict: { enabled: true, passed: true, failures: [] },
    visualQa: {
      complete: false,
      existingCount: 3,
      requiredCount: 12,
      captureCommand: 'cross-env MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next'
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

function createReadyManualTestData() {
  return createManualTestDataReadiness({
    adminLoginOk: true,
    managerLoginOk: true,
    miniappAdminAccountLoginOk: true,
    miniappTestAccountLoginOk: true,
    miniappAdminBranchCount: 2,
    miniappTestBranchCount: 1,
    branches: [{ name: '城东店' }, { name: '城西店' }],
    managerBranches: [{ name: '城东店' }],
    classes: [
      {
        title: '基础拳击燃脂',
        branchName: '城东店',
        startsAt: '2099-01-01T11:30:00.000Z',
        status: 'SCHEDULED'
      },
      {
        title: '进阶组合拳',
        branchName: '城西店',
        startsAt: '2099-01-02T12:00:00.000Z',
        status: 'SCHEDULED'
      }
    ],
    now: '2026-06-14T00:00:00.000Z'
  });
}

function createReadyMiniappProject() {
  const localPrivateAppId = ['wx', 'abcdef1234567890'].join('');

  return createMiniappProjectReadiness({
    projectConfig: {
      miniprogramRoot: 'dist/',
      appid: 'touristappid'
    },
    privateConfig: {
      appid: localPrivateAppId
    },
    privateConfigExists: true,
    distFilesPresent: true,
    missingDistFiles: []
  });
}

test('manual test data readiness verifies seeded admin branches and future classes without exposing tokens', () => {
  const readiness = createReadyManualTestData();

  assert.equal(readiness.ready, true);
  assert.equal(readiness.adminLoginOk, true);
  assert.equal(readiness.managerLoginOk, true);
  assert.equal(readiness.miniappAdminAccountLoginOk, true);
  assert.equal(readiness.miniappTestAccountLoginOk, true);
  assert.equal(readiness.miniappAdminBranchCount, 2);
  assert.equal(readiness.miniappTestBranchCount, 1);
  assert.equal(readiness.miniappTestSingleBranchOnly, true);
  assert.equal(readiness.eastBranchPresent, true);
  assert.equal(readiness.westBranchPresent, true);
  assert.equal(readiness.managerEastBranchPresent, true);
  assert.equal(readiness.managerWestBranchAbsent, true);
  assert.equal(readiness.futureClassCount, 2);
  assert.deepEqual(readiness.failures, []);
  assert.doesNotMatch(JSON.stringify(readiness), /accessToken|Bearer|admin123456|manager123456|admin\/admin|test\/test/);
});

test('manual test data readiness blocks when miniapp operation accounts are missing or over-scoped', () => {
  const readiness = createManualTestDataReadiness({
    adminLoginOk: true,
    managerLoginOk: true,
    miniappAdminAccountLoginOk: false,
    miniappTestAccountLoginOk: true,
    miniappAdminBranchCount: 0,
    miniappTestBranchCount: 2,
    branches: [{ name: '城东店' }, { name: '城西店' }],
    managerBranches: [{ name: '城东店' }],
    classes: [
      {
        title: '基础拳击燃脂',
        branchName: '城东店',
        startsAt: '2099-01-01T11:30:00.000Z',
        status: 'SCHEDULED'
      }
    ],
    now: '2026-06-14T00:00:00.000Z'
  });

  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.failures, [
    {
      id: 'miniapp-admin-account-login-failed',
      detail: 'miniapp admin account login failed'
    },
    {
      id: 'miniapp-test-account-over-scoped',
      detail: 'miniapp test account must access exactly one branch'
    }
  ]);
  assert.deepEqual(readiness.nextHumanAction, {
    section: '3. 后台权限和排课',
    line: 26,
    text: '运行 `pnpm --filter @booking/api seed:cloud-test-accounts`，确认当前数据库有小程序运营端测试账号。'
  });
});

test('manual test data readiness points to the non-destructive seed verification step when data is missing', () => {
  const readiness = createManualTestDataReadiness({
    adminLoginOk: true,
    managerLoginOk: true,
    branches: [{ name: '城东店' }],
    managerBranches: [{ name: '城东店' }],
    classes: [],
    now: '2026-06-14T00:00:00.000Z'
  });

  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.failures, [
    {
      id: 'missing-west-branch',
      detail: 'missing 城西店 branch'
    },
    {
      id: 'missing-future-classes',
      detail: 'missing seeded future classes'
    }
  ]);
  assert.deepEqual(readiness.nextHumanAction, {
    section: '1. 本地环境准备',
    line: 7,
    text: '执行现有迁移和种子数据：`pnpm --filter @booking/api prisma:deploy && pnpm --filter @booking/api prisma:seed`。'
  });
});

test('manual test data readiness blocks when east manager branch scope is unsafe', () => {
  const readiness = createManualTestDataReadiness({
    adminLoginOk: true,
    managerLoginOk: true,
    branches: [{ name: '城东店' }, { name: '城西店' }],
    managerBranches: [{ name: '城东店' }, { name: '城西店' }],
    classes: [
      {
        title: '基础拳击燃脂',
        branchName: '城东店',
        startsAt: '2099-01-01T11:30:00.000Z',
        status: 'SCHEDULED'
      }
    ],
    now: '2026-06-14T00:00:00.000Z'
  });

  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.failures, [
    {
      id: 'manager-west-branch-visible',
      detail: 'east-manager can access 城西店'
    }
  ]);
  assert.deepEqual(readiness.nextHumanAction, {
    section: '3. 后台权限和排课',
    line: 31,
    text: '确认店长只能选择 `城东店`，不能查看或操作 `城西店` 数据。'
  });
});

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

test('miniapp project readiness keeps tracked AppID placeholder-only while hiding local private AppID', () => {
  const localPrivateAppId = ['wx', 'abcdef1234567890'].join('');
  const readiness = createMiniappProjectReadiness({
    projectConfig: {
      miniprogramRoot: 'dist/',
      appid: 'touristappid'
    },
    privateConfig: {
      appid: localPrivateAppId
    },
    privateConfigExists: true,
    distFilesPresent: true,
    missingDistFiles: [],
    distApiBaseUrlKind: 'device-reachable'
  });

  assert.equal(readiness.ready, true);
  assert.equal(readiness.miniprogramRootPointsToDist, true);
  assert.equal(readiness.trackedAppIdPlaceholder, true);
  assert.equal(readiness.trackedAppIdRealLooking, false);
  assert.equal(readiness.privateConfigExists, true);
  assert.equal(readiness.privateAppIdConfigured, true);
  assert.equal(readiness.privateAppIdPlaceholder, false);
  assert.equal(readiness.privateAppIdRealLooking, true);
  assert.equal(readiness.distFilesPresent, true);
  assert.equal(readiness.distApiBaseUrlKind, 'device-reachable');
  assert.equal(readiness.distApiBaseUrlDeviceReachable, true);
  assert.deepEqual(readiness.failures, []);
  assert.doesNotMatch(JSON.stringify(readiness), new RegExp(localPrivateAppId));
});

test('miniapp project readiness blocks dist builds that still point to localhost API', () => {
  const readiness = createMiniappProjectReadiness({
    projectConfig: {
      miniprogramRoot: 'dist/',
      appid: 'touristappid'
    },
    distFilesPresent: true,
    missingDistFiles: [],
    distApiBaseUrlKind: 'local-only'
  });

  assert.equal(readiness.ready, false);
  assert.equal(readiness.distApiBaseUrlDeviceReachable, false);
  assert.deepEqual(readiness.failures, [
    {
      id: 'miniapp-dist-local-api',
      detail: 'miniapp dist API base URL must be reachable from a real device'
    }
  ]);
  assert.deepEqual(readiness.nextHumanAction, {
    section: '2. 真实微信登录准备',
    line: 21,
    text: '在微信开发者工具中打开小程序构建目录 `apps/miniapp/dist`，不要打开源码目录 `apps/miniapp`。'
  });
});

test('miniapp dist API base classifier distinguishes local-only and device-reachable builds without exposing URLs', () => {
  assert.equal(classifyMiniappDistApiBase(['const API = "http://localhost:4000";']), 'local-only');
  assert.equal(classifyMiniappDistApiBase(['const API = "http://127.0.0.1:4000";']), 'local-only');
  assert.equal(classifyMiniappDistApiBase(['const API = "http://192.168.31.249:4000";']), 'device-reachable');
  assert.equal(classifyMiniappDistApiBase(['const API = "https://api.example.com";']), 'device-reachable');
  assert.equal(classifyMiniappDistApiBase(['const API = "";']), 'unknown');
});

test('miniapp project readiness blocks wrong DevTools root or tracked real AppID without leaking it', () => {
  const trackedRealAppId = ['wx', '1234567890abcdef'].join('');
  const readiness = createMiniappProjectReadiness({
    projectConfig: {
      miniprogramRoot: 'src/',
      appid: trackedRealAppId
    },
    distFilesPresent: false,
    missingDistFiles: ['app.js', 'app.json'],
    distApiBaseUrlKind: 'unknown'
  });

  assert.equal(readiness.ready, false);
  assert.equal(readiness.miniprogramRootPointsToDist, false);
  assert.equal(readiness.trackedAppIdPlaceholder, false);
  assert.equal(readiness.trackedAppIdRealLooking, true);
  assert.deepEqual(readiness.failures, [
    {
      id: 'wrong-miniprogram-root',
      detail: 'miniprogramRoot must point to dist/'
    },
    {
      id: 'tracked-real-app-id',
      detail: 'tracked project.config.json appid must stay touristappid'
    },
    {
      id: 'missing-miniapp-dist',
      detail: 'missing miniapp dist files: app.js, app.json'
    }
  ]);
  assert.deepEqual(readiness.nextHumanAction, {
    section: '2. 真实微信登录准备',
    line: 21,
    text: '在微信开发者工具中打开小程序构建目录 `apps/miniapp/dist`，不要打开源码目录 `apps/miniapp`。'
  });
  assert.doesNotMatch(JSON.stringify(readiness), new RegExp(trackedRealAppId));
});

test('manual test readiness blocks manual start when miniapp DevTools project config is unsafe', () => {
  const readiness = createManualTestReadiness(createDevStatus(), {
    wechatConfig: createReadyWechatConfig(),
    testData: createReadyManualTestData(),
    miniappProject: createMiniappProjectReadiness({
      projectConfig: { miniprogramRoot: 'src/', appid: 'touristappid' },
      distFilesPresent: true
    })
  });

  assert.equal(readiness.readyForManualWechat, false);
  assert.equal(readiness.gates.find((gate) => gate.id === 'miniapp-devtools-project')?.ok, false);
  assert.equal(
    readiness.gates.find((gate) => gate.id === 'miniapp-devtools-project')?.detail,
    'miniprogramRoot must point to dist/'
  );
  assert.deepEqual(readiness.nextHumanAction, {
    section: '2. 真实微信登录准备',
    line: 21,
    text: '在微信开发者工具中打开小程序构建目录 `apps/miniapp/dist`，不要打开源码目录 `apps/miniapp`。'
  });
});

test('manual test readiness allows starting manual WeChat checks when strict local preview and WeChat config are healthy', () => {
  const readiness = createManualTestReadiness(createDevStatus(), {
    wechatConfig: createReadyWechatConfig(),
    testData: createReadyManualTestData(),
    miniappProject: createReadyMiniappProject()
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
      { id: 'manual-test-data', ok: true, requiredFor: 'manual-start' },
      { id: 'wechat-login-config', ok: true, requiredFor: 'manual-start' },
      { id: 'miniapp-devtools-project', ok: true, requiredFor: 'manual-start' },
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
    line: 20,
    text: '运行 `pnpm --filter @booking/api wechat:check`，确认 AppID、AppSecret 和登录模式检查通过。'
  });
  assert.notEqual(readiness.nextHumanAction.text, readiness.manualTestNext.text);
  assert.equal(readiness.captureCommand, 'cross-env MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next');
});

test('manual test readiness blocks manual WeChat checks when seeded local test data is missing', () => {
  const readiness = createManualTestReadiness(createDevStatus(), {
    wechatConfig: createReadyWechatConfig(),
    testData: createManualTestDataReadiness({ adminLoginOk: false }),
    miniappProject: createReadyMiniappProject()
  });

  assert.equal(readiness.readyForManualWechat, false);
  assert.equal(readiness.gates.find((gate) => gate.id === 'manual-test-data')?.ok, false);
  assert.equal(readiness.gates.find((gate) => gate.id === 'manual-test-data')?.detail, 'admin login failed');
  assert.deepEqual(readiness.nextHumanAction, {
    section: '1. 本地环境准备',
    line: 7,
    text: '执行现有迁移和种子数据：`pnpm --filter @booking/api prisma:deploy && pnpm --filter @booking/api prisma:seed`。'
  });
});

test('manual test readiness blocks manual WeChat checks when local WeChat config is incomplete', () => {
  const readiness = createManualTestReadiness(createDevStatus(), {
    wechatConfig: createWechatConfigReadiness({}),
    testData: createReadyManualTestData(),
    miniappProject: createReadyMiniappProject()
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
      wechatConfig: createReadyWechatConfig(),
      testData: createReadyManualTestData(),
      miniappProject: createReadyMiniappProject()
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
        captureCommand: 'cross-env MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next'
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
      wechatConfig: createReadyWechatConfig(),
      testData: createReadyManualTestData(),
      miniappProject: createReadyMiniappProject()
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
  assert.match(readme, /testData/);
  assert.match(readme, /本地验收测试数据/);
  assert.match(readme, /admin\/admin/);
  assert.match(readme, /test\/test/);
  assert.match(readme, /test` 只管理 1 个门店/);
  assert.match(readme, /east-manager/);
  assert.match(readme, /店长只能访问城东店/);
  assert.match(readme, /wechatConfig/);
  assert.match(readme, /真实微信登录配置/);
  assert.match(readme, /miniappProject/);
  assert.match(readme, /小程序 DevTools 项目配置/);
  assert.match(readme, /真机可访问类型/);
  assert.match(readme, /localhost/);
  assert.match(optimizationChecklist, /pnpm ops:manual-test:readiness/);
  assert.match(optimizationChecklist, /本地验收测试数据门禁/);
  assert.match(optimizationChecklist, /小程序运营端账号门禁/);
  assert.match(optimizationChecklist, /\/auth\/account-login/);
  assert.match(optimizationChecklist, /真机 API 地址门禁/);
  assert.match(optimizationChecklist, /local-only/);
  assert.match(optimizationChecklist, /店长只能访问城东店/);
  assert.match(optimizationChecklist, /真实微信登录配置门禁/);
  assert.match(optimizationChecklist, /小程序 DevTools 项目配置门禁/);
});
