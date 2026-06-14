import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function percentFromProgress(progress = {}) {
  const completed = progress.completed ?? 0;
  const total = progress.total ?? 0;
  const percent = progress.percent ?? (total > 0 ? Math.round((completed / total) * 100) : 100);

  return { completed, total, percent };
}

function createGate({ id, label, ok, requiredFor, detail }) {
  return {
    id,
    label,
    ok,
    requiredFor,
    detail
  };
}

function findSection(sections = [], titlePattern) {
  return sections.find((section) => titlePattern.test(section.title));
}

function createNextHumanAction({ readyForManualWechat, manualTest }) {
  if (!readyForManualWechat) return manualTest.next ?? null;

  const wechatSection = findSection(manualTest.sections, /真实微信登录准备/);
  if (!wechatSection || wechatSection.completed >= wechatSection.total) {
    return manualTest.next ?? null;
  }

  return (
    wechatSection.next ?? {
      section: wechatSection.title,
      line: null,
      text: '本地预览和 strict 环境门禁已通过；继续完成真实微信登录准备。'
    }
  );
}

function createReleaseBlockers(gates) {
  return gates
    .filter((gate) => gate.requiredFor === 'release' && !gate.ok)
    .map((gate) => ({
      id: gate.id,
      label: gate.label,
      detail: gate.detail
    }));
}

export function createManualTestReadiness(devStatus) {
  const progress = {
    preview: percentFromProgress(devStatus.progress?.preview),
    visualQa: percentFromProgress(devStatus.progress?.visualQa),
    manualTest: percentFromProgress(devStatus.progress?.manualTest),
    strict: devStatus.progress?.strict ?? devStatus.strict ?? { enabled: true, passed: false, failures: [] }
  };
  const manualTest = devStatus.manualTest ?? {
    complete: progress.manualTest.total > 0 && progress.manualTest.completed === progress.manualTest.total,
    next: null,
    sections: []
  };
  const visualQa = devStatus.visualQa ?? {
    complete: progress.visualQa.total > 0 && progress.visualQa.completed === progress.visualQa.total
  };
  const localPreviewOk = progress.preview.total > 0 && progress.preview.completed === progress.preview.total;
  const strictOk = progress.strict.passed === true;
  const readyForManualWechat = localPreviewOk && strictOk;
  const gates = [
    createGate({
      id: 'local-preview',
      label: '本地预览',
      ok: localPreviewOk,
      requiredFor: 'manual-start',
      detail: `${progress.preview.completed}/${progress.preview.total}`
    }),
    createGate({
      id: 'strict-dev-status',
      label: '严格本地环境检查',
      ok: strictOk,
      requiredFor: 'manual-start',
      detail:
        progress.strict.failures && progress.strict.failures.length > 0
          ? progress.strict.failures.join(' ')
          : 'passed'
    }),
    createGate({
      id: 'visual-qa-matrix',
      label: '多设备视觉截图矩阵',
      ok: visualQa.complete === true,
      requiredFor: 'release',
      detail: `${progress.visualQa.completed}/${progress.visualQa.total}`
    }),
    createGate({
      id: 'manual-checklist',
      label: '手工验收清单',
      ok: manualTest.complete === true,
      requiredFor: 'release',
      detail: `${progress.manualTest.completed}/${progress.manualTest.total}`
    })
  ];
  const releaseBlockers = createReleaseBlockers(gates);

  return {
    mode: 'manual-test-readiness',
    opensDevTools: false,
    readyForManualWechat,
    readyForRelease: releaseBlockers.length === 0,
    releaseBlockers,
    progress,
    gates,
    nextAction: devStatus.progress?.nextAction ?? null,
    manualTestNext: manualTest.next ?? null,
    nextHumanAction: createNextHumanAction({ readyForManualWechat, manualTest }),
    captureCommand: devStatus.visualQa?.captureCommand ?? null
  };
}

function parseJsonOutput(stdout) {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('dev-status output did not contain JSON');
  }

  return JSON.parse(stdout.slice(start, end + 1));
}

export function readStrictDevStatus() {
  const result = spawnSync(process.execPath, ['scripts/dev-status.mjs', '--strict'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });

  if (!result.stdout) {
    throw new Error(result.stderr || 'dev-status did not return output');
  }

  return parseJsonOutput(result.stdout);
}

function main() {
  const readiness = createManualTestReadiness(readStrictDevStatus());
  console.log(JSON.stringify(readiness, null, 2));
  if (!readiness.readyForManualWechat) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  }
}
