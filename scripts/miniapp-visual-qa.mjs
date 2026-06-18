import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const automator = require('miniprogram-automator');

const DEFAULT_CLI_PATH = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const DEFAULT_PROJECT_PATH = path.resolve('apps/miniapp/dist');
const DEFAULT_OUTPUT_DIR = path.resolve('docs/manual-test-screenshots');
const DEFAULT_STALE_SOURCE_PATHS = [
  path.resolve('apps/miniapp/src'),
  path.resolve('apps/miniapp/config'),
  path.resolve('apps/miniapp/package.json')
];
const DEFAULT_AUTO_PORT = 19000;
const DEVTOOLS_CONFIRM_ENV = 'MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS';
const DEVTOOLS_CONFIRM_FLAG = '--allow-devtools';
const TARGET_NEXT_FLAG = '--target-next';
export const CONFIRMED_CAPTURE_COMMAND = `cross-env ${DEVTOOLS_CONFIRM_ENV}=1 pnpm miniapp:visual-qa:capture-next`;

const pages = [
  { label: 'classes', pagePath: '/pages/classes/index' },
  { label: 'bookings', pagePath: '/pages/bookings/index' },
  { label: 'profile', pagePath: '/pages/profile/index' }
];

const deviceMatrix = [
  { deviceName: 'iPhone SE', viewport: '375 x 667' },
  { deviceName: 'iPhone 12/13 (Pro)', viewport: '390 x 844' },
  { deviceName: 'iPhone 15 Pro Max', viewport: '430 x 932' },
  { deviceName: 'Nexus 6', viewport: '412 x 732' }
];
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');

export function slugDeviceName(deviceName) {
  return deviceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function createScreenshotPlan(deviceName, outputDir = DEFAULT_OUTPUT_DIR) {
  const slug = slugDeviceName(deviceName);
  return pages.map((page) => ({
    ...page,
    outputPath: path.join(outputDir, `${slug}-${page.label}.png`)
  }));
}

export function createScreenshotMatrix(outputDir = DEFAULT_OUTPUT_DIR) {
  return deviceMatrix.map((device) => ({
    ...device,
    screenshots: createScreenshotPlan(device.deviceName, outputDir)
  }));
}

function parseViewport(viewport) {
  const match = viewport.match(/^(\d+)\s*x\s*(\d+)$/i);
  if (!match) return null;

  return {
    width: Number(match[1]),
    height: Number(match[2])
  };
}

function readPngDimensions(outputPath) {
  const buffer = readFileSync(outputPath);
  if (buffer.length < 24 || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return { valid: false, reason: 'not a PNG screenshot' };
  }

  if (buffer.toString('ascii', 12, 16) !== 'IHDR') {
    return { valid: false, reason: 'not a PNG screenshot' };
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width <= 0 || height <= 0) return { valid: false, reason: 'not a PNG screenshot' };

  return { valid: true, width, height };
}

function validateScreenshotFile(outputPath, viewport, options = {}) {
  if (!existsSync(outputPath)) return { exists: false, valid: false };

  const dimensions = readPngDimensions(outputPath);
  if (!dimensions.valid) {
    return { exists: true, valid: false, reason: dimensions.reason };
  }

  const viewportSize = parseViewport(viewport);
  if (!viewportSize) return { exists: true, valid: true, width: dimensions.width, height: dimensions.height };

  const minWidth = viewportSize.width * 0.8;
  const minHeight = viewportSize.height * 0.7;
  const maxWidth = viewportSize.width * 4;
  const maxHeight = viewportSize.height * 4;
  const dimensionsMatchViewport =
    dimensions.width >= minWidth &&
    dimensions.height >= minHeight &&
    dimensions.width <= maxWidth &&
    dimensions.height <= maxHeight;

  if (!dimensionsMatchViewport) {
    return {
      exists: true,
      valid: false,
      width: dimensions.width,
      height: dimensions.height,
      reason: 'screenshot dimensions do not match viewport'
    };
  }

  if (options.staleAfter) {
    const screenshotMtimeMs = statSync(outputPath).mtimeMs;
    if (screenshotMtimeMs < options.staleAfter.getTime()) {
      return {
        exists: true,
        valid: false,
        width: dimensions.width,
        height: dimensions.height,
        reason: 'screenshot is older than latest miniapp UI source'
      };
    }
  }

  return { exists: true, valid: true, width: dimensions.width, height: dimensions.height };
}

function resolveLatestMtime(paths) {
  let latestMtimeMs = 0;

  function visit(targetPath) {
    if (!existsSync(targetPath)) return;

    const stat = statSync(targetPath);
    latestMtimeMs = Math.max(latestMtimeMs, stat.mtimeMs);

    if (!stat.isDirectory()) return;

    for (const name of readdirSync(targetPath)) {
      if (name === 'dist' || name === 'node_modules') continue;
      visit(path.join(targetPath, name));
    }
  }

  paths.forEach(visit);
  return latestMtimeMs > 0 ? new Date(latestMtimeMs) : null;
}

function percent(completed, total) {
  if (total <= 0) return 100;
  return Math.round((completed / total) * 100);
}

function createProgress(report) {
  return {
    completed: report.existingCount,
    total: report.requiredCount,
    percent: percent(report.existingCount, report.requiredCount),
    missing: report.missing.length,
    invalid: report.invalid.length
  };
}

export function verifyScreenshotMatrix(outputDir = DEFAULT_OUTPUT_DIR, options = {}) {
  const staleAfter = options.staleAfter ?? resolveLatestMtime(DEFAULT_STALE_SOURCE_PATHS);
  const devices = createScreenshotMatrix(outputDir).map((device) => {
    const screenshots = device.screenshots.map((screenshot) => ({
      ...screenshot,
      ...validateScreenshotFile(screenshot.outputPath, device.viewport, { staleAfter })
    }));

    return {
      ...device,
      screenshots,
      complete: screenshots.every((screenshot) => screenshot.exists && screenshot.valid)
    };
  });
  const missing = devices.flatMap((device) =>
    device.screenshots
      .filter((screenshot) => !screenshot.exists)
      .map((screenshot) => ({
        deviceName: device.deviceName,
        viewport: device.viewport,
        label: screenshot.label,
        outputPath: screenshot.outputPath
      }))
  );
  const invalid = devices.flatMap((device) =>
    device.screenshots
      .filter((screenshot) => screenshot.exists && !screenshot.valid)
      .map((screenshot) => ({
        deviceName: device.deviceName,
        viewport: device.viewport,
        label: screenshot.label,
        outputPath: screenshot.outputPath,
        width: screenshot.width,
        height: screenshot.height,
        reason: screenshot.reason
      }))
  );

  return {
    complete: missing.length === 0 && invalid.length === 0,
    requiredCount: devices.length * pages.length,
    existingCount: devices.reduce(
      (count, device) => count + device.screenshots.filter((screenshot) => screenshot.exists && screenshot.valid).length,
      0
    ),
    presentCount: devices.reduce(
      (count, device) => count + device.screenshots.filter((screenshot) => screenshot.exists).length,
      0
    ),
    devices,
    missing,
    invalid
  };
}

export function findNextMissingDevice(report) {
  const device = report.devices.find((item) => !item.complete);
  if (!device) return null;

  return {
    deviceName: device.deviceName,
    viewport: device.viewport,
    missingLabels: device.screenshots
      .filter((screenshot) => !screenshot.exists || !screenshot.valid)
      .map((screenshot) => screenshot.label)
  };
}

export function createNextMissingDeviceReport(report) {
  const nextDevice = findNextMissingDevice(report);
  if (!nextDevice) return null;

  const device = report.devices.find((item) => item.deviceName === nextDevice.deviceName);
  const missingScreenshots = device.screenshots
    .filter((screenshot) => !screenshot.exists || !screenshot.valid)
    .map((screenshot) => ({
      label: screenshot.label,
      pagePath: screenshot.pagePath,
      outputPath: screenshot.outputPath,
      ...(screenshot.reason ? { reason: screenshot.reason } : {})
    }));

  return {
    ...nextDevice,
    missingScreenshots
  };
}

export function assertCaptureDeviceMatchesTarget(deviceName, targetDevice) {
  if (!targetDevice) {
    throw new Error('No missing visual QA device remains. Run pnpm miniapp:visual-qa:check before capturing more screenshots.');
  }

  if (deviceName !== targetDevice.deviceName) {
    throw new Error(
      `Current WeChat DevTools simulator is ${deviceName}. ` +
        `Switch the WeChat DevTools simulator to ${targetDevice.deviceName} (${targetDevice.viewport}) before capturing.`
    );
  }
}

function canListenOnAddress(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    if (host) {
      server.listen(port, host);
      return;
    }
    server.listen(port);
  });
}

async function canListenOnPort(port) {
  const checks = await Promise.all([
    canListenOnAddress(port),
    canListenOnAddress(port, '127.0.0.1'),
    canListenOnAddress(port, '::1')
  ]);
  return checks.every(Boolean);
}

export async function resolveAutomatorPort(startPort = DEFAULT_AUTO_PORT) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await canListenOnPort(port)) return port;
  }

  throw new Error(`No available automator port found from ${startPort} to ${startPort + 49}`);
}

function isTruthy(value) {
  return value === '1' || value?.toLowerCase() === 'true';
}

export function readOptions(argv, env = process.env) {
  const options = {
    cliPath: env.WECHAT_DEVTOOLS_CLI || DEFAULT_CLI_PATH,
    projectPath: env.MINIAPP_DIST || DEFAULT_PROJECT_PATH,
    outputDir: env.MINIAPP_VISUAL_QA_OUTPUT || DEFAULT_OUTPUT_DIR,
    port: Number(env.MINIAPP_AUTOMATOR_PORT || DEFAULT_AUTO_PORT),
    mode: 'status',
    opensDevTools: false,
    allowDevToolsLaunch: isTruthy(env[DEVTOOLS_CONFIRM_ENV]),
    checkMatrix: false,
    nextMissing: false,
    manualPlan: false,
    targetNext: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--cli-path' && next) options.cliPath = next;
    if (arg === '--project' && next) options.projectPath = next;
    if (arg === '--out' && next) options.outputDir = next;
    if (arg === '--port' && next) options.port = Number(next);
    if (arg === DEVTOOLS_CONFIRM_FLAG) options.allowDevToolsLaunch = true;
    if (arg === TARGET_NEXT_FLAG) options.targetNext = true;
    if (arg === '--capture') {
      options.mode = 'capture';
    }
    if (arg === '--check-matrix') {
      options.mode = 'check';
      options.checkMatrix = true;
    }
    if (arg === '--next-missing') {
      options.mode = 'next';
      options.nextMissing = true;
    }
    if (arg === '--manual-plan') {
      options.mode = 'manual-plan';
      options.manualPlan = true;
    }
  }

  options.projectPath = path.resolve(options.projectPath);
  options.outputDir = path.resolve(options.outputDir);
  options.opensDevTools = options.mode === 'capture' && options.allowDevToolsLaunch;
  return options;
}

function createStatusReport(outputDir) {
  const report = verifyScreenshotMatrix(outputDir);
  return {
    mode: 'status',
    opensDevTools: false,
    complete: report.complete,
    existingCount: report.existingCount,
    requiredCount: report.requiredCount,
    progress: createProgress(report),
    next: createNextMissingDeviceReport(report),
    captureCommand: CONFIRMED_CAPTURE_COMMAND
  };
}

export function createManualCapturePlan(report) {
  const progress = createProgress(report);
  const nextDevice = createNextMissingDeviceReport(report);
  if (!nextDevice) {
    return {
      mode: 'manual-plan',
      opensDevTools: false,
      complete: true,
      progress,
      nextDevice: null,
      targetScreenshots: [],
      steps: ['All required screenshots exist. Run pnpm miniapp:visual-qa:check before marking visual QA complete.'],
      commands: ['pnpm miniapp:visual-qa:check']
    };
  }

  return {
    mode: 'manual-plan',
    opensDevTools: false,
    complete: false,
    progress,
    nextDevice,
    targetScreenshots: nextDevice.missingScreenshots,
    steps: [
      `Switch the WeChat DevTools simulator to ${nextDevice.deviceName} (${nextDevice.viewport}).`,
      `Capture the missing pages for this device: ${nextDevice.missingLabels.join(', ')}.`,
      `Expected screenshot files: ${nextDevice.missingScreenshots.map((item) => item.outputPath).join(', ')}.`,
      `Run ${CONFIRMED_CAPTURE_COMMAND} only after the simulator is on the target device.`,
      'Then run pnpm miniapp:visual-qa:next to continue, and pnpm miniapp:visual-qa:check when all screenshots are present.'
    ],
    commands: [CONFIRMED_CAPTURE_COMMAND, 'pnpm miniapp:visual-qa:next', 'pnpm miniapp:visual-qa:check']
  };
}

export async function captureVisualQaScreenshots(options) {
  if (!options.allowDevToolsLaunch) {
    throw new Error(
      `Refusing to open WeChat DevTools without explicit confirmation. ` +
        `Run ${CONFIRMED_CAPTURE_COMMAND}, ` +
        `or pass ${DEVTOOLS_CONFIRM_FLAG} after manually selecting the target simulator device.`
    );
  }

  mkdirSync(options.outputDir, { recursive: true });
  const targetDevice = options.targetNext
    ? createNextMissingDeviceReport(verifyScreenshotMatrix(options.outputDir))
    : null;
  const port = await resolveAutomatorPort(options.port);

  const miniProgram = await automator.launch({
    cliPath: options.cliPath,
    projectPath: options.projectPath,
    port,
    trustProject: true,
    timeout: 60000
  });

  try {
    const systemInfo = await miniProgram.systemInfo();
    const deviceName = systemInfo.model || 'unknown-device';
    if (options.targetNext) assertCaptureDeviceMatchesTarget(deviceName, targetDevice);
    const plan = targetDevice?.missingScreenshots ?? createScreenshotPlan(deviceName, options.outputDir);

    for (const item of plan) {
      await miniProgram.switchTab(item.pagePath);
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await miniProgram.screenshot({ path: item.outputPath });
    }

    return {
      device: {
        name: deviceName,
        screenWidth: systemInfo.screenWidth,
        screenHeight: systemInfo.screenHeight,
        platform: systemInfo.platform
      },
      port,
      screenshots: plan.map((item) => item.outputPath)
    };
  } finally {
    miniProgram.disconnect();
  }
}

async function main() {
  const options = readOptions(process.argv.slice(2));
  if (options.nextMissing) {
    const report = verifyScreenshotMatrix(options.outputDir);
    console.log(
      JSON.stringify(
        {
          complete: report.complete,
          progress: createProgress(report),
          next: createNextMissingDeviceReport(report)
        },
        null,
        2
      )
    );
    return;
  }

  if (options.manualPlan) {
    const report = verifyScreenshotMatrix(options.outputDir);
    console.log(JSON.stringify(createManualCapturePlan(report), null, 2));
    return;
  }

  if (options.checkMatrix) {
    const report = verifyScreenshotMatrix(options.outputDir);
    console.log(JSON.stringify(report, null, 2));
    if (!report.complete) process.exit(1);
    return;
  }

  if (options.mode === 'status') {
    console.log(JSON.stringify(createStatusReport(options.outputDir), null, 2));
    return;
  }

  const result = await captureVisualQaScreenshots(options);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  });
}
