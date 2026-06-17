import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('root lint runs the miniapp typecheck gate', () => {
  const rootPackage = JSON.parse(readFileSync('package.json', 'utf8'));
  const miniappPackage = JSON.parse(readFileSync('apps/miniapp/package.json', 'utf8'));

  assert.equal(miniappPackage.scripts.lint, 'tsc --noEmit -p tsconfig.json');
  assert.match(rootPackage.scripts.lint, /@booking\/miniapp lint/);
});

test('miniapp ops date helpers use the configured business timezone', () => {
  const script = `
    import assert from 'node:assert/strict';
    import {
      businessDateKeyForIso,
      formatBusinessDate,
      parseBusinessDateTime,
      toBusinessDateTimeParts
    } from './apps/miniapp/src/ops-date.ts';

    assert.equal(formatBusinessDate(new Date('2030-01-01T16:30:00.000Z'), 480), '2030-01-02');
    assert.equal(businessDateKeyForIso('2030-01-01T15:30:00.000Z', 480), '2030-01-01');
    assert.equal(businessDateKeyForIso('2030-01-01T16:30:00.000Z', 480), '2030-01-02');
    assert.deepEqual(toBusinessDateTimeParts('2030-01-02T10:30:00.000Z', 480), {
      date: '2030-01-02',
      time: '18:30'
    });
    assert.equal(parseBusinessDateTime('2030-01-02', '18:30', 480)?.toISOString(), '2030-01-02T10:30:00.000Z');
    assert.equal(parseBusinessDateTime('2030-02-30', '18:30', 480), null);
  `;

  execFileSync('apps/api/node_modules/.bin/tsx', ['-e', script], { stdio: 'pipe' });
});
