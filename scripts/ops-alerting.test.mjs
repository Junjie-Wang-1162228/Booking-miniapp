import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const alertingServicePath = 'apps/api/src/alerts/alerts.service.ts';
const appModulePath = 'apps/api/src/app.module.ts';
const e2eSourcePath = 'apps/api/test/app.e2e-spec.ts';
const exceptionFilterPath = 'apps/api/src/common/safe-exception.filter.ts';
const notificationsServicePath = 'apps/api/src/notifications/notifications.service.ts';

test('api exposes configurable alert webhook service with redaction', () => {
  const source = readFileSync(alertingServicePath, 'utf8');
  const appModule = readFileSync(appModulePath, 'utf8');

  assert.match(source, /AlertingService/);
  assert.match(source, /ALERT_WEBHOOK_URL/);
  assert.match(source, /redactAlertValue/);
  assert.match(source, /redactAlertText/);
  assert.match(source, /fetch\(webhookUrl/);
  assert.match(appModule, /AlertingModule/);
});

test('critical API errors and notification failures trigger alerts', () => {
  const e2eSource = readFileSync(e2eSourcePath, 'utf8');
  const exceptionFilter = readFileSync(exceptionFilterPath, 'utf8');
  const notificationsService = readFileSync(notificationsServicePath, 'utf8');

  assert.match(exceptionFilter, /AlertingService/);
  assert.match(exceptionFilter, /status >= HttpStatus\.INTERNAL_SERVER_ERROR/);
  assert.match(exceptionFilter, /notify\(\{/);
  assert.match(notificationsService, /AlertingService/);
  assert.match(notificationsService, /notification_delivery_failed/);
  assert.match(e2eSource, /alerts unhandled server errors without leaking sensitive details/);
});
