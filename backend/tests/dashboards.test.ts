import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { seedFixtures, TEST_PASSWORD, type Fixtures } from './setup/fixtures.js';
import { login, type ApiSession } from './setup/helpers.js';

const app = createApp();
const api = request(app);
let fixtures: Fixtures;
let admin: ApiSession;
let alice: ApiSession;
let bob: ApiSession;
let student: ApiSession;

describe('Dashboards', () => {
  beforeAll(async () => {
    fixtures = await seedFixtures();
    admin = await login(app, fixtures.admin.email, TEST_PASSWORD);
    alice = await login(app, fixtures.facultyAlice.email, TEST_PASSWORD);
    bob = await login(app, fixtures.facultyBob.email, TEST_PASSWORD);
    student = await login(app, fixtures.students[0].email, TEST_PASSWORD);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/dashboard/admin', () => {
    it('reports totals that match the database', async () => {
      const response = await admin.get('/api/dashboard/admin').expect(200);
      const stats = response.body.data.stats;

      expect(stats.totalStudents).toBe(await prisma.student.count());
      expect(stats.totalFaculty).toBe(await prisma.faculty.count());
      expect(stats.totalDepartments).toBe(await prisma.department.count());
      expect(stats.totalSubjects).toBe(await prisma.subject.count());
      // "Total sessions" counts classes actually conducted: past and not cancelled.
      expect(stats.totalSessions).toBe(
        await prisma.attendanceSession.count({
          where: { isCancelled: false, attendanceDate: { lte: new Date() } },
        }),
      );
    });

    it('never returns hardcoded statistics', async () => {
      const before = await admin.get('/api/dashboard/admin').expect(200);

      await prisma.department.create({
        data: { departmentName: 'Electronics', departmentCode: 'ECE' },
      });

      const after = await admin.get('/api/dashboard/admin').expect(200);
      expect(after.body.data.stats.totalDepartments).toBe(
        before.body.data.stats.totalDepartments + 1,
      );
    });

    it('lists the students below the attendance threshold', async () => {
      const response = await admin.get('/api/dashboard/admin').expect(200);
      const rollNumbers = response.body.data.belowThreshold.map(
        (row: { rollNumber: string }) => row.rollNumber,
      );
      expect(rollNumbers).toContain('CS1A02');
      expect(response.body.data.stats.threshold).toBe(75);
    });
    it('returns department and subject attendance breakdowns', async () => {
      const response = await admin.get('/api/dashboard/admin').expect(200);
      expect(response.body.data.departmentAttendance.length).toBeGreaterThan(0);
      expect(response.body.data.subjectAttendance.length).toBeGreaterThan(0);
      expect(response.body.data.trend.length).toBeGreaterThan(0);
    });

    it('records the sign in in the audit trail', async () => {
      const response = await admin.get('/api/dashboard/admin').expect(200);
      const actions = response.body.data.recentAuditLogs.map(
        (log: { action: string }) => log.action,
      );
      expect(actions).toContain('LOGIN');
    });
  });

  describe('GET /api/dashboard/faculty', () => {
    it('reports only the assignments the faculty member teaches', async () => {
      const response = await alice.get('/api/dashboard/faculty').expect(200);

      expect(response.body.data.assignments.length).toBe(2);
      expect(response.body.data.stats.assignedSubjects).toBe(2);
      expect(response.body.data.stats.assignedClasses).toBe(2);
    });

    it('counts the students enrolled in the faculty own classes', async () => {
      const response = await alice.get('/api/dashboard/faculty').expect(200);
      // Alice teaches CS101/A and CS201/A. Both classes enrol the same two
      // students, so the distinct student count is two.
      expect(response.body.data.stats.totalStudents).toBe(2);
      expect(response.body.data.stats.totalEnrollments).toBe(4);
    });

    it('reports the number of sessions held for each assignment', async () => {
      const response = await alice.get('/api/dashboard/faculty').expect(200);

      const cs101 = response.body.data.assignments.find(
        (assignment: { subject: { subjectCode: string } }) =>
          assignment.subject.subjectCode === 'CS101',
      );
      // Three classes were held: the cancelled one and the future one are excluded.
      expect(cs101.sessionCount).toBe(3);
    });

    it('returns per assignment attendance statistics', async () => {
      const response = await alice.get('/api/dashboard/faculty').expect(200);
      const statistics = response.body.data.assignmentStatistics;

      expect(statistics.length).toBe(2);
      const cs101 = statistics.find(
        (entry: { assignmentId: number }) => entry.assignmentId === fixtures.assignmentIds.cs101A,
      );
      // Three held classes, six attendance marks (two students per class).
      expect(cs101.totalClasses).toBe(3);
      expect(cs101.totalRecords).toBe(6);
      expect(cs101.present).toBe(2);
      expect(cs101.absent).toBe(2);
      expect(cs101.late).toBe(1);
      expect(cs101.onLeave).toBe(1);
      expect(cs101.percentage).toBe(50);
    });

    it('scopes a second faculty member to their own classes', async () => {
      const response = await bob.get('/api/dashboard/faculty').expect(200);
      expect(response.body.data.assignments.length).toBe(1);
      expect(response.body.data.stats.totalStudents).toBe(2);
    });
  });

  describe('GET /api/dashboard/student', () => {
    it('reports the student own overall attendance', async () => {
      const response = await student.get('/api/dashboard/student').expect(200);

      expect(response.body.data.overall.total).toBe(5);
      expect(response.body.data.overall.attended).toBe(4);
      expect(response.body.data.overall.percentage).toBe(80);
    });

    it('returns a card per subject', async () => {
      const response = await student.get('/api/dashboard/student').expect(200);
      expect(response.body.data.subjects.length).toBe(2);
      expect(response.body.data.subjects.map((subject: { subjectCode: string }) => subject.subjectCode).sort()).toEqual(
        ['CS101', 'CS201'],
      );
    });

    it('raises a low attendance alert below the threshold', async () => {
      const lowAttendance = await login(app, fixtures.students[1].email, TEST_PASSWORD);
      const response = await lowAttendance.get('/api/dashboard/student').expect(200);

      expect(response.body.data.alerts.length).toBeGreaterThan(0);
      expect(response.body.data.alerts[0].type).toBe('LOW_ATTENDANCE');
      expect(response.body.data.alerts[0].severity).toBe('critical');
    });

    it('raises no alert for a student above the threshold', async () => {
      const aboveThreshold = await login(app, fixtures.students[2].email, TEST_PASSWORD);
      const response = await aboveThreshold.get('/api/dashboard/student').expect(200);

      expect(response.body.data.alerts.length).toBe(0);
    });

    it('returns a monthly chart series', async () => {
      const response = await student.get('/api/dashboard/student').expect(200);
      expect(response.body.data.monthly.length).toBeGreaterThan(0);
      expect(response.body.data.monthly[0]).toHaveProperty('label');
    });
  });
});
