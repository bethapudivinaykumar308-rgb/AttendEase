import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// The limiters read the environment when they are first imported, so the
// limits have to be lowered before the application module is loaded. The
// application therefore has to be imported dynamically.
process.env.RATE_LIMIT_MAX = '5';
process.env.AUTH_RATE_LIMIT_MAX = '500';

let createApp: (typeof import('../src/app.js'))['createApp'];
let app: Express;

beforeAll(async () => {
  ({ createApp } = await import('../src/app.js'));
  app = createApp();
});

afterAll(async () => {
  const { prisma } = await import('../src/config/prisma.js');
  await prisma.$disconnect();
});

describe('API rate limiting', () => {
  it('blocks the requests that exceed the window limit', async () => {
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await request(app).get('/api/health');
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 5).every((status) => status === 200)).toBe(true);
    expect(statuses.slice(5).every((status) => status === 429)).toBe(true);
  });

  it('exposes the standard rate limit headers', async () => {
    const response = await request(app).get('/api/health');
    expect(response.headers['ratelimit-limit']).toBe('5');
    expect(response.headers['ratelimit-remaining']).toBeDefined();
    expect(response.headers['ratelimit-reset']).toBeDefined();
  });
});
