import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const boolish = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value === '') return fallback;
      return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
    });

const csv = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  API_PORT: z.coerce.number().int().positive().default(5000),
  APP_URL: z.string().default('http://localhost:5173'),
  API_URL: z.string().default('http://localhost:5000'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  ATTENDANCE_THRESHOLD_PERCENT: z.coerce.number().min(1).max(100).default(75),
  ATTENDANCE_COUNTED_STATUSES: csv,
  CORS_ORIGINS: csv,
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info', 'debug']).default('info'),
  SECURE_COOKIES: boolish(false),
  TRUST_PROXY: boolish(false),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues.join('\n')}`);
  throw new Error('Invalid environment configuration');
}

const raw = parsed.data;

const countedStatuses = raw.ATTENDANCE_COUNTED_STATUSES.length
  ? raw.ATTENDANCE_COUNTED_STATUSES
  : ['PRESENT', 'LATE'];

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  isTest: raw.NODE_ENV === 'test',
  cookieName: 'attendease_token',
  csrfCookieName: 'attendease_csrf',
  csrfHeaderName: 'x-csrf-token',
  countedStatuses,
  thresholdPercent: raw.ATTENDANCE_THRESHOLD_PERCENT,
  corsOrigins: raw.CORS_ORIGINS.length ? raw.CORS_ORIGINS : [raw.APP_URL],
  frontendDist: path.resolve(process.cwd(), '../frontend/dist'),
};

export type Env = typeof env;
