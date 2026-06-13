import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const availabilitySourcePath = 'apps/miniapp/src/class-availability.ts';
const classesSourcePath = 'apps/miniapp/src/pages/classes/index.tsx';
const detailSourcePath = 'apps/miniapp/src/pages/class-detail/index.tsx';

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

test('miniapp has a shared bookable class guard for canceled and started classes', () => {
  const source = readIfExists(availabilitySourcePath);

  assert.match(source, /isBookableClass/);
  assert.match(source, /filterBookableClasses/);
  assert.match(source, /boxingClass\.status\s*!==\s*'SCHEDULED'/);
  assert.match(source, /new Date\(boxingClass\.startsAt\)\.getTime\(\)\s*<=\s*now\.getTime\(\)/);
});

test('classes list filters API results before rendering available classes', () => {
  const source = readFileSync(classesSourcePath, 'utf8');

  assert.match(source, /filterBookableClasses/);
  assert.match(source, /const bookableClasses = filterBookableClasses\(classList\)/);
  assert.match(source, /setClasses\(bookableClasses\)/);
  assert.match(source, /applyLoadedClasses\(classList\)/);
});

test('class detail treats unavailable classes as not found instead of bookable', () => {
  const source = readFileSync(detailSourcePath, 'utf8');

  assert.match(source, /isBookableClass/);
  assert.match(source, /item\.id === classId && isBookableClass\(item\)/);
  assert.match(source, /这节课可能已经下架、取消或不属于当前门店。/);
});
