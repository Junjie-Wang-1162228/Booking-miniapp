import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const apiPackageJson = JSON.parse(readFileSync('apps/api/package.json', 'utf8'));
const readme = readFileSync('README.md', 'utf8');
const envExample = readFileSync('.env.example', 'utf8');
const dockerCompose = readFileSync('docker-compose.yml', 'utf8');
const manualChecklist = readFileSync('docs/manual-test-checklist.md', 'utf8');
const verifyWorkflowPath = '.github/workflows/verify.yml';

function gitGrep(pattern) {
  try {
    return execFileSync('git', ['grep', '-n', pattern, '--', ':!pnpm-lock.yaml'], { encoding: 'utf8' });
  } catch (error) {
    if (error.status === 1) return '';
    throw error;
  }
}

test('package exposes a single safe project verification command', () => {
  const verify = packageJson.scripts.verify;

  assert.equal(typeof verify, 'string');
  assert.match(verify, /^pnpm --filter @booking\/api prisma:generate && pnpm lint/);
  assert.match(verify, /pnpm lint/);
  assert.match(verify, /pnpm --filter @booking\/api test:e2e/);
  assert.match(verify, /node --test scripts\/\*\.test\.mjs/);
  assert.match(verify, /pnpm security:check/);
  assert.match(verify, /pnpm build/);
  assert.doesNotMatch(verify, /miniapp:visual-qa:capture|miniapp:visual-qa:check/);
});

test('README documents pnpm verify as the pre-push quality gate', () => {
  assert.match(readme, /pnpm verify/);
  assert.match(readme, /统一质量门禁/);
  assert.match(readme, /不打开微信开发者工具/);
});

test('README documents dev status visual QA screenshot targets', () => {
  assert.match(readme, /`pnpm dev:status`[^\n]*视觉截图矩阵完成度[^\n]*截图保存路径/);
  assert.match(readme, /`pnpm dev:status`[^\n]*MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next/);
  assert.match(readme, /visualQa\.captureCommand/);
});

test('GitHub Actions verify workflow runs the same safe project gate', () => {
  assert.equal(existsSync(verifyWorkflowPath), true);
  const workflow = readFileSync(verifyWorkflowPath, 'utf8');

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24:\s*true/);
  assert.match(workflow, /actions\/checkout@v4/);
  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /corepack enable/);
  assert.match(workflow, /corepack prepare pnpm@9\.15\.9 --activate/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm verify/);
  assert.match(workflow, /mysql:8\.4/);
  assert.match(workflow, /3307:3306/);
  assert.match(workflow, /MYSQL_ROOT_PASSWORD:\s*booking_root/);
  assert.doesNotMatch(workflow, /miniapp:visual-qa:capture|miniapp:visual-qa:check/);
});

test('local mysql host port can be overridden without editing tracked project files', () => {
  assert.match(dockerCompose, /\$\{BOOKING_MYSQL_HOST_PORT:-3307\}:3306/);
  assert.match(envExample, /^BOOKING_MYSQL_HOST_PORT="3307"$/m);
  assert.match(readme, /BOOKING_MYSQL_HOST_PORT=3308/);
  assert.match(readme, /apps\/api\/\.env[\s\S]*DATABASE_URL[\s\S]*3308/);
  assert.match(manualChecklist, /BOOKING_MYSQL_HOST_PORT=3308/);
  assert.match(manualChecklist, /pnpm dev:status:strict/);
});

test('tracked miniapp appid values stay placeholder-only', () => {
  const miniappProjectConfig = readFileSync('apps/miniapp/project.config.json', 'utf8');
  const wechatCheckScript = readFileSync('apps/api/scripts/check-wechat-login.ts', 'utf8');

  assert.match(envExample, /^MINIAPP_APP_ID="touristappid"$/m);
  assert.match(miniappProjectConfig, /"appid":\s*"touristappid"/);
  assert.match(wechatCheckScript, /touristappid/);
  assert.equal(gitGrep(`personal-mvp-${'appid'}`), '');
});

test('local setup uses non-interactive prisma deployment for existing migrations', () => {
  assert.equal(apiPackageJson.scripts['prisma:deploy'], 'prisma migrate deploy');
  assert.match(readme, /pnpm --filter @booking\/api prisma:deploy/);
  assert.match(manualChecklist, /pnpm --filter @booking\/api prisma:deploy/);
  assert.match(readme, /交互式的 `pnpm --filter @booking\/api prisma:migrate` 创建新 migration/);
  assert.doesNotMatch(readme, /pnpm --filter @booking\/api prisma:migrate\s*\n\s*pnpm --filter @booking\/api prisma:seed/);
  assert.doesNotMatch(manualChecklist, /pnpm --filter @booking\/api prisma:migrate/);
});
