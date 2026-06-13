import { pathToFileURL } from 'node:url';
import {
  createRestoreCommand,
  ensureRestoreIsConfirmed,
  parseKeyValueArgs,
  redactCommand,
  resolveDbOptions,
  runRestore
} from './db-maintenance.mjs';

async function main() {
  const options = resolveDbOptions(parseKeyValueArgs(process.argv.slice(2)));
  const command = createRestoreCommand(options);

  if (options.dryRun) {
    console.log(JSON.stringify({ mode: 'restore', command: redactCommand(command), file: options.file ?? null }, null, 2));
    return;
  }

  ensureRestoreIsConfirmed(options);
  await runRestore(options);
  console.log(`Database restored from ${options.file}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
