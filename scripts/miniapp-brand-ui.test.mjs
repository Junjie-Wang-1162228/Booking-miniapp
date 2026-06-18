import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const logoAssetPath = 'apps/miniapp/src/assets/brand/zhenzhi-logo.jpg';
const brandLogoPath = 'apps/miniapp/src/components/BrandLogo.tsx';
const appStylePath = 'apps/miniapp/src/app.scss';
const classesPath = 'apps/miniapp/src/pages/classes/index.tsx';
const detailPath = 'apps/miniapp/src/pages/class-detail/index.tsx';
const detailStylePath = 'apps/miniapp/src/pages/class-detail/index.scss';
const profilePath = 'apps/miniapp/src/pages/profile/index.tsx';
const profileStylePath = 'apps/miniapp/src/pages/profile/index.scss';
const bookingsPath = 'apps/miniapp/src/pages/bookings/index.tsx';
const bookingsStylePath = 'apps/miniapp/src/pages/bookings/index.scss';

test('miniapp uses the ZHENZHIGEDOU logo asset in the shared brand component', () => {
  const brandLogo = readFileSync(brandLogoPath, 'utf8');

  assert.equal(existsSync(logoAssetPath), true);
  assert.match(brandLogo, /zhenzhi-logo\.jpg/);
  assert.match(brandLogo, /Image/);
  assert.match(brandLogo, /真知格斗/);
  assert.match(brandLogo, /ZHENZHIGEDOU/);
});

test('miniapp global theme reflects the gym reference palette and training floor texture', () => {
  const styles = readFileSync(appStylePath, 'utf8');

  assert.match(styles, /#e31b23/);
  assert.match(styles, /#f28a24/);
  assert.match(styles, /\.hero__brand-line/);
  assert.match(styles, /linear-gradient/);
  assert.match(styles, /brand-logo__image/);
  assert.match(styles, /mat-lane/);
});

test('member-facing pages carry the ZHENZHIGEDOU brand treatment without changing workflows', () => {
  const classesSource = readFileSync(classesPath, 'utf8');
  const detailStyles = readFileSync(detailStylePath, 'utf8');
  const profileStyles = readFileSync(profileStylePath, 'utf8');
  const bookingsStyles = readFileSync(bookingsStylePath, 'utf8');

  assert.match(classesSource, /训练场开放中/);
  assert.match(classesSource, /hero__brand-line/);
  assert.match(detailStyles, /detail-hero/);
  assert.match(detailStyles, /#f28a24/);
  assert.match(profileStyles, /account-login-panel/);
  assert.match(profileStyles, /#f28a24/);
  assert.match(bookingsStyles, /booking-card/);
  assert.match(bookingsStyles, /#f28a24/);
});

test('classes landing page surfaces venue context from the gym reference style', () => {
  const classesSource = readFileSync(classesPath, 'utf8');
  const appStyles = readFileSync(appStylePath, 'utf8');

  assert.match(classesSource, /venue-strip/);
  assert.match(classesSource, /selectedBranch\?\.address/);
  assert.match(classesSource, /训练馆信息/);
  assert.match(appStyles, /venue-strip__mat-zone/);
  assert.match(appStyles, /#5f6368/);
  assert.match(appStyles, /#ff8a2a/);
});

test('phase two brand treatment carries through bookings profile and detail pages', () => {
  const bookingsSource = readFileSync(bookingsPath, 'utf8');
  const detailSource = readFileSync(detailPath, 'utf8');
  const profileSource = readFileSync(profilePath, 'utf8');
  const appStyles = readFileSync(appStylePath, 'utf8');
  const detailStyles = readFileSync(detailStylePath, 'utf8');

  assert.match(bookingsSource, /training-strip booking-training-strip/);
  assert.match(bookingsSource, /到课节奏/);
  assert.match(profileSource, /training-strip profile-training-strip/);
  assert.match(profileSource, /会员课时 · 运营权限 · 场馆联系/);
  assert.match(detailSource, /detail-hero__brand-line/);
  assert.match(detailSource, /训练计划 · 装备准备 · 门店联系/);
  assert.match(appStyles, /\.training-strip/);
  assert.match(appStyles, /training-strip__track/);
  assert.match(detailStyles, /detail-hero__brand-line/);
});

test('phase two brand surfaces keep compact layouts for narrow phone screens', () => {
  const appStyles = readFileSync(appStylePath, 'utf8');
  const bookingsStyles = readFileSync(bookingsStylePath, 'utf8');
  const classesStyles = readFileSync('apps/miniapp/src/pages/classes/index.scss', 'utf8');
  const opsStyles = readFileSync('apps/miniapp/src/pages/ops/index.scss', 'utf8');

  assert.match(appStyles, /@media \(max-width: 380px\)/);
  assert.match(appStyles, /\.venue-strip,\s*\.training-strip\s*{[^}]*grid-template-columns: 1fr/s);
  assert.match(appStyles, /\.member-switch\s*{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(bookingsStyles, /@media \(max-width: 380px\)/);
  assert.match(bookingsStyles, /\.booking-footer\s*{[^}]*align-items: stretch/s);
  assert.match(classesStyles, /@media \(max-width: 380px\)/);
  assert.match(classesStyles, /\.class-action-row\s*{[^}]*flex-direction: column/s);
  assert.match(opsStyles, /@media \(max-width: 380px\)/);
  assert.match(opsStyles, /\.ops-two-inputs,\s*\.ops-search-row,\s*\.ops-action-row\s*{[^}]*flex-direction: column/s);
});
