import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareE2eDatabase } from './prepare-e2e-database';

function apiRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

async function main() {
  const databaseUrl = await prepareE2eDatabase();

  execFileSync('pnpm', ['exec', 'jest', '--config', './test/jest-e2e.json', '--runInBand'], {
    cwd: apiRoot(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit'
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
