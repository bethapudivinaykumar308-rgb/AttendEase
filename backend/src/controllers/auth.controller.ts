import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/response.js';
import { issueCsrfToken } from '../middleware/csrf.js';
import { recordAudit } from '../services/audit.service.js';
import {
  authenticate,
  changePassword,
  createSessionToken,
  getProfile,
  requestPasswordReset,
  resetPasswordWithToken,
} from '../services/auth.service.js';
import { badRequest } from '../utils/errors.js';

const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.SECURE_COOKIES,
  path: '/',
  maxAge: 1000 * 60 * 60 * 8,
};

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  const user = await authenticate(email, password);

  const token = createSessionToken(user);
  res.cookie(env.cookieName, token, sessionCookieOptions);
  const csrfToken = issueCsrfToken(res);

  await recordAudit({
    userId: user.id,
    action: 'LOGIN',
    entityType: 'User',
    entityId: user.id,
    req,
  });

  sendSuccess(res, { user: await getProfile(user.id), csrfToken }, 200);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  res.clearCookie(env.cookieName, { path: '/' });
  res.clearCookie(env.csrfCookieName, { path: '/' });

  await recordAudit({
    userId: req.user?.id ?? null,
    action: 'LOGOUT',
    entityType: 'User',
    entityId: req.user?.id ?? null,
    req,
  });

  sendSuccess(res, { message: 'Signed out successfully' });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const profile = await getProfile(req.user!.id);
  const csrfToken = issueCsrfToken(res);
  sendSuccess(res, { user: profile, csrfToken });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as { email: string };
  const token = await requestPasswordReset(email);

  await recordAudit({
    action: 'PASSWORD_RESET_REQUESTED',
    entityType: 'User',
    entityId: email,
    req,
  });

  // The response never discloses whether the address exists.
  sendSuccess(res, {
    message: 'If an account exists for that email, a password reset link has been sent.',
    ...(token && !env.isProduction ? { resetToken: token } : {}),
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = req.body as { token: string; password: string };
  await resetPasswordWithToken(token, password);

  await recordAudit({
    action: 'PASSWORD_RESET_COMPLETED',
    entityType: 'User',
    req,
  });

  sendSuccess(res, { message: 'Your password has been reset. You can sign in now.' });
});

export const changePasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, password } = req.body as {
    currentPassword: string;
    password: string;
  };
  await changePassword(req.user!.id, currentPassword, password);
  await recordAudit({
    userId: req.user!.id,
    action: 'PASSWORD_CHANGED',
    entityType: 'User',
    entityId: req.user!.id,
    req,
  });
  sendSuccess(res, { message: 'Password updated successfully' });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body as { name?: string };
  if (!name) throw badRequest('Nothing to update');

  await prisma.user.update({ where: { id: req.user!.id }, data: { name } });
  await recordAudit({
    userId: req.user!.id,
    action: 'PROFILE_UPDATED',
    entityType: 'User',
    entityId: req.user!.id,
    details: { name },
    req,
  });

  sendSuccess(res, { user: await getProfile(req.user!.id) });
});
