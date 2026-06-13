import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_SCAN_ROOTS = ['apps', 'scripts'];
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.taro',
  'coverage',
  'dist',
  'node_modules'
]);

const LOG_CALL_PATTERN =
  /\b(?:console|(?:this\.)?logger)\.(?:log|info|warn|error|debug|verbose|fatal)\s*\(/;

const SENSITIVE_PATTERNS = [
  { term: 'accessToken', pattern: /\baccess[_-]?token\b/i },
  { term: 'appSecret', pattern: /\b(?:[A-Z0-9_]*APP_SECRET[A-Z0-9_]*|appSecret|app_secret)\b/ },
  { term: 'authorization', pattern: /\bauthorization\b/i },
  { term: 'cookie', pattern: /\bcookie\b/i },
  { term: 'database_url', pattern: /\bdatabase[_-]?url\b/i },
  { term: 'MYSQL_PWD', pattern: /\bmysql_pwd\b/i },
  { term: 'openid', pattern: /\bopenid\b/i },
  { term: 'passwordHash', pattern: /\bpasswordHash\b/ },
  { term: 'password', pattern: /\bpassword\b/i },
  { term: 'phone', pattern: /\bphone\b/i },
  { term: 'privateKey', pattern: /\bprivate[_-]?key\b/i },
  { term: 'refreshToken', pattern: /\brefresh[_-]?token\b/i },
  { term: 'token', pattern: /\btoken\b/i },
  { term: 'jwt', pattern: /\bjwt\b/i },
  { term: 'unionid', pattern: /\bunionid\b/i }
];

const MASKED_OUTPUT_PATTERN = /\b(mask|redact|redacted|sanitize|safe)\w*\s*\(/i;

function isSourceFile(file) {
  return SOURCE_EXTENSIONS.has(path.extname(file));
}

function isTestFile(file) {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || /\.(test|spec)\.mjs$/.test(file);
}

function isIgnoredDirectory(name) {
  return IGNORED_DIRECTORIES.has(name);
}

export function collectSourceFiles(roots = DEFAULT_SCAN_ROOTS) {
  const files = [];
  const visit = (entry) => {
    if (!existsSync(entry)) return;

    const stat = statSync(entry);
    if (stat.isDirectory()) {
      if (isIgnoredDirectory(path.basename(entry))) return;

      for (const child of readdirSync(entry)) {
        visit(path.join(entry, child));
      }
      return;
    }

    if (stat.isFile() && isSourceFile(entry) && !isTestFile(entry)) {
      files.push(entry);
    }
  };

  roots.forEach((root) => visit(root));
  return files.sort();
}

function findSensitiveTerm(line) {
  return SENSITIVE_PATTERNS.find(({ pattern }) => pattern.test(line))?.term ?? null;
}

function isMaskedLogLine(line) {
  return MASKED_OUTPUT_PATTERN.test(line);
}

export function scanSourceForSensitiveLogging(file, source) {
  return source
    .split(/\r?\n/)
    .flatMap((line, index) => {
      const text = line.trim();
      if (!LOG_CALL_PATTERN.test(text) || isMaskedLogLine(text)) return [];

      const term = findSensitiveTerm(text);
      if (!term) return [];

      return [
        {
          file,
          line: index + 1,
          term,
          text
        }
      ];
    });
}

export function findSensitiveLoggingViolations({ files = collectSourceFiles(), readFile = readFileSync } = {}) {
  return files.flatMap((file) => {
    const source = readFile(file, 'utf8');
    return scanSourceForSensitiveLogging(file, source);
  });
}

function main() {
  const violations = findSensitiveLoggingViolations();

  if (violations.length === 0) {
    console.log('Sensitive logging check passed');
    return;
  }

  console.error('Sensitive values must not be written to logs:');
  violations.forEach((violation) => {
    console.error(`- ${violation.file}:${violation.line} contains "${violation.term}": ${violation.text}`);
  });
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
