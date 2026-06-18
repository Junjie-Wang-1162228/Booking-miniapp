import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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

function isRealLookingWechatAppId(value) {
  return /\bwx[0-9a-z]{16,}\b/i.test(String(value ?? '').trim());
}

function readJsonFile(path) {
  if (!existsSync(path)) return {};
  const source = readFileSync(path, 'utf8').trim();
  return source ? JSON.parse(source) : {};
}

export function createMiniappPrivateConfig(existingConfig, appId) {
  return {
    ...existingConfig,
    appid: appId
  };
}

export function syncMiniappPrivateConfig({
  envPath = resolve(process.cwd(), 'apps/api/.env'),
  privateConfigPath = resolve(process.cwd(), 'apps/miniapp/project.private.config.json')
} = {}) {
  if (!existsSync(envPath)) {
    throw new Error(`Missing env file: ${envPath}`);
  }

  const env = parseEnvSource(readFileSync(envPath, 'utf8'));
  const appId = String(env.MINIAPP_APP_ID ?? '').trim();
  if (!isRealLookingWechatAppId(appId)) {
    throw new Error('MINIAPP_APP_ID must be configured with a real WeChat AppID before syncing DevTools config');
  }

  const config = createMiniappPrivateConfig(readJsonFile(privateConfigPath), appId);
  mkdirSync(dirname(privateConfigPath), { recursive: true });
  writeFileSync(privateConfigPath, `${JSON.stringify(config, null, 2)}\n`);

  return {
    updated: true,
    privateConfigPath,
    appidConfigured: true,
    appidPrinted: false
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    console.log(JSON.stringify(syncMiniappPrivateConfig(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
