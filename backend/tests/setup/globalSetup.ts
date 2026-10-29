import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '../..');

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required and must point at the isolated test schema.',
  );
}

/**
 * Brings the dedicated test schema up to date with the real migrations
 * before any test runs. `prisma migrate deploy` is the same command used for
 * production, so the suite exercises the shipped migration history rather
 * than `db push`.
 */
export async function setup(): Promise<void> {
  const prismaCli = path.resolve(backendRoot, '../node_modules/prisma/build/index.js');

  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
}

export async function teardown(): Promise<void> {
  // The schema is intentionally left in place: it makes repeat runs fast and
  // keeps the migrations applied for manual inspection.
}
