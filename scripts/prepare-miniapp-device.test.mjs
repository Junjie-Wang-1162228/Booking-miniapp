import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createMiniappDevicePrepPlan,
  runMiniappDevicePrep,
  selectLanHost
} from './prepare-miniapp-device.mjs';

const packagePath = 'package.json';
const readmePath = 'README.md';
const manualChecklistPath = 'docs/manual-test-checklist.md';
const optimizationChecklistPath = 'docs/optimization-checklist.md';

function read(path) {
  return readFileSync(path, 'utf8');
}

test('selectLanHost picks a non-internal IPv4 address for real-device debugging', () => {
  assert.equal(
    selectLanHost({
      lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      en0: [{ address: '192.168.31.249', family: 'IPv4', internal: false }]
    }),
    '192.168.31.249'
  );
});

test('createMiniappDevicePrepPlan builds a device-reachable miniapp dist plan without opening DevTools', () => {
  const plan = createMiniappDevicePrepPlan({
    projectRoot: '/repo',
    lanHost: '192.168.31.249',
    apiPort: 4000,
    timezoneOffsetMinutes: 480
  });

  assert.equal(plan.apiBaseUrl, 'http://192.168.31.249:4000');
  assert.equal(plan.healthUrl, 'http://192.168.31.249:4000/health');
  assert.equal(plan.devtoolsProjectPath, '/repo/apps/miniapp/dist');
  assert.equal(plan.opensDevTools, false);
  assert.deepEqual(plan.steps.map((step) => step.id), ['sync-private-config', 'build-miniapp-dist', 'manual-readiness']);
  assert.deepEqual(plan.steps[1], {
    id: 'build-miniapp-dist',
    command: 'pnpm',
    args: ['--filter', '@booking/miniapp', 'build:weapp'],
    env: {
      TARO_APP_AUTH_MODE: 'wechat',
      TARO_APP_API_BASE_URL: 'http://192.168.31.249:4000',
      TARO_APP_CLOUDBASE_ENV_ID: '',
      TARO_APP_CLOUDBASE_SERVICE_NAME: '',
      TARO_APP_BUSINESS_TIMEZONE_OFFSET_MINUTES: '480'
    }
  });
});

test('createMiniappDevicePrepPlan rejects localhost API bases because phones cannot reach them', () => {
  assert.throws(
    () =>
      createMiniappDevicePrepPlan({
        projectRoot: '/repo',
        apiBaseUrl: 'http://localhost:4000'
      }),
    /device-reachable/
  );
});

test('createMiniappDevicePrepPlan requires an explicit API base when no LAN host is available', () => {
  assert.throws(
    () =>
      createMiniappDevicePrepPlan({
        projectRoot: '/repo',
        networks: {}
      }),
    /--api-base-url/
  );
});

test('runMiniappDevicePrep syncs private config, rebuilds dist, then runs readiness without leaking secrets', () => {
  const calls = [];
  const result = runMiniappDevicePrep({
    projectRoot: '/repo',
    lanHost: '192.168.31.249',
    runCommand: (command, args, options) => {
      calls.push({ command, args, env: options.env });

      if (args.join(' ') === 'ops:manual-test:readiness') {
        return {
          stdout: JSON.stringify({
            readyForManualWechat: true,
            miniappProject: {
              distApiBaseUrlKind: 'device-reachable',
              distApiHealthOk: true
            }
          })
        };
      }

      return { stdout: '{}' };
    }
  });

  assert.deepEqual(
    calls.map((call) => `${call.command} ${call.args.join(' ')}`),
    [
      'pnpm miniapp:sync-private-config',
      'pnpm --filter @booking/miniapp build:weapp',
      'pnpm ops:manual-test:readiness'
    ]
  );
  assert.equal(calls[1].env.TARO_APP_API_BASE_URL, 'http://192.168.31.249:4000');
  assert.equal(calls[1].env.TARO_APP_CLOUDBASE_ENV_ID, '');
  assert.equal(calls[1].env.TARO_APP_CLOUDBASE_SERVICE_NAME, '');
  assert.equal(result.readyForManualWechat, true);
  assert.equal(result.opensDevTools, false);
  assert.equal(result.nextHumanAction, 'Open /repo/apps/miniapp/dist in WeChat DevTools, then use real-device debugging.');
  assert.doesNotMatch(JSON.stringify(result), /MINIAPP_APP_SECRET|secret|wx[0-9a-z]{16,}/i);
});

test('package and docs expose the one-command real-device miniapp preparation flow', () => {
  const packageJson = JSON.parse(read(packagePath));
  const readme = read(readmePath);
  const manualChecklist = read(manualChecklistPath);
  const optimizationChecklist = read(optimizationChecklistPath);

  assert.equal(packageJson.scripts['miniapp:prepare-device'], 'node scripts/prepare-miniapp-device.mjs');
  assert.match(readme, /pnpm miniapp:prepare-device/);
  assert.match(readme, /真机调试/);
  assert.match(manualChecklist, /pnpm miniapp:prepare-device/);
  assert.match(optimizationChecklist, /miniapp:prepare-device/);
});
