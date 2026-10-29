/**
 * Seed script for the AttendEase demo database.
 *
 * The script is idempotent: every record is matched on its natural key and
 * updated or skipped if it already exists, so it can be re-run safely.
 *
 *   npm run db:seed
 */
import { PrismaClient, type AttendanceStatus, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dayjs from 'dayjs';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Attend@123';

const DEPARTMENTS = [
  { departmentName: 'Computer Science & Engineering', departmentCode: 'CSE' },
  { departmentName: 'Electronics & Communication Engineering', departmentCode: 'ECE' },
  { departmentName: 'Business Administration', departmentCode: 'MBA' },
];

const FACULTY = [
  { name: 'Dr. Arun Kumar', facultyId: 'FAC-1001', departmentCode: 'CSE', designation: 'Professor & Head' },
  { name: 'Dr. Priya Menon', facultyId: 'FAC-1002', departmentCode: 'ECE', designation: 'Associate Professor' },
  { name: 'Dr. Rahul Deshpande', facultyId: 'FAC-1003', departmentCode: 'MBA', designation: 'Professor' },
  { name: 'Dr. Sneha Iyer', facultyId: 'FAC-1004', departmentCode: 'CSE', designation: 'Assistant Professor' },
  { name: 'Dr. Vikram Rao', facultyId: 'FAC-1005', departmentCode: 'ECE', designation: 'Assistant Professor' },
  { name: 'Dr. Ananya Bose', facultyId: 'FAC-1006', departmentCode: 'MBA', designation: 'Associate Professor' },
];

const STUDENT_NAMES = [
  'Aarav Sharma', 'Diya Patel', 'Ishaan Verma', 'Kavya Nair', 'Rohan Gupta',
  'Ananya Reddy', 'Kabir Singh', 'Meera Joshi', 'Aditya Kumar', 'Sneha Rao',
  'Yash Mehta', 'Pooja Shah', 'Nikhil Agarwal', 'Tara Malhotra', 'Manav Chopra',
  'Riya Srivastava', 'Arjun Pandey', 'Neha Kulkarni', 'Devansh Mishra', 'Priya Menon',
  'Siddharth Jain', 'Aisha Khan', 'Varun Pillai', 'Snehal More', 'Harsh Bansal',
  'Lakshmi Prasad', 'Aryan Thakur', 'Ritika Saxena', 'Karthik Ram', 'Priyanka Bose',
  'Rahul Yadav', 'Megha Dutta', 'Suresh Kumar', 'Nandini Rao', 'Vivek Sharma',
  'Shruti Iyer', 'Manoj Pillai', 'Aditi Deshmukh', 'Rakesh Gupta', 'Sneha Bhardwaj',
  'Kiran Salunkhe', 'Anjali Menon', 'Gaurav Shinde', 'Bhavna Trivedi', 'Sameer Qureshi',
  'Ritika Jain', 'Abhishek Roy', 'Swati Kapoor', 'Naveen Chandra', 'Preeti Varma',
  'Aryan Bhatt', 'Shreya Nanda', 'Harsh Vardhan', 'Divya Kamath', 'Mohit Saxena',
  'Anushka Tiwari', 'Rakesh Pillai', 'Snehal Jadhav', 'Imran Sheikh', 'Kavya Bhatia',
];

interface SubjectSeed {
  subjectCode: string;
  subjectName: string;
  departmentCode: string;
  semesterNumber: number;
  credits: number;
}

const SUBJECTS: SubjectSeed[] = [
  { subjectCode: 'CSE101', subjectName: 'Programming Fundamentals', departmentCode: 'CSE', semesterNumber: 1, credits: 4 },
  { subjectCode: 'CSE102', subjectName: 'Data Structures', departmentCode: 'CSE', semesterNumber: 1, credits: 4 },
  { subjectCode: 'CSE103', subjectName: 'Database Management Systems', departmentCode: 'CSE', semesterNumber: 2, credits: 4 },
  { subjectCode: 'CSE104', subjectName: 'Operating Systems', departmentCode: 'CSE', semesterNumber: 2, credits: 3 },
  { subjectCode: 'CSE105', subjectName: 'Computer Networks', departmentCode: 'CSE', semesterNumber: 3, credits: 3 },
  { subjectCode: 'CSE106', subjectName: 'Software Engineering', departmentCode: 'CSE', semesterNumber: 3, credits: 3 },
  { subjectCode: 'ECE101', subjectName: 'Basic Electrical Engineering', departmentCode: 'ECE', semesterNumber: 1, credits: 4 },
  { subjectCode: 'ECE102', subjectName: 'Digital Signal Processing', departmentCode: 'ECE', semesterNumber: 2, credits: 4 },
  { subjectCode: 'ECE103', subjectName: 'Microcontrollers & Embedded Systems', departmentCode: 'ECE', semesterNumber: 2, credits: 3 },
  { subjectCode: 'ECE104', subjectName: 'Communication Systems', departmentCode: 'ECE', semesterNumber: 3, credits: 3 },
  { subjectCode: 'MBA101', subjectName: 'Principles of Management', departmentCode: 'MBA', semesterNumber: 1, credits: 3 },
  { subjectCode: 'MBA102', subjectName: 'Financial Accounting', departmentCode: 'MBA', semesterNumber: 2, credits: 4 },
  { subjectCode: 'MBA103', subjectName: 'Marketing Management', departmentCode: 'MBA', semesterNumber: 2, credits: 3 },
  { subjectCode: 'MBA104', subjectName: 'Business Analytics', departmentCode: 'MBA', semesterNumber: 3, credits: 3 },
];

const SECTIONS = ['A', 'B'];
const SESSIONS_PER_SECTION = 10;
const STUDENTS_PER_CLASS = 10;

const EXTRA_FIRST_NAMES = [
  'Abhinav', 'Akshay', 'Amar', 'Aniket', 'Ashwin', 'Balaji', 'Chandan', 'Deepak',
  'Dinesh', 'Ganesh', 'Harish', 'Ishan', 'Jatin', 'Lalit', 'Mahesh', 'Naresh',
  'Omkar', 'Prakash', 'Sagar', 'Tejas', 'Uday', 'Vatsal', 'Yuvan', 'Zoya',
  'Aman', 'Neel', 'Rudra', 'Vihaan', 'Kiaan', 'Reyansh', 'Anaya', 'Advait',
];

const EXTRA_LAST_NAMES = [
  'Ganguly', 'Chatterjee', 'Mukherjee', 'Banerjee', 'Sengupta', 'Bhattacharya',
  'Chowdhury', 'Deshpande', 'Sundaram', 'Balakrishnan', 'Ranganathan', 'Vasudevan',
  'Anand', 'Krishnan', 'Bhushan', 'Guha', 'Rastogi', 'Tripathi', 'Upadhyay',
  'Venkatesh', 'Wadhwa', 'Xavier', 'Zaheer', 'Chaturvedi', 'Devaraj', 'Ganesan',
  'Haridas', 'Jaffer', 'Kanwar', 'Lobo',
];

function studentName(index: number): string {
  if (index < STUDENT_NAMES.length) return STUDENT_NAMES[index];
  const offset = index - STUDENT_NAMES.length;
  const first = EXTRA_FIRST_NAMES[offset % EXTRA_FIRST_NAMES.length];
  const last = EXTRA_LAST_NAMES[Math.floor(offset / EXTRA_FIRST_NAMES.length) % EXTRA_LAST_NAMES.length];
  return `${first} ${last}`;
}

function hashSeed(...parts: (string | number)[]): number {
  const key = parts.join('|');
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function emailFor(name: string, domain: string): string {
  const base = name
    .toLowerCase()
    .replace(/^(dr|mr|mrs|ms)\.?\s+/, '')
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .join('.');
  return `${base}@${domain}`;
}

async function main() {
  console.log('[seed] starting');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // ---------------------------------------------------------------- admin
  await prisma.user.upsert({
    where: { email: 'admin@attendease.edu' },
    update: { name: 'System Administrator', isActive: true, role: 'ADMIN' },
    create: {
      name: 'System Administrator',
      email: 'admin@attendease.edu',
      passwordHash,
      role: 'ADMIN',
    },
  });
  console.log('[seed] admin ready');

  // ----------------------------------------------------------- departments
  const departmentByCode = new Map<string, number>();
  for (const department of DEPARTMENTS) {
    const record = await prisma.department.upsert({
      where: { departmentCode: department.departmentCode },
      update: { departmentName: department.departmentName },
      create: department,
    });
    departmentByCode.set(department.departmentCode, record.id);
  }
  console.log('[seed] departments ready');

  // -------------------------------------------------------- academic years
  const year2024 = await prisma.academicYear.upsert({
    where: { yearName: '2024-25' },
    update: {},
    create: {
      yearName: '2024-25',
      startDate: new Date('2024-08-01T00:00:00.000Z'),
      endDate: new Date('2025-05-31T00:00:00.000Z'),
      isActive: false,
    },
  });

  const year2025 = await prisma.academicYear.upsert({
    where: { yearName: '2025-26' },
    update: { isActive: true },
    create: {
      yearName: '2025-26',
      startDate: new Date('2025-08-01T00:00:00.000Z'),
      endDate: new Date('2026-05-31T00:00:00.000Z'),
      isActive: true,
    },
  });

  const semesterByKey = new Map<string, number>();
  const semesterPlan: { yearId: number; number: number; start: string; end: string; active: boolean }[] = [
    { yearId: year2024.id, number: 1, start: '2024-08-01', end: '2024-12-15', active: false },
    { yearId: year2024.id, number: 2, start: '2025-01-05', end: '2025-05-31', active: false },
    { yearId: year2025.id, number: 1, start: '2025-08-01', end: '2025-12-15', active: true },
    { yearId: year2025.id, number: 2, start: '2026-01-05', end: '2026-05-31', active: true },
    { yearId: year2025.id, number: 3, start: '2026-06-01', end: '2026-07-31', active: true },
  ];

  for (const plan of semesterPlan) {
    const semester = await prisma.semester.upsert({
      where: {
        semester_number_per_year: {
          academicYearId: plan.yearId,
          semesterNumber: plan.number,
        },
      },
      update: { isActive: plan.active },
      create: {
        academicYearId: plan.yearId,
        semesterNumber: plan.number,
        startDate: new Date(`${plan.start}T00:00:00.000Z`),
        endDate: new Date(`${plan.end}T00:00:00.000Z`),
        isActive: plan.active,
      },
    });
    semesterByKey.set(`${plan.yearId}:${plan.number}`, semester.id);
  }
  console.log('[seed] academic years and semesters ready');

  // -------------------------------------------------------------- subjects
  interface SubjectRecord {
    id: number;
    subjectCode: string;
    semesterId: number;
    departmentId: number;
  }
  const subjectRecords = new Map<string, SubjectRecord>();

  for (const subject of SUBJECTS) {
    const semesterId = semesterByKey.get(`${year2025.id}:${subject.semesterNumber}`);
    const departmentId = departmentByCode.get(subject.departmentCode);
    if (!semesterId || !departmentId) continue;

    const record = await prisma.subject.upsert({
      where: { subjectCode: subject.subjectCode },
      update: { subjectName: subject.subjectName, credits: subject.credits },
      create: {
        subjectCode: subject.subjectCode,
        subjectName: subject.subjectName,
        departmentId,
        semesterId,
        academicYearId: year2025.id,
        credits: subject.credits,
        isActive: true,
      },
    });
    subjectRecords.set(subject.subjectCode, {
      id: record.id,
      subjectCode: record.subjectCode,
      semesterId,
      departmentId,
    });
  }
  console.log('[seed] subjects ready');

  // -------------------------------------------------------------- sections
  const sectionIds: { subjectCode: string; section: string; id: number }[] = [];
  for (const subject of SUBJECTS) {
    const record = subjectRecords.get(subject.subjectCode);
    if (!record) continue;
    for (const section of SECTIONS) {
      const created = await prisma.section.upsert({
        where: {
          unique_section_offering: {
            subjectId: record.id,
            section,
            academicYearId: year2025.id,
          },
        },
        update: {},
        create: {
          subjectId: record.id,
          section,
          academicYearId: year2025.id,
        },
      });
      sectionIds.push({ subjectCode: subject.subjectCode, section, id: created.id });
    }
  }
  console.log('[seed] sections ready');

  // ---------------------------------------------------------------- faculty
  const facultyByCode = new Map<string, number>();
  for (const member of FACULTY) {
    const departmentId = departmentByCode.get(member.departmentCode)!;
    const email = emailFor(member.name, 'faculty.attendease.edu');

    const user = await prisma.user.upsert({
      where: { email },
      update: { name: member.name, isActive: true, role: 'FACULTY' },
      create: { name: member.name, email, passwordHash, role: 'FACULTY' },
    });

    const faculty = await prisma.faculty.upsert({
      where: { facultyId: member.facultyId },
      update: { designation: member.designation, departmentId },
      create: {
        userId: user.id,
        facultyId: member.facultyId,
        departmentId,
        designation: member.designation,
      },
    });
    facultyByCode.set(member.facultyId, faculty.id);
  }
  console.log('[seed] faculty ready');

  // --------------------------------------------------------------- students
  // One class group per (department, semester, section). Every group holds
  // STUDENTS_PER_CLASS students so each subject roster has a realistic size.
  const departmentsByCode = [...departmentByCode.entries()];
  const classGroups: {
    departmentCode: string;
    departmentId: number;
    semesterNumber: number;
    semesterId: number;
    section: string;
  }[] = [];

  for (let group = 0; group < DEPARTMENTS.length * 3 * SECTIONS.length; group += 1) {
    const [departmentCode, departmentId] = departmentsByCode[group % departmentsByCode.length];
    const semesterNumber = (Math.floor(group / departmentsByCode.length) % 3) + 1;
    const section = SECTIONS[Math.floor(group / (departmentsByCode.length * 3))];
    const semesterId = semesterByKey.get(`${year2025.id}:${semesterNumber}`)!;
    classGroups.push({ departmentCode, departmentId, semesterNumber, semesterId, section });
  }

  const studentIds: {
    id: number;
    rollNumber: string;
    departmentCode: string;
    semesterNumber: number;
    section: string;
  }[] = [];

  let studentIndex = 0;
  for (const group of classGroups) {
    for (let seat = 1; seat <= STUDENTS_PER_CLASS; seat += 1) {
      const name = studentName(studentIndex);
      const email = emailFor(name, 'students.attendease.edu');
      const rollNumber = `${group.departmentCode}${group.semesterNumber}${group.section}${String(seat).padStart(2, '0')}`;

      const user = await prisma.user.upsert({
        where: { email },
        update: { name, isActive: true, role: 'STUDENT' },
        create: { name, email, passwordHash, role: 'STUDENT' },
      });

      const student = await prisma.student.upsert({
        where: { rollNumber },
        update: { section: group.section, semesterId: group.semesterId, departmentId: group.departmentId },
        create: {
          userId: user.id,
          rollNumber,
          departmentId: group.departmentId,
          semesterId: group.semesterId,
          section: group.section,
          admissionYear: 2025,
        },
      });

      studentIds.push({
        id: student.id,
        rollNumber,
        departmentCode: group.departmentCode,
        semesterNumber: group.semesterNumber,
        section: group.section,
      });
      studentIndex += 1;
    }
  }
  console.log(`[seed] ${studentIds.length} students ready`);

  // --------------------------------------------------- faculty assignments
  const facultyList = FACULTY.map((m) => ({ ...m, id: facultyByCode.get(m.facultyId)! }));

  for (const section of sectionIds) {
    const subject = SUBJECTS.find((s) => s.subjectCode === section.subjectCode)!;
    const candidates = facultyList.filter((f) => f.departmentCode === subject.departmentCode);
    const chosen = candidates[sectionIds.filter((s) => s.subjectCode === section.subjectCode).indexOf(section) % candidates.length];

    await prisma.facultySubject.upsert({
      where: {
        unique_faculty_subject_assignment: {
          facultyId: chosen.id,
          subjectId: subjectRecords.get(section.subjectCode)!.id,
          sectionId: section.id,
          academicYearId: year2025.id,
        },
      },
      update: {},
      create: {
        facultyId: chosen.id,
        subjectId: subjectRecords.get(section.subjectCode)!.id,
        sectionId: section.id,
        academicYearId: year2025.id,
      },
    });
  }
  console.log('[seed] faculty assignments ready');

  // ---------------------------------------------------------- enrollments
  // A student is enrolled in every subject of their department that belongs to
  // their current semester, in the section they belong to.
  for (const student of studentIds) {
    const codes = SUBJECTS.filter(
      (subject) =>
        subject.departmentCode === student.departmentCode &&
        subject.semesterNumber === student.semesterNumber,
    ).map((subject) => subject.subjectCode);

    for (const code of codes) {
      const subject = subjectRecords.get(code)!;
      const section = sectionIds.find(
        (s) => s.subjectCode === code && s.section === student.section,
      )!;

      await prisma.enrollment.upsert({
        where: {
          unique_student_subject_enrollment: {
            studentId: student.id,
            subjectId: subject.id,
            academicYearId: year2025.id,
          },
        },
        update: { sectionId: section.id },
        create: {
          studentId: student.id,
          subjectId: subject.id,
          academicYearId: year2025.id,
          sectionId: section.id,
        },
      });
    }
  }
  console.log('[seed] enrollments ready');

  // --------------------------------------------------- attendance history
  const assignments = await prisma.facultySubject.findMany({
    where: { academicYearId: year2025.id },
    include: { section: true, subject: { select: { subjectCode: true } } },
  });

  let sessionCount = 0;
  let recordCount = 0;

  for (const assignment of assignments) {
    const enrolled = await prisma.enrollment.findMany({
      where: { subjectId: assignment.subjectId, sectionId: assignment.sectionId },
      select: { studentId: true },
    });
    if (enrolled.length === 0) continue;

    // Each subject has its own attendance culture so the reports show real
    // differences between subjects instead of a single uniform number.
    const subjectRand = mulberry32(hashSeed('subject', assignment.subject.subjectCode));
    const subjectPresentRate = 0.72 + subjectRand() * 0.16;

    for (let sessionNumber = 1; sessionNumber <= SESSIONS_PER_SECTION; sessionNumber += 1) {
      const date = dayjs().subtract((SESSIONS_PER_SECTION - sessionNumber + 2) * 7, 'day');
      const attendanceDate = new Date(`${date.format('YYYY-MM-DD')}T00:00:00.000Z`);

      const existing = await prisma.attendanceSession.findUnique({
        where: {
          unique_session_slot: {
            subjectId: assignment.subjectId,
            sectionId: assignment.sectionId,
            academicYearId: year2025.id,
            attendanceDate,
            sessionNumber,
          },
        },
      });
      if (existing) continue;

      const session = await prisma.attendanceSession.create({
        data: {
          subjectId: assignment.subjectId,
          facultyId: assignment.facultyId,
          academicYearId: year2025.id,
          sectionId: assignment.sectionId,
          section: assignment.section.section,
          attendanceDate,
          startTime: '09:00 AM',
          endTime: '10:00 AM',
          sessionNumber,
          topic: `Lecture ${sessionNumber}`,
          assignmentId: assignment.id,
          createdById: null,
        },
      });
      sessionCount += 1;

      const rows = enrolled.map((enrollment) => {
        const rand = mulberry32(
          hashSeed(assignment.subject.subjectCode, sessionNumber, enrollment.studentId),
        );
        const roll = rand();
        // A slice of the cohort is chronically absent, which is what the
        // low-attendance report and the student warning banner are for.
        const chronicAbsentee = enrollment.studentId % 9 === 0 ? 0.28 : 0;
        const presentRate = Math.max(0.35, subjectPresentRate - chronicAbsentee);

        let status: AttendanceStatus;
        if (roll < presentRate) status = 'PRESENT';
        else if (roll < presentRate + 0.08) status = 'ABSENT';
        else if (roll < presentRate + 0.19) status = 'LATE';
        else status = 'ON_LEAVE';

        return {
          attendanceSessionId: session.id,
          studentId: enrollment.studentId,
          attendanceStatus: status,
          markedById: null,
        };
      });

      await prisma.attendanceRecord.createMany({ data: rows });
      recordCount += rows.length;
    }
  }

  console.log(
    `[seed] attendance ready: ${sessionCount} new sessions, ${recordCount} new records`,
  );

  // Sessions created before assignment tracking existed carry no assignmentId.
  const orphanSessions = await prisma.attendanceSession.findMany({
    where: { assignmentId: null },
    select: { id: true, subjectId: true, sectionId: true, academicYearId: true },
  });

  let linked = 0;
  for (const session of orphanSessions) {
    const match = assignments.find(
      (assignment) =>
        assignment.subjectId === session.subjectId &&
        assignment.sectionId === session.sectionId &&
        assignment.academicYearId === session.academicYearId,
    );
    if (!match) continue;
    await prisma.attendanceSession.update({
      where: { id: session.id },
      data: { assignmentId: match.id },
    });
    linked += 1;
  }
  if (linked > 0) console.log(`[seed] linked ${linked} sessions to their assignment`);

  const [students, faculty, subjects, sessions, records] = await Promise.all([
    prisma.student.count(),
    prisma.faculty.count(),
    prisma.subject.count(),
    prisma.attendanceSession.count(),
    prisma.attendanceRecord.count(),
  ]);

  console.log('[seed] summary', {
    students,
    faculty,
    subjects,
    sessions,
    records,
  });
  console.log('[seed] done. demo password for every demo account:', DEMO_PASSWORD);
}

main()
  .catch((error) => {
    console.error('[seed] failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
