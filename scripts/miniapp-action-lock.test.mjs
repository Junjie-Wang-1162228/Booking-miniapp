import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const actionLockPath = 'apps/miniapp/src/use-action-lock.ts';
const pageStatePath = 'apps/miniapp/src/components/PageState.tsx';
const pages = [
  'apps/miniapp/src/pages/classes/index.tsx',
  'apps/miniapp/src/pages/bookings/index.tsx',
  'apps/miniapp/src/pages/profile/index.tsx',
  'apps/miniapp/src/pages/class-detail/index.tsx'
];

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

test('miniapp exposes a shared action lock hook for tap deduplication', () => {
  const source = readIfExists(actionLockPath);

  assert.match(source, /useActionLock/);
  assert.match(source, /lockedRef/);
  assert.match(source, /runLocked/);
  assert.match(source, /isActionLocked/);
  assert.match(source, /finally/);
});

test('core pages wrap high-risk button actions with runLocked and disabled state', () => {
  for (const path of pages) {
    const source = readFileSync(path, 'utf8');

    assert.match(source, /useActionLock/);
    assert.match(source, /runLocked/);
    assert.match(source, /isActionLocked/);
    assert.match(source, /disabled=\{[^}]*isActionLocked/);
  }
});

test('page state recovery action disables itself while retrying', () => {
  const source = readFileSync(pageStatePath, 'utf8');

  assert.match(source, /actionLoading/);
  assert.match(source, /handleAction/);
  assert.match(source, /disabled=\{actionLoading\}/);
  assert.match(source, /await onAction\(\)/);
});

test('page recovery actions return the loading promise to the page state lock', () => {
  for (const path of pages) {
    const source = readFileSync(path, 'utf8');

    assert.doesNotMatch(source, /onAction=\{\(\) => void load/);
  }
});
