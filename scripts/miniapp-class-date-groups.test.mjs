import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const classesSourcePath = 'apps/miniapp/src/pages/classes/index.tsx';
const classesStylePath = 'apps/miniapp/src/pages/classes/index.scss';

test('classes page groups available classes by date labels', () => {
  const source = readFileSync(classesSourcePath, 'utf8');

  assert.match(source, /getClassDateGroupLabel/);
  assert.match(source, /groupClassesByDate/);
  assert.match(source, /今天/);
  assert.match(source, /明天/);
  assert.match(source, /本周/);
  assert.match(source, /groupedClasses\.map/);
});

test('class date group headings have dedicated scan-friendly styles', () => {
  const style = readFileSync(classesStylePath, 'utf8');

  assert.match(style, /\.class-date-group/);
  assert.match(style, /\.class-date-heading/);
  assert.match(style, /\.class-date-title/);
});
