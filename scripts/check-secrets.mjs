import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const FORBIDDEN_FILE_PATTERNS = [
  /(^|\/)\.env($|\.)/,
  /(^|\/)project\.private\.config\.json$/,
  /\.(pem|key|p12|pfx)$/i,
  /(^|\/)id_(rsa|ed25519)$/
];

const ALLOWED_FILE_PATTERNS = [/(^|\/)\.env(\..*)?\.example$/];
const GENERATED_CONTENT_FILE_PATTERNS = [/(^|\/)pnpm-lock\.yaml$/, /(^|\/)package-lock\.json$/, /(^|\/)yarn\.lock$/];
const SCANNED_CONTENT_FILE_PATTERNS = [
  /(^|\/)\.env(\..*)?\.example$/,
  /(^|\/)\.gitignore$/,
  /\.(css|html|js|jsx|json|md|mjs|prisma|scss|sql|svg|toml|ts|tsx|txt|yaml|yml)$/i
];
const REAL_WECHAT_APPID_PATTERN = /\bwx[0-9a-z]{16,}\b/i;
const REAL_WECHAT_APPID_REASON = 'real WeChat AppID must stay in local private config';

export function findForbiddenTrackedFiles(files) {
  return files.filter((file) => {
    if (ALLOWED_FILE_PATTERNS.some((pattern) => pattern.test(file))) {
      return false;
    }

    return FORBIDDEN_FILE_PATTERNS.some((pattern) => pattern.test(file));
  });
}

export function readTrackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  return output.split('\0').filter(Boolean);
}

export function readStagedFiles() {
  const output = execFileSync('git', ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'], {
    encoding: 'utf8'
  });
  return output.split('\0').filter(Boolean);
}

export function shouldScanTrackedContent(path) {
  if (GENERATED_CONTENT_FILE_PATTERNS.some((pattern) => pattern.test(path))) {
    return false;
  }

  return SCANNED_CONTENT_FILE_PATTERNS.some((pattern) => pattern.test(path));
}

export function readWorkingTreeContentEntries(files) {
  return files
    .filter((file) => shouldScanTrackedContent(file))
    .map((file) => ({ path: file, content: readFileSync(file, 'utf8') }));
}

export function readStagedContentEntries(files = readStagedFiles()) {
  return files
    .filter((file) => shouldScanTrackedContent(file))
    .map((file) => ({
      path: file,
      content: execFileSync('git', ['show', `:${file}`], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
    }));
}

export function findForbiddenTrackedContent(entries) {
  return entries.flatMap(({ path, content }) => {
    if (!shouldScanTrackedContent(path)) {
      return [];
    }

    if (REAL_WECHAT_APPID_PATTERN.test(content)) {
      return [
        {
          path,
          reason: REAL_WECHAT_APPID_REASON
        }
      ];
    }

    return [];
  });
}

function main() {
  const trackedFiles = readTrackedFiles();
  const stagedFiles = readStagedFiles();
  const forbidden = findForbiddenTrackedFiles(Array.from(new Set([...trackedFiles, ...stagedFiles])));
  const forbiddenContent = findForbiddenTrackedContent([
    ...readWorkingTreeContentEntries(trackedFiles),
    ...readStagedContentEntries(stagedFiles)
  ]);

  if (forbidden.length > 0) {
    console.error('Tracked secret-like files are not allowed:');
    forbidden.forEach((file) => console.error(`- ${file}`));
    process.exitCode = 1;
  }

  if (forbiddenContent.length > 0) {
    console.error('Tracked sensitive content is not allowed:');
    forbiddenContent.forEach((violation) => console.error(`- ${violation.path}: ${violation.reason}`));
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
