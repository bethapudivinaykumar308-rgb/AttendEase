import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendPaginated, sendSuccess } from '../utils/response.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { recordAudit } from '../services/audit.service.js';
import { csvResponse, toCsv } from '../utils/csv.js';
import { startOfToday } from '../utils/dates.js';

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export const listDepartments = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, search } = req.query as unknown as {
    page: number;
    pageSize: number;
    search?: string;
  };

  const where = search
    ? {
        OR: [
          { departmentName: { contains: search } },
          { departmentCode: { contains: search } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.department.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { departmentName: 'asc' },
      include: {
        _count: { select: { students: true, faculty: true, subjects: true } },
      },
    }),
    prisma.department.count({ where }),
  ]);

  sendPaginated(res, items, total, page, pageSize);
});

export const createDepartment = asyncHandler(async (req: Request, res: Response) => {
  const department = await prisma.department.create({ data: req.body });
  await recordAudit({
    userId: req.user!.id,
    action: 'CREATE',
    entityType: 'Department',
    entityId: department.id,
    details: department,
    req,
  });
  sendSuccess(res, department, 201);
});

export const getDepartment = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const department = await prisma.department.findUnique({
    where: { id },
    include: {
      _count: { select: { students: true, faculty: true, subjects: true } },
    },
  });
  if (!department) throw notFound('Department not found');
  sendSuccess(res, department);
});

export const updateDepartment = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = await prisma.department.findUnique({ where: { id } });
  if (!existing) throw notFound('Department not found');

  const department = await prisma.department.update({ where: { id }, data: req.body });
  await recordAudit({
    userId: req.user!.id,
    action: 'UPDATE',
    entityType: 'Department',
    entityId: id,
    details: { before: existing, after: department },
    req,
  });
  sendSuccess(res, department);
});

export const deleteDepartment = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const department = await prisma.department.findUnique({
    where: { id },
    include: { _count: { select: { students: true, faculty: true, subjects: true } } },
  });
  if (!department) throw notFound('Department not found');

  const linked = department._count.students + department._count.faculty + department._count.subjects;
  if (linked > 0) {
    throw badRequest(
      'This department is still linked to students, faculty or subjects. Remove those records first.',
    );
  }

  await prisma.department.delete({ where: { id } });
  await recordAudit({
    userId: req.user!.id,
    action: 'DELETE',
    entityType: 'Department',
    entityId: id,
    details: department,
    req,
  });
  sendSuccess(res, { message: 'Department deleted' });
});

// ---------------------------------------------------------------------------
// Academic years
// ---------------------------------------------------------------------------

export const listAcademicYears = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
  const [items, total] = await Promise.all([
    prisma.academicYear.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { startDate: 'desc' },
      include: { _count: { select: { semesters: true, subjects: true, sessions: true } } },
    }),
    prisma.academicYear.count(),
  ]);
  sendPaginated(res, items, total, page, pageSize);
});

export const createAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const academicYear = await prisma.academicYear.create({ data: req.body });
  await recordAudit({
    userId: req.user!.id,
    action: 'CREATE',
    entityType: 'AcademicYear',
    entityId: academicYear.id,
    details: academicYear,
    req,
  });
  sendSuccess(res, academicYear, 201);
});

export const getAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const academicYear = await prisma.academicYear.findUnique({
    where: { id },
    include: { semesters: true },
  });
  if (!academicYear) throw notFound('Academic year not found');
  sendSuccess(res, academicYear);
});

export const updateAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = await prisma.academicYear.findUnique({ where: { id } });
  if (!existing) throw notFound('Academic year not found');

  const academicYear = await prisma.academicYear.update({ where: { id }, data: req.body });
  await recordAudit({
    userId: req.user!.id,
    action: 'UPDATE',
    entityType: 'AcademicYear',
    entityId: id,
    details: { before: existing, after: academicYear },
    req,
  });
  sendSuccess(res, academicYear);
});

export const deleteAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const academicYear = await prisma.academicYear.findUnique({
    where: { id },
    include: { _count: { select: { semesters: true, subjects: true, sessions: true } } },
  });
  if (!academicYear) throw notFound('Academic year not found');

  const linked = academicYear._count.subjects + academicYear._count.sessions;
  if (linked > 0) {
    throw badRequest(
      'This academic year already has subjects or attendance history and cannot be deleted. Deactivate it instead.',
    );
  }

  await prisma.academicYear.delete({ where: { id } });
  await recordAudit({
    userId: req.user!.id,
    action: 'DELETE',
    entityType: 'AcademicYear',
    entityId: id,
    details: academicYear,
    req,
  });
  sendSuccess(res, { message: 'Academic year deleted' });
});

// ---------------------------------------------------------------------------
// Semesters
// ---------------------------------------------------------------------------

export const listSemesters = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, academicYearId } = req.query as unknown as {
    page: number;
    pageSize: number;
    academicYearId?: number;
  };
  const where = academicYearId ? { academicYearId } : {};

  const [items, total] = await Promise.all([
    prisma.semester.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ academicYear: { startDate: 'desc' } }, { semesterNumber: 'asc' }],
      include: {
        academicYear: { select: { id: true, yearName: true } },
        _count: { select: { students: true, subjects: true } },
      },
    }),
    prisma.semester.count({ where }),
  ]);
  sendPaginated(res, items, total, page, pageSize);
});

export const createSemester = asyncHandler(async (req: Request, res: Response) => {
  const semester = await prisma.semester.create({
    data: req.body,
    include: { academicYear: { select: { id: true, yearName: true } } },
  });
  await recordAudit({
    userId: req.user!.id,
    action: 'CREATE',
    entityType: 'Semester',
    entityId: semester.id,
    details: semester,
    req,
  });
  sendSuccess(res, semester, 201);
});

export const getSemester = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const semester = await prisma.semester.findUnique({
    where: { id },
    include: {
      academicYear: { select: { id: true, yearName: true } },
      _count: { select: { students: true, subjects: true } },
    },
  });
  if (!semester) throw notFound('Semester not found');
  sendSuccess(res, semester);
});

export const updateSemester = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = await prisma.semester.findUnique({ where: { id } });
  if (!existing) throw notFound('Semester not found');

  const semester = await prisma.semester.update({ where: { id }, data: req.body });
  await recordAudit({
    userId: req.user!.id,
    action: 'UPDATE',
    entityType: 'Semester',
    entityId: id,
    details: { before: existing, after: semester },
    req,
  });
  sendSuccess(res, semester);
});

export const deleteSemester = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const semester = await prisma.semester.findUnique({
    where: { id },
    include: { _count: { select: { students: true, subjects: true } } },
  });
  if (!semester) throw notFound('Semester not found');

  if (semester._count.students > 0 || semester._count.subjects > 0) {
    throw badRequest(
      'This semester is linked to students or subjects and cannot be deleted. Deactivate it instead.',
    );
  }

  await prisma.semester.delete({ where: { id } });
  await recordAudit({
    userId: req.user!.id,
    action: 'DELETE',
    entityType: 'Semester',
    entityId: id,
    details: semester,
    req,
  });
  sendSuccess(res, { message: 'Semester deleted' });
});

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

export const listSubjects = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, search, departmentId, semesterId, academicYearId, isActive } =
    req.query as unknown as {
      page: number;
      pageSize: number;
      search?: string;
      departmentId?: number;
      semesterId?: number;
      academicYearId?: number;
      isActive?: boolean;
    };

  const where = {
    ...(departmentId ? { departmentId } : {}),
    ...(semesterId ? { semesterId } : {}),
    ...(academicYearId ? { academicYearId } : {}),
    ...(typeof isActive === 'boolean' ? { isActive } : {}),
    ...(search
      ? {
          OR: [
            { subjectName: { contains: search } },
            { subjectCode: { contains: search } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.subject.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { subjectCode: 'asc' },
      include: {
        department: { select: { id: true, departmentName: true, departmentCode: true } },
        semester: {
          select: {
            id: true,
            semesterNumber: true,
            academicYear: { select: { id: true, yearName: true } },
          },
        },
        academicYear: { select: { id: true, yearName: true } },
        _count: { select: { enrollments: true, assignments: true, sessions: true } },
      },
    }),
    prisma.subject.count({ where }),
  ]);

  sendPaginated(res, items, total, page, pageSize);
});

export const createSubject = asyncHandler(async (req: Request, res: Response) => {
  const subject = await prisma.subject.create({
    data: req.body,
    include: {
      department: { select: { id: true, departmentName: true, departmentCode: true } },
      semester: { select: { id: true, semesterNumber: true } },
      academicYear: { select: { id: true, yearName: true } },
    },
  });
  await recordAudit({
    userId: req.user!.id,
    action: 'CREATE',
    entityType: 'Subject',
    entityId: subject.id,
    details: subject,
    req,
  });
  sendSuccess(res, subject, 201);
});

export const getSubject = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const subject = await prisma.subject.findUnique({
    where: { id },
    include: {
      department: true,
      semester: { include: { academicYear: true } },
      academicYear: true,
      sections: { include: { academicYear: { select: { id: true, yearName: true } } } },
      assignments: {
        include: {
          faculty: {
            select: {
              id: true,
              facultyId: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
      _count: { select: { enrollments: true, sessions: true } },
    },
  });
  if (!subject) throw notFound('Subject not found');
  sendSuccess(res, subject);
});

export const updateSubject = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = await prisma.subject.findUnique({ where: { id } });
  if (!existing) throw notFound('Subject not found');

  const subject = await prisma.subject.update({
    where: { id },
    data: req.body,
    include: {
      department: { select: { id: true, departmentName: true, departmentCode: true } },
      semester: { select: { id: true, semesterNumber: true } },
      academicYear: { select: { id: true, yearName: true } },
    },
  });
  await recordAudit({
    userId: req.user!.id,
    action: 'UPDATE',
    entityType: 'Subject',
    entityId: id,
    details: { before: existing, after: subject },
    req,
  });
  sendSuccess(res, subject);
});

export const deleteSubject = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const subject = await prisma.subject.findUnique({
    where: { id },
    include: { _count: { select: { sessions: true, enrollments: true } } },
  });
  if (!subject) throw notFound('Subject not found');

  if (subject._count.sessions > 0) {
    // Attendance history must survive, so the subject is deactivated instead.
    const deactivated = await prisma.subject.update({ where: { id }, data: { isActive: false } });
    await recordAudit({
      userId: req.user!.id,
      action: 'DEACTIVATE',
      entityType: 'Subject',
      entityId: id,
      details: { reason: 'Has attendance history' },
      req,
    });
    sendSuccess(res, {
      ...deactivated,
      message: 'This subject has attendance history, so it was deactivated instead of deleted.',
    });
    return;
  }

  await prisma.subject.delete({ where: { id } });
  await recordAudit({
    userId: req.user!.id,
    action: 'DELETE',
    entityType: 'Subject',
    entityId: id,
    details: subject,
    req,
  });
  sendSuccess(res, { message: 'Subject deleted' });
});

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export const listSections = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, subjectId, academicYearId } = req.query as unknown as {
    page: number;
    pageSize: number;
    subjectId?: number;
    academicYearId?: number;
  };
  const where = {
    ...(subjectId ? { subjectId } : {}),
    ...(academicYearId ? { academicYearId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.section.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ subject: { subjectCode: 'asc' } }, { section: 'asc' }],
      include: {
        subject: { select: { id: true, subjectCode: true, subjectName: true } },
        academicYear: { select: { id: true, yearName: true } },
        _count: { select: { enrollments: true, assignments: true, sessions: true } },
      },
    }),
    prisma.section.count({ where }),
  ]);
  sendPaginated(res, items, total, page, pageSize);
});

export const createSection = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.section.findUnique({
    where: {
      unique_section_offering: {
        subjectId: req.body.subjectId,
        section: req.body.section,
        academicYearId: req.body.academicYearId,
      },
    },
  });
  if (existing) throw conflict('This section already exists for the selected subject and year');

  const section = await prisma.section.create({
    data: req.body,
    include: {
      subject: { select: { id: true, subjectCode: true, subjectName: true } },
      academicYear: { select: { id: true, yearName: true } },
    },
  });
  await recordAudit({
    userId: req.user!.id,
    action: 'CREATE',
    entityType: 'Section',
    entityId: section.id,
    details: section,
    req,
  });
  sendSuccess(res, section, 201);
});

export const getSection = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const section = await prisma.section.findUnique({
    where: { id },
    include: {
      subject: true,
      academicYear: true,
      assignments: {
        include: {
          faculty: {
            select: {
              id: true,
              facultyId: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
      },
      _count: { select: { enrollments: true, sessions: true } },
    },
  });
  if (!section) throw notFound('Section not found');
  sendSuccess(res, section);
});

export const updateSection = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = await prisma.section.findUnique({ where: { id } });
  if (!existing) throw notFound('Section not found');

  const section = await prisma.section.update({ where: { id }, data: req.body });
  await recordAudit({
    userId: req.user!.id,
    action: 'UPDATE',
    entityType: 'Section',
    entityId: id,
    details: { before: existing, after: section },
    req,
  });
  sendSuccess(res, section);
});

export const deleteSection = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const section = await prisma.section.findUnique({
    where: { id },
    include: { _count: { select: { enrollments: true, sessions: true } } },
  });
  if (!section) throw notFound('Section not found');

  if (section._count.sessions > 0) {
    throw badRequest(
      'This section already has attendance history and cannot be deleted. Remove the sessions first.',
    );
  }

  await prisma.section.delete({ where: { id } });
  await recordAudit({
    userId: req.user!.id,
    action: 'DELETE',
    entityType: 'Section',
    entityId: id,
    details: section,
    req,
  });
  sendSuccess(res, { message: 'Section deleted' });
});

// ---------------------------------------------------------------------------
// Academic overview used by filters
// ---------------------------------------------------------------------------

export const getAcademicOptions = asyncHandler(async (_req: Request, res: Response) => {
  const [departments, academicYears, semesters, subjects, sections] = await Promise.all([
    prisma.department.findMany({
      orderBy: { departmentName: 'asc' },
      select: { id: true, departmentName: true, departmentCode: true },
    }),
    prisma.academicYear.findMany({
      orderBy: { startDate: 'desc' },
      select: { id: true, yearName: true, startDate: true, endDate: true, isActive: true },
    }),
    prisma.semester.findMany({
      orderBy: [{ academicYearId: 'desc' }, { semesterNumber: 'asc' }],
      select: {
        id: true,
        semesterNumber: true,
        academicYearId: true,
        academicYear: { select: { yearName: true } },
      },
    }),
    prisma.subject.findMany({
      where: { isActive: true },
      orderBy: { subjectCode: 'asc' },
      select: { id: true, subjectCode: true, subjectName: true, departmentId: true, semesterId: true },
    }),
    prisma.section.findMany({
      orderBy: { section: 'asc' },
      select: { id: true, section: true, subjectId: true, academicYearId: true },
    }),
  ]);

  sendSuccess(res, { departments, academicYears, semesters, subjects, sections });
});

export { startOfToday };
