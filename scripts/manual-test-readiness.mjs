import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const PLACEHOLDER_APP_IDS = new Set(['touristappid']);
const WECHAT_ENV_KEYS = [
  'MINIAPP_APP_ID',
  'MINIAPP_APP_SECRET',
  'WECHAT_LOGIN_MOCK_ENABLED',
  'WECHAT_AUTO_PROVISION_ENABLED'
];
const WECHAT_CHECKLIST_ACTIONS = {
  appId: {
    section: '2. 真实微信登录准备',
    line: 17,
    text: '在 `apps/api/.env` 中配置当前微信开发者工具使用的 `MINIAPP_APP_ID`。'
  },
  appSecret: {
    section: '2. 真实微信登录准备',
    line: 18,
    text: '在 `apps/api/.env` 中配置微信小程序后台的 `MINIAPP_APP_SECRET`。'
  },
  autoProvision: {
    section: '2. 真实微信登录准备',
    line: 19,
    text: '确认接近生产的测试使用 `WECHAT_AUTO_PROVISION_ENABLED="false"`，未知微信账号必须由后台绑定会员。'
  },
  wechatCheck: {
    section: '2. 真实微信登录准备',
    line: 20,
    text: '运行 `pnpm --filter @booking/api wechat:check`，确认 AppID、AppSecret 和登录模式检查通过。'
  }
};
const MANUAL_TEST_CHECKLIST_ACTIONS = {
  testData: {
    section: '1. 本地环境准备',
    line: 7,
    text: '执行现有迁移和种子数据：`pnpm --filter @booking/api prisma:deploy && pnpm --filter @booking/api prisma:seed`。'
  },
  managerScope: {
    section: '3. 后台权限和排课',
    line: 31,
    text: '确认店长只能选择 `城东店`，不能查看或操作 `城西店` 数据。'
  }
};
const DEFAULT_API_BASE_URL = 'http://localhost:4000';

function percentFromProgress(progress = {}) {
  const completed = progress.completed ?? 0;
  const total = progress.total ?? 0;
  const percent = progress.percent ?? (total > 0 ? Math.round((completed / total) * 100) : 100);

  return { completed, total, percent };
}

function createGate({ id, label, ok, requiredFor, detail }) {
  return {
    id,
    label,
    ok,
    requiredFor,
    detail
  };
}

function findSection(sections = [], titlePattern) {
  return sections.find((section) => titlePattern.test(section.title));
}

function createNextHumanAction({
  localPreviewOk,
  strictOk,
  readyForManualWechat,
  manualTest,
  testData,
  wechatConfig
}) {
  if (!localPreviewOk || !strictOk) return manualTest.next ?? null;
  if (testData?.ready === false) return testData.nextHumanAction ?? manualTest.next ?? null;
  if (wechatConfig?.ready === false) return wechatConfig.nextHumanAction ?? manualTest.next ?? null;
  if (!readyForManualWechat) return manualTest.next ?? null;

  const wechatSection = findSection(manualTest.sections, /真实微信登录准备/);
  if (!wechatSection || wechatSection.completed >= wechatSection.total) {
    return manualTest.next ?? null;
  }

  if (
    wechatConfig?.ready === true &&
    wechatSection.next?.line !== null &&
    wechatSection.next?.line < WECHAT_CHECKLIST_ACTIONS.wechatCheck.line
  ) {
    return WECHAT_CHECKLIST_ACTIONS.wechatCheck;
  }

  return (
    wechatSection.next ?? {
      section: wechatSection.title,
      line: null,
      text: '本地预览和 strict 环境门禁已通过；继续完成真实微信登录准备。'
    }
  );
}

function createReleaseBlockers(gates) {
  return gates
    .filter((gate) => !gate.ok)
    .map((gate) => ({
      id: gate.id,
      label: gate.label,
      detail: gate.detail
    }));
}

function parseEnvSource(source) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .reduce((env, line) => {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex === -1) return env;

      const key = line.slice(0, separatorIndex).trim();
      const rawValue = line.slice(separatorIndex + 1).trim();
      env[key] = rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
      return env;
    }, {});
}

function pickEnv(env) {
  return WECHAT_ENV_KEYS.reduce((values, key) => {
    if (env[key] !== undefined) values[key] = env[key];
    return values;
  }, {});
}

function readBoolean(value, defaultValue) {
  if (value === undefined || value === null || String(value).trim() === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function createWechatFailure({ id, detail, nextHumanAction }) {
  return { id, detail, nextHumanAction };
}

function createReadinessFailure({ id, detail, nextHumanAction }) {
  return { id, detail, nextHumanAction };
}

export function createManualTestDataReadiness({
  adminLoginOk = false,
  managerLoginOk = false,
  branches = [],
  managerBranches = [],
  classes = [],
  now = new Date().toISOString(),
  source = null
} = {}) {
  const branchNames = new Set(branches.map((branch) => String(branch.name ?? '').trim()).filter(Boolean));
  const managerBranchNames = new Set(
    managerBranches.map((branch) => String(branch.name ?? '').trim()).filter(Boolean)
  );
  const eastBranchPresent = branchNames.has('城东店');
  const westBranchPresent = branchNames.has('城西店');
  const managerEastBranchPresent = managerBranchNames.has('城东店');
  const managerWestBranchAbsent = !managerBranchNames.has('城西店');
  const nowMs = Date.parse(now);
  const futureClassCount = classes.filter((boxingClass) => {
    if (boxingClass.status && boxingClass.status !== 'SCHEDULED') return false;
    const startsAtMs = Date.parse(String(boxingClass.startsAt ?? ''));
    return Number.isFinite(startsAtMs) && startsAtMs > nowMs;
  }).length;
  const failures = [];

  if (!adminLoginOk) {
    failures.push(
      createReadinessFailure({
        id: 'admin-login-failed',
        detail: 'admin login failed',
        nextHumanAction: MANUAL_TEST_CHECKLIST_ACTIONS.testData
      })
    );
  }

  if (!managerLoginOk) {
    failures.push(
      createReadinessFailure({
        id: 'manager-login-failed',
        detail: 'east-manager login failed',
        nextHumanAction: MANUAL_TEST_CHECKLIST_ACTIONS.managerScope
      })
    );
  }

  if (!eastBranchPresent) {
    failures.push(
      createReadinessFailure({
        id: 'missing-east-branch',
        detail: 'missing 城东店 branch',
        nextHumanAction: MANUAL_TEST_CHECKLIST_ACTIONS.testData
      })
    );
  }

  if (!westBranchPresent) {
    failures.push(
      createReadinessFailure({
        id: 'missing-west-branch',
        detail: 'missing 城西店 branch',
        nextHumanAction: MANUAL_TEST_CHECKLIST_ACTIONS.testData
      })
    );
  }

  if (managerLoginOk && !managerEastBranchPresent) {
    failures.push(
      createReadinessFailure({
        id: 'manager-missing-east-branch',
        detail: 'east-manager cannot access 城东店',
        nextHumanAction: MANUAL_TEST_CHECKLIST_ACTIONS.managerScope
      })
    );
  }

  if (managerLoginOk && !managerWestBranchAbsent) {
    failures.push(
      createReadinessFailure({
        id: 'manager-west-branch-visible',
        detail: 'east-manager can access 城西店',
        nextHumanAction: MANUAL_TEST_CHECKLIST_ACTIONS.managerScope
      })
    );
  }

  if (futureClassCount === 0) {
    failures.push(
      createReadinessFailure({
        id: 'missing-future-classes',
        detail: 'missing seeded future classes',
        nextHumanAction: MANUAL_TEST_CHECKLIST_ACTIONS.testData
      })
    );
  }

  return {
    checked: true,
    source,
    adminLoginOk,
    managerLoginOk,
    eastBranchPresent,
    westBranchPresent,
    managerEastBranchPresent,
    managerWestBranchAbsent,
    futureClassCount,
    ready: failures.length === 0,
    failures: failures.map(({ id, detail }) => ({ id, detail })),
    nextHumanAction: failures[0]?.nextHumanAction ?? null
  };
}

export function createWechatConfigReadiness(env = {}, options = {}) {
  const appId = String(env.MINIAPP_APP_ID ?? '').trim();
  const appSecret = String(env.MINIAPP_APP_SECRET ?? '').trim();
  const mockLoginEnabled = readBoolean(env.WECHAT_LOGIN_MOCK_ENABLED, false);
  const autoProvisionEnabled = readBoolean(env.WECHAT_AUTO_PROVISION_ENABLED, true);
  const appIdPlaceholder = appId !== '' && PLACEHOLDER_APP_IDS.has(appId);
  const appIdConfigured = appId !== '' && !appIdPlaceholder;
  const appSecretConfigured = appSecret !== '';
  const failures = [];

  if (!appIdConfigured) {
    failures.push(
      createWechatFailure({
        id: appIdPlaceholder ? 'placeholder-app-id' : 'missing-app-id',
        detail: appIdPlaceholder ? 'placeholder MINIAPP_APP_ID' : 'missing MINIAPP_APP_ID',
        nextHumanAction: WECHAT_CHECKLIST_ACTIONS.appId
      })
    );
  }

  if (!appSecretConfigured) {
    failures.push(
      createWechatFailure({
        id: 'missing-app-secret',
        detail: 'missing MINIAPP_APP_SECRET',
        nextHumanAction: WECHAT_CHECKLIST_ACTIONS.appSecret
      })
    );
  }

  if (mockLoginEnabled) {
    failures.push(
      createWechatFailure({
        id: 'mock-login-enabled',
        detail: 'WECHAT_LOGIN_MOCK_ENABLED must be false',
        nextHumanAction: WECHAT_CHECKLIST_ACTIONS.wechatCheck
      })
    );
  }

  if (autoProvisionEnabled) {
    failures.push(
      createWechatFailure({
        id: 'auto-provision-enabled',
        detail: 'WECHAT_AUTO_PROVISION_ENABLED must be false',
        nextHumanAction: WECHAT_CHECKLIST_ACTIONS.autoProvision
      })
    );
  }

  return {
    checked: true,
    source: options.source ?? null,
    appIdConfigured,
    appIdPlaceholder,
    appSecretConfigured,
    mockLoginEnabled,
    autoProvisionEnabled,
    ready: failures.length === 0,
    failures: failures.map(({ id, detail }) => ({ id, detail })),
    nextHumanAction: failures[0]?.nextHumanAction ?? null
  };
}

export function readWechatConfigReadiness({
  envPath = resolve(process.cwd(), 'apps/api/.env'),
  env = process.env
} = {}) {
  const envFileExists = existsSync(envPath);
  const fileEnv = envFileExists ? parseEnvSource(readFileSync(envPath, 'utf8')) : {};
  const mergedEnv = { ...fileEnv, ...pickEnv(env) };

  return createWechatConfigReadiness(mergedEnv, {
    source: {
      envFile: envPath,
      envFileExists
    }
  });
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function readLocalEnvValues(envPath, env = process.env) {
  const envFileExists = existsSync(envPath);
  const fileEnv = envFileExists ? parseEnvSource(readFileSync(envPath, 'utf8')) : {};
  return { envFileExists, values: { ...fileEnv, ...env } };
}

export async function readManualTestDataReadiness({
  apiBaseUrl = DEFAULT_API_BASE_URL,
  envPath = resolve(process.cwd(), 'apps/api/.env'),
  env = process.env
} = {}) {
  const { values } = readLocalEnvValues(envPath, env);
  const username = values.ADMIN_USERNAME || 'admin';
  const password = values.ADMIN_PASSWORD || 'admin123456';
  const managerUsername = 'east-manager';
  const managerPassword = values.MANAGER_PASSWORD || 'manager123456';
  const source = { apiBaseUrl };
  const login = await fetchJson(`${apiBaseUrl}/auth/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const accessToken = login.body?.accessToken;

  if (!login.ok || !accessToken) {
    return createManualTestDataReadiness({
      adminLoginOk: false,
      source
    });
  }

  const managerLogin = await fetchJson(`${apiBaseUrl}/auth/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: managerUsername, password: managerPassword })
  });
  const managerAccessToken = managerLogin.body?.accessToken;
  const authHeaders = { Authorization: `Bearer ${accessToken}` };
  const managerAuthHeaders = managerAccessToken ? { Authorization: `Bearer ${managerAccessToken}` } : null;
  const [branches, classes, managerBranches] = await Promise.all([
    fetchJson(`${apiBaseUrl}/admin/branches`, { headers: authHeaders }),
    fetchJson(`${apiBaseUrl}/admin/classes`, { headers: authHeaders }),
    managerAuthHeaders
      ? fetchJson(`${apiBaseUrl}/admin/branches`, { headers: managerAuthHeaders })
      : Promise.resolve({ ok: false, body: [] })
  ]);

  return createManualTestDataReadiness({
    adminLoginOk: true,
    managerLoginOk: managerLogin.ok && Boolean(managerAccessToken),
    branches: Array.isArray(branches.body) ? branches.body : [],
    managerBranches: Array.isArray(managerBranches.body) ? managerBranches.body : [],
    classes: Array.isArray(classes.body) ? classes.body : [],
    source
  });
}

export function createManualTestReadiness(
  devStatus,
  {
    testData = createManualTestDataReadiness({}),
    wechatConfig = createWechatConfigReadiness({})
  } = {}
) {
  const progress = {
    preview: percentFromProgress(devStatus.progress?.preview),
    visualQa: percentFromProgress(devStatus.progress?.visualQa),
    manualTest: percentFromProgress(devStatus.progress?.manualTest),
    strict: devStatus.progress?.strict ?? devStatus.strict ?? { enabled: true, passed: false, failures: [] }
  };
  const manualTest = devStatus.manualTest ?? {
    complete: progress.manualTest.total > 0 && progress.manualTest.completed === progress.manualTest.total,
    next: null,
    sections: []
  };
  const visualQa = devStatus.visualQa ?? {
    complete: progress.visualQa.total > 0 && progress.visualQa.completed === progress.visualQa.total
  };
  const localPreviewOk = progress.preview.total > 0 && progress.preview.completed === progress.preview.total;
  const strictOk = progress.strict.passed === true;
  const readyForManualWechat = localPreviewOk && strictOk && testData.ready === true && wechatConfig.ready === true;
  const gates = [
    createGate({
      id: 'local-preview',
      label: '本地预览',
      ok: localPreviewOk,
      requiredFor: 'manual-start',
      detail: `${progress.preview.completed}/${progress.preview.total}`
    }),
    createGate({
      id: 'strict-dev-status',
      label: '严格本地环境检查',
      ok: strictOk,
      requiredFor: 'manual-start',
      detail:
        progress.strict.failures && progress.strict.failures.length > 0
          ? progress.strict.failures.join(' ')
          : 'passed'
    }),
    createGate({
      id: 'manual-test-data',
      label: '本地验收测试数据',
      ok: testData.ready === true,
      requiredFor: 'manual-start',
      detail: testData.failures?.[0]?.detail ?? 'passed'
    }),
    createGate({
      id: 'wechat-login-config',
      label: '真实微信登录配置',
      ok: wechatConfig.ready === true,
      requiredFor: 'manual-start',
      detail: wechatConfig.failures?.[0]?.detail ?? 'passed'
    }),
    createGate({
      id: 'visual-qa-matrix',
      label: '多设备视觉截图矩阵',
      ok: visualQa.complete === true,
      requiredFor: 'release',
      detail: `${progress.visualQa.completed}/${progress.visualQa.total}`
    }),
    createGate({
      id: 'manual-checklist',
      label: '手工验收清单',
      ok: manualTest.complete === true,
      requiredFor: 'release',
      detail: `${progress.manualTest.completed}/${progress.manualTest.total}`
    })
  ];
  const releaseBlockers = createReleaseBlockers(gates);

  return {
    mode: 'manual-test-readiness',
    opensDevTools: false,
    readyForManualWechat,
    readyForRelease: releaseBlockers.length === 0,
    releaseBlockers,
    progress,
    gates,
    testData,
    wechatConfig,
    nextAction: devStatus.progress?.nextAction ?? null,
    manualTestNext: manualTest.next ?? null,
    nextHumanAction: createNextHumanAction({
      localPreviewOk,
      strictOk,
      readyForManualWechat,
      manualTest,
      testData,
      wechatConfig
    }),
    captureCommand: devStatus.visualQa?.captureCommand ?? null
  };
}

function parseJsonOutput(stdout) {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('dev-status output did not contain JSON');
  }

  return JSON.parse(stdout.slice(start, end + 1));
}

export function readStrictDevStatus() {
  const result = spawnSync(process.execPath, ['scripts/dev-status.mjs', '--strict'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });

  if (!result.stdout) {
    throw new Error(result.stderr || 'dev-status did not return output');
  }

  return parseJsonOutput(result.stdout);
}

async function main() {
  const [testData, wechatConfig] = await Promise.all([
    readManualTestDataReadiness(),
    Promise.resolve(readWechatConfigReadiness())
  ]);
  const readiness = createManualTestReadiness(readStrictDevStatus(), {
    testData,
    wechatConfig
  });
  console.log(JSON.stringify(readiness, null, 2));
  if (!readiness.readyForManualWechat) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  });
}
