import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// The limiters read the environment when they are first imported, so the
// limits have to be lowered before the application module is loaded. The
// application therefore has to be imported dynamically.
process.env.RATE_LIMIT_MAX = '500';
process.env.AUTH_RATE_LIMIT_MAX = '3';

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

describe('Credential rate limiting', () => {
  it('does not count a successful sign in towards the limit', async () => {
    const { seedFixtures, TEST_PASSWORD } = await import('./setup/fixtures.js');
    const fixtures = await seedFixtures();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: fixtures.admin.email, password: TEST_PASSWORD })
        .expect(200);
      expect(response.body.data.user.role).toBe('ADMIN');
    }
  });

  it('blocks repeated failed sign in attempts', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@attendease.test', password: 'WrongPass@123' })
        .expect(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    }

    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@attendease.test', password: 'WrongPass@123' });

    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});
