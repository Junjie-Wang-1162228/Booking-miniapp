import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDevStatusReport,
  detectBookingAdminHtml,
  parseDatabaseUrlForStatus,
  parseDockerComposeServices,
  parseDockerPublishedContainers,
  summarizePreviewProcesses
} from './dev-status.mjs';

test('parseDockerComposeServices reads a healthy mysql service from docker compose json lines', () => {
  const output = [
    JSON.stringify({
      Service: 'mysql',
      State: 'running',
      Health: 'healthy',
      Status: 'Up 5 hours (healthy)',
      Name: 'booking-miniapp-mysql-1'
    })
  ].join('\n');

  assert.deepEqual(parseDockerComposeServices(output), [
    {
      service: 'mysql',
      name: 'booking-miniapp-mysql-1',
      state: 'running',
      health: 'healthy',
      status: 'Up 5 hours (healthy)'
    }
  ]);
});

test('parseDatabaseUrlForStatus returns only non-secret connection metadata', () => {
  assert.deepEqual(parseDatabaseUrlForStatus('mysql://booking_user:secret-pass@localhost:3307/boxing_booking'), {
    host: 'localhost',
    port: 3307,
    database: 'boxing_booking'
  });
});

test('parseDockerPublishedContainers reads published docker port metadata', () => {
  const output = [
    JSON.stringify({
      ID: '8d59993aeee3',
      Names: 'mvp-mysql-1',
      Ports: '0.0.0.0:3307->3306/tcp, [::]:3307->3306/tcp'
    })
  ].join('\n');

  assert.deepEqual(parseDockerPublishedContainers(output), [
    {
      id: '8d59993aeee3',
      name: 'mvp-mysql-1',
      ports: '0.0.0.0:3307->3306/tcp, [::]:3307->3306/tcp'
    }
  ]);
});

test('detectBookingAdminHtml only accepts the booking admin page', () => {
  assert.equal(detectBookingAdminHtml('<title>拳馆约课后台</title><div id="root"></div>'), true);
  assert.equal(detectBookingAdminHtml('<title>Other app</title>'), false);
});

test('summarizePreviewProcesses identifies project watch processes', () => {
  const output = `
  8510 node /Users/Agent-space/.npm-global/bin/pnpm api:dev
  8653 node /Users/Agent-space/Desktop/Booking-miniapp/apps/api/node_modules/.bin/../@nestjs/cli/bin/nest.js start --watch
  10915 node /Users/Agent-space/.npm-global/bin/pnpm admin:dev
  11039 node /Users/Agent-space/Desktop/Booking-miniapp/apps/admin/node_modules/.bin/../vite/bin/vite.js --host 0.0.0.0 --port 5173
  10622 node /Users/Agent-space/.npm-global/bin/pnpm miniapp:dev
  10754 node /Users/Agent-space/Desktop/Booking-miniapp/apps/miniapp/node_modules/.bin/../@tarojs/cli/bin/taro build --type weapp --watch
  `;

  assert.deepEqual(summarizePreviewProcesses(output), {
    apiWatch: true,
    adminVite: true,
    miniappWatch: true
  });
});

test('createDevStatusReport marks local preview ready when required services are healthy', () => {
  const report = createDevStatusReport({
    mysql: {
      ok: true,
      service: 'mysql',
      status: 'Up 5 hours (healthy)'
    },
    api: {
      ok: true,
      url: 'http://localhost:4000/health',
      body: { ok: true }
    },
    admin: {
      ok: true,
      url: 'http://localhost:5174',
      checkedPorts: [5173, 5174]
    },
    miniapp: {
      ok: true,
      distPath: 'apps/miniapp/dist',
      watchRunning: true,
      latestBuildAt: '2026-06-13T08:56:47.000Z'
    },
    visualQa: {
      complete: false,
      existingCount: 3,
      requiredCount: 12,
      next: {
        deviceName: 'iPhone SE',
        viewport: '375 x 667',
        missingLabels: ['classes', 'bookings', 'profile']
      }
    }
  });

  assert.equal(report.mode, 'dev-status');
  assert.equal(report.ok, true);
  assert.equal(report.preview.api.url, 'http://localhost:4000/health');
  assert.equal(report.preview.admin.url, 'http://localhost:5174');
  assert.equal(report.preview.miniapp.openPath, 'apps/miniapp/dist');
  assert.equal(report.visualQa.next.deviceName, 'iPhone SE');
  assert.deepEqual(report.notes, []);
});

test('createDevStatusReport warns when DATABASE_URL is served by another mysql container', () => {
  const report = createDevStatusReport({
    mysql: {
      ok: true,
      service: 'mysql',
      name: 'booking-miniapp-mysql-1',
      status: 'Up 5 hours (healthy)',
      database: {
        host: 'localhost',
        port: 3307,
        database: 'boxing_booking'
      },
      publishedContainer: {
        id: '8d59993aeee3',
        name: 'mvp-mysql-1',
        ports: '0.0.0.0:3307->3306/tcp'
      },
      warning:
        'DATABASE_URL localhost:3307/boxing_booking is published by mvp-mysql-1, not compose mysql booking-miniapp-mysql-1.',
      remediation:
        'Run docker ps to confirm port ownership, then stop the conflicting container or update apps/api/.env DATABASE_URL to the intended MySQL.'
    },
    api: {
      ok: true,
      url: 'http://localhost:4000/health',
      body: { ok: true }
    },
    admin: {
      ok: true,
      url: 'http://localhost:5174',
      checkedPorts: [5173, 5174]
    },
    miniapp: {
      ok: true,
      distPath: 'apps/miniapp/dist',
      watchRunning: true,
      latestBuildAt: '2026-06-13T08:56:47.000Z'
    },
    visualQa: {
      complete: false,
      existingCount: 3,
      requiredCount: 12,
      next: null
    }
  });

  assert.equal(report.ok, true);
  assert.match(report.notes.join('\n'), /published by mvp-mysql-1/);
  assert.match(report.notes.join('\n'), /stop the conflicting container or update apps\/api\/\.env DATABASE_URL/);
});

test('createDevStatusReport adds notes for degraded preview services', () => {
  const report = createDevStatusReport({
    mysql: { ok: false, status: 'not running' },
    api: { ok: false, url: 'http://localhost:4000/health', error: 'ECONNREFUSED' },
    admin: { ok: false, checkedPorts: [5173, 5174] },
    miniapp: { ok: false, distPath: 'apps/miniapp/dist', watchRunning: false },
    visualQa: { complete: false, existingCount: 0, requiredCount: 12, next: null }
  });

  assert.equal(report.ok, false);
  assert.match(report.notes.join('\n'), /MySQL/);
  assert.match(report.notes.join('\n'), /API/);
  assert.match(report.notes.join('\n'), /管理端/);
  assert.match(report.notes.join('\n'), /小程序/);
});
