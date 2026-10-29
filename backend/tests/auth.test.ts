import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { seedFixtures, TEST_PASSWORD, type Fixtures } from './setup/fixtures.js';
import { csrfCookieFrom, login } from './setup/helpers.js';

const app = createApp();
const api = request(app);
let fixtures: Fixtures;

describe('Authentication', () => {
  beforeAll(async () => {
    fixtures = await seedFixtures();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/auth/login', () => {
    it('signs a user in and returns the profile plus a CSRF token', async () => {
      const response = await api
        .post('/api/auth/login')
        .send({ email: fixtures.admin.email, password: TEST_PASSWORD })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toMatchObject({
        email: fixtures.admin.email,
        role: 'ADMIN',
      });
      expect(typeof response.body.data.csrfToken).toBe('string');
      expect(response.body.data.csrfToken.length).toBeGreaterThan(20);
    });

    it('sets an http-only session cookie that is not readable from JavaScript', async () => {
      const response = await api
        .post('/api/auth/login')
        .send({ email: fixtures.admin.email, password: TEST_PASSWORD })
        .expect(200);

      const cookies = response.headers['set-cookie'] as unknown as string[];
      const sessionCookie = cookies.find((cookie) => cookie.startsWith('attendease_token='));

      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toContain('HttpOnly');
      expect(sessionCookie).toContain('SameSite=Lax');
      expect(sessionCookie).toContain('Path=/');
    });

    it('never returns the password hash or the raw password', async () => {
      const response = await api
        .post('/api/auth/login')
        .send({ email: fixtures.admin.email, password: TEST_PASSWORD })
        .expect(200);

      const serialised = JSON.stringify(response.body);
      expect(serialised).not.toContain('passwordHash');
      expect(serialised).not.toContain('$2a$');
      expect(serialised).not.toContain(TEST_PASSWORD);
    });

    it('rejects a wrong password with 401', async () => {
      const response = await api
        .post('/api/auth/login')
        .send({ email: fixtures.admin.email, password: 'WrongPassword1' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects an unknown email with the same message as a wrong password', async () => {
      const unknown = await api
        .post('/api/auth/login')
        .send({ email: 'nobody@attendease.test', password: 'WrongPassword1' })
        .expect(401);
      const wrongPassword = await api
        .post('/api/auth/login')
        .send({ email: fixtures.admin.email, password: 'WrongPassword1' })
        .expect(401);

      expect(unknown.body.error.message).toBe(wrongPassword.body.error.message);
    });

    it('is case insensitive on the email address', async () => {
      await api
        .post('/api/auth/login')
        .send({ email: fixtures.admin.email.toUpperCase(), password: TEST_PASSWORD })
        .expect(200);
    });

    it('rejects a malformed email with 422', async () => {
      const response = await api
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: TEST_PASSWORD })
        .expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a missing password with 422', async () => {
      await api.post('/api/auth/login').send({ email: fixtures.admin.email }).expect(422);
    });

    it('refuses to sign in a deactivated account', async () => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: fixtures.students[0].email },
      });
      await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

      const response = await api
        .post('/api/auth/login')
        .send({ email: fixtures.students[0].email, password: TEST_PASSWORD })
        .expect(401);

      expect(response.body.error.message).toMatch(/deactivated/i);

      await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns the signed-in profile for a valid session', async () => {
      const session = await login(app, fixtures.admin.email, TEST_PASSWORD);
      const response = await session.get('/api/auth/me').expect(200);

      expect(response.body.data.user.email).toBe(fixtures.admin.email);
      expect(response.body.data.user.role).toBe('ADMIN');
    });

    it('rejects a request without a session cookie with 401', async () => {
      await api.get('/api/auth/me').expect(401);
    });

    it('rejects a tampered session cookie with 401', async () => {
      const response = await api
        .get('/api/auth/me')
        .set('Cookie', 'attendease_token=not-a-real-jwt')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a session whose account was deactivated after login', async () => {
      const session = await login(app, fixtures.students[1].email, TEST_PASSWORD);
      await prisma.user.update({
        where: { id: fixtures.students[1].userId },
        data: { isActive: false },
      });

      const response = await session.get('/api/auth/me').expect(403);
      expect(response.body.error.message).toMatch(/deactivated/i);

      await prisma.user.update({
        where: { id: fixtures.students[1].userId },
        data: { isActive: true },
      });
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears the session cookie', async () => {
      const session = await login(app, fixtures.admin.email, TEST_PASSWORD);
      const response = await session.post('/api/auth/logout').expect(200);

      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((cookie) => cookie.startsWith('attendease_token='))).toBe(true);
    });

    it('requires a CSRF token', async () => {
      const session = await login(app, fixtures.admin.email, TEST_PASSWORD);
      const response = await session.postWithoutCsrf('/api/auth/logout').expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.message).toMatch(/CSRF/i);
    });

    it('rejects a mismatched CSRF token', async () => {
      const session = await login(app, fixtures.admin.email, TEST_PASSWORD);
      const response = await session.agent
        .post('/api/auth/logout')
        .set('X-CSRF-Token', 'a'.repeat(48))
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('accepts the CSRF token that matches the double-submit cookie', async () => {
      const response = await api
        .post('/api/auth/login')
        .send({ email: fixtures.admin.email, password: TEST_PASSWORD })
        .expect(200);

      const csrfToken = response.body.data.csrfToken as string;
      const cookieToken = csrfCookieFrom(response);
      expect(cookieToken).toBe(csrfToken);
    });
  });

  describe('CSRF protection on state-changing requests', () => {
    it('blocks a POST without any CSRF token', async () => {
      const session = await login(app, fixtures.admin.email, TEST_PASSWORD);
      const response = await session.postWithoutCsrf('/api/auth/profile').expect(403);
      expect(response.body.error.message).toMatch(/CSRF/i);
    });

    it('allows safe methods without a CSRF token', async () => {
      const session = await login(app, fixtures.admin.email, TEST_PASSWORD);
      await session.get('/api/auth/me').expect(200);
    });
  });

  describe('Password reset', () => {
    it('does not disclose whether an email exists', async () => {
      const known = await api
        .post('/api/auth/forgot-password')
        .send({ email: fixtures.admin.email })
        .expect(200);
      const unknown = await api
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@attendease.test' })
        .expect(200);

      expect(known.body.data.message).toBe(unknown.body.data.message);
    });

    it('resets the password with a valid token and invalidates the old password', async () => {
      const forgot = await api
        .post('/api/auth/forgot-password')
        .send({ email: fixtures.students[0].email })
        .expect(200);

      const token = forgot.body.data.resetToken as string;
      expect(typeof token).toBe('string');

      await api
        .post('/api/auth/reset-password')
        .send({ token, password: 'NewPassword9' })
        .expect(200);

      await api
        .post('/api/auth/login')
        .send({ email: fixtures.students[0].email, password: TEST_PASSWORD })
        .expect(401);

      await api
        .post('/api/auth/login')
        .send({ email: fixtures.students[0].email, password: 'NewPassword9' })
        .expect(200);
    });

    it('rejects a reset with an unknown token', async () => {
      const response = await api
        .post('/api/auth/reset-password')
        .send({ token: 'x'.repeat(48), password: 'NewPassword9' })
        .expect(400);

      expect(response.body.error.message).toMatch(/invalid or has expired/i);
    });

    it('rejects a reset with a weak password', async () => {
      const forgot = await api
        .post('/api/auth/forgot-password')
        .send({ email: fixtures.students[0].email })
        .expect(200);

      await api
        .post('/api/auth/reset-password')
        .send({ token: forgot.body.data.resetToken, password: 'weak' })
        .expect(422);
    });

    it('cannot reuse a reset token once it has been used', async () => {
      const forgot = await api
        .post('/api/auth/forgot-password')
        .send({ email: fixtures.students[1].email })
        .expect(200);

      const token = forgot.body.data.resetToken as string;
      await api
        .post('/api/auth/reset-password')
        .send({ token, password: 'AnotherPass9' })
        .expect(200);

      await api
        .post('/api/auth/reset-password')
        .send({ token, password: 'YetAnother9' })
        .expect(400);
    });
  });

  describe('PUT /api/auth/password', () => {
    it('changes the password when the current one is correct', async () => {
      const session = await login(app, fixtures.students[2].email, TEST_PASSWORD);
      await session
        .put('/api/auth/password')
        .send({ currentPassword: TEST_PASSWORD, password: 'ChangedPass9' })
        .expect(200);

      await api
        .post('/api/auth/login')
        .send({ email: fixtures.students[2].email, password: 'ChangedPass9' })
        .expect(200);
    });

    it('rejects the change when the current password is wrong', async () => {
      const session = await login(app, fixtures.students[3].email, TEST_PASSWORD);
      const response = await session
        .put('/api/auth/password')
        .send({ currentPassword: 'NotMyPassword1', password: 'ChangedPass9' })
        .expect(400);

      expect(response.body.error.message).toMatch(/current password is incorrect/i);
    });
  });

  describe('GET /api/health', () => {
    it('reports a healthy database connection', async () => {
      const response = await api.get('/api/health').expect(200);
      expect(response.body.data.status).toBe('ok');
      expect(response.body.data.database).toBe('connected');
    });
  });
});
