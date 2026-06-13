export const DEFAULT_DEV_JWT_SECRET = 'dev-secret-change-before-production';
export const DEFAULT_ADMIN_PASSWORD = 'admin123456';
export const DEFAULT_MANAGER_PASSWORD = 'manager123456';

type ConfigReader = {
  get(key: string): string | undefined;
};

function isProduction(config: ConfigReader) {
  return config.get('NODE_ENV') === 'production';
}

function readBoolean(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function resolveJwtSecret(config: ConfigReader) {
  const secret = config.get('JWT_SECRET')?.trim();

  if (isProduction(config) && (!secret || secret === DEFAULT_DEV_JWT_SECRET)) {
    throw new Error('JWT_SECRET must be set to a non-default value in production');
  }

  return secret || DEFAULT_DEV_JWT_SECRET;
}

export function assertProductionDatabaseConfig(config: ConfigReader) {
  if (!isProduction(config)) return;

  const databaseUrl = config.get('DATABASE_URL')?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set in production');
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid URL in production');
  }

  const host = parsed.hostname.toLowerCase();
  if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(host)) {
    throw new Error('DATABASE_URL must not point to a local database in production');
  }

  const username = decodeURIComponent(parsed.username).toLowerCase();
  if (['root', 'admin', 'administrator', 'postgres', 'mysql'].includes(username)) {
    throw new Error('DATABASE_URL must not use a superuser account in production');
  }
  if (username === 'booking_user') {
    throw new Error('DATABASE_URL must not use the example local database user in production');
  }

  const databaseName = parsed.pathname.replace(/^\/+/, '').toLowerCase();
  if (!databaseName || /(^|[_-])(dev|test|local|shadow)([_-]|$)/.test(databaseName)) {
    throw new Error('DATABASE_URL must not point to a development, test, or shadow database in production');
  }
}

export function assertDemoSeedAllowed(config: ConfigReader) {
  if (isProduction(config)) {
    throw new Error('Demo seed data must not be loaded in production');
  }
}

function resolveSeedPassword(config: ConfigReader, key: string, defaultValue: string) {
  const password = config.get(key)?.trim();

  if (isProduction(config) && (!password || password === defaultValue)) {
    throw new Error(`${key} must be set to a non-default value in production`);
  }

  return password || defaultValue;
}

export function resolveAdminSeedPassword(config: ConfigReader) {
  return resolveSeedPassword(config, 'ADMIN_PASSWORD', DEFAULT_ADMIN_PASSWORD);
}

export function resolveManagerSeedPassword(config: ConfigReader) {
  return resolveSeedPassword(config, 'MANAGER_PASSWORD', DEFAULT_MANAGER_PASSWORD);
}

export function isDefaultSeedAdminPassword(config: ConfigReader, password: string) {
  if (!isProduction(config)) return false;

  const normalizedPassword = password.trim();
  return [DEFAULT_ADMIN_PASSWORD, DEFAULT_MANAGER_PASSWORD].includes(normalizedPassword);
}

export function isWechatAutoProvisionEnabled(config: ConfigReader) {
  return readBoolean(config.get('WECHAT_AUTO_PROVISION_ENABLED'), !isProduction(config));
}

export function resolveCorsOrigin(config: ConfigReader) {
  const configuredOrigins = config
    .get('CORS_ORIGINS')
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!isProduction(config)) {
    return configuredOrigins?.length ? configuredOrigins : true;
  }

  if (!configuredOrigins?.length) {
    throw new Error('CORS_ORIGINS must be set in production');
  }

  return configuredOrigins;
}
