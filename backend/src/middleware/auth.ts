import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import { asyncHandler } from '../utils/async-handler.js';
import type { AuthUser } from '../types/express.js';

export interface SessionPayload {
  sub: number;
  role: Role;
  name: string;
  email: string;
}

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as unknown as SessionPayload;
  } catch {
    return null;
  }
}

function extractToken(req: Request): string | null {
  const fromCookie = (req.cookies as Record<string, string> | undefined)?.[env.cookieName];
  if (fromCookie) return fromCookie;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/**
 * Verifies the session cookie/JWT and re-checks that the account is still
 * active in the database, so deactivating a user takes effect immediately
 * instead of waiting for the token to expire.
 */
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) throw unauthorized('You must be signed in to access this resource');

  const payload = verifySessionToken(token);
  if (!payload) throw unauthorized('Your session has expired, please sign in again');

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  if (!user) throw unauthorized('Your account no longer exists');
  if (!user.isActive) throw forbidden('Your account has been deactivated. Contact the administrator.');

  req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  next();
});

/** Attaches the user when a valid token is present, but never rejects. */
export const optionalAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) return next();
  const payload = verifySessionToken(token);
  if (!payload) return next();
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (user?.isActive) {
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  }
  next();
});

/**
 * Requires an authenticated session whose role is in the allowed list.
 * The session check runs first, so `req.user` is always populated.
 */
export function requireRole(...roles: Role[]) {
  const checkRole: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden(`This action requires one of the following roles: ${roles.join(', ')}`));
    }
    next();
  };

  return [requireAuth, checkRole];
}
