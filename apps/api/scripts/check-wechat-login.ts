import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type EnvMap = Record<string, string | undefined>;

function parseEnvFile(path: string): EnvMap {
  if (!existsSync(path)) return {};

  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .reduce<EnvMap>((env, line) => {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex === -1) return env;

      const key = line.slice(0, separatorIndex).trim();
      const rawValue = line.slice(separatorIndex + 1).trim();
      env[key] = rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
      return env;
    }, {});
}

function readConfig() {
  const envPath = resolve(process.cwd(), '.env');
  const fileEnv = parseEnvFile(envPath);

  return {
    envPath,
    appId: process.env.MINIAPP_APP_ID ?? fileEnv.MINIAPP_APP_ID ?? '',
    appSecret: process.env.MINIAPP_APP_SECRET ?? fileEnv.MINIAPP_APP_SECRET ?? '',
    mockEnabled: process.env.WECHAT_LOGIN_MOCK_ENABLED ?? fileEnv.WECHAT_LOGIN_MOCK_ENABLED ?? 'false',
    autoProvisionEnabled:
      process.env.WECHAT_AUTO_PROVISION_ENABLED ?? fileEnv.WECHAT_AUTO_PROVISION_ENABLED ?? 'true',
    autoProvisionBranch:
      process.env.WECHAT_AUTO_PROVISION_BRANCH_NAME ?? fileEnv.WECHAT_AUTO_PROVISION_BRANCH_NAME ?? '',
    autoProvisionLessons:
      process.env.WECHAT_AUTO_PROVISION_LESSONS ?? fileEnv.WECHAT_AUTO_PROVISION_LESSONS ?? '10',
    testCode: process.env.WECHAT_LOGIN_TEST_CODE ?? ''
  };
}

function isEnabled(value: string) {
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function mask(value: string) {
  if (!value) return '<empty>';
  if (value.length <= 8) return '<set>';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function checkCode2Session(appId: string, appSecret: string, code: string) {
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', appId);
  url.searchParams.set('secret', appSecret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  const response = await fetch(url);
  const data = (await response.json()) as {
    openid?: string;
    unionid?: string;
    errcode?: number;
    errmsg?: string;
  };

  if (data.errcode || !data.openid) {
    throw new Error(`code2Session failed: ${data.errcode ?? 'NO_OPENID'} ${data.errmsg ?? ''}`.trim());
  }

  return data;
}

async function main() {
  const config = readConfig();
  const mockEnabled = isEnabled(config.mockEnabled);
  const autoProvisionLessons = Number(config.autoProvisionLessons);
  const failures: string[] = [];

  console.log(`Using env file: ${config.envPath}`);
  console.log(`MINIAPP_APP_ID: ${config.appId || '<empty>'}`);
  console.log(`MINIAPP_APP_SECRET: ${mask(config.appSecret)}`);
  console.log(`WECHAT_LOGIN_MOCK_ENABLED: ${config.mockEnabled}`);
  console.log(`WECHAT_AUTO_PROVISION_ENABLED: ${config.autoProvisionEnabled}`);
  console.log(`WECHAT_AUTO_PROVISION_BRANCH_NAME: ${config.autoProvisionBranch || '<first active branch>'}`);
  console.log(`WECHAT_AUTO_PROVISION_LESSONS: ${config.autoProvisionLessons}`);

  if (!config.appId) {
    failures.push('MINIAPP_APP_ID is required.');
  }

  if (config.appId === 'personal-mvp-appid') {
    failures.push('MINIAPP_APP_ID still uses the placeholder value.');
  }

  if (!mockEnabled && !config.appSecret) {
    failures.push('MINIAPP_APP_SECRET is required when WECHAT_LOGIN_MOCK_ENABLED is false.');
  }

  if (!Number.isInteger(autoProvisionLessons) || autoProvisionLessons < 0) {
    failures.push('WECHAT_AUTO_PROVISION_LESSONS must be a non-negative integer.');
  }

  if (failures.length > 0) {
    console.error('\nConfiguration check failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }

  if (!config.testCode) {
    console.log('\nConfiguration check passed.');
    console.log('Set WECHAT_LOGIN_TEST_CODE to a fresh wx.login code to verify code2Session.');
    return;
  }

  if (mockEnabled) {
    console.log('\nMock login is enabled; skipping real code2Session check.');
    return;
  }

  const session = await checkCode2Session(config.appId, config.appSecret, config.testCode);
  console.log('\ncode2Session check passed.');
  console.log(`openid: ${mask(session.openid ?? '')}`);
  if (session.unionid) {
    console.log(`unionid: ${mask(session.unionid)}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
