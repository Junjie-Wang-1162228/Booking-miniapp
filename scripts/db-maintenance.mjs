import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const defaultDbOptions = {
  envFile: 'apps/api/.env',
  host: 'localhost',
  port: '3307',
  user: 'booking_user',
  password: 'booking_pass',
  database: 'boxing_booking',
  backupDir: 'db-backups'
};

export function parseKeyValueArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;

    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    if (!rawKey) continue;
    const key = rawKey.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }

  return options;
}

export function resolveDbOptions(overrides = {}) {
  const envFile = overrides.envFile || defaultDbOptions.envFile;
  const envValues = loadEnvFile(envFile);
  const urlOptions = parseDatabaseUrl(overrides.url || envValues.DATABASE_URL);

  return {
    ...defaultDbOptions,
    ...urlOptions,
    ...overrides
  };
}

export function loadEnvFile(envFile) {
  const filePath = path.resolve(envFile);
  if (!existsSync(filePath)) return {};

  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        const key = line.slice(0, index);
        const rawValue = line.slice(index + 1).trim();
        return [key, rawValue.replace(/^["']|["']$/g, '')];
      })
  );
}

export function parseDatabaseUrl(databaseUrl) {
  if (!databaseUrl) return {};

  const parsed = new URL(databaseUrl);
  return {
    host: parsed.hostname,
    port: parsed.port || '3306',
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  };
}

export function sanitizeName(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function createBackupPath(options, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const database = sanitizeName(options.database || defaultDbOptions.database);
  return path.resolve(options.backupDir || defaultDbOptions.backupDir, `${database}-${stamp}.sql`);
}

export function createMysqlArgs(options, commandArgs = []) {
  return [
    '--protocol=TCP',
    '-h',
    options.host,
    '-P',
    String(options.port),
    '-u',
    options.user,
    ...commandArgs
  ];
}

export function createBackupCommand(options) {
  return {
    command: 'mysqldump',
    args: createMysqlArgs(options, [
      '--single-transaction',
      '--routines',
      '--triggers',
      '--no-tablespaces',
      options.database
    ]),
    env: { MYSQL_PWD: options.password }
  };
}

export function createRestoreCommand(options) {
  return {
    command: 'mysql',
    args: createMysqlArgs(options, [options.database]),
    env: { MYSQL_PWD: options.password }
  };
}

export function redactCommand(command) {
  return {
    ...command,
    env: command.env?.MYSQL_PWD ? { MYSQL_PWD: '<redacted>' } : command.env
  };
}

export function ensureRestoreIsConfirmed(options) {
  if (options.confirmLocalRestore !== true && options.confirmLocalRestore !== 'true') {
    throw new Error('Refusing to restore without --confirm-local-restore');
  }
}

export function runProcess(command, args, spawnOptions = {}) {
  return new Promise((resolve, reject) => {
    const { inputFile, ...childOptions } = spawnOptions;
    const child = spawn(command, args, {
      ...childOptions,
      env: {
        ...process.env,
        ...(childOptions.env || {})
      }
    });
    if (inputFile) {
      createReadStream(inputFile).pipe(child.stdin);
    }
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

export async function runBackup(options) {
  const backupPath = options.out ? path.resolve(options.out) : createBackupPath(options);
  mkdirSync(path.dirname(backupPath), { recursive: true });
  if (existsSync(backupPath)) {
    throw new Error(`Backup file already exists: ${backupPath}`);
  }
  const tempPath = `${backupPath}.tmp-${process.pid}-${Date.now()}`;
  const backupCommand = createBackupCommand(options);
  const output = createWriteStream(tempPath, { flags: 'wx' });

  await new Promise((resolve, reject) => {
    let childExited = false;
    let outputFinished = false;
    let exitCode = null;
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      output.destroy();
      rmSync(tempPath, { force: true });
      reject(error);
    };

    const complete = () => {
      if (settled || !childExited || !outputFinished) return;
      settled = true;
      resolve();
    };

    const child = spawn(backupCommand.command, backupCommand.args, {
      stdio: ['ignore', 'pipe', 'inherit'],
      env: {
        ...process.env,
        ...(backupCommand.env || {})
      }
    });
    child.stdout.pipe(output);
    child.once('error', fail);
    output.once('error', fail);
    output.once('finish', () => {
      outputFinished = true;
      complete();
    });
    child.once('close', (code) => {
      childExited = true;
      exitCode = code;
      if (code === 0) {
        complete();
        return;
      }
      fail(new Error(`${backupCommand.command} exited with code ${exitCode}`));
    });
  });

  renameSync(tempPath, backupPath);
  return backupPath;
}

export async function runRestore(options) {
  ensureRestoreIsConfirmed(options);
  if (!options.file) {
    throw new Error('Missing required --file <backup.sql>');
  }
  const backupFile = path.resolve(options.file);
  if (!existsSync(backupFile)) {
    throw new Error(`Backup file not found: ${backupFile}`);
  }

  const restoreCommand = createRestoreCommand(options);
  await runProcess(restoreCommand.command, restoreCommand.args, {
    stdio: ['pipe', 'inherit', 'inherit'],
    env: restoreCommand.env,
    inputFile: backupFile
  });
}
