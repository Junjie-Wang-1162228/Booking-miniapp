export const DEFAULT_DEV_JWT_SECRET = 'dev-secret-change-before-production';

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

export function isWechatAutoProvisionEnabled(config: ConfigReader) {
  return readBoolean(config.get('WECHAT_AUTO_PROVISION_ENABLED'), !isProduction(config));
}
