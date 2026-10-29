import { Router } from 'express';
import {
  changePasswordHandler,
  forgotPassword,
  login,
  logout,
  me,
  resetPassword,
  updateProfile,
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '../validators/auth.validator.js';

export const authRouter = Router();

// Credential endpoints get the stricter brute-force limiter.
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), login);
authRouter.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  forgotPassword,
);
authRouter.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  resetPassword,
);
authRouter.get('/me', requireAuth, me);
authRouter.post('/logout', requireAuth, logout);
authRouter.put('/password', requireAuth, validate({ body: changePasswordSchema }), changePasswordHandler);
authRouter.put('/profile', requireAuth, validate({ body: updateProfileSchema }), updateProfile);
