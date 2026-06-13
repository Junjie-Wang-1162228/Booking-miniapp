import assert from 'node:assert/strict';
import test from 'node:test';
import { findForbiddenTrackedContent, findForbiddenTrackedFiles } from './check-secrets.mjs';

test('allows example environment templates', () => {
  const files = ['.env.example', 'apps/api/.env.example', 'apps/api/.env.production.example'];

  assert.deepEqual(findForbiddenTrackedFiles(files), []);
});

test('flags tracked environment files that can contain real secrets', () => {
  const files = ['.env', 'apps/api/.env', 'apps/api/.env.local', 'apps/api/.env.production'];

  assert.deepEqual(findForbiddenTrackedFiles(files), files);
});

test('flags tracked private keys and certificate bundles', () => {
  const files = [
    'certs/prod.pem',
    'certs/api.key',
    'certs/apple.p12',
    'certs/wechat.pfx',
    'deploy/id_rsa',
    'deploy/id_ed25519'
  ];

  assert.deepEqual(findForbiddenTrackedFiles(files), files);
});

test('flags real WeChat appid in tracked miniapp project config', () => {
  const realLookingAppId = ['wx', '1234567890abcdef'].join('');
  const violations = findForbiddenTrackedContent([
    {
      path: 'apps/miniapp/project.config.json',
      content: `{ "appid": "${realLookingAppId}" }`
    }
  ]);

  assert.deepEqual(violations, [
    {
      path: 'apps/miniapp/project.config.json',
      reason: 'real WeChat AppID must stay in local private config'
    }
  ]);
});

test('allows placeholder WeChat appid in tracked miniapp project config', () => {
  const violations = findForbiddenTrackedContent([
    {
      path: 'apps/miniapp/project.config.json',
      content: '{ "appid": "touristappid" }'
    }
  ]);

  assert.deepEqual(violations, []);
});

test('flags real WeChat appid in any tracked text file', () => {
  const realLookingAppId = ['wx', 'abcdef1234567890'].join('');
  const violations = findForbiddenTrackedContent([
    {
      path: 'README.md',
      content: `Local AppID: ${realLookingAppId}`
    }
  ]);

  assert.deepEqual(violations, [
    {
      path: 'README.md',
      reason: 'real WeChat AppID must stay in local private config'
    }
  ]);
});

test('ignores generated lockfiles when scanning appid-shaped strings', () => {
  const lockfileHashFragment = ['wx', 'abcdef1234567890'].join('');
  const violations = findForbiddenTrackedContent([
    {
      path: 'pnpm-lock.yaml',
      content: `integrity: sha512-${lockfileHashFragment}`
    }
  ]);

  assert.deepEqual(violations, []);
});
