import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendPaginated, sendSuccess } from '../utils/response.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { recordAudit } from '../services/audit.service.js';
import { assertSubjectAccess, resolveCallerScope, taughtEnrollmentFilter } from '../utils/scope.js';

const assignmentInclude = {
  faculty: {
    select: {
      id: true,
      facultyId: true,
      user: { select: { id: true, name: true, email: true } },
    },
  },
  subject: {
    select: { id: true, subjectCode: true, subjectName: true, credits: true },
  },
  section: { select: { id: true, section: true } },
  academicYear: { select: { id: true, yearName: true } },
  _count: { select: { sessions: true } },
} as const;

// ---------------------------------------------------------------------------
// Faculty-subject assignments
// ---------------------------------------------------------------------------

export const listAssignments = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, search, facultyId, subjectId, academicYearId, sectionId } =
    req.query as unknown as {
      page: number;
      pageSize: number;
      search?: string;
      facultyId?: number;
      subjectId?: number;
      academicYearId?: number;
      sectionId?: number;
    };

  const scope = await resolveCallerScope(req);

  // Faculty only ever see the assignments they personally teach, and students
  // have no business reading the teaching assignments at all.
  const where: Prisma.FacultySubjectWhereInput = {
    ...(scope.role === 'FACULTY'
      ? scope.facultyId
        ? { facultyId: scope.facultyId }
        : { id: -1 }
      : {}),
    ...(scope.role === 'STUDENT' ? { id: -1 } : {}),
    ...(scope.role === 'ADMIN' && facultyId ? { facultyId } : {}),
    ...(scope.role === 'ADMIN' && subjectId ? { subjectId } : {}),
    ...(academicYearId ? { academicYearId } : {}),
    ...(sectionId ? { sectionId } : {}),
    ...(search
      ? {
          OR: [
            { faculty: { user: { name: { contains: search } } } },
            { subject: { subjectName: { contains: search } } },
            { subject: { subjectCode: { contains: search } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.facultySubject.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: assignmentInclude,
    }),
    prisma.facultySubject.count({ where }),
  ]);

  sendPaginated(res, items, total, page, pageSize);
});

export const createAssignment = asyncHandler(async (req: Request, res: Response) => {
  const { facultyId, subjectId, sectionId, academicYearId } = req.body as {
    facultyId: number;
    subjectId: number;
    sectionId: number;
    academicYearId: number;
  };

  const [faculty, subject, section] = await Promise.all([
    prisma.faculty.findUnique({ where: { id: facultyId } }),
    prisma.subject.findUnique({ where: { id: subjectId } }),
    prisma.section.findUnique({ where: { id: sectionId } }),
  ]);

  if (!faculty) throw notFound('Faculty member not found');
  if (!subject) throw notFound('Subject not found');
  if (!section) throw notFound('Section not found');
  if (section.subjectId !== subjectId) {
    throw badRequest('The selected section does not belong to the selected subject');
  }
  if (section.academicYearId !== academicYearId) {
    throw badRequest('The selected section belongs to a different academic year');
  }

  const duplicate = await prisma.facultySubject.findUnique({
    where: {
      unique_faculty_subject_assignment: { facultyId, subjectId, sectionId, academicYearId },
    },
  });
  if (duplicate) {
    throw conflict('This faculty member is already assigned to this subject and section');
  }

  const assignment = await prisma.facultySubject.create({
    data: { facultyId, subjectId, sectionId, academicYearId },
    include: assignmentInclude,
  });

  await recordAudit({
    userId: req.user!.id,
    action: 'CREATE',
    entityType: 'FacultySubject',
    entityId: assignment.id,
    details: { facultyId, subjectId, sectionId, academicYearId },
    req,
  });

  sendSuccess(res, assignment, 201);
});

export const updateAssignment = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = await prisma.facultySubject.findUnique({ where: { id } });
  if (!existing) throw notFound('Assignment not found');

  const assignment = await prisma.facultySubject.update({
    where: { id },
    data: req.body,
    include: assignmentInclude,
  });

  await recordAudit({
    userId: req.user!.id,
    action: 'UPDATE',
    entityType: 'FacultySubject',
    entityId: id,
    details: { before: existing, after: assignment },
    req,
  });

  sendSuccess(res, assignment);
});

export const deleteAssignment = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = await prisma.facultySubject.findUnique({
    where: { id },
    include: { _count: { select: { sessions: true } } },
  });
  if (!existing) throw notFound('Assignment not found');

  if (existing._count.sessions > 0) {
    throw badRequest(
      'This assignment already has attendance sessions recorded against it and cannot be removed.',
    );
  }

  await prisma.facultySubject.delete({ where: { id } });
  await recordAudit({
    userId: req.user!.id,
    action: 'DELETE',
    entityType: 'FacultySubject',
    entityId: id,
    details: existing,
    req,
  });

  sendSuccess(res, { message: 'Assignment removed' });
});

// ---------------------------------------------------------------------------
// Student enrollments
// ---------------------------------------------------------------------------

export const listEnrollments = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, search, subjectId, sectionId, academicYearId, studentId } =
    req.query as unknown as {
      page: number;
      pageSize: number;
      search?: string;
      subjectId?: number;
      sectionId?: number;
      academicYearId?: number;
      studentId?: number;
    };

  const scope = await resolveCallerScope(req);

  // The scope filter and the free-text search both use OR, so they are
  // combined through an explicit AND list.
  const andFilters: Prisma.EnrollmentWhereInput[] = [];

  if (scope.role === 'FACULTY') {
    andFilters.push(
      scope.taughtOfferings.length > 0 ? taughtEnrollmentFilter(scope) : { id: -1 },
    );
  }

  if (search) {
    andFilters.push({
      OR: [
        { student: { user: { name: { contains: search } } } },
        { student: { rollNumber: { contains: search } } },
      ],
    });
  }

  const where: Prisma.EnrollmentWhereInput = {
    ...(scope.role === 'ADMIN' && subjectId ? { subjectId } : {}),
    ...(sectionId ? { sectionId } : {}),
    ...(academicYearId ? { academicYearId } : {}),
    // A student is pinned to their own enrollments; the requested studentId
    // must never widen that scope.
    ...(scope.role === 'STUDENT'
      ? { studentId: scope.studentId ?? -1 }
      : studentId
        ? { studentId }
        : {}),
    ...(andFilters.length > 0 ? { AND: andFilters } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.enrollment.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        student: {
          select: {
            id: true,
            rollNumber: true,
            section: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        subject: { select: { id: true, subjectCode: true, subjectName: true } },
        section: { select: { id: true, section: true } },
        academicYear: { select: { id: true, yearName: true } },
      },
    }),
    prisma.enrollment.count({ where }),
  ]);

  sendPaginated(res, items, total, page, pageSize);
});

export const createEnrollments = asyncHandler(async (req: Request, res: Response) => {
  const { studentIds, subjectId, academicYearId, sectionId } = req.body as {
    studentIds: number[];
    subjectId: number;
    academicYearId: number;
    sectionId?: number;
  };

  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!subject) throw notFound('Subject not found');

  if (sectionId) {
    const section = await prisma.section.findUnique({ where: { id: sectionId } });
    if (!section) throw notFound('Section not found');
    if (section.subjectId !== subjectId) {
      throw badRequest('The selected section does not belong to the selected subject');
    }
  }

  const existing = await prisma.enrollment.findMany({
    where: { studentId: { in: studentIds }, subjectId, academicYearId },
    select: { studentId: true },
  });
  const alreadyEnrolled = new Set(existing.map((e) => e.studentId));

  const toCreate = studentIds.filter((studentId) => !alreadyEnrolled.has(studentId));

  let created = 0;
  if (toCreate.length > 0) {
    await prisma.enrollment.createMany({
      data: toCreate.map((studentId) => ({
        studentId,
        subjectId,
        academicYearId,
        sectionId: sectionId ?? null,
      })),
    });
    created = toCreate.length;
  }

  await recordAudit({
    userId: req.user!.id,
    action: 'CREATE',
    entityType: 'Enrollment',
    entityId: subjectId,
    details: { created, skipped: studentIds.length - created },
    req,
  });

  sendSuccess(
    res,
    {
      created,
      skipped: studentIds.length - created,
      message: `${created} student(s) enrolled${
        studentIds.length - created > 0 ? `, ${studentIds.length - created} already enrolled` : ''
      }`,
    },
    201,
  );
});

export const deleteEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const enrollment = await prisma.enrollment.findUnique({ where: { id } });
  if (!enrollment) throw notFound('Enrollment not found');

  const records = await prisma.attendanceRecord.count({
    where: { studentId: enrollment.studentId, session: { subjectId: enrollment.subjectId } },
  });

  if (records > 0) {
    throw badRequest(
      'This student already has attendance records for the subject, so the enrollment cannot be removed.',
    );
  }

  await prisma.enrollment.delete({ where: { id } });
  await recordAudit({
    userId: req.user!.id,
    action: 'DELETE',
    entityType: 'Enrollment',
    entityId: id,
    details: enrollment,
    req,
  });

  sendSuccess(res, { message: 'Enrollment removed' });
});

/** Roster for a subject/section - used by the attendance marking screen. */
export const getSubjectRoster = asyncHandler(async (req: Request, res: Response) => {
  const subjectId = Number(req.params.subjectId);
  const sectionId = req.query.sectionId ? Number(req.query.sectionId) : undefined;

  const scope = await resolveCallerScope(req);
  assertSubjectAccess(scope, subjectId);

  const enrollmentWhere: Prisma.EnrollmentWhereInput = {
    subjectId,
    ...(sectionId ? { sectionId } : {}),
  };

  if (scope.role === 'FACULTY') {
    // A faculty member only sees the sections of the subject they teach.
    const ownSectionIds = scope.taughtOfferings
      .filter((offering) => offering.subjectId === subjectId)
      .map((offering) => offering.sectionId);
    enrollmentWhere.AND = [
      {
        OR: [{ sectionId: null }, { sectionId: { in: ownSectionIds } }],
      },
    ];
  }

  const enrollments = await prisma.enrollment.findMany({
    where: enrollmentWhere,
    include: {
      student: {
        select: {
          id: true,
          rollNumber: true,
          section: true,
          user: { select: { id: true, name: true, email: true, isActive: true } },
        },
      },
      section: { select: { id: true, section: true } },
    },
    orderBy: { student: { rollNumber: 'asc' } },
  });

  sendSuccess(
    res,
    enrollments.map((enrollment) => ({
      studentId: enrollment.student.id,
      rollNumber: enrollment.student.rollNumber,
      name: enrollment.student.user.name,
      email: enrollment.student.user.email,
      section: enrollment.student.section,
      isActive: enrollment.student.user.isActive,
      enrollmentId: enrollment.id,
    })),
  );
});
