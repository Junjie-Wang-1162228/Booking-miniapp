import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const FORBIDDEN_FILE_PATTERNS = [
  /(^|\/)\.env($|\.)/,
  /\.(pem|key|p12|pfx)$/i,
  /(^|\/)id_(rsa|ed25519)$/
];

const ALLOWED_FILE_PATTERNS = [/(^|\/)\.env(\..*)?\.example$/];
const REAL_WECHAT_APPID_PATTERN = /"appid"\s*:\s*"wx[a-f0-9]{12,}"/i;

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

export function findForbiddenTrackedContent(entries) {
  return entries.flatMap(({ path, content }) => {
    if (path === 'apps/miniapp/project.config.json' && REAL_WECHAT_APPID_PATTERN.test(content)) {
      return [
        {
          path,
          reason: 'real WeChat AppID must stay in local private config'
        }
      ];
    }

    return [];
  });
}

function main() {
  const trackedFiles = readTrackedFiles();
  const forbidden = findForbiddenTrackedFiles(trackedFiles);
  const forbiddenContent = findForbiddenTrackedContent(
    trackedFiles
      .filter((file) => file === 'apps/miniapp/project.config.json')
      .map((file) => ({ path: file, content: readFileSync(file, 'utf8') }))
  );

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
