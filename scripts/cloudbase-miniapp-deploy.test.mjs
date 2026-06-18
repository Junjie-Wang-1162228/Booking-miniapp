import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

test('api is ready for CloudBase Run container deployment', () => {
  assert.equal(existsSync('Dockerfile'), true);
  assert.equal(existsSync('.dockerignore'), true);

  const dockerfile = readFileSync('Dockerfile', 'utf8');
  const mainSource = readFileSync('apps/api/src/main.ts', 'utf8');

  assert.match(dockerfile, /corepack enable/);
  assert.match(dockerfile, /pnpm --filter @booking\/api prisma:generate/);
  assert.match(dockerfile, /pnpm --filter @booking\/api build/);
  assert.match(dockerfile, /EXPOSE 3000/);
  assert.match(dockerfile, /node", "apps\/api\/dist\/src\/main\.js"/);
  assert.match(mainSource, /config\.get\('PORT'\)/);
  assert.match(mainSource, /config\.get\('API_PORT'\)/);
});

test('admin WeChat binding can promote the current miniapp binding code to ADMIN login', () => {
  const apiPackage = JSON.parse(readFileSync('apps/api/package.json', 'utf8'));
  const scriptPath = 'apps/api/scripts/bind-admin-wechat.ts';

  assert.equal(apiPackage.scripts['wechat:bind-admin'], 'tsx scripts/bind-admin-wechat.ts');
  assert.equal(existsSync(scriptPath), true);

  const source = readFileSync(scriptPath, 'utf8');
  assert.match(source, /UserRole\.ADMIN/);
  assert.match(source, /wechatBindingTicket\.findUnique/);
  assert.match(source, /wechatAccount\.create/);
  assert.match(source, /status:\s*'BOUND'/);
  assert.doesNotMatch(source, /console\.log\([^)]*openid/);
});

test('temporary CloudBase test accounts are explicit and documented', () => {
  const apiPackage = JSON.parse(readFileSync('apps/api/package.json', 'utf8'));
  const scriptPath = 'apps/api/scripts/seed-cloud-test-accounts.ts';

  assert.equal(apiPackage.scripts['seed:cloud-test-accounts'], 'tsx scripts/seed-cloud-test-accounts.ts');
  assert.equal(existsSync(scriptPath), true);

  const source = readFileSync(scriptPath, 'utf8');
  assert.match(source, /upsertAdminUser\('admin', adminPasswordHash/);
  assert.match(source, /upsertAdminUser\('test', testPasswordHash/);
  assert.match(source, /bcrypt\.hash\('admin'/);
  assert.match(source, /bcrypt\.hash\('test'/);
  assert.match(source, /StaffRole\.OWNER/);
  assert.match(source, /StaffRole\.MANAGER/);
  assert.doesNotMatch(source, /console\.log\([^)]*password/i);
});

test('docs explain miniapp-only CloudBase real-device testing without the web admin', () => {
  assert.equal(existsSync('docs/cloudbase-miniapp-runbook.md'), true);
  const docs = readFileSync('docs/cloudbase-miniapp-runbook.md', 'utf8');
  const readme = readFileSync('README.md', 'utf8');

  assert.match(docs, /CloudBase Run/);
  assert.match(docs, /网站后台可以暂时不部署/);
  assert.match(docs, /pnpm --filter @booking\/api wechat:bind-admin/);
  assert.match(docs, /admin\/admin/);
  assert.match(docs, /test\/test/);
  assert.match(docs, /临时测试账号/);
  assert.match(docs, /账号登录/);
  assert.match(docs, /微信授权登录/);
  assert.match(docs, /会员侧继续使用微信绑定登录/);
  assert.match(docs, /6 位绑定码/);
  assert.match(docs, /TARO_APP_API_BASE_URL/);
  assert.match(readme, /docs\/cloudbase-miniapp-runbook\.md/);
});
