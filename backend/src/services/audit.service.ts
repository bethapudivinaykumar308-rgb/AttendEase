import type { Request } from 'express';
import { prisma } from '../config/prisma.js';

export interface AuditInput {
  userId?: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  details?: unknown;
  req?: Request;
}

/**
 * Writes an audit trail entry. Audit failures must never break the request
 * that triggered them, so errors are logged and swallowed.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? input.req?.user?.id ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId != null ? String(input.entityId) : null,
        details:
          input.details === undefined
            ? null
            : typeof input.details === 'string'
              ? input.details
              : JSON.stringify(input.details),
        ipAddress: input.req?.ip ?? null,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[audit-log-error]', error);
  }
}
