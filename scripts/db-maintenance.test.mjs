import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createBackupCommand,
  createBackupPath,
  createRestoreCommand,
  ensureRestoreIsConfirmed,
  loadEnvFile,
  parseKeyValueArgs,
  parseDatabaseUrl,
  redactCommand,
  resolveDbOptions,
  sanitizeName
} from './db-maintenance.mjs';

test('parseKeyValueArgs accepts kebab-case flags and boolean flags', () => {
  assert.deepEqual(parseKeyValueArgs(['--database', 'boxing_booking', '--confirm-local-restore', '--dry-run']), {
    database: 'boxing_booking',
    confirmLocalRestore: true,
    dryRun: true
  });
});

test('sanitizeName keeps backup filenames filesystem-safe', () => {
  assert.equal(sanitizeName('boxing booking/prod:shadow'), 'boxing-booking-prod-shadow');
});

test('createBackupPath uses sanitized database and ISO timestamp', () => {
  const backupPath = createBackupPath(
    resolveDbOptions({ database: 'boxing booking', backupDir: 'tmp-backups' }),
    new Date('2026-06-13T01:02:03.004Z')
  );
  assert.match(backupPath, /tmp-backups\/boxing-booking-2026-06-13T01-02-03-004Z\.sql$/);
});

test('loadEnvFile reads quoted DATABASE_URL values', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'db-maintenance-env-'));
  const envFile = path.join(tempDir, '.env');

  try {
    writeFileSync(envFile, 'DATABASE_URL="mysql://booking_user:secret%21@127.0.0.1:3307/boxing_booking"\n');
    assert.deepEqual(loadEnvFile(envFile), {
      DATABASE_URL: 'mysql://booking_user:secret%21@127.0.0.1:3307/boxing_booking'
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('parseDatabaseUrl maps a MySQL URL to CLI connection options', () => {
  assert.deepEqual(parseDatabaseUrl('mysql://booking_user:secret%21@127.0.0.1:3307/boxing_booking'), {
    host: '127.0.0.1',
    port: '3307',
    user: 'booking_user',
    password: 'secret!',
    database: 'boxing_booking'
  });
});

test('createBackupCommand uses mysqldump against the configured database URL', () => {
  const command = createBackupCommand(
    resolveDbOptions({ url: 'mysql://backup_user:backup%21@localhost:3307/boxing_booking' })
  );

  assert.equal(command.command, 'mysqldump');
  assert.deepEqual(command.args.slice(0, 7), [
    '--protocol=TCP',
    '-h',
    'localhost',
    '-P',
    '3307',
    '-u',
    'backup_user'
  ]);
  assert.ok(command.args.includes('--single-transaction'));
  assert.ok(command.args.includes('--routines'));
  assert.ok(command.args.includes('--triggers'));
  assert.ok(command.args.includes('--no-tablespaces'));
  assert.equal(command.args.at(-1), 'boxing_booking');
  assert.deepEqual(command.env, { MYSQL_PWD: 'backup!' });
});

test('createRestoreCommand restores into the selected local database', () => {
  const command = createRestoreCommand(
    resolveDbOptions({
      url: 'mysql://restore_user:restore%21@127.0.0.1:3307/boxing_booking',
      database: 'boxing_booking_restore_test'
    })
  );

  assert.equal(command.command, 'mysql');
  assert.deepEqual(command.args, [
    '--protocol=TCP',
    '-h',
    '127.0.0.1',
    '-P',
    '3307',
    '-u',
    'restore_user',
    'boxing_booking_restore_test'
  ]);
  assert.deepEqual(command.env, { MYSQL_PWD: 'restore!' });
});

test('redactCommand hides the MySQL password from printable command details', () => {
  assert.deepEqual(
    redactCommand({ command: 'mysql', args: ['-u', 'root'], env: { MYSQL_PWD: 'secret' } }),
    { command: 'mysql', args: ['-u', 'root'], env: { MYSQL_PWD: '<redacted>' } }
  );
});

test('backup dry-run output redacts MYSQL_PWD', () => {
  const output = execFileSync(process.execPath, [
    'scripts/db-backup.mjs',
    '--dry-run',
    '--url',
    'mysql://backup_user:backup-secret@127.0.0.1:3307/boxing_booking'
  ]).toString();

  assert.match(output, /<redacted>/);
  assert.doesNotMatch(output, /backup-secret/);
});

test('restore dry-run output redacts MYSQL_PWD', () => {
  const output = execFileSync(process.execPath, [
    'scripts/db-restore.mjs',
    '--dry-run',
    '--url',
    'mysql://restore_user:restore-secret@127.0.0.1:3307/boxing_booking',
    '--file',
    'db-backups/example.sql'
  ]).toString();

  assert.match(output, /<redacted>/);
  assert.doesNotMatch(output, /restore-secret/);
});

test('ensureRestoreIsConfirmed rejects restore without explicit local confirmation', () => {
  assert.throws(() => ensureRestoreIsConfirmed({}), /Refusing to restore without --confirm-local-restore/);
  assert.doesNotThrow(() => ensureRestoreIsConfirmed({ confirmLocalRestore: true }));
});
