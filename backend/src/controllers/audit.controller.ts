import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendPaginated } from '../utils/response.js';
import { csvResponse, toCsv } from '../utils/csv.js';

export const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, search, action, entityType, userId, startDate, endDate } =
    req.query as unknown as {
      page: number;
      pageSize: number;
      search?: string;
      action?: string;
      entityType?: string;
      userId?: number;
      startDate?: Date;
      endDate?: Date;
    };

  const where = {
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(userId ? { userId } : {}),
    ...(search
      ? {
          OR: [
            { action: { contains: search } },
            { entityType: { contains: search } },
            { user: { name: { contains: search } } },
          ],
        }
      : {}),
    ...(startDate || endDate
      ? {
          createdAt: {
            ...(startDate ? { gte: startDate } : {}),
            ...(endDate ? { lte: endDate } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  sendPaginated(res, items, total, page, pageSize);
});

export const exportAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const { action, entityType } = req.query as unknown as {
    action?: string;
    entityType?: string;
  };

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
    include: { user: { select: { name: true, role: true } } },
  });

  const csv = toCsv(
    ['Timestamp', 'User', 'Role', 'Action', 'Entity Type', 'Entity ID', 'Details', 'IP Address'],
    logs.map((log) => [
      log.createdAt.toISOString(),
      log.user?.name ?? 'System',
      log.user?.role ?? '',
      log.action,
      log.entityType,
      log.entityId ?? '',
      log.details ?? '',
      log.ipAddress ?? '',
    ]),
  );

  csvResponse(res, 'audit-logs.csv', csv);
});
