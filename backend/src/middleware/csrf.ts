import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { forbidden } from '../utils/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Endpoints that are unauthenticated and therefore cannot be CSRF'd. */
const EXEMPT_PATHS = [
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/health',
];

export function issueCsrfToken(res: Response): string {
  const token = crypto.randomBytes(24).toString('hex');
  res.cookie(env.csrfCookieName, token, {
    httpOnly: false,
    sameSite: 'lax',
    secure: env.SECURE_COOKIES,
    maxAge: 1000 * 60 * 60 * 8,
    path: '/',
  });
  return token;
}

/**
 * Double-submit cookie CSRF protection. The session cookie is http-only, so
 * a cross-site form post cannot read the token that must accompany every
 * state-changing request.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();
  if (EXEMPT_PATHS.some((path) => req.originalUrl.startsWith(path))) return next();

  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[env.csrfCookieName];
  const headerToken = req.headers[env.csrfHeaderName];

  if (!cookieToken || typeof headerToken !== 'string') {
    return next(forbidden('Missing CSRF token. Please refresh the page and try again.'));
  }

  const a = Buffer.from(String(cookieToken));
  const b = Buffer.from(headerToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return next(forbidden('Invalid CSRF token. Please refresh the page and try again.'));
  }

  next();
}
