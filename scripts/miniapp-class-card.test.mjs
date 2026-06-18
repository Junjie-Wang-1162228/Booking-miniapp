import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const classesSourcePath = 'apps/miniapp/src/pages/classes/index.tsx';
const classesStylePath = 'apps/miniapp/src/pages/classes/index.scss';
const classDetailSourcePath = 'apps/miniapp/src/pages/class-detail/index.tsx';
const classDetailStylePath = 'apps/miniapp/src/pages/class-detail/index.scss';
const visibleClassesSourcePath = 'apps/miniapp/src/visible-classes.ts';

test('class cards show duration, branch, and training tag metadata', () => {
  const source = readFileSync(classesSourcePath, 'utf8');

  assert.match(source, /getClassTrainingTag/);
  assert.match(source, /durationMin/);
  assert.match(source, /branchName/);
  assert.match(source, /class-meta-grid/);
  assert.match(source, /适合/);
});

test('classes page loads admin-visible classes with the admin endpoint', () => {
  const source = readFileSync(classesSourcePath, 'utf8');
  const visibleClassesSource = readFileSync(visibleClassesSourcePath, 'utf8');

  assert.match(source, /loadVisibleClasses/);
  assert.match(visibleClassesSource, /getAdminClasses/);
  assert.match(visibleClassesSource, /session\.user\.role === 'ADMIN'/);
  assert.match(visibleClassesSource, /isBookedByMe:\s*false/);
  assert.match(source, /user\?\.role === 'ADMIN'/);
  assert.match(source, /运营查看/);
  assert.match(source, /user\?\.role !== 'ADMIN'[\s\S]*className="reminder-row"/);
});

test('class detail page uses the same admin-visible class loading path', () => {
  const source = readFileSync(classDetailSourcePath, 'utf8');

  assert.match(source, /loadVisibleClasses/);
  assert.match(source, /setUserRole\(session\.user\.role\)/);
  assert.match(source, /userRole === 'ADMIN'/);
});

test('admin-visible class actions are styled as read-only instead of booking actions', () => {
  const classesStyle = readFileSync(classesStylePath, 'utf8');
  const detailStyle = readFileSync(classDetailStylePath, 'utf8');

  assert.match(classesStyle, /\.primary-action\.is-admin/);
  assert.match(classesStyle, /\.primary-action\.is-admin[\s\S]*background:\s*#3b3b3b/);
  assert.match(detailStyle, /\.detail-primary-action\.is-admin/);
  assert.match(detailStyle, /\.detail-primary-action\.is-admin[\s\S]*background:\s*#3b3b3b/);
});

test('class metadata wraps on narrow screens without shrinking action buttons', () => {
  const style = readFileSync(classesStylePath, 'utf8');

  assert.match(style, /\.class-meta-grid/);
  assert.match(style, /flex-wrap:\s*wrap/);
  assert.match(style, /\.class-meta-chip/);
});
