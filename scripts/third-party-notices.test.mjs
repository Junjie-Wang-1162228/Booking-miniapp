import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const noticesPath = 'THIRD_PARTY_NOTICES.md';
const commercialChecklistPath = 'docs/commercial-readiness-checklist.md';
const optimizationChecklistPath = 'docs/optimization-checklist.md';

test('third party notices document direct dependencies and licenses', () => {
  const notices = readFileSync(noticesPath, 'utf8');

  assert.match(notices, /# Third Party Notices/);
  assert.match(notices, /Direct Runtime Dependencies/);
  assert.match(notices, /Development and Build Tooling/);
  assert.match(notices, /Asset and Brand Material Policy/);
  assert.match(notices, /@nestjs\/core[\s\S]*MIT/);
  assert.match(notices, /@prisma\/client[\s\S]*Apache-2\.0/);
  assert.match(notices, /antd[\s\S]*MIT/);
  assert.match(notices, /lucide-react[\s\S]*ISC/);
  assert.match(notices, /@tarojs\/taro[\s\S]*MIT/);
  assert.match(notices, /No third-party photos, posters, QR codes, logos, venue images, or coach images/);
});

test('commercial checklist links third party notices evidence', () => {
  const commercialChecklist = readFileSync(commercialChecklistPath, 'utf8');
  const optimizationChecklist = readFileSync(optimizationChecklistPath, 'utf8');

  assert.match(commercialChecklist, /THIRD_PARTY_NOTICES\.md/);
  assert.match(commercialChecklist, /主要依赖和许可证/);
  assert.match(optimizationChecklist, /THIRD_PARTY_NOTICES\.md/);
  assert.match(optimizationChecklist, /许可证/);
});
