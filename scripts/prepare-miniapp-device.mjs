import { spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_API_PORT = 4000;
const DEFAULT_TIMEZONE_OFFSET_MINUTES = 480;
const LOCAL_ONLY_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

export function selectLanHost(networks = networkInterfaces()) {
  return Object.values(networks)
    .flat()
    .filter(Boolean)
    .find((item) => {
      const family = item.family === 4 ? 'IPv4' : item.family;
      if (family !== 'IPv4' || item.internal) return false;
      if (!item.address || item.address.startsWith('169.254.')) return false;
      return true;
    })?.address;
}

function normalizeApiBaseUrl(apiBaseUrl) {
  const trimmed = String(apiBaseUrl ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('A device-reachable API base URL is required.');

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid API base URL: ${trimmed}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('The miniapp device API base URL must use http or https.');
  }

  if (LOCAL_ONLY_HOSTS.has(parsed.hostname)) {
    throw new Error('The miniapp device API base URL must be device-reachable, not localhost.');
  }

  return trimmed;
}

function parseJsonFromOutput(output) {
  const source = String(output ?? '').trim();
  if (!source) return null;

  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;

  return JSON.parse(source.slice(start, end + 1));
}

export function createMiniappDevicePrepPlan({
  projectRoot = PROJECT_ROOT,
  apiBaseUrl,
  lanHost,
  networks = networkInterfaces(),
  apiPort = DEFAULT_API_PORT,
  timezoneOffsetMinutes = DEFAULT_TIMEZONE_OFFSET_MINUTES
} = {}) {
  const resolvedLanHost = lanHost ?? selectLanHost(networks);
  if (!apiBaseUrl && !resolvedLanHost) {
    throw new Error('No LAN IPv4 address was detected. Pass --api-base-url http://<LAN-IP>:4000 explicitly.');
  }

  const resolvedApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl || `http://${resolvedLanHost}:${apiPort}`);
  const devtoolsProjectPath = path.join(projectRoot, 'apps/miniapp/dist');

  return {
    apiBaseUrl: resolvedApiBaseUrl,
    healthUrl: `${resolvedApiBaseUrl}/health`,
    devtoolsProjectPath,
    opensDevTools: false,
    steps: [
      {
        id: 'sync-private-config',
        command: 'pnpm',
        args: ['miniapp:sync-private-config']
      },
      {
        id: 'build-miniapp-dist',
        command: 'pnpm',
        args: ['--filter', '@booking/miniapp', 'build:weapp'],
        env: {
          TARO_APP_AUTH_MODE: 'wechat',
          TARO_APP_API_BASE_URL: resolvedApiBaseUrl,
          TARO_APP_BUSINESS_TIMEZONE_OFFSET_MINUTES: String(timezoneOffsetMinutes)
        }
      },
      {
        id: 'manual-readiness',
        command: 'pnpm',
        args: ['ops:manual-test:readiness']
      }
    ]
  };
}

function defaultRunCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? PROJECT_ROOT,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: 'utf8'
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`Command failed: ${command} ${args.join(' ')}${output ? `\n${output}` : ''}`);
  }

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  };
}

export function runMiniappDevicePrep({
  projectRoot = PROJECT_ROOT,
  apiBaseUrl,
  lanHost,
  apiPort,
  timezoneOffsetMinutes,
  runCommand = defaultRunCommand
} = {}) {
  const plan = createMiniappDevicePrepPlan({
    projectRoot,
    apiBaseUrl,
    lanHost,
    apiPort,
    timezoneOffsetMinutes
  });
  const completedSteps = [];
  let readiness = null;

  for (const step of plan.steps) {
    const output = runCommand(step.command, step.args, {
      cwd: projectRoot,
      env: step.env
    });
    completedSteps.push({ id: step.id, ok: true });

    if (step.id === 'manual-readiness') {
      readiness = parseJsonFromOutput(output.stdout);
    }
  }

  return {
    mode: 'miniapp-device-prep',
    opensDevTools: false,
    apiBaseUrl: plan.apiBaseUrl,
    healthUrl: plan.healthUrl,
    devtoolsProjectPath: plan.devtoolsProjectPath,
    steps: completedSteps,
    readyForManualWechat: Boolean(readiness?.readyForManualWechat),
    miniappProject: readiness?.miniappProject
      ? {
          distApiBaseUrlKind: readiness.miniappProject.distApiBaseUrlKind,
          distApiHealthOk: readiness.miniappProject.distApiHealthOk
        }
      : null,
    nextHumanAction: `Open ${plan.devtoolsProjectPath} in WeChat DevTools, then use real-device debugging.`
  };
}

export function parseArgs(argv = []) {
  return argv.reduce((options, arg, index) => {
    if (arg === '--dry-run') return { ...options, dryRun: true };
    if (arg === '--api-base-url') return { ...options, apiBaseUrl: argv[index + 1] };
    if (arg === '--lan-host') return { ...options, lanHost: argv[index + 1] };
    if (arg === '--api-port') return { ...options, apiPort: Number(argv[index + 1]) };
    if (arg === '--timezone-offset-minutes') return { ...options, timezoneOffsetMinutes: Number(argv[index + 1]) };
    if (argv[index - 1]?.startsWith('--')) return options;
    throw new Error(`Unknown miniapp device prep option: ${arg}`);
  }, {});
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = options.dryRun
    ? {
        mode: 'miniapp-device-prep-plan',
        ...createMiniappDevicePrepPlan(options)
      }
    : runMiniappDevicePrep(options);

  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
