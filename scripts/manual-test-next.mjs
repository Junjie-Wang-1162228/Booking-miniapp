import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function parseJsonFromCommandOutput(output) {
  const source = String(output ?? '');
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('manual-test readiness output did not contain JSON');
  }

  return JSON.parse(source.slice(start, end + 1));
}

function redactManualActionText(text) {
  return String(text ?? '')
    .replace(/`([^`]+)`\s*\/\s*`([^`]+)`/g, '`$1` / `[已隐藏]`')
    .replace(/\b(admin123456|manager123456)\b/g, '[已隐藏]');
}

function sanitizeHumanAction(action) {
  if (!action) return null;

  return {
    section: action.section,
    line: action.line,
    text: redactManualActionText(action.text)
  };
}

function createManualTestSections(sections = []) {
  return sections.map((section) => ({
    title: section.title,
    completed: section.completed,
    total: section.total,
    percent: section.percent,
    next: sanitizeHumanAction(section.next)
  }));
}

export function createManualTestNextSummary(readiness) {
  return {
    mode: 'manual-test-next',
    opensDevTools: false,
    readyForManualWechat: readiness.readyForManualWechat === true,
    readyForRelease: readiness.readyForRelease === true,
    nextHumanAction: sanitizeHumanAction(readiness.nextHumanAction),
    devtoolsProjectPath: readiness.miniappProject?.source?.dist ?? null,
    miniappDistApi: {
      kind: readiness.miniappProject?.distApiBaseUrlKind ?? null,
      healthOk: readiness.miniappProject?.distApiHealthOk ?? null
    },
    progress: {
      manualTest: readiness.progress?.manualTest ?? null,
      visualQa: readiness.progress?.visualQa ?? null
    },
    manualTestSections: createManualTestSections(readiness.manualTestSections),
    visualQaDiagnostics: readiness.visualQaDiagnostics ?? null,
    releaseBlockers: readiness.releaseBlockers ?? [],
    captureCommand: readiness.captureCommand ?? null
  };
}

function readManualTestReadiness() {
  const result = spawnSync('pnpm', ['ops:manual-test:readiness'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`pnpm ops:manual-test:readiness failed${output ? `\n${output}` : ''}`);
  }

  return parseJsonFromCommandOutput(result.stdout);
}

function main() {
  console.log(JSON.stringify(createManualTestNextSummary(readManualTestReadiness()), null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
