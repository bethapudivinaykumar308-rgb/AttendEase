import request from 'supertest';
import type { Express } from 'express';

export interface LoggedInUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface ApiSession {
  agent: ReturnType<typeof request.agent>;
  csrfToken: string;
  user: LoggedInUser;
  get(url: string): request.Test;
  post(url: string): request.Test;
  put(url: string): request.Test;
  del(url: string): request.Test;
  /** Performs a request without the CSRF header, to prove the guard works. */
  postWithoutCsrf(url: string): request.Test;
}

export async function login(
  app: Express,
  email: string,
  password: string,
): Promise<ApiSession> {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email, password }).expect(200);

  const csrfToken = response.body.data.csrfToken as string;
  const user = response.body.data.user as LoggedInUser;

  return {
    agent,
    csrfToken,
    user,
    get: (url) => agent.get(url),
    post: (url) => agent.post(url).set('X-CSRF-Token', csrfToken),
    put: (url) => agent.put(url).set('X-CSRF-Token', csrfToken),
    del: (url) => agent.delete(url).set('X-CSRF-Token', csrfToken),
    postWithoutCsrf: (url) => agent.post(url),
  };
}

/** Reads the CSRF token from the double-submit cookie. */
export function csrfCookieFrom(response: { headers: Record<string, unknown> }): string | undefined {
  const raw = response.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  for (const cookie of cookies) {
    const match = /attendease_csrf=([^;]+)/.exec(cookie);
    if (match) return match[1];
  }
  return undefined;
}
