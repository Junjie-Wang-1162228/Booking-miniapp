import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createManualTestStatus, parseManualChecklist } from './manual-test-status.mjs';

const manualChecklistPath = 'docs/manual-test-checklist.md';
const readmePath = 'README.md';
const optimizationChecklistPath = 'docs/optimization-checklist.md';
const packagePath = 'package.json';

function read(path) {
  return readFileSync(path, 'utf8');
}

test('manual test checklist uses strict local readiness before real WeChat checks', () => {
  const source = read(manualChecklistPath);

  assert.match(source, /pnpm dev:status:strict/);
  assert.match(source, /数据库端口漂移/);
});

test('manual test checklist opens the built miniapp dist and guards visual capture', () => {
  const source = read(manualChecklistPath);

  assert.match(source, /apps\/miniapp\/dist/);
  assert.doesNotMatch(source, /Open miniapp build in WeChat DevTools from `apps\/miniapp`/);
  assert.match(source, /完成度/);
  assert.match(source, /截图保存路径/);
  assert.match(source, /cross-env MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next/);
  assert.match(source, /pnpm miniapp:visual-qa:check/);
});

test('package exposes the manual test checklist guard', () => {
  const packageJson = JSON.parse(read(packagePath));

  assert.equal(packageJson.scripts['ops:manual-test-checklist:test'], 'node --test scripts/manual-test-checklist.test.mjs');
});

test('manual test status parser summarizes checked items by section', () => {
  const source = [
    '# 手工测试清单',
    '',
    '## 1. 本地环境准备',
    '',
    '- [x] 启动 MySQL：`pnpm dev:db`。',
    '- [ ] 运行 `pnpm dev:status`。',
    '',
    '## 2. 视觉走查',
    '',
    '- [ ] 运行 `pnpm miniapp:visual-qa`。'
  ].join('\n');

  const status = parseManualChecklist(source, 'docs/manual-test-checklist.md');

  assert.equal(status.total, 3);
  assert.equal(status.completed, 1);
  assert.equal(status.percent, 33);
  assert.deepEqual(status.next, {
    section: '1. 本地环境准备',
    line: 6,
    text: '运行 `pnpm dev:status`。'
  });
  assert.deepEqual(
    status.sections.map((section) => ({
      title: section.title,
      completed: section.completed,
      total: section.total,
      percent: section.percent,
      next: section.next
    })),
    [
      {
        title: '1. 本地环境准备',
        completed: 1,
        total: 2,
        percent: 50,
        next: {
          section: '1. 本地环境准备',
          line: 6,
          text: '运行 `pnpm dev:status`。'
        }
      },
      {
        title: '2. 视觉走查',
        completed: 0,
        total: 1,
        percent: 0,
        next: {
          section: '2. 视觉走查',
          line: 10,
          text: '运行 `pnpm miniapp:visual-qa`。'
        }
      }
    ]
  );
});

test('manual test status reports the current checklist without opening external tools', () => {
  const status = createManualTestStatus();

  assert.equal(status.mode, 'manual-test-status');
  assert.equal(status.checklistPath, 'docs/manual-test-checklist.md');
  assert.equal(status.opensDevTools, false);
  assert.ok(status.total > 0);
  assert.ok(status.next?.text);
});

test('package exposes a manual test status command', () => {
  const packageJson = JSON.parse(read(packagePath));

  assert.equal(packageJson.scripts['ops:manual-test:status'], 'node scripts/manual-test-status.mjs');
});

test('manual test status CLI reports incomplete checklists without failing the shell command', () => {
  const output = execFileSync('node', ['scripts/manual-test-status.mjs'], { encoding: 'utf8' });
  const status = JSON.parse(output);

  assert.equal(status.mode, 'manual-test-status');
  assert.equal(status.complete, false);
  assert.equal(status.opensDevTools, false);
});

test('docs expose the manual test status command', () => {
  const readme = read(readmePath);
  const optimizationChecklist = read(optimizationChecklistPath);

  assert.match(readme, /pnpm ops:manual-test:status/);
  assert.match(readme, /manual-test-status/);
  assert.match(optimizationChecklist, /pnpm ops:manual-test:status/);
});
