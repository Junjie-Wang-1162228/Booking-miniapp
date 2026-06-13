import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const classesSourcePath = 'apps/miniapp/src/pages/classes/index.tsx';
const classesStylePath = 'apps/miniapp/src/pages/classes/index.scss';

test('class cards show duration, branch, and training tag metadata', () => {
  const source = readFileSync(classesSourcePath, 'utf8');

  assert.match(source, /getClassTrainingTag/);
  assert.match(source, /durationMin/);
  assert.match(source, /branchName/);
  assert.match(source, /class-meta-grid/);
  assert.match(source, /适合/);
});

test('class metadata wraps on narrow screens without shrinking action buttons', () => {
  const style = readFileSync(classesStylePath, 'utf8');

  assert.match(style, /\.class-meta-grid/);
  assert.match(style, /flex-wrap:\s*wrap/);
  assert.match(style, /\.class-meta-chip/);
});
