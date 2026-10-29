import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/response.js';
import { csvResponse, toCsv } from '../utils/csv.js';
import { buildReport, REPORT_TYPES, type ReportFilter } from '../services/report.service.js';
import { forbidden } from '../utils/errors.js';

/**
 * Restricts a report to what the signed-in user is allowed to see.
 * Faculty see only subjects they teach, students see only their own record.
 */
async function scopeFilters(req: Request, filters: ReportFilter): Promise<ReportFilter> {
  const role = req.user!.role;

  if (role === 'ADMIN') return filters;

  if (role === 'FACULTY') {
    const faculty = await prisma.faculty.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    if (!faculty) return { ...filters, subjectId: -1 };

    const assignments = await prisma.facultySubject.findMany({
      where: { facultyId: faculty.id },
      select: { subjectId: true, sectionId: true },
    });
    const subjectIds = [...new Set(assignments.map((a) => a.subjectId))];
    const ownSectionIds = [...new Set(assignments.map((a) => a.sectionId))];

    if (filters.subjectId && !subjectIds.includes(filters.subjectId)) {
      throw forbidden('You do not teach the selected subject');
    }
    if (filters.sectionId && !ownSectionIds.includes(filters.sectionId)) {
      throw forbidden('You do not teach the selected section');
    }

    const subjectId = filters.subjectId ?? subjectIds[0];
    // Reports are limited to the class offerings this faculty member actually
    // teaches, so a colleague's section never leaks into their results.
    const sectionIds = filters.sectionId
      ? [filters.sectionId]
      : subjectId
        ? [...new Set(assignments.filter((a) => a.subjectId === subjectId).map((a) => a.sectionId))]
        : ownSectionIds;

    return { ...filters, subjectId, sectionIds };
  }

  // Students can only ever see their own attendance.
  const student = await prisma.student.findUnique({
    where: { userId: req.user!.id },
    select: { id: true },
  });
  if (!student) throw forbidden('No student profile is linked to this account');
  return { ...filters, studentId: student.id };
}

export const getReports = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ReportFilter & { reportType: string };
  const filters = await scopeFilters(req, query);
  const report = await buildReport(query.reportType, filters);
  sendSuccess(res, report);
});

export const exportReports = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ReportFilter & { reportType: string };
  const filters = await scopeFilters(req, query);
  const report = await buildReport(query.reportType, filters);

  const csv = toCsv(
    report.columns.map((column) => column.label),
    report.rows.map((row) => report.columns.map((column) => (row[column.key] ?? '') as string)),
  );

  csvResponse(res, `attendance-${query.reportType}-report.csv`, csv);
});

export const getReportTypes = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, REPORT_TYPES);
});
