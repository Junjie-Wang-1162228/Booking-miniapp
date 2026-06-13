import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSourcePath = 'apps/admin/src/App.tsx';
const apiSourcePath = 'apps/admin/src/api.ts';
const typesSourcePath = 'apps/admin/src/types.ts';
const e2eSourcePath = 'apps/api/test/app.e2e-spec.ts';

test('admin API exposes coach management helpers and types', () => {
  const apiSource = readFileSync(apiSourcePath, 'utf8');
  const typesSource = readFileSync(typesSourcePath, 'utf8');

  assert.match(typesSource, /AdminCoach/);
  assert.match(typesSource, /CreateCoachInput/);
  assert.match(typesSource, /UpdateCoachInput/);
  assert.match(typesSource, /nickname/);
  assert.match(apiSource, /getAdminCoaches/);
  assert.match(apiSource, /\/admin\/coaches/);
  assert.match(apiSource, /createCoach/);
  assert.match(apiSource, /updateCoach/);
});

test('admin dashboard exposes coach management and class coach selection', () => {
  const source = readFileSync(appSourcePath, 'utf8');

  assert.match(source, /coaches/);
  assert.match(source, /教练管理/);
  assert.match(source, /coachColumns/);
  assert.match(source, /createCoach/);
  assert.match(source, /updateCoach/);
  assert.match(source, /coachOptionsByBranch/);
  assert.match(source, /name="coachId"/);
  assert.match(source, /选择教练档案/);
});

test('api e2e covers coach management and coach role boundaries', () => {
  const source = readFileSync(e2eSourcePath, 'utf8');

  assert.match(source, /lets admins create, list, and disable coaches/);
  assert.match(source, /enforces coach role view and operation boundaries/);
  assert.match(source, /\/admin\/coaches/);
  assert.match(source, /coachId/);
  assert.match(source, /expect\(coachClasses\.body\.map/);
  assert.match(source, /expect\(coachBookings\.body\.map/);
});

