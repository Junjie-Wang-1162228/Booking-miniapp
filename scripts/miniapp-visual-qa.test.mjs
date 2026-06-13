import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createManualCapturePlan,
  createScreenshotMatrix,
  createScreenshotPlan,
  findNextMissingDevice,
  readOptions,
  resolveAutomatorPort,
  slugDeviceName,
  verifyScreenshotMatrix
} from './miniapp-visual-qa.mjs';

test('slugDeviceName creates stable lowercase device slugs', () => {
  assert.equal(slugDeviceName('iPhone 12/13 (Pro)'), 'iphone-12-13-pro');
  assert.equal(slugDeviceName('Nexus 6'), 'nexus-6');
});

test('createScreenshotPlan maps the core tab pages to screenshot filenames', () => {
  assert.deepEqual(createScreenshotPlan('iPhone 12/13 (Pro)', 'docs/manual-test-screenshots'), [
    {
      label: 'classes',
      pagePath: '/pages/classes/index',
      outputPath: 'docs/manual-test-screenshots/iphone-12-13-pro-classes.png'
    },
    {
      label: 'bookings',
      pagePath: '/pages/bookings/index',
      outputPath: 'docs/manual-test-screenshots/iphone-12-13-pro-bookings.png'
    },
    {
      label: 'profile',
      pagePath: '/pages/profile/index',
      outputPath: 'docs/manual-test-screenshots/iphone-12-13-pro-profile.png'
    }
  ]);
});

test('resolveAutomatorPort skips an occupied default port', async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const occupiedPort = server.address().port;

  try {
    const resolvedPort = await resolveAutomatorPort(occupiedPort);
    assert.notEqual(resolvedPort, occupiedPort);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('createScreenshotMatrix lists the required device and page screenshot files', () => {
  const matrix = createScreenshotMatrix('docs/manual-test-screenshots');
  assert.equal(matrix.length, 4);
  assert.deepEqual(
    matrix.find((device) => device.deviceName === 'iPhone SE')?.screenshots.map((item) => item.outputPath),
    [
      'docs/manual-test-screenshots/iphone-se-classes.png',
      'docs/manual-test-screenshots/iphone-se-bookings.png',
      'docs/manual-test-screenshots/iphone-se-profile.png'
    ]
  );
});

test('verifyScreenshotMatrix reports missing files until the whole matrix exists', () => {
  const outputDir = mkdtempSync(path.join(tmpdir(), 'miniapp-visual-qa-'));
  try {
    const initialReport = verifyScreenshotMatrix(outputDir);
    assert.equal(initialReport.complete, false);
    assert.equal(initialReport.missing.length, 12);

    for (const device of createScreenshotMatrix(outputDir)) {
      for (const screenshot of device.screenshots) {
        writeFileSync(screenshot.outputPath, 'fake screenshot');
      }
    }

    const completeReport = verifyScreenshotMatrix(outputDir);
    assert.equal(completeReport.complete, true);
    assert.equal(completeReport.missing.length, 0);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test('findNextMissingDevice returns the first incomplete device with missing pages', () => {
  const outputDir = mkdtempSync(path.join(tmpdir(), 'miniapp-visual-qa-next-'));
  try {
    for (const screenshot of createScreenshotPlan('iPhone 12/13 (Pro)', outputDir)) {
      writeFileSync(screenshot.outputPath, 'fake screenshot');
    }

    const report = verifyScreenshotMatrix(outputDir);
    const next = findNextMissingDevice(report);
    assert.deepEqual(next, {
      deviceName: 'iPhone SE',
      viewport: '375 x 667',
      missingLabels: ['classes', 'bookings', 'profile']
    });
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test('createManualCapturePlan gives safe next-step instructions without opening DevTools', () => {
  const outputDir = mkdtempSync(path.join(tmpdir(), 'miniapp-visual-qa-plan-'));
  try {
    for (const screenshot of createScreenshotPlan('iPhone 12/13 (Pro)', outputDir)) {
      writeFileSync(screenshot.outputPath, 'fake screenshot');
    }

    const plan = createManualCapturePlan(verifyScreenshotMatrix(outputDir));
    assert.equal(plan.opensDevTools, false);
    assert.equal(plan.complete, false);
    assert.deepEqual(plan.nextDevice, {
      deviceName: 'iPhone SE',
      viewport: '375 x 667',
      missingLabels: ['classes', 'bookings', 'profile']
    });
    assert.deepEqual(plan.commands, [
      'pnpm miniapp:visual-qa:capture',
      'pnpm miniapp:visual-qa:next',
      'pnpm miniapp:visual-qa:check'
    ]);
    assert.match(plan.steps[0], /iPhone SE/);
    assert.match(plan.steps[1], /classes, bookings, profile/);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test('createManualCapturePlan reports completion when the screenshot matrix is complete', () => {
  const outputDir = mkdtempSync(path.join(tmpdir(), 'miniapp-visual-qa-plan-complete-'));
  try {
    for (const device of createScreenshotMatrix(outputDir)) {
      for (const screenshot of device.screenshots) {
        writeFileSync(screenshot.outputPath, 'fake screenshot');
      }
    }

    const plan = createManualCapturePlan(verifyScreenshotMatrix(outputDir));
    assert.deepEqual(plan, {
      mode: 'manual-plan',
      opensDevTools: false,
      complete: true,
      nextDevice: null,
      steps: ['All required screenshots exist. Run pnpm miniapp:visual-qa:check before marking visual QA complete.'],
      commands: ['pnpm miniapp:visual-qa:check']
    });
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test('readOptions defaults to a status mode that does not open DevTools', () => {
  const options = readOptions([]);
  assert.equal(options.mode, 'status');
  assert.equal(options.opensDevTools, false);
});

test('readOptions supports a manual plan mode that does not open DevTools', () => {
  const options = readOptions(['--manual-plan']);
  assert.equal(options.mode, 'manual-plan');
  assert.equal(options.opensDevTools, false);
  assert.equal(options.manualPlan, true);
});

test('readOptions requires explicit capture mode before opening DevTools', () => {
  const options = readOptions(['--capture']);
  assert.equal(options.mode, 'capture');
  assert.equal(options.opensDevTools, true);
});
