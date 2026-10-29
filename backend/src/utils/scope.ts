import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { forbidden } from './errors.js';

export interface TaughtOffering {
  subjectId: number;
  sectionId: number;
}

export interface CallerScope {
  role: 'ADMIN' | 'FACULTY' | 'STUDENT';
  userId: number;
  facultyId?: number;
  studentId?: number;
  /** Subject ids the caller is allowed to see (empty for admins and students). */
  taughtSubjectIds: number[];
  /** The exact class offerings the caller teaches. */
  taughtOfferings: TaughtOffering[];
}

/**
 * Resolves what the signed-in caller is allowed to read, so every controller
 * can scope its queries the same way.
 */
export async function resolveCallerScope(req: Request): Promise<CallerScope> {
  const role = req.user!.role;

  if (role === 'ADMIN') {
    return { role, userId: req.user!.id, taughtSubjectIds: [], taughtOfferings: [] };
  }

  if (role === 'FACULTY') {
    const faculty = await prisma.faculty.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    const assignments = faculty
      ? await prisma.facultySubject.findMany({
          where: { facultyId: faculty.id },
          select: { subjectId: true, sectionId: true },
        })
      : [];
    return {
      role,
      userId: req.user!.id,
      facultyId: faculty?.id,
      taughtSubjectIds: [...new Set(assignments.map((a) => a.subjectId))],
      taughtOfferings: assignments.map((a) => ({ subjectId: a.subjectId, sectionId: a.sectionId })),
    };
  }

  const student = await prisma.student.findUnique({
    where: { userId: req.user!.id },
    select: { id: true },
  });
  return {
    role,
    userId: req.user!.id,
    studentId: student?.id,
    taughtSubjectIds: [],
    taughtOfferings: [],
  };
}

/**
 * Limits an enrollment query to the class offerings the faculty member
 * actually teaches. A subject-level enrollment (no section) belongs to every
 * section of that subject.
 */
export function taughtEnrollmentFilter(scope: CallerScope): Prisma.EnrollmentWhereInput {
  return {
    OR: [
      { sectionId: null, subjectId: { in: scope.taughtSubjectIds } },
      ...scope.taughtOfferings.map((offering) => ({
        subjectId: offering.subjectId,
        sectionId: offering.sectionId,
      })),
    ],
  };
}

/** Throws unless the caller is allowed to read the given subject. */
export function assertSubjectAccess(scope: CallerScope, subjectId: number): void {
  if (scope.role === 'ADMIN') return;
  if (scope.role === 'FACULTY') {
    if (!scope.taughtSubjectIds.includes(subjectId)) {
      throw forbidden('You are not assigned to teach this subject');
    }
    return;
  }
  throw forbidden('Students cannot view subject rosters');
}
