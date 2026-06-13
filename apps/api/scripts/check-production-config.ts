import {
  assertProductionDatabaseConfig,
  isWechatAutoProvisionEnabled,
  resolveCorsOrigin,
  resolveJwtSecret
} from '../src/auth/security-config';

const envConfig = { get: (key: string) => process.env[key] };

function main() {
  resolveJwtSecret(envConfig);
  resolveCorsOrigin(envConfig);
  assertProductionDatabaseConfig(envConfig);

  if (process.env.NODE_ENV === 'production' && isWechatAutoProvisionEnabled(envConfig)) {
    throw new Error('WECHAT_AUTO_PROVISION_ENABLED must be false in production');
  }

  console.log('Production configuration check passed');
}

main();
