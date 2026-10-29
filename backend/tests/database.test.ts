import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/config/prisma.js';
import { seedFixtures, type Fixtures } from './setup/fixtures.js';

let fixtures: Fixtures;

/** Prisma's error code for a unique constraint violation. */
const UNIQUE_VIOLATION = 'P2002';
/** Prisma's error code for a foreign key constraint violation. */
const FOREIGN_KEY_VIOLATION = 'P2003';

async function expectConstraintError(action: () => Promise<unknown>, code: string) {
  await expect(action()).rejects.toMatchObject({ code });
}

/** Reads the indexes MySQL actually created for a table. */
async function indexesFor(table: string): Promise<{ columns: string[]; unique: boolean }[]> {
  const rows = await prisma.$queryRaw<
    { INDEX_NAME: string; NON_UNIQUE: number; COLUMN_NAME: string; SEQ_IN_INDEX: number }[]
  >`
    SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
    ORDER BY INDEX_NAME, SEQ_IN_INDEX
  `;

  const grouped = new Map<string, { columns: string[]; unique: boolean }>();
  for (const row of rows) {
    const entry = grouped.get(row.INDEX_NAME) ?? {
      columns: [],
      // MySQL reports NON_UNIQUE as a BIGINT, so it has to be coerced.
      unique: Number(row.NON_UNIQUE) === 0,
    };
    entry.columns.push(row.COLUMN_NAME);
    grouped.set(row.INDEX_NAME, entry);
  }
  return [...grouped.values()];
}

/** True when the table has an index over exactly the given columns. */
async function hasIndex(table: string, columns: string[], unique?: boolean): Promise<boolean> {
  const indexes = await indexesFor(table);
  return indexes.some(
    (index) =>
      index.columns.join(',') === columns.join(',') &&
      (unique === undefined || index.unique === unique),
  );
}

describe('Database', () => {
  beforeAll(async () => {
    fixtures = await seedFixtures();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Unique constraints', () => {
    it('rejects a second user with the same email address', async () => {
      await expectConstraintError(
        () =>
          prisma.user.create({
            data: {
              name: 'Duplicate Admin',
              email: fixtures.admin.email,
              passwordHash: 'x',
              role: 'ADMIN',
            },
          }),
        UNIQUE_VIOLATION,
      );
    });

    it('rejects a second student with the same roll number', async () => {
      const existing = fixtures.students[0];
      await expectConstraintError(
        () =>
          prisma.student.create({
            data: {
              userId: existing.userId,
              rollNumber: existing.rollNumber!,
              departmentId: fixtures.departmentId,
              semesterId: fixtures.semester1Id,
              section: 'A',
              admissionYear: 2025,
            },
          }),
        UNIQUE_VIOLATION,
      );
    });

    it('rejects a second faculty member with the same faculty id', async () => {
      await expectConstraintError(
        () =>
          prisma.faculty.create({
            data: {
              userId: fixtures.admin.userId,
              facultyId: 'FAC001',
              departmentId: fixtures.departmentId,
              designation: 'Lecturer',
            },
          }),
        UNIQUE_VIOLATION,
      );
    });

    it('rejects a second subject with the same subject code', async () => {
      await expectConstraintError(
        () =>
          prisma.subject.create({
            data: {
              subjectCode: 'CS101',
              subjectName: 'Duplicate subject',
              departmentId: fixtures.departmentId,
              semesterId: fixtures.semester1Id,
              academicYearId: fixtures.academicYearId,
            },
          }),
        UNIQUE_VIOLATION,
      );
    });

    it('rejects a duplicate semester number inside the same academic year', async () => {
      await expectConstraintError(
        () =>
          prisma.semester.create({
            data: {
              semesterNumber: 1,
              academicYearId: fixtures.academicYearId,
              startDate: new Date('2026-01-01T00:00:00.000Z'),
              endDate: new Date('2026-06-01T00:00:00.000Z'),
            },
          }),
        UNIQUE_VIOLATION,
      );
    });

    it('rejects a duplicate section offering', async () => {
      await expectConstraintError(
        () =>
          prisma.section.create({
            data: {
              subjectId: fixtures.subjectIds.cs101,
              section: 'A',
              academicYearId: fixtures.academicYearId,
            },
          }),
        UNIQUE_VIOLATION,
      );
    });

    it('rejects a duplicate faculty assignment for the same section', async () => {
      await expectConstraintError(
        () =>
          prisma.facultySubject.create({
            data: {
              facultyId: fixtures.facultyIds.alice,
              subjectId: fixtures.subjectIds.cs101,
              sectionId: fixtures.sectionIds.cs101A,
              academicYearId: fixtures.academicYearId,
            },
          }),
        UNIQUE_VIOLATION,
      );
    });

    it('rejects a duplicate enrollment for the same student and subject', async () => {
      await expectConstraintError(
        () =>
          prisma.enrollment.create({
            data: {
              studentId: fixtures.studentIds.s1,
              subjectId: fixtures.subjectIds.cs101,
              sectionId: fixtures.sectionIds.cs101A,
              academicYearId: fixtures.academicYearId,
            },
          }),
        UNIQUE_VIOLATION,
      );
    });

    it('rejects a duplicate attendance session in the same slot', async () => {
      await expectConstraintError(
        () =>
          prisma.attendanceSession.create({
            data: {
              subjectId: fixtures.subjectIds.cs101,
              facultyId: fixtures.facultyIds.alice,
              academicYearId: fixtures.academicYearId,
              sectionId: fixtures.sectionIds.cs101A,
              section: 'A',
              attendanceDate: new Date(`${fixtures.dates.past1}T00:00:00.000Z`),
              sessionNumber: 1,
            },
          }),
        UNIQUE_VIOLATION,
      );
    });

    it('rejects a second attendance record for the same student and session', async () => {
      await expectConstraintError(
        () =>
          prisma.attendanceRecord.create({
            data: {
              attendanceSessionId: fixtures.sessionIds.past1,
              studentId: fixtures.studentIds.s1,
              attendanceStatus: 'ABSENT',
            },
          }),
        UNIQUE_VIOLATION,
      );
    });
  });

  describe('Referential integrity', () => {
    it('refuses to delete a department that still owns students', async () => {
      await expectConstraintError(
        () => prisma.department.delete({ where: { id: fixtures.departmentId } }),
        FOREIGN_KEY_VIOLATION,
      );
    });

    it('refuses to delete an academic year that still owns subjects', async () => {
      await expectConstraintError(
        () => prisma.academicYear.delete({ where: { id: fixtures.academicYearId } }),
        FOREIGN_KEY_VIOLATION,
      );
    });

    it('cascades the semesters of a deleted academic year', async () => {
      const year = await prisma.academicYear.create({
        data: {
          yearName: '2099',
          startDate: new Date('2099-01-01T00:00:00.000Z'),
          endDate: new Date('2099-12-31T00:00:00.000Z'),
        },
      });
      const semester = await prisma.semester.create({
        data: {
          semesterNumber: 1,
          academicYearId: year.id,
          startDate: new Date('2099-01-01T00:00:00.000Z'),
          endDate: new Date('2099-06-30T00:00:00.000Z'),
        },
      });

      await prisma.academicYear.delete({ where: { id: year.id } });

      const remaining = await prisma.semester.findUnique({ where: { id: semester.id } });
      expect(remaining).toBeNull();
    });

    it('clears the assignment link of a session when the assignment is deleted', async () => {
      const session = await prisma.attendanceSession.findUnique({
        where: { id: fixtures.sessionIds.past1 },
      });
      expect(session?.assignmentId).toBe(fixtures.assignmentIds.cs101A);

      await prisma.facultySubject.delete({ where: { id: fixtures.assignmentIds.cs101A } });

      const after = await prisma.attendanceSession.findUnique({
        where: { id: fixtures.sessionIds.past1 },
      });
      expect(after?.assignmentId).toBeNull();
      expect(after).not.toBeNull();
    });

    it('refuses to delete a student who owns attendance history', async () => {
      await expectConstraintError(
        () => prisma.student.delete({ where: { id: fixtures.studentIds.s1 } }),
        FOREIGN_KEY_VIOLATION,
      );

      const records = await prisma.attendanceRecord.count({
        where: { studentId: fixtures.studentIds.s1 },
      });
      expect(records).toBeGreaterThan(0);
    });
  });

  describe('Transactions', () => {
    it('rolls back every statement when one of them fails', async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.department.create({
            data: { departmentName: 'Rollback Test', departmentCode: 'RBT' },
          });
          throw new Error('simulated failure');
        }),
      ).rejects.toThrow('simulated failure');

      const leftover = await prisma.department.findFirst({
        where: { departmentCode: 'RBT' },
      });
      expect(leftover).toBeNull();
    });

    it('rolls back an atomic batch when a later statement violates a constraint', async () => {
      await expect(
        prisma.$transaction([
          prisma.department.create({
            data: { departmentName: 'Batch Test', departmentCode: 'BAT' },
          }),
          prisma.department.create({
            data: { departmentName: 'Duplicate Code', departmentCode: 'CSE' },
          }),
        ]),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

      const leftover = await prisma.department.findFirst({
        where: { departmentCode: 'BAT' },
      });
      expect(leftover).toBeNull();
    });

    it('commits every statement when the batch succeeds', async () => {
      await prisma.$transaction([
        prisma.department.create({
          data: { departmentName: 'Committed Test', departmentCode: 'CMT' },
        }),
      ]);

      const committed = await prisma.department.findFirst({
        where: { departmentCode: 'CMT' },
      });
      expect(committed).not.toBeNull();

      await prisma.department.delete({ where: { id: committed!.id } });
    });
  });

  describe('Indexes', () => {
    it('indexes the columns the attendance queries rely on', async () => {
      expect(await hasIndex('attendance_sessions', ['subject_id'])).toBe(true);
      expect(await hasIndex('attendance_sessions', ['faculty_id'])).toBe(true);
      expect(await hasIndex('attendance_sessions', ['attendance_date'])).toBe(true);
      expect(await hasIndex('attendance_sessions', ['academic_year_id'])).toBe(true);
      expect(await hasIndex('attendance_sessions', ['section_id'])).toBe(true);
    });

    it('indexes the attendance records by student and status', async () => {
      expect(await hasIndex('attendance_records', ['student_id'])).toBe(true);
      expect(await hasIndex('attendance_records', ['attendance_status'])).toBe(true);
    });

    it('indexes the lookup columns used by the list screens', async () => {
      expect(await hasIndex('students', ['department_id'])).toBe(true);
      expect(await hasIndex('students', ['semester_id'])).toBe(true);
      expect(await hasIndex('students', ['section'])).toBe(true);
      expect(await hasIndex('subjects', ['department_id'])).toBe(true);
      expect(await hasIndex('subjects', ['semester_id'])).toBe(true);
      expect(await hasIndex('subjects', ['academic_year_id'])).toBe(true);
      expect(await hasIndex('enrollments', ['subject_id'])).toBe(true);
      expect(await hasIndex('enrollments', ['section_id'])).toBe(true);
      expect(await hasIndex('faculty_subjects', ['subject_id'])).toBe(true);
      expect(await hasIndex('faculty_subjects', ['academic_year_id'])).toBe(true);
      expect(await hasIndex('audit_logs', ['user_id'])).toBe(true);
      expect(await hasIndex('audit_logs', ['entity_type', 'entity_id'])).toBe(true);
      expect(await hasIndex('audit_logs', ['created_at'])).toBe(true);
    });

    it('uses a unique index for the lookup keys', async () => {
      expect(await hasIndex('users', ['email'], true)).toBe(true);
      expect(await hasIndex('students', ['roll_number'], true)).toBe(true);
      expect(await hasIndex('students', ['user_id'], true)).toBe(true);
      expect(await hasIndex('faculty', ['faculty_id'], true)).toBe(true);
      expect(await hasIndex('faculty', ['user_id'], true)).toBe(true);
      expect(await hasIndex('subjects', ['subject_code'], true)).toBe(true);
      expect(await hasIndex('departments', ['department_code'], true)).toBe(true);
      expect(await hasIndex('academic_years', ['year_name'], true)).toBe(true);
    });

    it('uses a unique index for the attendance business keys', async () => {
      expect(
        await hasIndex(
          'attendance_sessions',
          ['subject_id', 'section_id', 'academic_year_id', 'attendance_date', 'session_number'],
          true,
        ),
      ).toBe(true);
      expect(
        await hasIndex('attendance_records', ['attendance_session_id', 'student_id'], true),
      ).toBe(true);
      expect(
        await hasIndex('enrollments', ['student_id', 'subject_id', 'academic_year_id'], true),
      ).toBe(true);
      expect(
        await hasIndex(
          'faculty_subjects',
          ['faculty_id', 'subject_id', 'section_id', 'academic_year_id'],
          true,
        ),
      ).toBe(true);
      expect(
        await hasIndex('sections', ['subject_id', 'section', 'academic_year_id'], true),
      ).toBe(true);
      expect(
        await hasIndex('semesters', ['academic_year_id', 'semester_number'], true),
      ).toBe(true);
    });
  });

  describe('History preservation', () => {
    it('keeps the attendance history of a deactivated student', async () => {
      const before = await prisma.attendanceRecord.count({
        where: { studentId: fixtures.studentIds.s4 },
      });
      expect(before).toBeGreaterThan(0);

      await prisma.user.update({
        where: { id: fixtures.students[3].userId },
        data: { isActive: false },
      });

      const after = await prisma.attendanceRecord.count({
        where: { studentId: fixtures.studentIds.s4 },
      });
      expect(after).toBe(before);

      const student = await prisma.student.findUnique({
        where: { id: fixtures.studentIds.s4 },
        include: { user: true },
      });
      expect(student?.user.isActive).toBe(false);
    });
  });
});
