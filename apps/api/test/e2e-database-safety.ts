const SAFE_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const SAFE_DATABASE_NAMES = new Set(['boxing_booking_e2e', 'boxing_booking_test']);

function failUnsafeDatabase(message: string): never {
  throw new Error(`Refusing to reset an unsafe E2E database: ${message}`);
}

export function assertE2eDatabaseIsSafeToReset(databaseUrl = process.env.DATABASE_URL) {
  if (process.env.E2E_ALLOW_DATABASE_RESET === 'true') return;
  if (!databaseUrl) failUnsafeDatabase('DATABASE_URL is not set');

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    failUnsafeDatabase('DATABASE_URL is not a valid URL');
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!SAFE_LOCAL_HOSTS.has(parsed.hostname) || !SAFE_DATABASE_NAMES.has(databaseName)) {
    failUnsafeDatabase(`host=${parsed.hostname}, database=${databaseName || '<empty>'}`);
  }
}
