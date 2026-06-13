import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const automator = require('miniprogram-automator');

const DEFAULT_CLI_PATH = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const DEFAULT_PROJECT_PATH = path.resolve('apps/miniapp/dist');
const DEFAULT_OUTPUT_DIR = path.resolve('docs/manual-test-screenshots');
const DEFAULT_AUTO_PORT = 19000;

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

export function verifyScreenshotMatrix(outputDir = DEFAULT_OUTPUT_DIR) {
  const devices = createScreenshotMatrix(outputDir).map((device) => {
    const screenshots = device.screenshots.map((screenshot) => ({
      ...screenshot,
      exists: existsSync(screenshot.outputPath)
    }));

    return {
      ...device,
      screenshots,
      complete: screenshots.every((screenshot) => screenshot.exists)
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

  return {
    complete: missing.length === 0,
    requiredCount: devices.length * pages.length,
    existingCount: devices.reduce(
      (count, device) => count + device.screenshots.filter((screenshot) => screenshot.exists).length,
      0
    ),
    devices,
    missing
  };
}

export function findNextMissingDevice(report) {
  const device = report.devices.find((item) => !item.complete);
  if (!device) return null;

  return {
    deviceName: device.deviceName,
    viewport: device.viewport,
    missingLabels: device.screenshots.filter((screenshot) => !screenshot.exists).map((screenshot) => screenshot.label)
  };
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

export function readOptions(argv) {
  const options = {
    cliPath: process.env.WECHAT_DEVTOOLS_CLI || DEFAULT_CLI_PATH,
    projectPath: process.env.MINIAPP_DIST || DEFAULT_PROJECT_PATH,
    outputDir: process.env.MINIAPP_VISUAL_QA_OUTPUT || DEFAULT_OUTPUT_DIR,
    port: Number(process.env.MINIAPP_AUTOMATOR_PORT || DEFAULT_AUTO_PORT),
    mode: 'status',
    opensDevTools: false,
    checkMatrix: false,
    nextMissing: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--cli-path' && next) options.cliPath = next;
    if (arg === '--project' && next) options.projectPath = next;
    if (arg === '--out' && next) options.outputDir = next;
    if (arg === '--port' && next) options.port = Number(next);
    if (arg === '--capture') {
      options.mode = 'capture';
      options.opensDevTools = true;
    }
    if (arg === '--check-matrix') {
      options.mode = 'check';
      options.checkMatrix = true;
    }
    if (arg === '--next-missing') {
      options.mode = 'next';
      options.nextMissing = true;
    }
  }

  options.projectPath = path.resolve(options.projectPath);
  options.outputDir = path.resolve(options.outputDir);
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
    next: findNextMissingDevice(report),
    captureCommand: 'pnpm miniapp:visual-qa:capture'
  };
}

export async function captureVisualQaScreenshots(options) {
  mkdirSync(options.outputDir, { recursive: true });
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
    const plan = createScreenshotPlan(deviceName, options.outputDir);

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
    console.log(JSON.stringify({ complete: report.complete, next: findNextMissingDevice(report) }, null, 2));
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
