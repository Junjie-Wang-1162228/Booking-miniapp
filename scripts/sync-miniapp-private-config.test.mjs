import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createMiniappPrivateConfig,
  syncMiniappPrivateConfig
} from './sync-miniapp-private-config.mjs';

const packagePath = 'package.json';
const readmePath = 'README.md';
const manualChecklistPath = 'docs/manual-test-checklist.md';
const optimizationChecklistPath = 'docs/optimization-checklist.md';

function read(path) {
  return readFileSync(path, 'utf8');
}

function withTempProject(fn) {
  const root = mkdtempSync(join(tmpdir(), 'booking-miniapp-private-config-'));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('createMiniappPrivateConfig preserves existing private config and sets the real AppID', () => {
  const appId = ['wx', 'abcdef1234567890'].join('');
  const config = createMiniappPrivateConfig(
    {
      projectname: '拳馆约课',
      setting: { urlCheck: false }
    },
    appId
  );

  assert.deepEqual(config, {
    projectname: '拳馆约课',
    setting: { urlCheck: false },
    appid: appId
  });
});

test('syncMiniappPrivateConfig writes ignored DevTools private config without exposing the AppID', () =>
  withTempProject((root) => {
    const envPath = join(root, '.env');
    const privateConfigPath = join(root, 'project.private.config.json');
    const appId = ['wx', 'abcdef1234567890'].join('');
    writeFileSync(envPath, `MINIAPP_APP_ID=${appId}\nMINIAPP_APP_SECRET=secret-value\n`);
    writeFileSync(privateConfigPath, '{\n  "projectname": "拳馆约课"\n}\n');

    const result = syncMiniappPrivateConfig({ envPath, privateConfigPath });
    const privateConfig = JSON.parse(readFileSync(privateConfigPath, 'utf8'));

    assert.equal(privateConfig.appid, appId);
    assert.equal(privateConfig.projectname, '拳馆约课');
    assert.deepEqual(result, {
      updated: true,
      privateConfigPath,
      appidConfigured: true,
      appidPrinted: false
    });
    assert.doesNotMatch(JSON.stringify(result), new RegExp(appId));
    assert.doesNotMatch(JSON.stringify(result), /secret-value/);
  }));

test('syncMiniappPrivateConfig rejects missing or placeholder AppID before writing', () =>
  withTempProject((root) => {
    const envPath = join(root, '.env');
    const privateConfigPath = join(root, 'project.private.config.json');
    writeFileSync(envPath, 'MINIAPP_APP_ID=touristappid\n');
    writeFileSync(privateConfigPath, '{\n  "projectname": "拳馆约课"\n}\n');

    assert.throws(
      () => syncMiniappPrivateConfig({ envPath, privateConfigPath }),
      /MINIAPP_APP_ID must be configured with a real WeChat AppID/
    );
    assert.deepEqual(JSON.parse(readFileSync(privateConfigPath, 'utf8')), {
      projectname: '拳馆约课'
    });
  }));

test('package and docs expose the miniapp private config sync command', () => {
  const packageJson = JSON.parse(read(packagePath));
  const readme = read(readmePath);
  const manualChecklist = read(manualChecklistPath);
  const optimizationChecklist = read(optimizationChecklistPath);

  assert.equal(packageJson.scripts['miniapp:sync-private-config'], 'node scripts/sync-miniapp-private-config.mjs');
  assert.match(readme, /pnpm miniapp:sync-private-config/);
  assert.match(readme, /不输出真实 AppID/);
  assert.match(manualChecklist, /pnpm miniapp:sync-private-config/);
  assert.match(optimizationChecklist, /miniapp:sync-private-config/);
});
