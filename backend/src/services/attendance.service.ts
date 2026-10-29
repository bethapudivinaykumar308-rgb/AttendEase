import type { AttendanceStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { dayjs } from '../utils/dayjs.js';
import { formatDate, startOfToday } from '../utils/dates.js';

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'ON_LEAVE'];

export interface StatusBreakdown {
  present: number;
  absent: number;
  late: number;
  onLeave: number;
}

export interface PercentageBreakdown extends StatusBreakdown {
  total: number;
  attended: number;
  percentage: number;
}

export function emptyBreakdown(): StatusBreakdown {
  return { present: 0, absent: 0, late: 0, onLeave: 0 };
}

/** Start of the UTC day that contains the given timestamp. */
export function startOfDayUtc(date: Date): Date {
  return new Date(`${formatDate(date)}T00:00:00.000Z`);
}

/** End of the UTC day that contains the given timestamp. */
export function endOfDayUtc(date: Date): Date {
  return new Date(`${formatDate(date)}T23:59:59.999Z`);
}

/**
 * Applies the configured attendance policy. A session only counts when it is
 * in the past and has not been cancelled, and a status counts as "attended"
 * when it appears in ATTENDANCE_COUNTED_STATUSES.
 */
export function calculatePercentage(breakdown: StatusBreakdown, total: number): number {
  if (total <= 0) return 0;
  const attended =
    breakdown.present +
    breakdown.late +
    (env.countedStatuses.includes('ON_LEAVE') ? breakdown.onLeave : 0);
  return Math.round((attended / total) * 10000) / 100;
}

export function summarise(breakdown: StatusBreakdown, total: number): PercentageBreakdown {
  const attended =
    breakdown.present +
    breakdown.late +
    (env.countedStatuses.includes('ON_LEAVE') ? breakdown.onLeave : 0);
  return {
    ...breakdown,
    total,
    attended,
    percentage: calculatePercentage(breakdown, total),
  };
}

export interface EligibleSessionWhere {
  isCancelled: false;
  attendanceDate: { lte: Date };
}

export function eligibleSessionWhere(): EligibleSessionWhere {
  return { isCancelled: false, attendanceDate: { lte: startOfToday() } };
}

export interface AttendanceFilter {
  academicYearId?: number;
  semesterId?: number;
  departmentId?: number;
  subjectId?: number;
  sectionId?: number;
  section?: string;
  studentId?: number;
  facultyId?: number;
  startDate?: Date;
  endDate?: Date;
  status?: AttendanceStatus;
}

/** Builds the Prisma filter for attendance sessions from the report filters. */
export function sessionWhere(filters: AttendanceFilter): Prisma.AttendanceSessionWhereInput {
  const where: Prisma.AttendanceSessionWhereInput = {};

  if (filters.subjectId) where.subjectId = filters.subjectId;
  if (filters.facultyId) where.facultyId = filters.facultyId;
  if (filters.sectionId) where.sectionId = filters.sectionId;
  if (filters.section) where.section = filters.section;
  if (filters.academicYearId) where.academicYearId = filters.academicYearId;
  if (filters.departmentId) where.subject = { departmentId: filters.departmentId };
  if (filters.semesterId) where.subject = { ...(where.subject as object), semesterId: filters.semesterId };

  if (filters.startDate || filters.endDate) {
    const range: Prisma.DateTimeFilter = {};
    if (filters.startDate) range.gte = startOfDayUtc(filters.startDate);
    if (filters.endDate) range.lte = endOfDayUtc(filters.endDate);
    where.attendanceDate = range;
  }

  return where;
}

export interface StudentSubjectSummary {
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  credits: number;
  departmentName: string;
  semesterNumber: number | null;
  yearName: string | null;
  section: string | null;
  breakdown: PercentageBreakdown;
}

/**
 * Subject-wise attendance for a single student, calculated from the actual
 * attendance records and the eligible (past, non-cancelled) sessions.
 */
export async function getStudentSubjectSummaries(
  studentId: number,
  filters: AttendanceFilter = {},
): Promise<StudentSubjectSummary[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId,
      ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    },
    include: {
      subject: {
        include: {
          department: { select: { departmentName: true } },
          semester: {
            select: {
              semesterNumber: true,
              academicYear: { select: { yearName: true } },
            },
          },
        },
      },
      section: { select: { id: true, section: true } },
    },
  });

  if (enrollments.length === 0) return [];

  const subjectIds = [...new Set(enrollments.map((e) => e.subjectId))];

  const sessions = await prisma.attendanceSession.findMany({
    where: {
      subjectId: { in: subjectIds },
      ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
      ...eligibleSessionWhere(),
    },
    select: { id: true, subjectId: true, sectionId: true, attendanceDate: true },
  });

  const sessionIds = sessions.map((s) => s.id);

  const records = await prisma.attendanceRecord.findMany({
    where: { studentId, attendanceSessionId: { in: sessionIds } },
    select: { attendanceSessionId: true, attendanceStatus: true },
  });

  const recordBySession = new Map(
    records.map((record) => [record.attendanceSessionId, record.attendanceStatus]),
  );

  const sessionsBySubject = new Map<number, typeof sessions>();
  for (const session of sessions) {
    const list = sessionsBySubject.get(session.subjectId) ?? [];
    list.push(session);
    sessionsBySubject.set(session.subjectId, list);
  }

  return enrollments.map((enrollment) => {
    const subjectSessions = (sessionsBySubject.get(enrollment.subjectId) ?? []).filter((session) => {
      // A student only attends sessions for their own section, unless they
      // are enrolled without a specific section.
      if (!enrollment.sectionId) return true;
      return session.sectionId === enrollment.sectionId;
    });

    const breakdown = emptyBreakdown();
    for (const session of subjectSessions) {
      const status = recordBySession.get(session.id);
      if (!status) continue;
      if (status === 'PRESENT') breakdown.present += 1;
      else if (status === 'ABSENT') breakdown.absent += 1;
      else if (status === 'LATE') breakdown.late += 1;
      else if (status === 'ON_LEAVE') breakdown.onLeave += 1;
    }

    return {
      subjectId: enrollment.subject.id,
      subjectCode: enrollment.subject.subjectCode,
      subjectName: enrollment.subject.subjectName,
      credits: enrollment.subject.credits,
      departmentName: enrollment.subject.department.departmentName,
      semesterNumber: enrollment.subject.semester?.semesterNumber ?? null,
      yearName: enrollment.subject.semester?.academicYear?.yearName ?? null,
      section: enrollment.section?.section ?? null,
      breakdown: summarise(breakdown, subjectSessions.length),
    };
  });
}

/** Overall attendance for a student across every subject. */
export async function getStudentOverallSummary(
  studentId: number,
  filters: AttendanceFilter = {},
): Promise<PercentageBreakdown> {
  const summaries = await getStudentSubjectSummaries(studentId, filters);
  const breakdown = emptyBreakdown();
  let total = 0;

  for (const summary of summaries) {
    breakdown.present += summary.breakdown.present;
    breakdown.absent += summary.breakdown.absent;
    breakdown.late += summary.breakdown.late;
    breakdown.onLeave += summary.breakdown.onLeave;
    total += summary.breakdown.total;
  }

  return summarise(breakdown, total);
}

/** Monthly breakdown of a student's attendance. */
export async function getStudentMonthlySummary(
  studentId: number,
  filters: AttendanceFilter = {},
): Promise<{ month: string; label: string; breakdown: PercentageBreakdown }[]> {
  const summaries = await getStudentSubjectSummaries(studentId, filters);

  const sessions = await prisma.attendanceSession.findMany({
    where: {
      subjectId: { in: summaries.map((s) => s.subjectId) },
      ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
      ...eligibleSessionWhere(),
    },
    select: { id: true, attendanceDate: true, sectionId: true, subjectId: true },
  });

  const sessionIds = sessions.map((s) => s.id);
  const records = await prisma.attendanceRecord.findMany({
    where: { studentId, attendanceSessionId: { in: sessionIds } },
    select: { attendanceSessionId: true, attendanceStatus: true },
  });

  const recordBySession = new Map(
    records.map((record) => [record.attendanceSessionId, record.attendanceStatus]),
  );

  const months = new Map<string, StatusBreakdown & { total: number }>();
  for (const session of sessions) {
    const key = formatDate(session.attendanceDate).slice(0, 7);
    const entry = months.get(key) ?? { ...emptyBreakdown(), total: 0 };
    entry.total += 1;
    const status = recordBySession.get(session.id);
    if (status === 'PRESENT') entry.present += 1;
    else if (status === 'ABSENT') entry.absent += 1;
    else if (status === 'LATE') entry.late += 1;
    else if (status === 'ON_LEAVE') entry.onLeave += 1;
    months.set(key, entry);
  }

  return [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, entry]) => ({
      month,
      label: dayjs(`${month}-01`).format('MMM YYYY'),      breakdown: summarise(entry, entry.total),
    }));
}
