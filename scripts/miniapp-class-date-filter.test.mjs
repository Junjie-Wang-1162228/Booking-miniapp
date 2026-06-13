import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const classesSourcePath = 'apps/miniapp/src/pages/classes/index.tsx';
const classesStylePath = 'apps/miniapp/src/pages/classes/index.scss';

test('classes page exposes horizontal date filters before the class list', () => {
  const source = readFileSync(classesSourcePath, 'utf8');

  assert.match(source, /ScrollView/);
  assert.match(source, /createClassDateFilters/);
  assert.match(source, /selectedDateKey/);
  assert.match(source, /filteredClasses/);
  assert.match(source, /全部/);
  assert.match(source, /dateFilters\.map/);
  assert.match(source, /setSelectedDateKey\(filter\.key\)/);
});

test('class date filters use a mobile-safe horizontal chip layout', () => {
  const styles = readFileSync(classesStylePath, 'utf8');

  assert.match(styles, /\.date-filter-bar/);
  assert.match(styles, /\.date-filter-scroll/);
  assert.match(styles, /\.date-filter-button/);
  assert.match(styles, /white-space: nowrap/);
  assert.match(styles, /min-height: 72px/);
});
