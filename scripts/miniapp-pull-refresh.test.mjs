import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const pages = [
  {
    label: 'classes',
    sourcePath: 'apps/miniapp/src/pages/classes/index.tsx',
    configPath: 'apps/miniapp/src/pages/classes/index.config.ts'
  },
  {
    label: 'bookings',
    sourcePath: 'apps/miniapp/src/pages/bookings/index.tsx',
    configPath: 'apps/miniapp/src/pages/bookings/index.config.ts'
  },
  {
    label: 'profile',
    sourcePath: 'apps/miniapp/src/pages/profile/index.tsx',
    configPath: 'apps/miniapp/src/pages/profile/index.config.ts'
  },
  {
    label: 'class detail',
    sourcePath: 'apps/miniapp/src/pages/class-detail/index.tsx',
    configPath: 'apps/miniapp/src/pages/class-detail/index.config.ts'
  }
];

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

test('core miniapp pages enable native pull-down refresh in page config', () => {
  for (const page of pages) {
    const config = readIfExists(page.configPath);

    assert.match(config, /definePageConfig/);
    assert.match(config, /enablePullDownRefresh:\s*true/);
    assert.match(config, /backgroundTextStyle:\s*'light'/);
  }
});

test('core miniapp pages reload data and stop pull-down refresh', () => {
  for (const page of pages) {
    const source = readFileSync(page.sourcePath, 'utf8');

    assert.match(source, /usePullDownRefresh/);
    assert.match(source, /refreshPage/);
    assert.match(source, /Taro\.stopPullDownRefresh\(\)/);
    assert.match(source, /finally/);
  }
});
