import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const profilePath = 'apps/miniapp/src/pages/profile/index.tsx';
const profileStylesPath = 'apps/miniapp/src/pages/profile/index.scss';
const typesPath = 'apps/miniapp/src/types.ts';

test('profile page shows scannable member identity and branch summary', () => {
  const source = readFileSync(profilePath, 'utf8');
  const types = readFileSync(typesPath, 'utf8');

  assert.match(types, /memberNo: string \| null/);
  assert.match(source, /会员资料/);
  assert.match(source, /user\?\.phone/);
  assert.match(source, /selectedBranch\?\.memberNo/);
  assert.match(source, /selectedBranch\?\.name/);
  assert.match(source, /selectedBalance/);
});

test('profile summary uses compact rows that fit mobile screens', () => {
  const styles = readFileSync(profileStylesPath, 'utf8');

  assert.match(styles, /\.profile-summary/);
  assert.match(styles, /\.profile-summary__grid/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /word-break: break-word/);
});
