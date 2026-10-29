import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/response.js';
import { env } from '../config/env.js';
import { formatDate, todayString } from '../utils/dates.js';
import {
  eligibleSessionWhere,
  getStudentMonthlySummary,
  getStudentOverallSummary,
  getStudentSubjectSummaries,
  summarise,
  emptyBreakdown,
} from '../services/attendance.service.js';

async function averageAttendance(attendanceDateFilter?: { gte?: Date; lte?: Date }) {
  const sessions = await prisma.attendanceSession.findMany({
    where: { ...eligibleSessionWhere(), ...(attendanceDateFilter ?? {}) },
    select: { id: true },
  });

  const records = await prisma.attendanceRecord.findMany({
    where: { attendanceSessionId: { in: sessions.map((s) => s.id) } },
    select: { attendanceStatus: true },
  });

  const counts = emptyBreakdown();
  for (const record of records) {
    if (record.attendanceStatus === 'PRESENT') counts.present += 1;
    else if (record.attendanceStatus === 'ABSENT') counts.absent += 1;
    else if (record.attendanceStatus === 'LATE') counts.late += 1;
    else if (record.attendanceStatus === 'ON_LEAVE') counts.onLeave += 1;
  }

  return summarise(counts, records.length);
}

export const adminDashboard = asyncHandler(async (_req: Request, res: Response) => {
  const today = todayString();
  const todayStart = new Date(`${today}T00:00:00.000Z`);
  const todayEnd = new Date(`${today}T23:59:59.999Z`);

  const [
    totalStudents,
    totalFaculty,
    totalDepartments,
    totalSubjects,
    totalSessions,
    todaySessions,
    activeStudents,
    recentUsers,
    recentSessions,
    recentAuditLogs,
  ] = await Promise.all([
    prisma.student.count(),
    prisma.faculty.count(),
    prisma.department.count(),
    prisma.subject.count({ where: { isActive: true } }),
    // "Total sessions" means classes actually conducted: past and not cancelled.
    prisma.attendanceSession.count({ where: eligibleSessionWhere() }),
    prisma.attendanceSession.count({
      where: { attendanceDate: { gte: todayStart, lte: todayEnd }, isCancelled: false },
    }),
    prisma.user.count({ where: { role: 'STUDENT', isActive: true } }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    }),
    prisma.attendanceSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        attendanceDate: true,
        sessionNumber: true,
        section: true,
        isCancelled: true,
        subject: { select: { subjectCode: true, subjectName: true } },
        faculty: { select: { user: { select: { name: true } } } },
        records: { select: { attendanceStatus: true } },
      },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        user: { select: { name: true, role: true } },
      },
    }),
  ]);

  const overall = await averageAttendance();

  // Attendance trend for the last 30 days, which covers several weekly cycles.
  const trend = await prisma.attendanceSession.findMany({
    where: {
      ...eligibleSessionWhere(),
      attendanceDate: { gte: new Date(Date.now() - 30 * 86_400_000) },
    },
    select: { id: true, attendanceDate: true },
  });

  const trendRecords = await prisma.attendanceRecord.findMany({
    where: { attendanceSessionId: { in: trend.map((t) => t.id) } },
    select: { attendanceSessionId: true, attendanceStatus: true },
  });

  const trendMap = new Map<string, { present: number; absent: number; late: number; onLeave: number }>();
  for (const session of trend) {
    const key = formatDate(session.attendanceDate);
    trendMap.set(key, { present: 0, absent: 0, late: 0, onLeave: 0 });
  }
  const sessionById = new Map(trend.map((t) => [t.id, t]));
  for (const record of trendRecords) {
    const session = sessionById.get(record.attendanceSessionId);
    if (!session) continue;
    const entry = trendMap.get(formatDate(session.attendanceDate));
    if (!entry) continue;
    if (record.attendanceStatus === 'PRESENT') entry.present += 1;
    else if (record.attendanceStatus === 'ABSENT') entry.absent += 1;
    else if (record.attendanceStatus === 'LATE') entry.late += 1;
    else if (record.attendanceStatus === 'ON_LEAVE') entry.onLeave += 1;
  }

  const trendData = [...trendMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => {
      const total = counts.present + counts.absent + counts.late + counts.onLeave;
      return {
        date,
        ...counts,
        percentage: total > 0 ? Math.round(((counts.present + counts.late) / total) * 10000) / 100 : 0,
      };
    });

  // Department-wise attendance.
  const departmentSubjects = await prisma.subject.findMany({
    select: {
      id: true,
      departmentId: true,
      department: { select: { departmentName: true } },
    },
  });
  const departmentBySubject = new Map(
    departmentSubjects.map((s) => [s.id, s.department.departmentName]),
  );

  const allSessions = await prisma.attendanceSession.findMany({
    where: eligibleSessionWhere(),
    select: { id: true, subjectId: true },
  });
  const allRecords = await prisma.attendanceRecord.findMany({
    where: { attendanceSessionId: { in: allSessions.map((s) => s.id) } },
    select: { attendanceSessionId: true, attendanceStatus: true },
  });

  const subjectBySession = new Map(allSessions.map((s) => [s.id, s.subjectId]));
  const departmentStats = new Map<string, { present: number; absent: number; late: number; onLeave: number }>();
  for (const record of allRecords) {
    const subjectId = subjectBySession.get(record.attendanceSessionId);
    if (!subjectId) continue;
    const departmentName = departmentBySubject.get(subjectId);
    if (!departmentName) continue;
    const entry = departmentStats.get(departmentName) ?? { present: 0, absent: 0, late: 0, onLeave: 0 };
    if (record.attendanceStatus === 'PRESENT') entry.present += 1;
    else if (record.attendanceStatus === 'ABSENT') entry.absent += 1;
    else if (record.attendanceStatus === 'LATE') entry.late += 1;
    else if (record.attendanceStatus === 'ON_LEAVE') entry.onLeave += 1;
    departmentStats.set(departmentName, entry);
  }

  const departmentData = [...departmentStats.entries()]
    .map(([department, counts]) => {
      const total = counts.present + counts.absent + counts.late + counts.onLeave;
      return {
        department,
        ...counts,
        percentage: total > 0 ? Math.round(((counts.present + counts.late) / total) * 10000) / 100 : 0,
      };
    })
    .sort((a, b) => b.percentage - a.percentage);

  // Subject-wise attendance.
  const subjectStats = new Map<number, { present: number; absent: number; late: number; onLeave: number }>();
  for (const record of allRecords) {
    const subjectId = subjectBySession.get(record.attendanceSessionId);
    if (!subjectId) continue;
    const entry = subjectStats.get(subjectId) ?? { present: 0, absent: 0, late: 0, onLeave: 0 };
    if (record.attendanceStatus === 'PRESENT') entry.present += 1;
    else if (record.attendanceStatus === 'ABSENT') entry.absent += 1;
    else if (record.attendanceStatus === 'LATE') entry.late += 1;
    else if (record.attendanceStatus === 'ON_LEAVE') entry.onLeave += 1;
    subjectStats.set(subjectId, entry);
  }

  const subjectDetails = await prisma.subject.findMany({
    where: { id: { in: [...subjectStats.keys()] } },
    select: { id: true, subjectCode: true, subjectName: true },
  });
  const subjectById = new Map(subjectDetails.map((s) => [s.id, s]));

  const subjectData = [...subjectStats.entries()]
    .map(([subjectId, counts]) => {
      const total = counts.present + counts.absent + counts.late + counts.onLeave;
      const subject = subjectById.get(subjectId);
      return {
        subjectId,
        subjectCode: subject?.subjectCode ?? '',
        subjectName: subject?.subjectName ?? '',
        ...counts,
        percentage: total > 0 ? Math.round(((counts.present + counts.late) / total) * 10000) / 100 : 0,
      };
    })
    .sort((a, b) => b.percentage - a.percentage);

  // Students below the attendance threshold.
  const students = await prisma.student.findMany({
    where: { user: { isActive: true } },
    select: { id: true },
  });

  const belowThreshold: { studentId: number; name: string; rollNumber: string; percentage: number }[] = [];
  for (const student of students) {
    const summary = await getStudentOverallSummary(student.id);
    if (summary.total > 0 && summary.percentage < env.thresholdPercent) {
      const profile = await prisma.student.findUnique({
        where: { id: student.id },
        select: { rollNumber: true, user: { select: { name: true } } },
      });
      belowThreshold.push({
        studentId: student.id,
        name: profile?.user.name ?? '',
        rollNumber: profile?.rollNumber ?? '',
        percentage: summary.percentage,
      });
    }
  }

  sendSuccess(res, {
    stats: {
      totalStudents,
      totalFaculty,
      totalDepartments,
      totalSubjects,
      totalSessions,
      todaySessions,
      activeStudents,
      averageAttendance: overall.percentage,
      studentsBelowThreshold: belowThreshold.length,
      threshold: env.thresholdPercent,
    },
    trend: trendData,
    departmentAttendance: departmentData,
    subjectAttendance: subjectData,
    belowThreshold: belowThreshold.sort((a, b) => a.percentage - b.percentage).slice(0, 10),
    recentSessions: recentSessions.map((session) => {
      const counts = { present: 0, absent: 0, late: 0, onLeave: 0 };
      for (const record of session.records) {
        if (record.attendanceStatus === 'PRESENT') counts.present += 1;
        else if (record.attendanceStatus === 'ABSENT') counts.absent += 1;
        else if (record.attendanceStatus === 'LATE') counts.late += 1;
        else if (record.attendanceStatus === 'ON_LEAVE') counts.onLeave += 1;
      }
      const { records: _records, ...rest } = session;
      return { ...rest, attendanceDate: formatDate(session.attendanceDate), summary: counts };
    }),
    recentUsers: recentUsers.map((user) => ({
      ...user,
      createdAt: user.createdAt.toISOString(),
    })),
    recentAuditLogs: recentAuditLogs.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
    })),
  });
});

export const facultyDashboard = asyncHandler(async (req: Request, res: Response) => {
  const faculty = await prisma.faculty.findUnique({
    where: { userId: req.user!.id },
    select: { id: true },
  });

  if (!faculty) {
    sendSuccess(res, { stats: {}, assignments: [], sessions: [] });
    return;
  }

  const today = todayString();
  const todayStart = new Date(`${today}T00:00:00.000Z`);
  const todayEnd = new Date(`${today}T23:59:59.999Z`);

  const assignments = await prisma.facultySubject.findMany({
    where: { facultyId: faculty.id },
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
      section: { select: { id: true, section: true } },
      academicYear: { select: { id: true, yearName: true } },
    },
  });

  const sessionCounts = await prisma.attendanceSession.groupBy({
    by: ['subjectId', 'sectionId', 'academicYearId'],
    where: {
      facultyId: faculty.id,
      ...eligibleSessionWhere(),
    },
    _count: { _all: true },
  });

  const sessionCountBy = new Map(
    sessionCounts.map((row) => [
      `${row.subjectId}:${row.sectionId}:${row.academicYearId}`,
      row._count._all,
    ]),
  );

  const assignmentsWithCounts = assignments.map((assignment) => ({
    ...assignment,
    sessionCount:
      sessionCountBy.get(
        `${assignment.subjectId}:${assignment.sectionId}:${assignment.academicYearId}`,
      ) ?? 0,
  }));

  const subjectIds = [...new Set(assignments.map((a) => a.subjectId))];

  // The faculty member's own class offerings. Counting students or
  // enrollments by subject alone would pull in another teacher's section.
  const taughtOfferings = assignments.map((assignment) => ({
    subjectId: assignment.subjectId,
    sectionId: assignment.sectionId,
  }));

  const [totalEnrollments, todaySessions, recentSessions, studentCount] = await Promise.all([
    prisma.enrollment.count({
      where: {
        OR: taughtOfferings.map((offering) => ({
          subjectId: offering.subjectId,
          sectionId: offering.sectionId,
        })),
      },
    }),
    prisma.attendanceSession.count({
      where: {
        facultyId: faculty.id,
        attendanceDate: { gte: todayStart, lte: todayEnd },
        isCancelled: false,
      },
    }),
    prisma.attendanceSession.findMany({
      where: { facultyId: faculty.id },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        attendanceDate: true,
        sessionNumber: true,
        section: true,
        topic: true,
        subject: { select: { subjectCode: true, subjectName: true } },
        records: { select: { attendanceStatus: true } },
      },
    }),
    prisma.student.count({
      where: {
        enrollments: {
          some: {
            OR: taughtOfferings.map((offering) => ({
              subjectId: offering.subjectId,
              sectionId: offering.sectionId,
            })),
          },
        },
      },
    }),
  ]);

  // Subject-wise statistics for the faculty's own subjects. Only sessions the
  // signed-in faculty member recorded are counted.
  const sessions = await prisma.attendanceSession.findMany({
    where: {
      subjectId: { in: subjectIds },
      facultyId: faculty.id,
      ...eligibleSessionWhere(),
    },
    select: { id: true, subjectId: true, sectionId: true, academicYearId: true },
  });
  const records = await prisma.attendanceRecord.findMany({
    where: { attendanceSessionId: { in: sessions.map((s) => s.id) } },
    select: { attendanceSessionId: true, attendanceStatus: true },
  });

  type Counters = { present: number; absent: number; late: number; onLeave: number };
  const emptyCounters = (): Counters => ({ present: 0, absent: 0, late: 0, onLeave: 0 });
  const subjectBySession = new Map(sessions.map((s) => [s.id, s]));
  const subjectStats = new Map<number, Counters>();
  const assignmentStats = new Map<string, Counters>();

  // A class is counted when it was conducted: past and not cancelled.
  const classCountBySubject = new Map<number, number>();
  const classCountByAssignment = new Map<string, number>();
  for (const session of sessions) {
    classCountBySubject.set(session.subjectId, (classCountBySubject.get(session.subjectId) ?? 0) + 1);
    const assignmentKey = `${session.subjectId}:${session.sectionId}:${session.academicYearId}`;
    classCountByAssignment.set(assignmentKey, (classCountByAssignment.get(assignmentKey) ?? 0) + 1);
  }

  for (const record of records) {
    const session = subjectBySession.get(record.attendanceSessionId);
    if (!session) continue;

    const subjectEntry = subjectStats.get(session.subjectId) ?? emptyCounters();
    const assignmentEntry =
      assignmentStats.get(
        `${session.subjectId}:${session.sectionId}:${session.academicYearId}`,
      ) ?? emptyCounters();

    if (record.attendanceStatus === 'PRESENT') {
      subjectEntry.present += 1;
      assignmentEntry.present += 1;
    } else if (record.attendanceStatus === 'ABSENT') {
      subjectEntry.absent += 1;
      assignmentEntry.absent += 1;
    } else if (record.attendanceStatus === 'LATE') {
      subjectEntry.late += 1;
      assignmentEntry.late += 1;
    } else if (record.attendanceStatus === 'ON_LEAVE') {
      subjectEntry.onLeave += 1;
      assignmentEntry.onLeave += 1;
    }

    subjectStats.set(session.subjectId, subjectEntry);
    assignmentStats.set(
      `${session.subjectId}:${session.sectionId}:${session.academicYearId}`,
      assignmentEntry,
    );
  }

  const subjectDetails = await prisma.subject.findMany({
    where: { id: { in: [...subjectStats.keys()] } },
    select: { id: true, subjectCode: true, subjectName: true },
  });
  const subjectById = new Map(subjectDetails.map((s) => [s.id, s]));

  const subjectStatistics = [...subjectStats.entries()]
    .map(([subjectId, counts]) => {
      const marked = counts.present + counts.absent + counts.late + counts.onLeave;
      const subject = subjectById.get(subjectId);
      return {
        subjectId,
        subjectCode: subject?.subjectCode ?? '',
        subjectName: subject?.subjectName ?? '',
        ...counts,
        totalClasses: classCountBySubject.get(subjectId) ?? 0,
        totalRecords: marked,
        percentage:
          marked > 0 ? Math.round(((counts.present + counts.late) / marked) * 10000) / 100 : 0,
      };
    })
    .sort((a, b) => b.percentage - a.percentage);

  const assignmentStatistics = assignmentsWithCounts.map((assignment) => {
    const assignmentKey = `${assignment.subjectId}:${assignment.sectionId}:${assignment.academicYearId}`;
    const counts = assignmentStats.get(assignmentKey) ?? emptyCounters();
    const marked = counts.present + counts.absent + counts.late + counts.onLeave;
    return {
      assignmentId: assignment.id,
      present: counts.present,
      absent: counts.absent,
      late: counts.late,
      onLeave: counts.onLeave,
      totalClasses: classCountByAssignment.get(assignmentKey) ?? 0,
      totalRecords: marked,
      percentage:
        marked > 0 ? Math.round(((counts.present + counts.late) / marked) * 10000) / 100 : 0,
    };
  });

  sendSuccess(res, {
    stats: {
      assignedSubjects: assignments.length,
      assignedClasses: new Set(assignments.map((a) => a.sectionId)).size,
      totalStudents: studentCount,
      totalEnrollments,
      todaySessions,
    },
    assignments: assignmentsWithCounts,
    assignmentStatistics,
    subjectStatistics,
    recentSessions: recentSessions.map((session) => {
      const counts = { present: 0, absent: 0, late: 0, onLeave: 0 };
      for (const record of session.records) {
        if (record.attendanceStatus === 'PRESENT') counts.present += 1;
        else if (record.attendanceStatus === 'ABSENT') counts.absent += 1;
        else if (record.attendanceStatus === 'LATE') counts.late += 1;
        else if (record.attendanceStatus === 'ON_LEAVE') counts.onLeave += 1;
      }
      const { records: _records, ...rest } = session;
      return { ...rest, attendanceDate: formatDate(session.attendanceDate), summary: counts };
    }),
  });
});

export const studentDashboard = asyncHandler(async (req: Request, res: Response) => {
  const student = await prisma.student.findUnique({
    where: { userId: req.user!.id },
    select: { id: true },
  });

  if (!student) {
    sendSuccess(res, { overall: null, subjects: [], monthly: [], alerts: [] });
    return;
  }

  const [overall, subjects, monthly] = await Promise.all([
    getStudentOverallSummary(student.id),
    getStudentSubjectSummaries(student.id),
    getStudentMonthlySummary(student.id),
  ]);

  const alerts = subjects
    .filter((subject) => subject.breakdown.percentage < env.thresholdPercent)
    .map((subject) => ({
      type: 'LOW_ATTENDANCE',
      severity: subject.breakdown.percentage < env.thresholdPercent - 15 ? 'critical' : 'warning',
      title: `Low attendance in ${subject.subjectCode}`,
      message: `Your attendance in ${subject.subjectName} is ${subject.breakdown.percentage}%, below the ${env.thresholdPercent}% requirement.`,
      subjectId: subject.subjectId,
    }));

  sendSuccess(res, {
    overall,
    subjects,
    monthly,
    alerts,
    threshold: env.thresholdPercent,
  });
});
