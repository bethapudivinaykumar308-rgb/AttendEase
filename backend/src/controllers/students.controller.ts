import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendPaginated, sendSuccess } from '../utils/response.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { recordAudit } from '../services/audit.service.js';
import { hashPassword } from '../services/auth.service.js';
import { csvResponse, toCsv } from '../utils/csv.js';
import { resolveCallerScope, taughtEnrollmentFilter } from '../utils/scope.js';
import {
  getStudentMonthlySummary,
  getStudentOverallSummary,
  getStudentSubjectSummaries,
} from '../services/attendance.service.js';

/** Password handed to imported students that did not carry one in the file. */
const DEFAULT_IMPORT_PASSWORD = 'Attend@123';

const studentInclude = {
  user: { select: { id: true, name: true, email: true, isActive: true, createdAt: true } },
  department: { select: { id: true, departmentName: true, departmentCode: true } },
  semester: {
    select: {
      id: true,
      semesterNumber: true,
      academicYear: { select: { id: true, yearName: true } },
    },
  },
} as const;

export const listStudents = asyncHandler(async (req: Request, res: Response) => {
  const {
    page,
    pageSize,
    search,
    departmentId,
    semesterId,
    academicYearId,
    section,
    isActive,
  } = req.query as unknown as {
    page: number;
    pageSize: number;
    search?: string;
    departmentId?: number;
    semesterId?: number;
    academicYearId?: number;
    section?: string;
    isActive?: boolean;
  };

  const where = {
    ...(departmentId ? { departmentId } : {}),
    ...(semesterId ? { semesterId } : {}),
    ...(section ? { section } : {}),
    // The active flag lives on the linked user account, not on the student row.
    ...(typeof isActive === 'boolean' ? { user: { isActive } } : {}),
    ...(academicYearId ? { semester: { academicYearId } } : {}),
    ...(search
      ? {
          OR: [
            { user: { name: { contains: search } } },
            { user: { email: { contains: search } } },
            { rollNumber: { contains: search } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.student.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { rollNumber: 'asc' },
      include: studentInclude,
    }),
    prisma.student.count({ where }),
  ]);

  sendPaginated(res, items, total, page, pageSize);
});

export const createStudent = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, rollNumber, departmentId, semesterId, section, admissionYear } =
    req.body as {
      name: string;
      email: string;
      password: string;
      rollNumber: string;
      departmentId: number;
      semesterId: number;
      section: string;
      admissionYear: number;
    };

  const existingUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existingUser) throw conflict('An account with this email already exists');

  const existingRoll = await prisma.student.findUnique({ where: { rollNumber } });
  if (existingRoll) throw conflict('A student with this roll number already exists');

  const passwordHash = await hashPassword(password);

  const student = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, email: email.toLowerCase(), passwordHash, role: 'STUDENT' },
    });
    return tx.student.create({
      data: { userId: user.id, rollNumber, departmentId, semesterId, section, admissionYear },
      include: studentInclude,
    });
  });

  await recordAudit({
    userId: req.user!.id,
    action: 'CREATE',
    entityType: 'Student',
    entityId: student.id,
    details: { rollNumber, email },
    req,
  });

  sendSuccess(res, student, 201);
});

export const getStudent = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  const scope = await resolveCallerScope(req);
  if (scope.role === 'STUDENT' && scope.studentId !== id) {
    throw forbidden('You can only view your own student record');
  }

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      ...studentInclude,
      enrollments: {
        include: {
          subject: {
            select: {
              id: true,
              subjectCode: true,
              subjectName: true,
              credits: true,
              department: { select: { departmentName: true } },
            },
          },
          academicYear: { select: { id: true, yearName: true } },
          section: { select: { id: true, section: true } },
        },
      },
    },
  });
  if (!student) throw notFound('Student not found');

  if (scope.role === 'FACULTY') {
    const shared = await prisma.enrollment.findFirst({
      where: { studentId: id, ...taughtEnrollmentFilter(scope) },
      select: { id: true },
    });
    if (!shared) {
      throw forbidden('You can only view students enrolled in the classes you teach');
    }
  }

  const summary = await getStudentOverallSummary(id);
  const subjects = await getStudentSubjectSummaries(id);

  sendSuccess(res, { ...student, summary, subjectSummaries: subjects });
});

export const updateStudent = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = await prisma.student.findUnique({ where: { id }, include: studentInclude });
  if (!existing) throw notFound('Student not found');

  const { name, email, isActive, ...studentFields } = req.body as {
    name?: string;
    email?: string;
    isActive?: boolean;
    rollNumber?: string;
    departmentId?: number;
    semesterId?: number;
    section?: string;
    admissionYear?: number;
  };

  const student = await prisma.$transaction(async (tx) => {
    if (name || email || typeof isActive === 'boolean') {
      await tx.user.update({
        where: { id: existing.user.id },
        data: {
          ...(name ? { name } : {}),
          ...(email ? { email: email.toLowerCase() } : {}),
          ...(typeof isActive === 'boolean' ? { isActive } : {}),
        },
      });
    }
    return tx.student.update({ where: { id }, data: studentFields, include: studentInclude });
  });

  await recordAudit({
    userId: req.user!.id,
    action: 'UPDATE',
    entityType: 'Student',
    entityId: id,
    details: { before: existing, after: student },
    req,
  });

  sendSuccess(res, student);
});

/**
 * Students are never hard-deleted once they carry attendance history, so the
 * account is deactivated instead.
 */
export const deactivateStudent = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) throw notFound('Student not found');

  await prisma.$transaction([
    prisma.user.update({ where: { id: student.userId }, data: { isActive: false } }),
    prisma.student.update({ where: { id }, data: { user: { update: { isActive: false } } } }),
  ]);

  await recordAudit({
    userId: req.user!.id,
    action: 'DEACTIVATE',
    entityType: 'Student',
    entityId: id,
    req,
  });

  sendSuccess(res, { message: 'Student deactivated' });
});

export const reactivateStudent = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) throw notFound('Student not found');

  await prisma.user.update({ where: { id: student.userId }, data: { isActive: true } });
  await recordAudit({
    userId: req.user!.id,
    action: 'REACTIVATE',
    entityType: 'Student',
    entityId: id,
    req,
  });

  sendSuccess(res, { message: 'Student reactivated' });
});

export const resetStudentPassword = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) throw notFound('Student not found');

  const { password } = req.body as { password: string };
  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: student.userId }, data: { passwordHash } });

  await recordAudit({
    userId: req.user!.id,
    action: 'PASSWORD_RESET',
    entityType: 'Student',
    entityId: id,
    req,
  });

  sendSuccess(res, { message: 'Password reset successfully' });
});

export const exportStudents = asyncHandler(async (req: Request, res: Response) => {
  const students = await prisma.student.findMany({
    orderBy: { rollNumber: 'asc' },
    include: studentInclude,
  });

  const csv = toCsv(
    [
      'Roll Number',
      'Name',
      'Email',
      'Department',
      'Department Code',
      'Semester',
      'Academic Year',
      'Section',
      'Admission Year',
      'Status',
    ],
    students.map((student) => [
      student.rollNumber,
      student.user.name,
      student.user.email,
      student.department.departmentName,
      student.department.departmentCode,
      student.semester.semesterNumber,
      student.semester.academicYear.yearName,
      student.section,
      student.admissionYear,
      student.user.isActive ? 'Active' : 'Inactive',
    ]),
  );

  csvResponse(res, 'students.csv', csv);
});

export const importStudents = asyncHandler(async (req: Request, res: Response) => {
  const { rows } = req.body as { rows: unknown };
  if (!Array.isArray(rows) || rows.length === 0) {
    throw badRequest('No rows were provided for import');
  }

  const results = {
    created: 0,
    skipped: 0,
    errors: [] as string[],
    defaultPasswordApplied: 0,
  };

  for (const rawRow of rows as Record<string, string>[]) {
    try {
      const name = String(rawRow.name ?? '').trim();
      const email = String(rawRow.email ?? '').trim().toLowerCase();
      const rollNumber = String(rawRow.rollNumber ?? '').trim();
      const departmentCode = String(rawRow.departmentCode ?? '').trim().toUpperCase();
      const semesterNumber = Number(rawRow.semesterNumber);
      const section = String(rawRow.section ?? '').trim().toUpperCase();
      const admissionYear = Number(rawRow.admissionYear);
      const suppliedPassword = String(rawRow.password ?? '').trim();
      const password = suppliedPassword || DEFAULT_IMPORT_PASSWORD;

      if (!name || !email || !rollNumber || !departmentCode || !section) {
        results.errors.push(`Row skipped: missing required values for "${name || email || 'unnamed'}"`);
        continue;
      }

      const department = await prisma.department.findUnique({ where: { departmentCode } });
      if (!department) {
        results.errors.push(`Row "${rollNumber}": department code ${departmentCode} was not found`);
        continue;
      }

      const semester = await prisma.semester.findFirst({
        where: { semesterNumber, academicYear: { isActive: true } },
        orderBy: { academicYear: { startDate: 'desc' } },
      });
      if (!semester) {
        results.errors.push(`Row "${rollNumber}": no active semester ${semesterNumber} was found`);
        continue;
      }

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        results.errors.push(`Row "${rollNumber}": ${email} already exists`);
        continue;
      }

      const existingRoll = await prisma.student.findUnique({ where: { rollNumber } });
      if (existingRoll) {
        results.errors.push(`Row "${rollNumber}": roll number already exists`);
        continue;
      }

      const passwordHash = await hashPassword(password);
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { name, email, passwordHash, role: 'STUDENT' },
        });
        await tx.student.create({
          data: {
            userId: user.id,
            rollNumber,
            departmentId: department.id,
            semesterId: semester.id,
            section,
            admissionYear: Number.isFinite(admissionYear) ? admissionYear : new Date().getFullYear(),
          },
        });
      });
      results.created += 1;
      if (!suppliedPassword) results.defaultPasswordApplied += 1;
    } catch (error) {
      results.errors.push(
        `Row failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  await recordAudit({
    userId: req.user!.id,
    action: 'IMPORT',
    entityType: 'Student',
    details: { created: results.created, skipped: results.skipped },
    req,
  });

  sendSuccess(res, {
    ...results,
    defaultPassword: DEFAULT_IMPORT_PASSWORD,
  });
});

export const getStudentAttendance = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) throw notFound('Student not found');

  const scope = await resolveCallerScope(req);
  if (scope.role === 'STUDENT' && scope.studentId !== id) {
    throw forbidden('You can only view your own attendance');
  }
  if (scope.role === 'FACULTY') {
    const shared = await prisma.enrollment.findFirst({
      where: { studentId: id, ...taughtEnrollmentFilter(scope) },
      select: { id: true },
    });
    if (!shared) {
      throw forbidden('You can only view students enrolled in the classes you teach');
    }
  }

  const [subjects, overall, monthly] = await Promise.all([
    getStudentSubjectSummaries(id),
    getStudentOverallSummary(id),
    getStudentMonthlySummary(id),
  ]);

  sendSuccess(res, { overall, subjects, monthly });
});
