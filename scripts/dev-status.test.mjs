import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDevStatusReport,
  createDatabasePortDriftRemediation,
  detectBookingAdminHtml,
  parseDatabaseUrlForStatus,
  parseDockerComposeServices,
  parseDockerPublishedContainers,
  readOptions,
  summarizePrismaEngineProcesses,
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

test('createDatabasePortDriftRemediation guides to a non-destructive mysql host port override', () => {
  const remediation = createDatabasePortDriftRemediation({
    database: {
      host: 'localhost',
      port: 3307,
      database: 'boxing_booking'
    },
    publishedContainer: {
      name: 'mvp-mysql-1'
    },
    composeServiceName: 'booking-miniapp-mysql-1'
  });

  assert.match(remediation, /BOOKING_MYSQL_HOST_PORT=3308/);
  assert.match(remediation, /apps\/api\/\.env/);
  assert.match(remediation, /DATABASE_URL/);
  assert.match(remediation, /SHADOW_DATABASE_URL/);
  assert.match(remediation, /recreate/i);
  assert.doesNotMatch(remediation, /stop the conflicting container/i);
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

test('summarizePrismaEngineProcesses reports only orphaned project Prisma engines', () => {
  const output = `
   3005     1 /Users/Agent-space/Desktop/Booking-miniapp/node_modules/.pnpm/@prisma+client/node_modules/.prisma/client/query-engine-darwin-arm64 --engine-protocol json
  30492 30491 /Users/Agent-space/Desktop/Booking-miniapp/node_modules/.pnpm/@prisma+client/node_modules/.prisma/client/query-engine-darwin-arm64 --engine-protocol json
  73478 73473 /Users/Agent-space/Desktop/OtherApp/node_modules/.pnpm/@prisma+client/node_modules/.prisma/client/query-engine-darwin-arm64 --engine-protocol json
  `;

  assert.deepEqual(summarizePrismaEngineProcesses(output, '/Users/Agent-space/Desktop/Booking-miniapp'), {
    totalCount: 2,
    orphanCount: 1,
    orphanPids: [3005]
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
        missingLabels: ['classes', 'bookings', 'profile'],
        missingScreenshots: [
          {
            label: 'classes',
            pagePath: '/pages/classes/index',
            outputPath: 'docs/manual-test-screenshots/iphone-se-classes.png'
          },
          {
            label: 'bookings',
            pagePath: '/pages/bookings/index',
            outputPath: 'docs/manual-test-screenshots/iphone-se-bookings.png'
          },
          {
            label: 'profile',
            pagePath: '/pages/profile/index',
            outputPath: 'docs/manual-test-screenshots/iphone-se-profile.png'
          }
        ]
      }
    }
  });

  assert.equal(report.mode, 'dev-status');
  assert.equal(report.ok, true);
  assert.equal(report.preview.api.url, 'http://localhost:4000/health');
  assert.equal(report.preview.admin.url, 'http://localhost:5174');
  assert.equal(report.preview.miniapp.openPath, 'apps/miniapp/dist');
  assert.equal(report.visualQa.next.deviceName, 'iPhone SE');
  assert.equal(
    report.visualQa.captureCommand,
    'cross-env MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next'
  );
  assert.deepEqual(report.progress.preview, {
    completed: 4,
    total: 4,
    percent: 100
  });
  assert.deepEqual(report.progress.visualQa, {
    completed: 3,
    total: 12,
    percent: 25
  });
  assert.deepEqual(
    report.visualQa.next.missingScreenshots.map((item) => item.outputPath),
    [
      'docs/manual-test-screenshots/iphone-se-classes.png',
      'docs/manual-test-screenshots/iphone-se-bookings.png',
      'docs/manual-test-screenshots/iphone-se-profile.png'
    ]
  );
  assert.match(report.progress.nextAction, /Capture iPhone SE screenshots for classes, bookings, profile/);
  assert.match(report.progress.nextAction, /iphone-se-classes\.png/);
  assert.match(
    report.progress.nextAction,
    /cross-env MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next/
  );
  assert.deepEqual(report.notes, []);
});

test('createDevStatusReport includes manual checklist progress after visual QA is complete', () => {
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
      complete: true,
      existingCount: 12,
      requiredCount: 12,
      next: null
    },
    manualTest: {
      checklistPath: 'docs/manual-test-checklist.md',
      complete: false,
      completed: 2,
      total: 4,
      percent: 50,
      next: {
        section: '会员端小程序',
        line: 18,
        text: '完成约课成功路径'
      },
      sections: []
    }
  });

  assert.deepEqual(report.progress.manualTest, {
    completed: 2,
    total: 4,
    percent: 50
  });
  assert.equal(report.manualTest.next.text, '完成约课成功路径');
  assert.match(report.progress.nextAction, /Continue manual test checklist/);
  assert.match(report.progress.nextAction, /会员端小程序 line 18: 完成约课成功路径/);
});

test('createDevStatusReport warns when DATABASE_URL is served by another mysql container', () => {
  const remediation = createDatabasePortDriftRemediation({
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
    composeServiceName: 'booking-miniapp-mysql-1'
  });

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
      remediation
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
  assert.match(report.notes.join('\n'), /BOOKING_MYSQL_HOST_PORT=3308/);
  assert.match(report.notes.join('\n'), /apps\/api\/\.env DATABASE_URL and SHADOW_DATABASE_URL/);
  assert.doesNotMatch(report.notes.join('\n'), /stop the conflicting container/i);
});

test('createDevStatusReport fails strict mode when DATABASE_URL is served by another mysql container', () => {
  const report = createDevStatusReport({
    strict: true,
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
        'DATABASE_URL localhost:3307/boxing_booking is published by mvp-mysql-1, not compose mysql booking-miniapp-mysql-1.'
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

  assert.equal(report.ok, false);
  assert.deepEqual(report.strict, {
    enabled: true,
    passed: false,
    failures: ['DATABASE_URL is served by a non-compose MySQL container.']
  });
  assert.deepEqual(report.progress.strict, {
    enabled: true,
    passed: false,
    failures: ['DATABASE_URL is served by a non-compose MySQL container.']
  });
  assert.match(report.progress.nextAction, /Resolve strict dev status failure/);
  assert.match(report.notes.join('\n'), /Strict dev status failed/);
});

test('createDevStatusReport warns about orphaned Prisma engines without failing preview readiness', () => {
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
      next: null
    },
    diagnostics: {
      prismaEngines: {
        totalCount: 3,
        orphanCount: 2,
        orphanPids: [3005, 7294]
      }
    }
  });

  assert.equal(report.ok, true);
  assert.equal(report.diagnostics.prismaEngines.orphanCount, 2);
  assert.match(report.notes.join('\n'), /orphaned Prisma query-engine/);
  assert.match(report.notes.join('\n'), /3005, 7294/);
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
  assert.match(report.notes.join('\n'), /pnpm dev:preview:start/);
  assert.match(report.progress.nextAction, /pnpm dev:preview:start/);
  assert.doesNotMatch(report.notes.join('\n'), /Run pnpm api:dev/);
  assert.doesNotMatch(report.notes.join('\n'), /Run pnpm admin:dev/);
  assert.doesNotMatch(report.notes.join('\n'), /Run pnpm miniapp:dev/);
});

test('readOptions enables strict mode only when requested', () => {
  assert.deepEqual(readOptions([]), { strict: false });
  assert.deepEqual(readOptions(['--strict']), { strict: true });
});
