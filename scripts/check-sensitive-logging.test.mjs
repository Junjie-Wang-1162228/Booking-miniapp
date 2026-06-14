import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findSensitiveLoggingViolations,
  scanSourceForSensitiveLogging
} from './check-sensitive-logging.mjs';

test('flags logging calls that include unmasked sensitive identifiers', () => {
  const source = `
    this.logger.error(\`wechat openid login failed: \${openid}\`);
    console.log(\`JWT token: \${token}\`);
  `;

  assert.deepEqual(scanSourceForSensitiveLogging('apps/api/src/auth/auth.service.ts', source), [
    {
      file: 'apps/api/src/auth/auth.service.ts',
      line: 2,
      term: 'openid',
      text: 'this.logger.error(`wechat openid login failed: ${openid}`);'
    },
    {
      file: 'apps/api/src/auth/auth.service.ts',
      line: 3,
      term: 'token',
      text: 'console.log(`JWT token: ${token}`);'
    }
  ]);
});

test('flags logging calls that include unmasked WeChat AppID values', () => {
  const source = 'console.log(`MINIAPP_APP_ID: ${config.appId}`);';

  assert.deepEqual(scanSourceForSensitiveLogging('apps/api/scripts/check-wechat-login.ts', source), [
    {
      file: 'apps/api/scripts/check-wechat-login.ts',
      line: 1,
      term: 'appId',
      text: 'console.log(`MINIAPP_APP_ID: ${config.appId}`);'
    }
  ]);
});

test('allows sensitive labels when the logged value is explicitly masked', () => {
  const source = `
    console.log(\`MINIAPP_APP_ID: \${mask(config.appId)}\`);
    console.log(\`MINIAPP_APP_SECRET: \${mask(config.appSecret)}\`);
    console.log(\`openid: \${mask(session.openid ?? '')}\`);
  `;

  assert.deepEqual(scanSourceForSensitiveLogging('apps/api/scripts/check-wechat-login.ts', source), []);
});

test('ignores sensitive identifiers outside logging calls', () => {
  const source = `
    const openid = dto.wechatOpenid?.trim();
    await tx.wechatAccount.create({ data: { openid } });
  `;

  assert.deepEqual(scanSourceForSensitiveLogging('apps/api/src/members/members.service.ts', source), []);
});

test('finds sensitive logging violations across provided files', () => {
  const files = new Map([
    ['apps/api/src/auth/auth.service.ts', 'this.logger.warn(`phone=${phone}`);'],
    ['apps/api/src/members/members.service.ts', 'const phone = dto.phone;']
  ]);

  const readFile = (file) => files.get(file) ?? '';
  assert.deepEqual(
    findSensitiveLoggingViolations({
      files: [...files.keys()],
      readFile
    }),
    [
      {
        file: 'apps/api/src/auth/auth.service.ts',
        line: 1,
        term: 'phone',
        text: 'this.logger.warn(`phone=${phone}`);'
      }
    ]
  );
});
