import type { AttendanceStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { formatDate } from '../utils/dates.js';
import { dayjs } from '../utils/dayjs.js';

export interface ReportFilter {
  academicYearId?: number;
  semesterId?: number;
  departmentId?: number;
  subjectId?: number;
  sectionId?: number;
  sectionIds?: number[];
  section?: string;
  studentId?: number;
  facultyId?: number;
  startDate?: Date;
  endDate?: Date;
  status?: AttendanceStatus;
  threshold?: number;
}

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
}

export interface ReportResult {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  summary?: Record<string, string | number>;
}

interface StatusCounts {
  present: number;
  absent: number;
  late: number;
  onLeave: number;
}

const emptyCounts = (): StatusCounts => ({ present: 0, absent: 0, late: 0, onLeave: 0 });

function countStatus(counts: StatusCounts, status: AttendanceStatus): void {
  if (status === 'PRESENT') counts.present += 1;
  else if (status === 'ABSENT') counts.absent += 1;
  else if (status === 'LATE') counts.late += 1;
  else if (status === 'ON_LEAVE') counts.onLeave += 1;
}

function percentage(counts: StatusCounts, total: number): number {
  if (total <= 0) return 0;
  const attended =
    counts.present +
    counts.late +
    (env.countedStatuses.includes('ON_LEAVE') ? counts.onLeave : 0);
  return Math.round((attended / total) * 10000) / 100;
}

function sessionWhere(filters: ReportFilter): Prisma.AttendanceSessionWhereInput {
  const where: Prisma.AttendanceSessionWhereInput = {
    isCancelled: false,
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.facultyId ? { facultyId: filters.facultyId } : {}),
    ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
    ...(filters.sectionIds?.length ? { sectionId: { in: filters.sectionIds } } : {}),
    ...(filters.section ? { section: filters.section } : {}),
    ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
  };

  if (filters.departmentId) where.subject = { departmentId: filters.departmentId };
  if (filters.semesterId) {
    where.subject = { ...(where.subject as object), semesterId: filters.semesterId };
  }

  if (filters.startDate || filters.endDate) {
    where.attendanceDate = {
      ...(filters.startDate
        ? { gte: new Date(`${formatDate(filters.startDate)}T00:00:00.000Z`) }
        : {}),
      ...(filters.endDate
        ? { lte: new Date(`${formatDate(filters.endDate)}T23:59:59.999Z`) }
        : {}),
    };
  }

  return where;
}

async function loadSessions(filters: ReportFilter) {
  return prisma.attendanceSession.findMany({
    where: sessionWhere(filters),
    select: {
      id: true,
      subjectId: true,
      sectionId: true,
      facultyId: true,
      academicYearId: true,
      section: true,
      attendanceDate: true,
      subject: {
        select: {
          id: true,
          subjectCode: true,
          subjectName: true,
          departmentId: true,
          department: { select: { departmentName: true } },
          semester: { select: { id: true, semesterNumber: true } },
        },
      },
      faculty: { select: { id: true, facultyId: true, user: { select: { name: true } } } },
      academicYear: { select: { id: true, yearName: true } },
    },
    orderBy: { attendanceDate: 'asc' },
  });
}

async function loadRecords(sessionIds: number[]) {
  if (sessionIds.length === 0) return [];
  return prisma.attendanceRecord.findMany({
    where: { attendanceSessionId: { in: sessionIds } },
    select: {
      attendanceSessionId: true,
      studentId: true,
      attendanceStatus: true,
      student: {
        select: {
          id: true,
          rollNumber: true,
          departmentId: true,
          department: { select: { departmentName: true } },
          user: { select: { name: true } },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------

async function studentWiseReport(filters: ReportFilter): Promise<ReportResult> {
  const sessions = await loadSessions(filters);
  const records = await loadRecords(sessions.map((s) => s.id));

  const students = await prisma.student.findMany({
    where: {
      ...(filters.studentId ? { id: filters.studentId } : {}),
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    },
    select: {
      id: true,
      rollNumber: true,
      section: true,
      department: { select: { departmentName: true } },
      user: { select: { name: true } },
    },
  });

  const perStudent = new Map<
    number,
    { counts: StatusCounts; total: number }
  >();

  for (const student of students) {
    perStudent.set(student.id, { counts: emptyCounts(), total: 0 });
  }

  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const sectionByStudent = new Map(students.map((s) => [s.id, s.section]));

  for (const record of records) {
    const entry = perStudent.get(record.studentId);
    if (!entry) continue;
    const session = sessionById.get(record.attendanceSessionId);
    if (!session) continue;
    // A session only counts for students enrolled in that section.
    const studentSection = sectionByStudent.get(record.studentId);
    if (studentSection && session.section && studentSection !== session.section) continue;
    entry.total += 1;
    countStatus(entry.counts, record.attendanceStatus);
  }

  const rows = students
    .map((student) => {
      const entry = perStudent.get(student.id)!;
      return {
        studentId: student.id,
        rollNumber: student.rollNumber,
        name: student.user.name,
        department: student.department.departmentName,
        section: student.section,
        totalClasses: entry.total,
        attended: entry.counts.present + entry.counts.late,
        present: entry.counts.present,
        late: entry.counts.late,
        absent: entry.counts.absent,
        onLeave: entry.counts.onLeave,
        percentage: percentage(entry.counts, entry.total),
      };
    })
    .filter((row) => row.totalClasses > 0)
    .sort((a, b) => (a.percentage as number) - (b.percentage as number));

  return {
    title: 'Student-wise Attendance Report',
    columns: [
      { key: 'rollNumber', label: 'Roll Number' },
      { key: 'name', label: 'Student' },
      { key: 'department', label: 'Department' },
      { key: 'section', label: 'Section' },
      { key: 'totalClasses', label: 'Total Classes', align: 'right' },
      { key: 'attended', label: 'Attended', align: 'right' },
      { key: 'present', label: 'Present', align: 'right' },
      { key: 'late', label: 'Late', align: 'right' },
      { key: 'absent', label: 'Absent', align: 'right' },
      { key: 'onLeave', label: 'On Leave', align: 'right' },
      { key: 'percentage', label: 'Attendance %', align: 'right' },
    ],
    rows,
    summary: {
      'Students': rows.length,
      'Average %':
        rows.length > 0
          ? Math.round(
              (rows.reduce((sum, row) => sum + (row.percentage as number), 0) / rows.length) * 100,
            ) / 100
          : 0,
    },
  };
}

async function subjectWiseReport(filters: ReportFilter): Promise<ReportResult> {
  const sessions = await loadSessions(filters);
  const records = await loadRecords(sessions.map((s) => s.id));

  const bySubject = new Map<
    number,
    { counts: StatusCounts; total: number; code: string; name: string; department: string }
  >();

  for (const session of sessions) {
    const entry = bySubject.get(session.subjectId) ?? {
      counts: emptyCounts(),
      total: 0,
      code: session.subject.subjectCode,
      name: session.subject.subjectName,
      department: session.subject.department.departmentName,
    };
    entry.total += 1;
    bySubject.set(session.subjectId, entry);
  }

  for (const record of records) {
    const session = sessions.find((s) => s.id === record.attendanceSessionId);
    if (!session) continue;
    const entry = bySubject.get(session.subjectId);
    if (entry) countStatus(entry.counts, record.attendanceStatus);
  }

  const rows = [...bySubject.entries()]
    .map(([subjectId, entry]) => ({
      subjectId,
      subjectCode: entry.code,
      subjectName: entry.name,
      department: entry.department,
      totalClasses: entry.total,
      attended: entry.counts.present + entry.counts.late,
      present: entry.counts.present,
      late: entry.counts.late,
      absent: entry.counts.absent,
      onLeave: entry.counts.onLeave,
      percentage: percentage(entry.counts, entry.total),
    }))
    .sort((a, b) => (a.subjectCode as string).localeCompare(b.subjectCode as string));

  return {
    title: 'Subject-wise Attendance Report',
    columns: [
      { key: 'subjectCode', label: 'Subject Code' },
      { key: 'subjectName', label: 'Subject' },
      { key: 'department', label: 'Department' },
      { key: 'totalClasses', label: 'Total Classes', align: 'right' },
      { key: 'attended', label: 'Attended', align: 'right' },
      { key: 'present', label: 'Present', align: 'right' },
      { key: 'late', label: 'Late', align: 'right' },
      { key: 'absent', label: 'Absent', align: 'right' },
      { key: 'onLeave', label: 'On Leave', align: 'right' },
      { key: 'percentage', label: 'Attendance %', align: 'right' },
    ],
    rows,
  };
}

async function classWiseReport(filters: ReportFilter): Promise<ReportResult> {
  const sessions = await loadSessions(filters);
  const records = await loadRecords(sessions.map((s) => s.id));

  const byClass = new Map<
    string,
    { counts: StatusCounts; total: number; subjectCode: string; subjectName: string; section: string }
  >();

  for (const session of sessions) {
    const key = `${session.subjectId}-${session.sectionId}`;
    const entry = byClass.get(key) ?? {
      counts: emptyCounts(),
      total: 0,
      subjectCode: session.subject.subjectCode,
      subjectName: session.subject.subjectName,
      section: session.section,
    };
    entry.total += 1;
    byClass.set(key, entry);
  }

  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  for (const record of records) {
    const session = sessionById.get(record.attendanceSessionId);
    if (!session) continue;
    const entry = byClass.get(`${session.subjectId}-${session.sectionId}`);
    if (entry) countStatus(entry.counts, record.attendanceStatus);
  }

  const rows = [...byClass.values()]
    .map((entry) => ({
      subjectCode: entry.subjectCode,
      subjectName: entry.subjectName,
      section: entry.section,
      totalClasses: entry.total,
      attended: entry.counts.present + entry.counts.late,
      present: entry.counts.present,
      late: entry.counts.late,
      absent: entry.counts.absent,
      onLeave: entry.counts.onLeave,
      percentage: percentage(entry.counts, entry.total),
    }))
    .sort((a, b) =>
      `${a.subjectCode}-${a.section}`.localeCompare(`${b.subjectCode}-${b.section}`),
    );

  return {
    title: 'Class-wise Attendance Report',
    columns: [
      { key: 'subjectCode', label: 'Subject Code' },
      { key: 'subjectName', label: 'Subject' },
      { key: 'section', label: 'Section' },
      { key: 'totalClasses', label: 'Total Classes', align: 'right' },
      { key: 'attended', label: 'Attended', align: 'right' },
      { key: 'absent', label: 'Absent', align: 'right' },
      { key: 'percentage', label: 'Attendance %', align: 'right' },
    ],
    rows,
  };
}

async function departmentWiseReport(filters: ReportFilter): Promise<ReportResult> {
  const sessions = await loadSessions(filters);
  const records = await loadRecords(sessions.map((s) => s.id));

  const byDepartment = new Map<
    number,
    { counts: StatusCounts; total: number; name: string }
  >();

  for (const session of sessions) {
    const departmentId = session.subject.departmentId;
    const entry = byDepartment.get(departmentId) ?? {
      counts: emptyCounts(),
      total: 0,
      name: session.subject.department.departmentName,
    };
    entry.total += 1;
    byDepartment.set(departmentId, entry);
  }

  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  for (const record of records) {
    const session = sessionById.get(record.attendanceSessionId);
    if (!session) continue;
    const entry = byDepartment.get(session.subject.departmentId);
    if (entry) countStatus(entry.counts, record.attendanceStatus);
  }

  const rows = [...byDepartment.entries()]
    .map(([departmentId, entry]) => ({
      departmentId,
      department: entry.name,
      totalClasses: entry.total,
      attended: entry.counts.present + entry.counts.late,
      present: entry.counts.present,
      late: entry.counts.late,
      absent: entry.counts.absent,
      onLeave: entry.counts.onLeave,
      percentage: percentage(entry.counts, entry.total),
    }))
    .sort((a, b) => (a.department as string).localeCompare(b.department as string));

  return {
    title: 'Department-wise Attendance Report',
    columns: [
      { key: 'department', label: 'Department' },
      { key: 'totalClasses', label: 'Total Classes', align: 'right' },
      { key: 'attended', label: 'Attended', align: 'right' },
      { key: 'present', label: 'Present', align: 'right' },
      { key: 'absent', label: 'Absent', align: 'right' },
      { key: 'percentage', label: 'Attendance %', align: 'right' },
    ],
    rows,
  };
}

async function dateWiseReport(filters: ReportFilter): Promise<ReportResult> {
  const sessions = await loadSessions(filters);
  const records = await loadRecords(sessions.map((s) => s.id));

  const byDate = new Map<string, { counts: StatusCounts; total: number; sessions: number }>();

  for (const session of sessions) {
    const key = formatDate(session.attendanceDate);
    const entry = byDate.get(key) ?? { counts: emptyCounts(), total: 0, sessions: 0 };
    entry.sessions += 1;
    byDate.set(key, entry);
  }

  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  for (const record of records) {
    const session = sessionById.get(record.attendanceSessionId);
    if (!session) continue;
    const entry = byDate.get(formatDate(session.attendanceDate));
    if (!entry) continue;
    entry.total += 1;
    countStatus(entry.counts, record.attendanceStatus);
  }

  const rows = [...byDate.entries()]
    .map(([date, entry]) => ({
      date,
      day: dayjs(date).format('dddd'),
      sessions: entry.sessions,
      totalRecords: entry.total,
      present: entry.counts.present,
      late: entry.counts.late,
      absent: entry.counts.absent,
      onLeave: entry.counts.onLeave,
      percentage: percentage(entry.counts, entry.total),
    }))
    .sort((a, b) => (a.date as string).localeCompare(b.date as string));

  return {
    title: 'Date-wise Attendance Report',
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'day', label: 'Day' },
      { key: 'sessions', label: 'Sessions', align: 'right' },
      { key: 'totalRecords', label: 'Records', align: 'right' },
      { key: 'present', label: 'Present', align: 'right' },
      { key: 'late', label: 'Late', align: 'right' },
      { key: 'absent', label: 'Absent', align: 'right' },
      { key: 'onLeave', label: 'On Leave', align: 'right' },
      { key: 'percentage', label: 'Attendance %', align: 'right' },
    ],
    rows,
  };
}

async function monthlyReport(filters: ReportFilter): Promise<ReportResult> {
  const sessions = await loadSessions(filters);
  const records = await loadRecords(sessions.map((s) => s.id));

  const byMonth = new Map<string, { counts: StatusCounts; total: number; sessions: number }>();

  for (const session of sessions) {
    const key = formatDate(session.attendanceDate).slice(0, 7);
    const entry = byMonth.get(key) ?? { counts: emptyCounts(), total: 0, sessions: 0 };
    entry.sessions += 1;
    byMonth.set(key, entry);
  }

  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  for (const record of records) {
    const session = sessionById.get(record.attendanceSessionId);
    if (!session) continue;
    const entry = byMonth.get(formatDate(session.attendanceDate).slice(0, 7));
    if (!entry) continue;
    entry.total += 1;
    countStatus(entry.counts, record.attendanceStatus);
  }

  const rows = [...byMonth.entries()]
    .map(([month, entry]) => ({
      month,
      label: dayjs(`${month}-01`).format('MMMM YYYY'),
      sessions: entry.sessions,
      totalRecords: entry.total,
      present: entry.counts.present,
      late: entry.counts.late,
      absent: entry.counts.absent,
      onLeave: entry.counts.onLeave,
      percentage: percentage(entry.counts, entry.total),
    }))
    .sort((a, b) => (a.month as string).localeCompare(b.month as string));

  return {
    title: 'Monthly Attendance Report',
    columns: [
      { key: 'label', label: 'Month' },
      { key: 'sessions', label: 'Sessions', align: 'right' },
      { key: 'totalRecords', label: 'Records', align: 'right' },
      { key: 'present', label: 'Present', align: 'right' },
      { key: 'late', label: 'Late', align: 'right' },
      { key: 'absent', label: 'Absent', align: 'right' },
      { key: 'onLeave', label: 'On Leave', align: 'right' },
      { key: 'percentage', label: 'Attendance %', align: 'right' },
    ],
    rows,
  };
}

async function semesterWiseReport(filters: ReportFilter): Promise<ReportResult> {
  const sessions = await loadSessions(filters);
  const records = await loadRecords(sessions.map((s) => s.id));

  const bySemester = new Map<
    number,
    { counts: StatusCounts; total: number; label: string; sessions: number }
  >();

  for (const session of sessions) {
    const semesterId = session.subject.semester?.id ?? 0;
    const entry = bySemester.get(semesterId) ?? {
      counts: emptyCounts(),
      total: 0,
      sessions: 0,
      label: session.subject.semester
        ? `Semester ${session.subject.semester.semesterNumber} (${session.academicYear.yearName})`
        : 'No semester',
    };
    entry.sessions += 1;
    bySemester.set(semesterId, entry);
  }

  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  for (const record of records) {
    const session = sessionById.get(record.attendanceSessionId);
    if (!session) continue;
    const entry = bySemester.get(session.subject.semester?.id ?? 0);
    if (entry) countStatus(entry.counts, record.attendanceStatus);
  }

  const rows = [...bySemester.entries()]
    .map(([semesterId, entry]) => ({
      semesterId,
      semester: entry.label,
      sessions: entry.sessions,
      totalRecords: entry.total,
      present: entry.counts.present,
      late: entry.counts.late,
      absent: entry.counts.absent,
      onLeave: entry.counts.onLeave,
      percentage: percentage(entry.counts, entry.total),
    }))
    .sort((a, b) => (a.semesterId as number) - (b.semesterId as number));

  return {
    title: 'Semester-wise Attendance Report',
    columns: [
      { key: 'semester', label: 'Semester' },
      { key: 'sessions', label: 'Sessions', align: 'right' },
      { key: 'totalRecords', label: 'Records', align: 'right' },
      { key: 'present', label: 'Present', align: 'right' },
      { key: 'late', label: 'Late', align: 'right' },
      { key: 'absent', label: 'Absent', align: 'right' },
      { key: 'onLeave', label: 'On Leave', align: 'right' },
      { key: 'percentage', label: 'Attendance %', align: 'right' },
    ],
    rows,
  };
}

async function lowAttendanceReport(filters: ReportFilter): Promise<ReportResult> {
  const threshold = filters.threshold ?? env.thresholdPercent;
  const base = await studentWiseReport(filters);

  const rows = base.rows.filter((row) => (row.percentage as number) < threshold);

  return {
    title: `Low Attendance Report (below ${threshold}%)`,
    columns: [
      { key: 'rollNumber', label: 'Roll Number' },
      { key: 'name', label: 'Student' },
      { key: 'department', label: 'Department' },
      { key: 'section', label: 'Section' },
      { key: 'totalClasses', label: 'Total Classes', align: 'right' },
      { key: 'attended', label: 'Attended', align: 'right' },
      { key: 'absent', label: 'Absent', align: 'right' },
      { key: 'percentage', label: 'Attendance %', align: 'right' },
    ],
    rows,
    summary: { 'Threshold': `${threshold}%`, 'Students below threshold': rows.length },
  };
}

async function facultyWiseReport(filters: ReportFilter): Promise<ReportResult> {
  const sessions = await loadSessions(filters);
  const records = await loadRecords(sessions.map((s) => s.id));

  const byFaculty = new Map<
    number,
    { counts: StatusCounts; total: number; name: string; facultyId: string; sessions: number }
  >();

  for (const session of sessions) {
    const entry = byFaculty.get(session.facultyId) ?? {
      counts: emptyCounts(),
      total: 0,
      sessions: 0,
      name: session.faculty.user.name,
      facultyId: session.faculty.facultyId,
    };
    entry.sessions += 1;
    byFaculty.set(session.facultyId, entry);
  }

  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  for (const record of records) {
    const session = sessionById.get(record.attendanceSessionId);
    if (!session) continue;
    const entry = byFaculty.get(session.facultyId);
    if (entry) countStatus(entry.counts, record.attendanceStatus);
  }

  const rows = [...byFaculty.entries()]
    .map(([facultyId, entry]) => ({
      facultyId,
      facultyCode: entry.facultyId,
      name: entry.name,
      sessionsConducted: entry.sessions,
      totalRecords: entry.total,
      present: entry.counts.present,
      late: entry.counts.late,
      absent: entry.counts.absent,
      onLeave: entry.counts.onLeave,
      percentage: percentage(entry.counts, entry.total),
    }))
    .sort((a, b) => (a.facultyCode as string).localeCompare(b.facultyCode as string));

  return {
    title: 'Faculty-wise Attendance Report',
    columns: [
      { key: 'facultyCode', label: 'Faculty ID' },
      { key: 'name', label: 'Faculty' },
      { key: 'sessionsConducted', label: 'Sessions', align: 'right' },
      { key: 'totalRecords', label: 'Records', align: 'right' },
      { key: 'present', label: 'Present', align: 'right' },
      { key: 'late', label: 'Late', align: 'right' },
      { key: 'absent', label: 'Absent', align: 'right' },
      { key: 'percentage', label: 'Attendance %', align: 'right' },
    ],
    rows,
  };
}

export async function buildReport(
  reportType: string,
  filters: ReportFilter,
): Promise<ReportResult> {
  switch (reportType) {
    case 'student-wise':
      return studentWiseReport(filters);
    case 'subject-wise':
      return subjectWiseReport(filters);
    case 'class-wise':
      return classWiseReport(filters);
    case 'department-wise':
      return departmentWiseReport(filters);
    case 'date-wise':
      return dateWiseReport(filters);
    case 'monthly':
      return monthlyReport(filters);
    case 'semester-wise':
      return semesterWiseReport(filters);
    case 'low-attendance':
      return lowAttendanceReport(filters);
    case 'faculty-wise':
      return facultyWiseReport(filters);
    default:
      throw new Error(`Unsupported report type: ${reportType}`);
  }
}

export const REPORT_TYPES = [
  { value: 'student-wise', label: 'Student-wise' },
  { value: 'subject-wise', label: 'Subject-wise' },
  { value: 'class-wise', label: 'Class-wise' },
  { value: 'department-wise', label: 'Department-wise' },
  { value: 'date-wise', label: 'Date-wise' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'semester-wise', label: 'Semester-wise' },
  { value: 'low-attendance', label: 'Low Attendance' },
  { value: 'faculty-wise', label: 'Faculty-wise' },
] as const;
