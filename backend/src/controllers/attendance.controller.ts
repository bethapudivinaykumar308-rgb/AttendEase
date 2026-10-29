import type { AttendanceStatus, Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendPaginated, sendSuccess } from '../utils/response.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { recordAudit } from '../services/audit.service.js';
import { formatDate, isFutureDate, todayString } from '../utils/dates.js';
import {
  eligibleSessionWhere,
  getStudentMonthlySummary,
  getStudentOverallSummary,
  getStudentSubjectSummaries,
} from '../services/attendance.service.js';
import { resolveCallerScope, taughtEnrollmentFilter } from '../utils/scope.js';

const sessionInclude = {
  subject: {
    select: {
      id: true,
      subjectCode: true,
      subjectName: true,
      department: { select: { id: true, departmentName: true } },
    },
  },
  faculty: {
    select: {
      id: true,
      facultyId: true,
      user: { select: { id: true, name: true } },
    },
  },
  sectionOffering: { select: { id: true, section: true } },
  academicYear: { select: { id: true, yearName: true } },
} as const;

interface SessionFilters {
  page: number;
  pageSize: number;
  search?: string;
  subjectId?: number;
  facultyId?: number;
  sectionId?: number;
  academicYearId?: number;
  departmentId?: number;
  date?: Date;
  startDate?: Date;
  endDate?: Date;
  status?: AttendanceStatus;
}

export const listSessions = asyncHandler(async (req: Request, res: Response) => {
  const filters = req.query as unknown as SessionFilters;
  const scope = await resolveCallerScope(req);

  if (scope.role !== 'ADMIN' && !scope.facultyId) {
    sendPaginated(res, [], 0, filters.page, filters.pageSize);
    return;
  }

  const where: Prisma.AttendanceSessionWhereInput = {
    ...(scope.facultyId ? { facultyId: scope.facultyId } : {}),
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
    ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
    ...(filters.departmentId ? { subject: { departmentId: filters.departmentId } } : {}),
    ...(filters.search
      ? {
          OR: [
            { subject: { subjectName: { contains: filters.search } } },
            { subject: { subjectCode: { contains: filters.search } } },
            { topic: { contains: filters.search } },
          ],
        }
      : {}),
  };

  if (filters.date) {
    where.attendanceDate = {
      gte: new Date(`${formatDate(filters.date)}T00:00:00.000Z`),
      lte: new Date(`${formatDate(filters.date)}T23:59:59.999Z`),
    };
  } else if (filters.startDate || filters.endDate) {
    const range: Prisma.DateTimeFilter = {};
    if (filters.startDate) range.gte = new Date(`${formatDate(filters.startDate)}T00:00:00.000Z`);
    if (filters.endDate) range.lte = new Date(`${formatDate(filters.endDate)}T23:59:59.999Z`);
    where.attendanceDate = range;
  }

  const [items, total] = await Promise.all([
    prisma.attendanceSession.findMany({
      where,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      orderBy: [{ attendanceDate: 'desc' }, { sessionNumber: 'desc' }],
      include: {
        ...sessionInclude,
        records: { select: { attendanceStatus: true } },
        _count: { select: { records: true } },
      },
    }),
    prisma.attendanceSession.count({ where }),
  ]);

  const data = items.map((session) => {
    const summary = { present: 0, absent: 0, late: 0, onLeave: 0 };
    for (const record of session.records) {
      if (record.attendanceStatus === 'PRESENT') summary.present += 1;
      else if (record.attendanceStatus === 'ABSENT') summary.absent += 1;
      else if (record.attendanceStatus === 'LATE') summary.late += 1;
      else if (record.attendanceStatus === 'ON_LEAVE') summary.onLeave += 1;
    }
    const { records: _records, ...rest } = session;
    return { ...rest, attendanceDate: formatDate(session.attendanceDate), summary };
  });

  sendPaginated(res, data, total, filters.page, filters.pageSize);
});

export const createSession = asyncHandler(async (req: Request, res: Response) => {
  const { subjectId, sectionId, attendanceDate, startTime, endTime, topic, sessionNumber } =
    req.body as {
      subjectId: number;
      sectionId: number;
      attendanceDate: Date;
      startTime?: string;
      endTime?: string;
      topic?: string;
      sessionNumber: number;
    };

  if (isFutureDate(attendanceDate)) {
    throw badRequest('Attendance cannot be recorded for a future date');
  }

  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { subject: true, academicYear: true },
  });
  if (!section) throw notFound('Section not found');
  if (section.subjectId !== subjectId) {
    throw badRequest('The selected section does not belong to the selected subject');
  }

  const scope = await resolveCallerScope(req);

  // The session must be backed by a real faculty-subject assignment.
  const assignment = await prisma.facultySubject.findFirst({
    where: {
      subjectId,
      sectionId,
      academicYearId: section.academicYearId,
      ...(scope.facultyId ? { facultyId: scope.facultyId } : {}),
    },
    include: { faculty: { select: { id: true, facultyId: true } } },
  });

  if (!assignment) {
    if (scope.role !== 'ADMIN') {
      throw forbidden('You are not assigned to teach this subject and section');
    }
    throw badRequest(
      'No faculty member is assigned to this subject and section. Create the assignment first.',
    );
  }

  const duplicate = await prisma.attendanceSession.findUnique({
    where: {
      unique_session_slot: {
        subjectId,
        sectionId,
        academicYearId: section.academicYearId,
        attendanceDate,
        sessionNumber,
      },
    },
  });
  if (duplicate) {
    throw conflict(
      `Session ${sessionNumber} already exists for ${section.subject.subjectCode} on ${formatDate(
        attendanceDate,
      )}.`,
    );
  }

  const session = await prisma.attendanceSession.create({
    data: {
      subjectId,
      sectionId,
      academicYearId: section.academicYearId,
      facultyId: assignment.faculty.id,
      assignmentId: assignment.id,
      section: section.section,
      attendanceDate,
      startTime: startTime || null,
      endTime: endTime || null,
      topic: topic || null,
      sessionNumber,
      createdById: req.user!.id,
    },
    include: sessionInclude,
  });

  await recordAudit({
    userId: req.user!.id,
    action: 'CREATE',
    entityType: 'AttendanceSession',
    entityId: session.id,
    details: { subjectId, sectionId, attendanceDate: formatDate(attendanceDate) },
    req,
  });

  sendSuccess(res, { ...session, attendanceDate: formatDate(session.attendanceDate) }, 201);
});

export const getSession = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const scope = await resolveCallerScope(req);

  const session = await prisma.attendanceSession.findUnique({
    where: { id },
    include: {
      ...sessionInclude,
      records: {
        include: {
          student: {
            select: {
              id: true,
              rollNumber: true,
              section: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
          markedBy: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!session) throw notFound('Attendance session not found');
  // A session roster exposes the whole class, so only the teaching faculty
  // and administrators may open one.
  if (scope.studentId) {
    throw forbidden('You can only view your own attendance records');
  }
  if (scope.role !== 'ADMIN' && scope.facultyId && session.facultyId !== scope.facultyId) {
    throw forbidden('You can only view sessions for subjects you teach');
  }

  // The roster is the enrolled students for this subject/section.
  const enrollments = await prisma.enrollment.findMany({
    where: { subjectId: session.subjectId, sectionId: session.sectionId },
    select: {
      student: {
        select: {
          id: true,
          rollNumber: true,
          section: true,
          user: { select: { id: true, name: true, email: true, isActive: true } },
        },
      },
    },
    orderBy: { student: { rollNumber: 'asc' } },
  });

  const recordByStudent = new Map(session.records.map((r) => [r.studentId, r]));

  const roster = enrollments.map((enrollment) => {
    const record = recordByStudent.get(enrollment.student.id);
    return {
      studentId: enrollment.student.id,
      rollNumber: enrollment.student.rollNumber,
      name: enrollment.student.user.name,
      email: enrollment.student.user.email,
      section: enrollment.student.section,
      isActive: enrollment.student.user.isActive,
      attendanceStatus: record?.attendanceStatus ?? null,
      remarks: record?.remarks ?? null,
      recordId: record?.id ?? null,
      markedBy: record?.markedBy?.name ?? null,
      markedAt: record?.markedAt ?? null,
    };
  });

  const summary = { present: 0, absent: 0, late: 0, onLeave: 0, unmarked: roster.length };
  for (const student of roster) {
    if (student.attendanceStatus === 'PRESENT') summary.present += 1;
    else if (student.attendanceStatus === 'ABSENT') summary.absent += 1;
    else if (student.attendanceStatus === 'LATE') summary.late += 1;
    else if (student.attendanceStatus === 'ON_LEAVE') summary.onLeave += 1;
    if (student.attendanceStatus) summary.unmarked -= 1;
  }

  const { records: _records, ...sessionWithoutRecords } = session;
  sendSuccess(res, {
    ...sessionWithoutRecords,
    attendanceDate: formatDate(session.attendanceDate),
    roster,
    summary,
  });
});

/**
 * Saves the attendance for a session. The whole submission runs inside a
 * transaction and uses upserts, so submitting twice never creates duplicate
 * records.
 */
export const submitRecords = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { records } = req.body as {
    records: { studentId: number; attendanceStatus: AttendanceStatus; remarks?: string }[];
  };

  const scope = await resolveCallerScope(req);

  const session = await prisma.attendanceSession.findUnique({
    where: { id },
    include: { subject: true },
  });
  if (!session) throw notFound('Attendance session not found');
  if (session.isCancelled) throw badRequest('This session has been cancelled');
  if (scope.role !== 'ADMIN' && scope.facultyId && session.facultyId !== scope.facultyId) {
    throw forbidden('You can only mark attendance for subjects you teach');
  }

  // Only students enrolled in this subject and section may be marked.
  const enrollments = await prisma.enrollment.findMany({
    where: { subjectId: session.subjectId, sectionId: session.sectionId },
    select: { studentId: true },
  });
  const enrolled = new Set(enrollments.map((e) => e.studentId));

  const invalid = records.filter((record) => !enrolled.has(record.studentId));
  if (invalid.length > 0) {
    throw badRequest(
      'One or more students are not enrolled in this section and cannot be marked.',
      { studentIds: invalid.map((record) => record.studentId) },
    );
  }

  const duplicates = records.filter(
    (record, index) => records.findIndex((r) => r.studentId === record.studentId) !== index,
  );
  if (duplicates.length > 0) {
    throw badRequest('The same student was submitted more than once');
  }

  const markedAt = new Date();

  await prisma.$transaction(async (tx) => {
    for (const record of records) {
      await tx.attendanceRecord.upsert({
        where: {
          unique_student_per_session: {
            attendanceSessionId: id,
            studentId: record.studentId,
          },
        },
        create: {
          attendanceSessionId: id,
          studentId: record.studentId,
          attendanceStatus: record.attendanceStatus,
          markedById: req.user!.id,
          remarks: record.remarks ?? null,
          markedAt,
        },
        update: {
          attendanceStatus: record.attendanceStatus,
          markedById: req.user!.id,
          remarks: record.remarks ?? null,
          markedAt,
        },
      });
    }
  });

  await recordAudit({
    userId: req.user!.id,
    action: 'SUBMIT_ATTENDANCE',
    entityType: 'AttendanceSession',
    entityId: id,
    details: { recordCount: records.length },
    req,
  });

  const saved = await prisma.attendanceRecord.findMany({
    where: { attendanceSessionId: id },
    select: { attendanceStatus: true },
  });

  const summary = { present: 0, absent: 0, late: 0, onLeave: 0 };
  for (const record of saved) {
    if (record.attendanceStatus === 'PRESENT') summary.present += 1;
    else if (record.attendanceStatus === 'ABSENT') summary.absent += 1;
    else if (record.attendanceStatus === 'LATE') summary.late += 1;
    else if (record.attendanceStatus === 'ON_LEAVE') summary.onLeave += 1;
  }

  sendSuccess(res, {
    message: `Attendance saved for ${records.length} student(s)`,
    summary,
    total: saved.length,
  });
});

export const updateRecord = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { attendanceStatus, remarks } = req.body as {
    attendanceStatus: AttendanceStatus;
    remarks?: string;
  };

  const scope = await resolveCallerScope(req);

  const record = await prisma.attendanceRecord.findUnique({
    where: { id },
    include: { session: { select: { facultyId: true, subjectId: true } } },
  });
  if (!record) throw notFound('Attendance record not found');
  if (scope.role !== 'ADMIN' && scope.facultyId && record.session.facultyId !== scope.facultyId) {
    throw forbidden('You can only correct attendance for subjects you teach');
  }

  const updated = await prisma.attendanceRecord.update({
    where: { id },
    data: {
      attendanceStatus,
      remarks: remarks ?? null,
      markedById: req.user!.id,
      markedAt: new Date(),
    },
    include: {
      student: { select: { id: true, rollNumber: true, user: { select: { name: true } } } },
    },
  });

  await recordAudit({
    userId: req.user!.id,
    action: 'UPDATE',
    entityType: 'AttendanceRecord',
    entityId: id,
    details: { from: record.attendanceStatus, to: attendanceStatus },
    req,
  });

  sendSuccess(res, updated);
});

export const listRecords = asyncHandler(async (req: Request, res: Response) => {
  const filters = req.query as unknown as SessionFilters & { studentId?: number };
  const scope = await resolveCallerScope(req);

  const where: Prisma.AttendanceRecordWhereInput = {
    // A student is always pinned to their own record; the requested
    // studentId is ignored so nobody can read another student's attendance.
    ...(scope.studentId
      ? { studentId: scope.studentId }
      : filters.studentId
        ? { studentId: filters.studentId }
        : {}),
    ...(filters.status ? { attendanceStatus: filters.status } : {}),
    ...(filters.subjectId ? { session: { subjectId: filters.subjectId } } : {}),
    ...(filters.sectionId ? { session: { sectionId: filters.sectionId } } : {}),
    ...(filters.academicYearId ? { session: { academicYearId: filters.academicYearId } } : {}),
    ...(filters.departmentId ? { session: { subject: { departmentId: filters.departmentId } } } : {}),
    ...(filters.facultyId ? { session: { facultyId: filters.facultyId } } : {}),
    ...(scope.facultyId ? { session: { facultyId: scope.facultyId } } : {}),
    ...(filters.startDate || filters.endDate
      ? {
          session: {
            attendanceDate: {
              ...(filters.startDate
                ? { gte: new Date(`${formatDate(filters.startDate)}T00:00:00.000Z`) }
                : {}),
              ...(filters.endDate
                ? { lte: new Date(`${formatDate(filters.endDate)}T23:59:59.999Z`) }
                : {}),
            },
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      orderBy: [{ session: { attendanceDate: 'desc' } }, { student: { rollNumber: 'asc' } }],
      include: {
        session: {
          select: {
            id: true,
            attendanceDate: true,
            subject: { select: { id: true, subjectCode: true, subjectName: true } },
            sectionOffering: { select: { section: true } },
          },
        },
        student: {
          select: {
            id: true,
            rollNumber: true,
            department: { select: { departmentName: true } },
            user: { select: { name: true } },
          },
        },
      },
    }),
    prisma.attendanceRecord.count({ where }),
  ]);

  const data = items.map((record) => ({
    ...record,
    session: { ...record.session, attendanceDate: formatDate(record.session.attendanceDate) },
  }));

  sendPaginated(res, data, total, filters.page, filters.pageSize);
});

export const getStudentAttendance = asyncHandler(async (req: Request, res: Response) => {
  const studentId = Number(req.params.studentId);
  const scope = await resolveCallerScope(req);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, rollNumber: true, user: { select: { name: true } } },
  });
  if (!student) throw notFound('Student not found');

  // A student may only read their own attendance.
  if (req.user!.role === 'STUDENT') {
    const own = await prisma.student.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    if (own?.id !== studentId) throw forbidden('You can only view your own attendance');
  }

  if (req.user!.role === 'FACULTY' && scope.facultyId) {
    const taught = await prisma.enrollment.findFirst({
      where: { studentId, ...taughtEnrollmentFilter(scope) },
      select: { id: true },
    });
    if (!taught) throw forbidden('You do not teach any class this student is enrolled in');
  }

  const [overall, subjects, monthly] = await Promise.all([
    getStudentOverallSummary(studentId),
    getStudentSubjectSummaries(studentId),
    getStudentMonthlySummary(studentId),
  ]);

  sendSuccess(res, { student, overall, subjects, monthly });
});

export const getSubjectAttendance = asyncHandler(async (req: Request, res: Response) => {
  const subjectId = Number(req.params.subjectId);
  const scope = await resolveCallerScope(req);

  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true, subjectCode: true, subjectName: true },
  });
  if (!subject) throw notFound('Subject not found');

  if (req.user!.role === 'FACULTY' && scope.facultyId) {
    const assignment = await prisma.facultySubject.findFirst({
      where: { facultyId: scope.facultyId, subjectId },
      select: { id: true },
    });
    if (!assignment) throw forbidden('You do not teach this subject');
  }

  const sessions = await prisma.attendanceSession.findMany({
    where: { subjectId, ...eligibleSessionWhere() },
    select: { id: true, sectionId: true, attendanceDate: true },
  });

  const sessionIds = sessions.map((s) => s.id);
  const records = await prisma.attendanceRecord.findMany({
    where: { attendanceSessionId: { in: sessionIds } },
    select: { attendanceSessionId: true, attendanceStatus: true },
  });

  const summary = { present: 0, absent: 0, late: 0, onLeave: 0 };
  for (const record of records) {
    if (record.attendanceStatus === 'PRESENT') summary.present += 1;
    else if (record.attendanceStatus === 'ABSENT') summary.absent += 1;
    else if (record.attendanceStatus === 'LATE') summary.late += 1;
    else if (record.attendanceStatus === 'ON_LEAVE') summary.onLeave += 1;
  }

  const attended = summary.present + summary.late;
  const total = sessions.length;

  sendSuccess(res, {
    subject,
    totalSessions: total,
    attended,
    percentage: total > 0 ? Math.round((attended / total) * 10000) / 100 : 0,
    summary,
  });
});

export const cancelSession = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const session = await prisma.attendanceSession.findUnique({ where: { id } });
  if (!session) throw notFound('Attendance session not found');

  const cancelled = await prisma.attendanceSession.update({
    where: { id },
    data: { isCancelled: true },
  });

  await recordAudit({
    userId: req.user!.id,
    action: 'CANCEL',
    entityType: 'AttendanceSession',
    entityId: id,
    details: { attendanceDate: formatDate(cancelled.attendanceDate) },
    req,
  });

  sendSuccess(res, { message: 'Session cancelled. It no longer counts towards attendance.' });
});

export const getTodaySessions = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCallerScope(req);
  const today = todayString();

  // Students only see the classes they are enrolled in.
  let studentClassFilter: Prisma.AttendanceSessionWhereInput | undefined;
  if (scope.studentId) {
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: scope.studentId },
      select: { subjectId: true, sectionId: true },
    });
    studentClassFilter = {
      OR: enrollments
        .filter((enrollment) => enrollment.sectionId !== null)
        .map((enrollment) => ({
          subjectId: enrollment.subjectId,
          sectionId: enrollment.sectionId as number,
        })),
    };
  }

  const sessions = await prisma.attendanceSession.findMany({
    where: {
      ...(scope.facultyId ? { facultyId: scope.facultyId } : {}),
      ...(studentClassFilter ?? {}),
      attendanceDate: {
        gte: new Date(`${today}T00:00:00.000Z`),
        lte: new Date(`${today}T23:59:59.999Z`),
      },
    },
    include: {
      ...sessionInclude,
      records: { select: { attendanceStatus: true } },
    },
    orderBy: { startTime: 'asc' },
  });

  const data = sessions.map((session) => {
    const summary = { present: 0, absent: 0, late: 0, onLeave: 0 };
    for (const record of session.records) {
      if (record.attendanceStatus === 'PRESENT') summary.present += 1;
      else if (record.attendanceStatus === 'ABSENT') summary.absent += 1;
      else if (record.attendanceStatus === 'LATE') summary.late += 1;
      else if (record.attendanceStatus === 'ON_LEAVE') summary.onLeave += 1;
    }
    const { records: _records, ...rest } = session;
    return { ...rest, attendanceDate: formatDate(session.attendanceDate), summary };
  });

  sendSuccess(res, data);
});
