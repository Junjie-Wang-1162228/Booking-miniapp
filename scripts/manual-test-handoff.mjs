import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseJsonFromCommandOutput } from './manual-test-next.mjs';

function boolZh(value) {
  return value === true ? '是' : '否';
}

function progressText(progress) {
  if (!progress) return '0/0，0%';
  return `${progress.completed ?? 0}/${progress.total ?? 0}，${progress.percent ?? 0}%`;
}

function redactManualActionText(text) {
  return String(text ?? '')
    .replace(/`([^`]+)`\s*\/\s*`([^`]+)`/g, '`$1` / `[已隐藏]`')
    .replace(/\b(admin123456|manager123456)\b/g, '[已隐藏]');
}

function actionLine(action) {
  if (!action) return '已完成';
  const line = action.line ? `第 ${action.line} 行，` : '';
  return `${line}${redactManualActionText(action.text)}`;
}

function listLines(items, formatter, emptyText) {
  if (!items || items.length === 0) return [`- ${emptyText}`];
  return items.map(formatter);
}

export function createManualTestHandoffMarkdown(summary) {
  const manualProgress = summary.progress?.manualTest ?? null;
  const visualProgress = summary.progress?.visualQa ?? null;
  const visualDiagnostics = summary.visualQaDiagnostics ?? {};
  const sections = summary.manualTestSections ?? [];
  const releaseBlockers = summary.releaseBlockers ?? [];
  const invalidReasons = visualDiagnostics.invalidReasons ?? [];

  return [
    '# 小程序真机验收交接',
    '',
    '## 当前状态',
    '',
    `- 可以开始真机微信验收：${boolZh(summary.readyForManualWechat)}`,
    `- 可以发布：${boolZh(summary.readyForRelease)}`,
    `- 小程序打开目录：\`${summary.devtoolsProjectPath ?? ''}\``,
    `- 构建包 API：\`${summary.miniappDistApi?.kind ?? 'unknown'}\`，healthOk=\`${summary.miniappDistApi?.healthOk ?? false}\``,
    `- 手工验收：${progressText(manualProgress)}`,
    `- 视觉截图：${progressText(visualProgress)}`,
    '',
    '## 下一步',
    '',
    summary.nextHumanAction
      ? `- 下一步：${summary.nextHumanAction.section}，${actionLine(summary.nextHumanAction)}`
      : '- 下一步：当前没有未完成的人工动作。',
    '',
    '## 手工验收分组',
    '',
    ...listLines(
      sections,
      (section) =>
        `- ${section.title}：${section.completed ?? 0}/${section.total ?? 0}，${section.percent ?? 0}%，下一步：${actionLine(section.next)}`,
      '没有手工验收分组。'
    ),
    '',
    '## 视觉截图',
    '',
    `- 已有截图：${visualDiagnostics.presentCount ?? 0}；无效截图：${visualDiagnostics.invalidCount ?? 0}`,
    ...listLines(invalidReasons, (reason) => `- 无效原因：${reason}`, '没有无效截图原因。'),
    summary.captureCommand ? `- 下一条截图命令：\`${summary.captureCommand}\`` : '- 下一条截图命令：无',
    '',
    '## 发布阻断',
    '',
    ...listLines(releaseBlockers, (blocker) => `- ${blocker.label}：${blocker.detail}`, '没有发布阻断项。'),
    ''
  ].join('\n');
}

function readManualTestNextSummary() {
  const result = spawnSync('pnpm', ['ops:manual-test:next'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`pnpm ops:manual-test:next failed${output ? `\n${output}` : ''}`);
  }

  return parseJsonFromCommandOutput(result.stdout);
}

function main() {
  console.log(createManualTestHandoffMarkdown(readManualTestNextSummary()));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
