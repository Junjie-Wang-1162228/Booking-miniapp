import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSourcePath = 'apps/admin/src/App.tsx';
const apiSourcePath = 'apps/admin/src/api.ts';
const typesSourcePath = 'apps/admin/src/types.ts';
const stylePath = 'apps/admin/src/styles.css';

test('admin API exposes member lesson ledger client types and request helper', () => {
  const apiSource = readFileSync(apiSourcePath, 'utf8');
  const typesSource = readFileSync(typesSourcePath, 'utf8');

  assert.match(typesSource, /LessonLedgerEntry/);
  assert.match(typesSource, /LessonLedgerResponse/);
  assert.match(typesSource, /ADJUSTMENT/);
  assert.match(typesSource, /DEDUCTION/);
  assert.match(apiSource, /getAdminMemberLessonLedger/);
  assert.match(apiSource, /\/admin\/members\/\$\{id\}\/lesson-ledger/);
  assert.match(apiSource, /branchId=/);
});

test('admin member list can open a lesson ledger modal', () => {
  const source = readFileSync(appSourcePath, 'utf8');

  assert.match(source, /getAdminMemberLessonLedger/);
  assert.match(source, /viewingLedgerMember/);
  assert.match(source, /lessonLedgerEntries/);
  assert.match(source, /openMemberLessonLedger/);
  assert.match(source, /课时流水/);
  assert.match(source, /会员课时流水/);
  assert.match(source, /member-ledger-list/);
  assert.match(source, /member-ledger-entry/);
  assert.match(source, /ledgerEntryTypeTag/);
});

test('member lesson ledger styles are compact and responsive', () => {
  const style = readFileSync(stylePath, 'utf8');

  assert.match(style, /\.member-ledger-list/);
  assert.match(style, /\.member-ledger-entry/);
  assert.match(style, /\.member-ledger-entry__meta/);
  assert.match(style, /overflow-wrap:\s*anywhere/);
  assert.match(style, /grid-template-columns:\s*1fr/);
});
