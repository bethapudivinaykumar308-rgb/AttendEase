import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendPaginated, sendSuccess } from '../utils/response.js';
import { conflict, notFound } from '../utils/errors.js';
import { recordAudit } from '../services/audit.service.js';
import { hashPassword } from '../services/auth.service.js';
import {
  generateTemporaryPassword,
  generateUniqueEmail,
} from '../services/credentials.service.js';
import { csvResponse, toCsv } from '../utils/csv.js';

const facultyInclude = {
  user: { select: { id: true, name: true, email: true, isActive: true, createdAt: true } },
  department: { select: { id: true, departmentName: true, departmentCode: true } },
} as const;

export const listFaculty = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, search, departmentId, isActive } = req.query as unknown as {
    page: number;
    pageSize: number;
    search?: string;
    departmentId?: number;
    isActive?: boolean;
  };

  const where = {
    ...(departmentId ? { departmentId } : {}),
    // The active flag lives on the linked user account, not on the faculty row.
    ...(typeof isActive === 'boolean' ? { user: { isActive } } : {}),
    ...(search
      ? {
          OR: [
            { user: { name: { contains: search } } },
            { user: { email: { contains: search } } },
            { facultyId: { contains: search } },
            { designation: { contains: search } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.faculty.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { facultyId: 'asc' },
      include: {
        ...facultyInclude,
        _count: { select: { assignments: true } },
      },
    }),
    prisma.faculty.count({ where }),
  ]);

  sendPaginated(res, items, total, page, pageSize);
});

export const createFaculty = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, facultyId, departmentId, designation } = req.body as {
    name: string;
    email?: string;
    password?: string;
    facultyId: string;
    departmentId: number;
    designation: string;
  };

  const finalEmail = email ?? (await generateUniqueEmail(name, 'FACULTY'));

  const existingUser = await prisma.user.findUnique({ where: { email: finalEmail.toLowerCase() } });
  if (existingUser) throw conflict('An account with this email already exists');

  const existingFaculty = await prisma.faculty.findUnique({ where: { facultyId } });
  if (existingFaculty) throw conflict('A faculty member with this ID already exists');

  const temporaryPassword = password ?? generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const faculty = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, email: finalEmail.toLowerCase(), passwordHash, role: 'FACULTY' },
    });
    return tx.faculty.create({
      data: { userId: user.id, facultyId, departmentId, designation },
      include: facultyInclude,
    });
  });

  await recordAudit({
    userId: req.user!.id,
    action: 'CREATE',
    entityType: 'Faculty',
    entityId: faculty.id,
    details: { facultyId, email: finalEmail, credentialsGenerated: !password },
    req,
  });

  // The password is shown to the administrator once and never stored in clear.
  sendSuccess(
    res,
    { ...faculty, credentials: { email: finalEmail, temporaryPassword } },
    201,
  );
});

export const getFaculty = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const faculty = await prisma.faculty.findUnique({
    where: { id },
    include: {
      ...facultyInclude,
      assignments: {
        include: {
          subject: { select: { id: true, subjectCode: true, subjectName: true, credits: true } },
          section: { select: { id: true, section: true } },
          academicYear: { select: { id: true, yearName: true } },
        },
      },
    },
  });
  if (!faculty) throw notFound('Faculty member not found');

  const sessionCount = await prisma.attendanceSession.count({ where: { facultyId: id } });
  sendSuccess(res, { ...faculty, sessionCount });
});

export const updateFaculty = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = await prisma.faculty.findUnique({ where: { id } });
  if (!existing) throw notFound('Faculty member not found');

  const { name, email, isActive, ...facultyFields } = req.body as {
    name?: string;
    email?: string;
    isActive?: boolean;
    facultyId?: string;
    departmentId?: number;
    designation?: string;
  };

  const faculty = await prisma.$transaction(async (tx) => {
    if (name || email || typeof isActive === 'boolean') {
      await tx.user.update({
        where: { id: existing.userId },
        data: {
          ...(name ? { name } : {}),
          ...(email ? { email: email.toLowerCase() } : {}),
          ...(typeof isActive === 'boolean' ? { isActive } : {}),
        },
      });
    }
    return tx.faculty.update({ where: { id }, data: facultyFields, include: facultyInclude });
  });

  await recordAudit({
    userId: req.user!.id,
    action: 'UPDATE',
    entityType: 'Faculty',
    entityId: id,
    details: { before: existing, after: faculty },
    req,
  });

  sendSuccess(res, faculty);
});

export const deactivateFaculty = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const faculty = await prisma.faculty.findUnique({ where: { id } });
  if (!faculty) throw notFound('Faculty member not found');

  await prisma.user.update({ where: { id: faculty.userId }, data: { isActive: false } });
  await recordAudit({
    userId: req.user!.id,
    action: 'DEACTIVATE',
    entityType: 'Faculty',
    entityId: id,
    req,
  });

  sendSuccess(res, { message: 'Faculty member deactivated' });
});

export const reactivateFaculty = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const faculty = await prisma.faculty.findUnique({ where: { id } });
  if (!faculty) throw notFound('Faculty member not found');

  await prisma.user.update({ where: { id: faculty.userId }, data: { isActive: true } });
  await recordAudit({
    userId: req.user!.id,
    action: 'REACTIVATE',
    entityType: 'Faculty',
    entityId: id,
    req,
  });

  sendSuccess(res, { message: 'Faculty member reactivated' });
});

export const resetFacultyPassword = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const faculty = await prisma.faculty.findUnique({ where: { id } });
  if (!faculty) throw notFound('Faculty member not found');

  const { password } = req.body as { password?: string };
  const newPassword = password ?? generateTemporaryPassword();
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: faculty.userId }, data: { passwordHash } });

  await recordAudit({
    userId: req.user!.id,
    action: 'PASSWORD_RESET',
    entityType: 'Faculty',
    entityId: id,
    details: { generated: !password },
    req,
  });

  sendSuccess(res, { message: 'Password reset successfully', password: newPassword });
});

export const exportFaculty = asyncHandler(async (req: Request, res: Response) => {
  const faculty = await prisma.faculty.findMany({
    orderBy: { facultyId: 'asc' },
    include: { ...facultyInclude, _count: { select: { assignments: true } } },
  });

  const csv = toCsv(
    ['Faculty ID', 'Name', 'Email', 'Department', 'Designation', 'Assigned Subjects', 'Status'],
    faculty.map((member) => [
      member.facultyId,
      member.user.name,
      member.user.email,
      member.department.departmentName,
      member.designation,
      member._count?.assignments ?? 0,
      member.user.isActive ? 'Active' : 'Inactive',
    ]),
  );

  csvResponse(res, 'faculty.csv', csv);
});
