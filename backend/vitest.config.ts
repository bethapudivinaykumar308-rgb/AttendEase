import { defineConfig } from 'vitest/config';

/**
 * The suite runs against a real MySQL 8 database (`attendance_management_test`)
 * that is a sibling of the development schema. Tests never touch the
 * development data, so a failing run can never corrupt the demo dataset.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (!TEST_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is required and must point at the isolated test schema.',
  );
}

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/setup/globalSetup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: 'attendease-test-only-secret-key-0123456789-abcdefghij',
      JWT_EXPIRES_IN: '8h',
      APP_URL: 'http://localhost:5173',
      API_URL: 'http://localhost:5000',
      CORS_ORIGINS: 'http://localhost:5173',
      ATTENDANCE_THRESHOLD_PERCENT: '75',
      ATTENDANCE_COUNTED_STATUSES: 'PRESENT,LATE',
      SECURE_COOKIES: 'false',
      TRUST_PROXY: 'false',
      LOG_LEVEL: 'silent',
      // High enough that ordinary traffic in the suite is never throttled.
      // The limiter itself is exercised in `rate-limit.test.ts`.
      RATE_LIMIT_MAX: '5000',
      AUTH_RATE_LIMIT_MAX: '2000',
      RESET_TOKEN_TTL_MINUTES: '30',
    },
    // The suites share one MySQL schema, so files must not run concurrently.
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    teardownTimeout: 30_000,
  },
});
