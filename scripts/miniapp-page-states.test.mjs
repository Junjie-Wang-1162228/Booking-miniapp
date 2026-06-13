import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageStateSourcePath = 'apps/miniapp/src/components/PageState.tsx';
const appStylePath = 'apps/miniapp/src/app.scss';
const pagePaths = [
  'apps/miniapp/src/pages/classes/index.tsx',
  'apps/miniapp/src/pages/bookings/index.tsx',
  'apps/miniapp/src/pages/profile/index.tsx',
  'apps/miniapp/src/pages/class-detail/index.tsx'
];

test('loading state has user-readable copy in addition to skeleton cards', () => {
  const source = readFileSync(pageStateSourcePath, 'utf8');
  const style = readFileSync(appStylePath, 'utf8');

  assert.match(source, /label\s*=\s*'加载中，请稍候'/);
  assert.match(source, /loading-card-list__label/);
  assert.match(style, /\.loading-card-list__label/);
});

test('core miniapp pages expose loading, empty, and error states with recovery actions', () => {
  for (const path of pagePaths) {
    const source = readFileSync(path, 'utf8');

    assert.match(source, /LoadingCards/);
    assert.match(source, /PageState/);
    assert.match(source, /variant="error"/);
    assert.match(source, /actionText="重新加载"/);
  }
});

test('empty states explain what the user can do next', () => {
  const classesSource = readFileSync('apps/miniapp/src/pages/classes/index.tsx', 'utf8');
  const bookingsSource = readFileSync('apps/miniapp/src/pages/bookings/index.tsx', 'utf8');
  const profileSource = readFileSync('apps/miniapp/src/pages/profile/index.tsx', 'utf8');

  assert.match(classesSource, /暂无可预约课程/);
  assert.match(classesSource, /刷新课程/);
  assert.match(bookingsSource, /暂无预约/);
  assert.match(bookingsSource, /去约课/);
  assert.match(bookingsSource, /Taro\.switchTab\(\{\s*url: '\/pages\/classes\/index'/);
  assert.match(profileSource, /暂无消课记录/);
  assert.match(profileSource, /刷新记录/);
});
