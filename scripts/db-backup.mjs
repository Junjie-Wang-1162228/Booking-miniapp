import { pathToFileURL } from 'node:url';
import {
  createBackupCommand,
  parseKeyValueArgs,
  redactCommand,
  resolveDbOptions,
  runBackup
} from './db-maintenance.mjs';

async function main() {
  const options = resolveDbOptions(parseKeyValueArgs(process.argv.slice(2)));
  const command = createBackupCommand(options);

  if (options.dryRun) {
    console.log(JSON.stringify({ mode: 'backup', command: redactCommand(command) }, null, 2));
    return;
  }

  const backupPath = await runBackup(options);
  console.log(`Database backup written to ${backupPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
