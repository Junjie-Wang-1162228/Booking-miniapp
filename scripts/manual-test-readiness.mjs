import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
const MINIAPP_REQUIRED_DIST_FILES = ['app.js', 'app.json', 'pages/classes/index.js'];
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
const MINIAPP_CHECKLIST_ACTIONS = {
  devtoolsOpen: {
    section: '2. 真实微信登录准备',
    line: 22,
    text: '在微信开发者工具中打开小程序构建目录 `apps/miniapp/dist`，不要打开源码目录 `apps/miniapp`。'
  }
};
const MANUAL_TEST_CHECKLIST_ACTIONS = {
  testData: {
    section: '1. 本地环境准备',
    line: 7,
    text: '执行现有迁移和种子数据：`pnpm --filter @booking/api prisma:deploy && pnpm --filter @booking/api prisma:seed`。'
  },
  cloudTestAccounts: {
    section: '3. 后台权限和排课',
    line: 26,
    text: '运行 `pnpm --filter @booking/api seed:cloud-test-accounts`，确认当前数据库有小程序运营端测试账号。'
  },
  managerScope: {
    section: '3. 后台权限和排课',
    line: 31,
    text: '确认店长只能选择 `城东店`，不能查看或操作 `城西店` 数据。'
  },
  miniappOpsEntry: {
    section: '3. 后台权限和排课',
    line: 27,
    text: '小程序账户页使用 `admin` / `admin` 账号登录，确认可以看到“运营管理”入口。'
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
  wechatConfig,
  miniappProject
}) {
  if (!localPreviewOk || !strictOk) return manualTest.next ?? null;
  if (testData?.ready === false) return testData.nextHumanAction ?? manualTest.next ?? null;
  if (wechatConfig?.ready === false) return wechatConfig.nextHumanAction ?? manualTest.next ?? null;
  if (miniappProject?.ready === false) return miniappProject.nextHumanAction ?? manualTest.next ?? null;
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
  miniappAdminAccountLoginOk = null,
  miniappTestAccountLoginOk = null,
  miniappAdminBranchCount = null,
  miniappTestBranchCount = null,
  miniappAdminOpsReadOk = null,
  miniappTestOpsReadOk = null,
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
  const miniappAdminHasBranchAccess =
    typeof miniappAdminBranchCount === 'number' ? miniappAdminBranchCount > 0 : null;
  const miniappTestSingleBranchOnly =
    typeof miniappTestBranchCount === 'number' ? miniappTestBranchCount === 1 : null;
  const nowMs = Date.parse(now);
  const futureClassCount = classes.filter((boxingClass) => {
    if (boxingClass.status && boxingClass.status !== 'SCHEDULED') return false;
    const startsAtMs = Date.parse(String(boxingClass.startsAt ?? ''));
    return Number.isFinite(startsAtMs) && startsAtMs > nowMs;
  }).length;
  const failures = [];

  if (miniappAdminAccountLoginOk === false) {
    failures.push(
      createReadinessFailure({
        id: 'miniapp-admin-account-login-failed',
        detail: 'miniapp admin account login failed',
        nextHumanAction: MANUAL_TEST_CHECKLIST_ACTIONS.cloudTestAccounts
      })
    );
  }

  if (miniappAdminAccountLoginOk === true && miniappAdminHasBranchAccess === false) {
    failures.push(
      createReadinessFailure({
        id: 'miniapp-admin-account-no-branch',
        detail: 'miniapp admin account has no branch access',
        nextHumanAction: MANUAL_TEST_CHECKLIST_ACTIONS.cloudTestAccounts
      })
    );
  }

  if (miniappTestAccountLoginOk === false) {
    failures.push(
      createReadinessFailure({
        id: 'miniapp-test-account-login-failed',
        detail: 'miniapp test account login failed',
        nextHumanAction: MANUAL_TEST_CHECKLIST_ACTIONS.cloudTestAccounts
      })
    );
  }

  if (miniappTestAccountLoginOk === true && miniappTestSingleBranchOnly === false) {
    failures.push(
      createReadinessFailure({
        id: 'miniapp-test-account-over-scoped',
        detail: 'miniapp test account must access exactly one branch',
        nextHumanAction: MANUAL_TEST_CHECKLIST_ACTIONS.cloudTestAccounts
      })
    );
  }

  if (miniappAdminOpsReadOk === false) {
    failures.push(
      createReadinessFailure({
        id: 'miniapp-admin-ops-read-failed',
        detail: 'miniapp admin operation read APIs failed',
        nextHumanAction: MANUAL_TEST_CHECKLIST_ACTIONS.miniappOpsEntry
      })
    );
  }

  if (miniappTestOpsReadOk === false) {
    failures.push(
      createReadinessFailure({
        id: 'miniapp-test-ops-read-failed',
        detail: 'miniapp test operation read APIs failed',
        nextHumanAction: MANUAL_TEST_CHECKLIST_ACTIONS.miniappOpsEntry
      })
    );
  }

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
    miniappAdminAccountLoginOk,
    miniappTestAccountLoginOk,
    miniappAdminBranchCount,
    miniappTestBranchCount,
    miniappAdminHasBranchAccess,
    miniappTestSingleBranchOnly,
    miniappAdminOpsReadOk,
    miniappTestOpsReadOk,
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

function normalizeMiniappRoot(value) {
  return String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

function isRealLookingWechatAppId(value) {
  return /\bwx[0-9a-z]{16,}\b/i.test(String(value ?? '').trim());
}

function isLocalOnlyUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname);
  } catch {
    return false;
  }
}

export function extractMiniappDistApiBaseUrls(sources = []) {
  return [
    ...new Set(
      sources
        .flatMap((source) => String(source ?? '').match(/https?:\/\/[^"'`\s)]+/g) ?? [])
        .map((url) => url.replace(/\/+$/, ''))
    )
  ];
}

export function classifyMiniappDistApiBase(sources = []) {
  if (isCloudbaseContainerBuild(sources.join('\n'))) return 'device-reachable';

  const urls = extractMiniappDistApiBaseUrls(sources);
  if (urls.some(isLocalOnlyUrl)) return 'local-only';
  if (urls.length > 0) return 'device-reachable';
  return 'unknown';
}

function isCloudbaseContainerBuild(source) {
  const text = String(source ?? '');
  const hasCloudCall = /cloud\.callContainer/.test(text);
  const envExpression = text.match(/config\s*:\s*\{\s*env\s*:\s*(["'][^"']*["']|[A-Za-z_$][\w$]*)/)?.[1] ?? '';
  const serviceExpression =
    text.match(/["']X-WX-SERVICE["']\s*:\s*(["'][^"']*["']|[A-Za-z_$][\w$]*)/)?.[1] ?? '';

  return (
    hasCloudCall &&
    Boolean(resolveStaticStringValue(text, envExpression)) &&
    Boolean(resolveStaticStringValue(text, serviceExpression))
  );
}

function resolveStaticStringValue(source, expression) {
  const text = String(source ?? '');
  const trimmedExpression = String(expression ?? '').trim();
  const literal = trimmedExpression.match(/^["']([^"']+)["']$/);
  if (literal) return literal[1];
  if (!/^[A-Za-z_$][\w$]*$/.test(trimmedExpression)) return '';

  const assignment = new RegExp(`\\b${escapeRegExp(trimmedExpression)}\\s*=\\s*["']([^"']+)["']`).exec(text);
  return assignment?.[1] ?? '';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isLikelyMiniappApiBaseUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isPrivateIpv4 =
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
    return isLocalOnlyUrl(value) || isPrivateIpv4 || Boolean(url.port) || /\bapi[.-]/.test(hostname);
  } catch {
    return false;
  }
}

export function selectMiniappDistApiBaseUrl(urls = []) {
  return urls.find((url) => !isLocalOnlyUrl(url) && isLikelyMiniappApiBaseUrl(url)) ?? null;
}

function readMiniappDistSources(distPath) {
  if (!existsSync(distPath)) return [];
  const sources = [];

  function walk(directory) {
    for (const name of readdirSync(directory)) {
      const path = resolve(directory, name);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        walk(path);
      } else if (/\.(js|json|wxml|wxss)$/.test(name)) {
        sources.push(readFileSync(path, 'utf8'));
      }
    }
  }

  walk(distPath);
  return sources;
}

function safeParseJsonFile(path) {
  if (!existsSync(path)) return { exists: false, value: null, error: null };

  try {
    return {
      exists: true,
      value: JSON.parse(readFileSync(path, 'utf8')),
      error: null
    };
  } catch (error) {
    return {
      exists: true,
      value: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function createMiniappProjectReadiness({
  projectConfig = null,
  projectConfigParseError = null,
  privateConfig = null,
  privateConfigExists = false,
  privateConfigParseError = null,
  distFilesPresent = false,
  missingDistFiles = [],
  distApiBaseUrlKind = 'unknown',
  distApiHealthOk = null,
  source = null
} = {}) {
  const miniprogramRoot = normalizeMiniappRoot(projectConfig?.miniprogramRoot);
  const miniprogramRootPointsToDist = miniprogramRoot === 'dist';
  const trackedAppId = String(projectConfig?.appid ?? '').trim();
  const trackedAppIdPlaceholder = PLACEHOLDER_APP_IDS.has(trackedAppId);
  const trackedAppIdRealLooking = isRealLookingWechatAppId(trackedAppId);
  const privateAppId = String(privateConfig?.appid ?? '').trim();
  const privateAppIdConfigured = privateAppId !== '' && !PLACEHOLDER_APP_IDS.has(privateAppId);
  const privateAppIdPlaceholder = privateAppId !== '' && PLACEHOLDER_APP_IDS.has(privateAppId);
  const privateAppIdRealLooking = isRealLookingWechatAppId(privateAppId);
  const distApiBaseUrlDeviceReachable =
    distApiBaseUrlKind === 'device-reachable' ? true : distApiBaseUrlKind === 'local-only' ? false : null;
  const failures = [];

  if (projectConfigParseError) {
    failures.push(
      createReadinessFailure({
        id: 'invalid-project-config',
        detail: 'apps/miniapp/project.config.json is not valid JSON',
        nextHumanAction: MINIAPP_CHECKLIST_ACTIONS.devtoolsOpen
      })
    );
  }

  if (!miniprogramRootPointsToDist) {
    failures.push(
      createReadinessFailure({
        id: 'wrong-miniprogram-root',
        detail: 'miniprogramRoot must point to dist/',
        nextHumanAction: MINIAPP_CHECKLIST_ACTIONS.devtoolsOpen
      })
    );
  }

  if (!trackedAppIdPlaceholder || trackedAppIdRealLooking) {
    failures.push(
      createReadinessFailure({
        id: trackedAppIdRealLooking ? 'tracked-real-app-id' : 'tracked-app-id-not-placeholder',
        detail: 'tracked project.config.json appid must stay touristappid',
        nextHumanAction: MINIAPP_CHECKLIST_ACTIONS.devtoolsOpen
      })
    );
  }

  if (privateConfigParseError) {
    failures.push(
      createReadinessFailure({
        id: 'invalid-private-project-config',
        detail: 'apps/miniapp/project.private.config.json is not valid JSON',
        nextHumanAction: MINIAPP_CHECKLIST_ACTIONS.devtoolsOpen
      })
    );
  }

  if (!privateAppIdRealLooking) {
    failures.push(
      createReadinessFailure({
        id: 'missing-private-app-id',
        detail: 'local project.private.config.json appid must be configured for real-device WeChat checks',
        nextHumanAction: MINIAPP_CHECKLIST_ACTIONS.devtoolsOpen
      })
    );
  }

  if (!distFilesPresent) {
    failures.push(
      createReadinessFailure({
        id: 'missing-miniapp-dist',
        detail:
          missingDistFiles.length > 0
            ? `missing miniapp dist files: ${missingDistFiles.join(', ')}`
            : 'missing miniapp dist files',
        nextHumanAction: MINIAPP_CHECKLIST_ACTIONS.devtoolsOpen
      })
    );
  }

  if (distApiBaseUrlKind === 'local-only') {
    failures.push(
      createReadinessFailure({
        id: 'miniapp-dist-local-api',
        detail: 'miniapp dist API base URL must be reachable from a real device',
        nextHumanAction: MINIAPP_CHECKLIST_ACTIONS.devtoolsOpen
      })
    );
  }

  if (distApiBaseUrlKind === 'device-reachable' && distApiHealthOk === false) {
    failures.push(
      createReadinessFailure({
        id: 'miniapp-dist-api-health-failed',
        detail: 'miniapp dist API health check failed',
        nextHumanAction: MINIAPP_CHECKLIST_ACTIONS.devtoolsOpen
      })
    );
  }

  return {
    checked: true,
    source,
    miniprogramRootPointsToDist,
    trackedAppIdPlaceholder,
    trackedAppIdRealLooking,
    privateConfigExists,
    privateAppIdConfigured,
    privateAppIdPlaceholder,
    privateAppIdRealLooking,
    distFilesPresent,
    missingDistFiles,
    distApiBaseUrlKind,
    distApiBaseUrlDeviceReachable,
    distApiHealthOk,
    ready: failures.length === 0,
    failures: failures.map(({ id, detail }) => ({ id, detail })),
    nextHumanAction: failures[0]?.nextHumanAction ?? null
  };
}

function joinHealthEndpoint(apiBaseUrl) {
  return `${String(apiBaseUrl).replace(/\/+$/, '')}/health`;
}

async function checkMiniappDistApiHealth(apiBaseUrl) {
  const response = await fetchJson(joinHealthEndpoint(apiBaseUrl));
  return response.ok === true;
}

export async function readMiniappProjectReadiness({
  projectConfigPath = resolve(process.cwd(), 'apps/miniapp/project.config.json'),
  privateConfigPath = resolve(process.cwd(), 'apps/miniapp/project.private.config.json'),
  distPath = resolve(process.cwd(), 'apps/miniapp/dist'),
  requiredDistFiles = MINIAPP_REQUIRED_DIST_FILES,
  distApiHealthChecker = checkMiniappDistApiHealth
} = {}) {
  const projectConfigResult = safeParseJsonFile(projectConfigPath);
  const privateConfigResult = safeParseJsonFile(privateConfigPath);
  const missingDistFiles = requiredDistFiles.filter((file) => !existsSync(resolve(distPath, file)));
  const distSources = readMiniappDistSources(distPath);
  const distApiBaseUrls = extractMiniappDistApiBaseUrls(distSources);
  const distApiBaseUrlKind = classifyMiniappDistApiBase(distSources);
  const deviceApiBaseUrl = selectMiniappDistApiBaseUrl(distApiBaseUrls);
  const distApiHealthOk =
    distApiBaseUrlKind === 'device-reachable' && deviceApiBaseUrl
      ? await distApiHealthChecker(deviceApiBaseUrl).catch(() => false)
      : null;

  return createMiniappProjectReadiness({
    projectConfig: projectConfigResult.value,
    projectConfigParseError: projectConfigResult.error,
    privateConfig: privateConfigResult.value,
    privateConfigExists: privateConfigResult.exists,
    privateConfigParseError: privateConfigResult.error,
    distFilesPresent: missingDistFiles.length === 0,
    missingDistFiles,
    distApiBaseUrlKind,
    distApiHealthOk,
    source: {
      projectConfig: projectConfigPath,
      privateConfig: privateConfigPath,
      dist: distPath
    }
  });
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

async function checkMiniappOpsReadApis(apiBaseUrl, accessToken, branchId) {
  if (!accessToken || !branchId) return false;
  const date = new Date().toISOString().slice(0, 10);
  const headers = { Authorization: `Bearer ${accessToken}` };
  const endpoints = [
    `/admin/metrics/daily?branchId=${encodeURIComponent(branchId)}&date=${encodeURIComponent(date)}`,
    `/admin/classes?branchId=${encodeURIComponent(branchId)}`,
    `/admin/bookings?branchId=${encodeURIComponent(branchId)}&date=${encodeURIComponent(date)}&status=BOOKED`,
    `/admin/members?branchId=${encodeURIComponent(branchId)}`
  ];
  const responses = await Promise.all(endpoints.map((endpoint) => fetchJson(`${apiBaseUrl}${endpoint}`, { headers })));
  return responses.every((response) => response.ok);
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
  const [login, miniappAdminLogin, miniappTestLogin] = await Promise.all([
    fetchJson(`${apiBaseUrl}/auth/admin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    }),
    fetchJson(`${apiBaseUrl}/auth/account-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' })
    }),
    fetchJson(`${apiBaseUrl}/auth/account-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test', password: 'test' })
    })
  ]);
  const miniappAdminAccessToken = miniappAdminLogin.body?.accessToken;
  const miniappTestAccessToken = miniappTestLogin.body?.accessToken;
  const accessToken = login.body?.accessToken ?? miniappAdminAccessToken;
  const miniappAdminBranches = Array.isArray(miniappAdminLogin.body?.user?.accessibleBranches)
    ? miniappAdminLogin.body.user.accessibleBranches
    : [];
  const miniappTestBranches = Array.isArray(miniappTestLogin.body?.user?.accessibleBranches)
    ? miniappTestLogin.body.user.accessibleBranches
    : [];
  const miniappAdminBranchId = miniappAdminBranches[0]?.id ?? null;
  const miniappTestBranchId = miniappTestBranches[0]?.id ?? null;
  const [miniappAdminOpsReadOk, miniappTestOpsReadOk] = await Promise.all([
    miniappAdminAccessToken
      ? checkMiniappOpsReadApis(apiBaseUrl, miniappAdminAccessToken, miniappAdminBranchId)
      : Promise.resolve(false),
    miniappTestAccessToken
      ? checkMiniappOpsReadApis(apiBaseUrl, miniappTestAccessToken, miniappTestBranchId)
      : Promise.resolve(false)
  ]);

  if (!accessToken) {
    return createManualTestDataReadiness({
      adminLoginOk: Boolean(miniappAdminAccessToken),
      miniappAdminAccountLoginOk: miniappAdminLogin.ok && Boolean(miniappAdminAccessToken),
      miniappTestAccountLoginOk: miniappTestLogin.ok && Boolean(miniappTestAccessToken),
      miniappAdminBranchCount: miniappAdminBranches.length,
      miniappTestBranchCount: miniappTestBranches.length,
      miniappAdminOpsReadOk,
      miniappTestOpsReadOk,
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
    miniappAdminAccountLoginOk: miniappAdminLogin.ok && Boolean(miniappAdminAccessToken),
    miniappTestAccountLoginOk: miniappTestLogin.ok && Boolean(miniappTestAccessToken),
    miniappAdminBranchCount: miniappAdminBranches.length,
    miniappTestBranchCount: miniappTestBranches.length,
    miniappAdminOpsReadOk,
    miniappTestOpsReadOk,
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
    wechatConfig = createWechatConfigReadiness({}),
    miniappProject = createMiniappProjectReadiness({})
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
  const readyForManualWechat =
    localPreviewOk &&
    strictOk &&
    testData.ready === true &&
    wechatConfig.ready === true &&
    miniappProject.ready === true;
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
      id: 'miniapp-devtools-project',
      label: '小程序 DevTools 项目配置',
      ok: miniappProject.ready === true,
      requiredFor: 'manual-start',
      detail: miniappProject.failures?.[0]?.detail ?? 'passed'
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
    miniappProject,
    nextAction: devStatus.progress?.nextAction ?? null,
    manualTestNext: manualTest.next ?? null,
    nextHumanAction: createNextHumanAction({
      localPreviewOk,
      strictOk,
      readyForManualWechat,
      manualTest,
      testData,
      wechatConfig,
      miniappProject
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
  const [testData, wechatConfig, miniappProject] = await Promise.all([
    readManualTestDataReadiness(),
    Promise.resolve(readWechatConfigReadiness()),
    readMiniappProjectReadiness()
  ]);
  const readiness = createManualTestReadiness(readStrictDevStatus(), {
    testData,
    wechatConfig,
    miniappProject
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
