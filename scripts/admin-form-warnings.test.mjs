import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync('apps/admin/src/App.tsx', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

test('admin forms avoid deprecated InputNumber addonAfter usage', () => {
  assert.doesNotMatch(appSource, /addonAfter=/);
  assert.match(appSource, /function NumberInputWithUnit/);
  assert.match(appSource, /Space\.Compact/);
});

test('admin modal forms are force-rendered before useForm instances are used', () => {
  assert.match(appSource, /forceRender[\s\S]*form=\{editCoachForm\}/);
  assert.match(appSource, /forceRender[\s\S]*form=\{editMemberForm\}/);
  assert.match(appSource, /forceRender[\s\S]*form=\{lessonAdjustmentForm\}/);
});

test('admin tab panes with form instances are force-rendered', () => {
  assert.match(appSource, /key:\s*'members'[\s\S]*forceRender:\s*true[\s\S]*form=\{memberForm\}/);
  assert.match(appSource, /key:\s*'coaches'[\s\S]*forceRender:\s*true[\s\S]*form=\{coachForm\}/);
  assert.match(appSource, /key:\s*'classes'[\s\S]*forceRender:\s*true[\s\S]*form=\{classForm\}/);
});

test('package exposes the admin form warning guard', () => {
  assert.equal(packageJson.scripts['admin:form-warnings:test'], 'node --test scripts/admin-form-warnings.test.mjs');
});
