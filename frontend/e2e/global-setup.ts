import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL;

if (!E2E_DATABASE_URL) {
  throw new Error(
    'E2E_DATABASE_URL is required and must point at the isolated end-to-end schema.',
  );
}

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../backend');

/**
 * Prepares a dedicated MySQL schema for the end to end suite.
 *
 * The end to end tests create and edit records, so they must never run against
 * the development database. The schema is dropped and re-seeded on every run
 * so the suite is repeatable.
 */
export default async function globalSetup(): Promise<void> {
  const schemaName = new URL(E2E_DATABASE_URL).pathname.replace(/^\//, '');
  const serverUrl = new URL(E2E_DATABASE_URL);
  serverUrl.pathname = '/mysql';

  const admin = new PrismaClient({ datasourceUrl: serverUrl.toString() });
  try {
    await admin.$executeRawUnsafe(
      `CREATE DATABASE IF NOT EXISTS \`${schemaName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } catch {
    // The application user is intentionally not a MySQL administrator, so the
    // schema has to be created once by a DBA. Failing here is not fatal as
    // long as the schema already exists.
  }
  await admin.$disconnect();

  const prismaCli = path.resolve(backendRoot, '../node_modules/prisma/build/index.js');
  const env = { ...process.env, DATABASE_URL: E2E_DATABASE_URL };

  execFileSync(
    process.execPath,
    [prismaCli, 'migrate', 'reset', '--force', '--skip-seed', '--skip-generate'],
    {
      cwd: backendRoot,
      env,
      stdio: 'inherit',
    },
  );

  execFileSync(process.execPath, [path.resolve(backendRoot, '../node_modules/tsx/dist/cli.mjs'), 'prisma/seed.ts'], {
    cwd: backendRoot,
    env,
    stdio: 'inherit',
  });
}
