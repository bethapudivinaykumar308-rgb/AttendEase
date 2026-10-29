import { prisma } from '../../src/config/prisma.js';
import { hashPassword } from '../../src/services/auth.service.js';

/** Every fixture account uses this password. */
export const TEST_PASSWORD = 'Test@12345';

const TABLES = [
  'attendance_records',
  'attendance_sessions',
  'enrollments',
  'faculty_subjects',
  'sections',
  'subjects',
  'students',
  'faculty',
  'semesters',
  'academic_years',
  'departments',
  'password_reset_tokens',
  'audit_logs',
  'users',
];

/**
 * Empties every table in the test schema. Foreign key checks are disabled for
 * the duration of the transaction so the order of the deletes does not matter.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0'),
    ...TABLES.map((table) => prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``)),
    prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1'),
  ]);
}

export interface TestAccount {
  id: number;
  userId: number;
  name: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'FACULTY' | 'STUDENT';
  rollNumber?: string;
}

export interface Fixtures {
  admin: TestAccount;
  facultyAlice: TestAccount;
  facultyBob: TestAccount;
  students: TestAccount[];
  departmentId: number;
  departmentCode: string;
  academicYearId: number;
  semester1Id: number;
  semester2Id: number;
  subjectIds: { cs101: number; cs102: number; cs201: number };
  sectionIds: { cs101A: number; cs101B: number; cs201A: number };
  facultyIds: { alice: number; bob: number };
  studentIds: { s1: number; s2: number; s3: number; s4: number };
  assignmentIds: { cs101A: number; cs101B: number; cs201A: number };
  sessionIds: {
    past1: number;
    past2: number;
    past3: number;
    cancelled: number;
    future: number;
    bobPast1: number;
    bobPast2: number;
    dbms1: number;
    dbms2: number;
  };
  dates: { past1: string; past2: string; past3: string; cancelled: string; future: string };
}

function utcDate(offsetDays: number): Date {
  const base = new Date();
  const date = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + offsetDays, 0, 0, 0, 0),
  );
  return date;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Builds a small but complete academic graph:
 *
 *  * 1 department, 2 semesters, 3 subjects, 3 section offerings
 *  * 1 admin, 2 faculty, 4 students
 *  * 3 faculty-subject assignments, 6 enrollments
 *  * 8 attendance sessions covering past / cancelled / future cases
 */
export async function seedFixtures(): Promise<Fixtures> {
  await resetDatabase();

  const passwordHash = await hashPassword(TEST_PASSWORD);

  const department = await prisma.department.create({
    data: { departmentName: 'Computer Science', departmentCode: 'CSE' },
  });

  const academicYear = await prisma.academicYear.create({
    data: {
      yearName: '2026',
      startDate: utcDate(-120),
      endDate: utcDate(120),
      isActive: true,
    },
  });

  const semester1 = await prisma.semester.create({
    data: {
      semesterNumber: 1,
      academicYearId: academicYear.id,
      startDate: utcDate(-120),
      endDate: utcDate(-30),
      isActive: true,
    },
  });

  const semester2 = await prisma.semester.create({
    data: {
      semesterNumber: 2,
      academicYearId: academicYear.id,
      startDate: utcDate(-30),
      endDate: utcDate(120),
      isActive: true,
    },
  });

  const cs101 = await prisma.subject.create({
    data: {
      subjectCode: 'CS101',
      subjectName: 'Programming Fundamentals',
      departmentId: department.id,
      semesterId: semester1.id,
      academicYearId: academicYear.id,
      credits: 4,
    },
  });

  const cs102 = await prisma.subject.create({
    data: {
      subjectCode: 'CS102',
      subjectName: 'Data Structures',
      departmentId: department.id,
      semesterId: semester1.id,
      academicYearId: academicYear.id,
      credits: 4,
    },
  });

  const cs201 = await prisma.subject.create({
    data: {
      subjectCode: 'CS201',
      subjectName: 'Database Management Systems',
      departmentId: department.id,
      semesterId: semester2.id,
      academicYearId: academicYear.id,
      credits: 4,
    },
  });

  const cs101A = await prisma.section.create({
    data: { subjectId: cs101.id, section: 'A', academicYearId: academicYear.id },
  });
  const cs101B = await prisma.section.create({
    data: { subjectId: cs101.id, section: 'B', academicYearId: academicYear.id },
  });
  const cs201A = await prisma.section.create({
    data: { subjectId: cs201.id, section: 'A', academicYearId: academicYear.id },
  });

  const adminUser = await prisma.user.create({
    data: {
      name: 'Ada Administrator',
      email: 'admin@attendease.test',
      passwordHash,
      role: 'ADMIN',
    },
  });

  const aliceUser = await prisma.user.create({
    data: {
      name: 'Alice Faculty',
      email: 'alice@attendease.test',
      passwordHash,
      role: 'FACULTY',
    },
  });
  const bobUser = await prisma.user.create({
    data: {
      name: 'Bob Faculty',
      email: 'bob@attendease.test',
      passwordHash,
      role: 'FACULTY',
    },
  });

  const alice = await prisma.faculty.create({
    data: {
      userId: aliceUser.id,
      facultyId: 'FAC001',
      departmentId: department.id,
      designation: 'Senior Lecturer',
    },
  });
  const bob = await prisma.faculty.create({
    data: {
      userId: bobUser.id,
      facultyId: 'FAC002',
      departmentId: department.id,
      designation: 'Lecturer',
    },
  });

  const studentRows = [
    { name: 'Sita Sharma', email: 's1@attendease.test', rollNumber: 'CS1A01', section: 'A' },
    { name: 'Ravi Kumar', email: 's2@attendease.test', rollNumber: 'CS1A02', section: 'A' },
    { name: 'Gita Menon', email: 's3@attendease.test', rollNumber: 'CS1B01', section: 'B' },
    { name: 'Anil Verma', email: 's4@attendease.test', rollNumber: 'CS1B02', section: 'B' },
  ];

  const students: TestAccount[] = [];
  for (const row of studentRows) {
    const user = await prisma.user.create({
      data: { name: row.name, email: row.email, passwordHash, role: 'STUDENT' },
    });
    const student = await prisma.student.create({
      data: {
        userId: user.id,
        rollNumber: row.rollNumber,
        departmentId: department.id,
        semesterId: semester1.id,
        section: row.section,
        admissionYear: 2025,
      },
    });
    students.push({
      id: student.id,
      userId: user.id,
      name: row.name,
      email: row.email,
      password: TEST_PASSWORD,
      role: 'STUDENT',
      rollNumber: row.rollNumber,
    });
  }

  const cs101AAssignment = await prisma.facultySubject.create({
    data: {
      facultyId: alice.id,
      subjectId: cs101.id,
      sectionId: cs101A.id,
      academicYearId: academicYear.id,
    },
  });
  const cs101BAssignment = await prisma.facultySubject.create({
    data: {
      facultyId: bob.id,
      subjectId: cs101.id,
      sectionId: cs101B.id,
      academicYearId: academicYear.id,
    },
  });
  const cs201AAssignment = await prisma.facultySubject.create({
    data: {
      facultyId: alice.id,
      subjectId: cs201.id,
      sectionId: cs201A.id,
      academicYearId: academicYear.id,
    },
  });

  const [s1, s2, s3, s4] = students;

  await prisma.enrollment.createMany({
    data: [
      { studentId: s1.id, subjectId: cs101.id, sectionId: cs101A.id, academicYearId: academicYear.id },
      { studentId: s2.id, subjectId: cs101.id, sectionId: cs101A.id, academicYearId: academicYear.id },
      { studentId: s3.id, subjectId: cs101.id, sectionId: cs101B.id, academicYearId: academicYear.id },
      { studentId: s4.id, subjectId: cs101.id, sectionId: cs101B.id, academicYearId: academicYear.id },
      { studentId: s1.id, subjectId: cs201.id, sectionId: cs201A.id, academicYearId: academicYear.id },
      { studentId: s2.id, subjectId: cs201.id, sectionId: cs201A.id, academicYearId: academicYear.id },
    ],
  });

  const past1Date = utcDate(-10);
  const past2Date = utcDate(-20);
  const past3Date = utcDate(-15);
  const cancelledDate = utcDate(-5);
  const futureDate = utcDate(5);

  const past1 = await prisma.attendanceSession.create({
    data: {
      subjectId: cs101.id,
      facultyId: alice.id,
      academicYearId: academicYear.id,
      sectionId: cs101A.id,
      section: 'A',
      attendanceDate: past1Date,
      startTime: '09:00',
      endTime: '10:00',
      topic: 'Introduction to programming',
      sessionNumber: 1,
      assignmentId: cs101AAssignment.id,
      createdById: aliceUser.id,
    },
  });

  const past2 = await prisma.attendanceSession.create({
    data: {
      subjectId: cs101.id,
      facultyId: alice.id,
      academicYearId: academicYear.id,
      sectionId: cs101A.id,
      section: 'A',
      attendanceDate: past2Date,
      startTime: '09:00',
      endTime: '10:00',
      topic: 'Control flow',
      sessionNumber: 1,
      assignmentId: cs101AAssignment.id,
      createdById: aliceUser.id,
    },
  });

  const past3 = await prisma.attendanceSession.create({
    data: {
      subjectId: cs101.id,
      facultyId: alice.id,
      academicYearId: academicYear.id,
      sectionId: cs101A.id,
      section: 'A',
      attendanceDate: past3Date,
      startTime: '09:00',
      endTime: '10:00',
      topic: 'Functions and scope',
      sessionNumber: 2,
      assignmentId: cs101AAssignment.id,
      createdById: aliceUser.id,
    },
  });

  const cancelled = await prisma.attendanceSession.create({
    data: {
      subjectId: cs101.id,
      facultyId: alice.id,
      academicYearId: academicYear.id,
      sectionId: cs101A.id,
      section: 'A',
      attendanceDate: cancelledDate,
      startTime: '09:00',
      endTime: '10:00',
      topic: 'Cancelled session',
      sessionNumber: 3,
      isCancelled: true,
      assignmentId: cs101AAssignment.id,
      createdById: aliceUser.id,
    },
  });

  const future = await prisma.attendanceSession.create({
    data: {
      subjectId: cs101.id,
      facultyId: alice.id,
      academicYearId: academicYear.id,
      sectionId: cs101A.id,
      section: 'A',
      attendanceDate: futureDate,
      startTime: '09:00',
      endTime: '10:00',
      topic: 'Scheduled session',
      sessionNumber: 1,
      assignmentId: cs101AAssignment.id,
      createdById: aliceUser.id,
    },
  });

  const bobPast1 = await prisma.attendanceSession.create({
    data: {
      subjectId: cs101.id,
      facultyId: bob.id,
      academicYearId: academicYear.id,
      sectionId: cs101B.id,
      section: 'B',
      attendanceDate: utcDate(-12),
      startTime: '11:00',
      endTime: '12:00',
      topic: 'Bob session one',
      sessionNumber: 1,
      assignmentId: cs101BAssignment.id,
      createdById: bobUser.id,
    },
  });

  const bobPast2 = await prisma.attendanceSession.create({
    data: {
      subjectId: cs101.id,
      facultyId: bob.id,
      academicYearId: academicYear.id,
      sectionId: cs101B.id,
      section: 'B',
      attendanceDate: utcDate(-18),
      startTime: '11:00',
      endTime: '12:00',
      topic: 'Bob session two',
      sessionNumber: 1,
      assignmentId: cs101BAssignment.id,
      createdById: bobUser.id,
    },
  });

  const dbms1 = await prisma.attendanceSession.create({
    data: {
      subjectId: cs201.id,
      facultyId: alice.id,
      academicYearId: academicYear.id,
      sectionId: cs201A.id,
      section: 'A',
      attendanceDate: utcDate(-8),
      startTime: '14:00',
      endTime: '15:00',
      topic: 'Relational model',
      sessionNumber: 1,
      assignmentId: cs201AAssignment.id,
      createdById: aliceUser.id,
    },
  });

  const dbms2 = await prisma.attendanceSession.create({
    data: {
      subjectId: cs201.id,
      facultyId: alice.id,
      academicYearId: academicYear.id,
      sectionId: cs201A.id,
      section: 'A',
      attendanceDate: utcDate(-16),
      startTime: '14:00',
      endTime: '15:00',
      topic: 'Normalisation',
      sessionNumber: 1,
      assignmentId: cs201AAssignment.id,
      createdById: aliceUser.id,
    },
  });

  await prisma.attendanceRecord.createMany({
    data: [
      { attendanceSessionId: past1.id, studentId: s1.id, attendanceStatus: 'PRESENT', markedById: aliceUser.id },
      { attendanceSessionId: past1.id, studentId: s2.id, attendanceStatus: 'ABSENT', markedById: aliceUser.id },
      { attendanceSessionId: past2.id, studentId: s1.id, attendanceStatus: 'LATE', markedById: aliceUser.id },
      { attendanceSessionId: past2.id, studentId: s2.id, attendanceStatus: 'PRESENT', markedById: aliceUser.id },
      { attendanceSessionId: past3.id, studentId: s1.id, attendanceStatus: 'ON_LEAVE', markedById: aliceUser.id },
      { attendanceSessionId: past3.id, studentId: s2.id, attendanceStatus: 'ABSENT', markedById: aliceUser.id },
      { attendanceSessionId: cancelled.id, studentId: s1.id, attendanceStatus: 'PRESENT', markedById: aliceUser.id },
      { attendanceSessionId: cancelled.id, studentId: s2.id, attendanceStatus: 'PRESENT', markedById: aliceUser.id },
      { attendanceSessionId: future.id, studentId: s1.id, attendanceStatus: 'PRESENT', markedById: aliceUser.id },
      { attendanceSessionId: future.id, studentId: s2.id, attendanceStatus: 'PRESENT', markedById: aliceUser.id },
      { attendanceSessionId: bobPast1.id, studentId: s3.id, attendanceStatus: 'PRESENT', markedById: bobUser.id },
      { attendanceSessionId: bobPast1.id, studentId: s4.id, attendanceStatus: 'ABSENT', markedById: bobUser.id },
      { attendanceSessionId: bobPast2.id, studentId: s3.id, attendanceStatus: 'LATE', markedById: bobUser.id },
      { attendanceSessionId: bobPast2.id, studentId: s4.id, attendanceStatus: 'PRESENT', markedById: bobUser.id },
      { attendanceSessionId: dbms1.id, studentId: s1.id, attendanceStatus: 'PRESENT', markedById: aliceUser.id },
      { attendanceSessionId: dbms1.id, studentId: s2.id, attendanceStatus: 'PRESENT', markedById: aliceUser.id },
      { attendanceSessionId: dbms2.id, studentId: s1.id, attendanceStatus: 'PRESENT', markedById: aliceUser.id },
      { attendanceSessionId: dbms2.id, studentId: s2.id, attendanceStatus: 'PRESENT', markedById: aliceUser.id },
    ],
  });

  return {
    admin: {
      id: adminUser.id,
      userId: adminUser.id,
      name: adminUser.name,
      email: adminUser.email,
      password: TEST_PASSWORD,
      role: 'ADMIN',
    },
    facultyAlice: {
      id: alice.id,
      userId: aliceUser.id,
      name: aliceUser.name,
      email: aliceUser.email,
      password: TEST_PASSWORD,
      role: 'FACULTY',
    },
    facultyBob: {
      id: bob.id,
      userId: bobUser.id,
      name: bobUser.name,
      email: bobUser.email,
      password: TEST_PASSWORD,
      role: 'FACULTY',
    },
    students,
    departmentId: department.id,
    departmentCode: department.departmentCode,
    academicYearId: academicYear.id,
    semester1Id: semester1.id,
    semester2Id: semester2.id,
    subjectIds: { cs101: cs101.id, cs102: cs102.id, cs201: cs201.id },
    sectionIds: { cs101A: cs101A.id, cs101B: cs101B.id, cs201A: cs201A.id },
    facultyIds: { alice: alice.id, bob: bob.id },
    studentIds: { s1: s1.id, s2: s2.id, s3: s3.id, s4: s4.id },
    assignmentIds: {
      cs101A: cs101AAssignment.id,
      cs101B: cs101BAssignment.id,
      cs201A: cs201AAssignment.id,
    },
    sessionIds: {
      past1: past1.id,
      past2: past2.id,
      past3: past3.id,
      cancelled: cancelled.id,
      future: future.id,
      bobPast1: bobPast1.id,
      bobPast2: bobPast2.id,
      dbms1: dbms1.id,
      dbms2: dbms2.id,
    },
    dates: {
      past1: toDateOnly(past1Date),
      past2: toDateOnly(past2Date),
      past3: toDateOnly(past3Date),
      cancelled: toDateOnly(cancelledDate),
      future: toDateOnly(futureDate),
    },
  };
}
