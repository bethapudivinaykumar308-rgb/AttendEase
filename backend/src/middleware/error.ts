import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, `Route ${req.method} ${req.originalUrl} was not found`, 'ROUTE_NOT_FOUND'));
}

/**
 * Centralised error handler. Operational errors expose their message; unknown
 * errors are logged in full but reported to the client as a generic 500 so
 * stack traces and internal details never leak.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The submitted data is invalid',
        details: err.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | string | undefined) ?? [];
      const fields = Array.isArray(target) ? target.join(', ') : String(target);
      res.status(409).json({
        success: false,
        error: {
          code: 'UNIQUE_CONSTRAINT',
          message: fields
            ? `A record with the same ${fields} already exists`
            : 'A record with the same unique values already exists',
          details: fields ? { fields } : undefined,
        },
      });
      return;
    }
    if (err.code === 'P2003') {
      res.status(409).json({
        success: false,
        error: {
          code: 'FOREIGN_KEY_CONSTRAINT',
          message:
            'This operation would break a relationship with existing records. Deactivate the record instead of deleting it.',
        },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'The requested record was not found' },
      });
      return;
    }
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // eslint-disable-next-line no-console
  console.error('[unhandled-error]', {
    method: req.method,
    path: req.originalUrl,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: env.isProduction
        ? 'Something went wrong on our end. Please try again.'
        : `Internal error: ${err instanceof Error ? err.message : String(err)}`,
    },
  });
}
