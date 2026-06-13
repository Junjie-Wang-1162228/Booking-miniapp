import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const apiSourcePath = 'apps/admin/src/api.ts';
const appSourcePath = 'apps/admin/src/App.tsx';
const typesSourcePath = 'apps/admin/src/types.ts';
const e2eSourcePath = 'apps/api/test/app.e2e-spec.ts';
const moduleSourcePath = 'apps/api/src/metrics/metrics.module.ts';

test('api exposes admin daily metrics endpoint and e2e coverage', () => {
  const e2eSource = readFileSync(e2eSourcePath, 'utf8');
  const moduleSource = readFileSync(moduleSourcePath, 'utf8');

  assert.match(moduleSource, /AdminMetricsController/);
  assert.match(moduleSource, /MetricsService/);
  assert.match(e2eSource, /returns daily operation metrics scoped by branch access/);
  assert.match(e2eSource, /\/admin\/metrics\/daily/);
  assert.match(e2eSource, /bookingCreatedCount/);
  assert.match(e2eSource, /fullClassCount/);
});

test('admin client exposes daily metrics types and helper', () => {
  const apiSource = readFileSync(apiSourcePath, 'utf8');
  const typesSource = readFileSync(typesSourcePath, 'utf8');

  assert.match(typesSource, /AdminDailyMetrics/);
  assert.match(typesSource, /bookingCreatedCount/);
  assert.match(typesSource, /bookingCanceledCount/);
  assert.match(typesSource, /lessonDeductedCount/);
  assert.match(typesSource, /fullClassCount/);
  assert.match(apiSource, /getAdminDailyMetrics/);
  assert.match(apiSource, /\/admin\/metrics\/daily/);
});

test('admin dashboard renders scan-friendly operation metric cards', () => {
  const appSource = readFileSync(appSourcePath, 'utf8');

  assert.match(appSource, /dailyMetrics/);
  assert.match(appSource, /metricCards/);
  assert.match(appSource, /今日预约/);
  assert.match(appSource, /今日取消/);
  assert.match(appSource, /今日消课/);
  assert.match(appSource, /满员课程/);
  assert.match(appSource, /metrics-grid/);
});
