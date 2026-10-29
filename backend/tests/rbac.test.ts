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
let s1: ApiSession;
let s3: ApiSession;

describe('Role based access control', () => {
  beforeAll(async () => {
    fixtures = await seedFixtures();
    admin = await login(app, fixtures.admin.email, TEST_PASSWORD);
    alice = await login(app, fixtures.facultyAlice.email, TEST_PASSWORD);
    bob = await login(app, fixtures.facultyBob.email, TEST_PASSWORD);
    s1 = await login(app, fixtures.students[0].email, TEST_PASSWORD);
    s3 = await login(app, fixtures.students[2].email, TEST_PASSWORD);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Unauthenticated access', () => {
    it('rejects every protected endpoint with 401', async () => {
      await api.get('/api/students').expect(401);
      await api.get('/api/dashboard/admin').expect(401);
      await api.get('/api/attendance/sessions').expect(401);
      await api.get('/api/reports/types').expect(401);
    });
  });

  describe('Student restrictions', () => {
    it('cannot list students', async () => {
      const response = await s1.get('/api/students').expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('cannot list faculty', async () => {
      await s1.get('/api/faculty').expect(403);
    });

    it('cannot read audit logs', async () => {
      await s1.get('/api/audit-logs').expect(403);
    });

    it('cannot open the admin dashboard', async () => {
      await s1.get('/api/dashboard/admin').expect(403);
    });

    it('can open the student dashboard', async () => {
      const response = await s1.get('/api/dashboard/student').expect(200);
      expect(response.body.success).toBe(true);
    });

    it('cannot open the faculty dashboard', async () => {
      await s1.get('/api/dashboard/faculty').expect(403);
    });

    it('can read its own student record', async () => {
      const response = await s1.get(`/api/students/${fixtures.studentIds.s1}`).expect(200);
      expect(response.body.data.rollNumber).toBe('CS1A01');
    });

    it('cannot read another student record', async () => {
      const response = await s1.get(`/api/students/${fixtures.studentIds.s3}`).expect(403);
      expect(response.body.error.message).toMatch(/only view your own/i);
    });

    it('can read its own attendance summary', async () => {
      const response = await s1
        .get(`/api/attendance/student/${fixtures.studentIds.s1}`)
        .expect(200);
      expect(response.body.data.student.rollNumber).toBe('CS1A01');
    });

    it('cannot read another student attendance summary', async () => {
      const response = await s1
        .get(`/api/attendance/student/${fixtures.studentIds.s3}`)
        .expect(403);
      expect(response.body.error.message).toMatch(/only view your own/i);
    });

    it('is pinned to its own records when listing attendance records', async () => {
      const response = await s1
        .get(`/api/attendance/records?studentId=${fixtures.studentIds.s3}&pageSize=100`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      const owners = new Set<number>(
        response.body.data.map((record: { studentId: number }) => record.studentId),
      );
      expect([...owners]).toEqual([fixtures.studentIds.s1]);
    });

    it('cannot open a session roster', async () => {
      const response = await s1.get(`/api/attendance/sessions/${fixtures.sessionIds.past1}`).expect(403);
      expect(response.body.error.message).toMatch(/only view your own attendance records/i);
    });

    it('cannot create an attendance session', async () => {
      await s1
        .post('/api/attendance/sessions')
        .send({
          subjectId: fixtures.subjectIds.cs101,
          sectionId: fixtures.sectionIds.cs101A,
          attendanceDate: fixtures.dates.past1,
          sessionNumber: 9,
        })
        .expect(403);
    });

    it('cannot submit attendance records', async () => {
      await s1
        .post(`/api/attendance/sessions/${fixtures.sessionIds.past1}/records`)
        .send({
          records: [{ studentId: fixtures.studentIds.s1, attendanceStatus: 'PRESENT' }],
        })
        .expect(403);
    });

    it('sees no teaching assignments', async () => {
      const response = await s1.get('/api/assignments').expect(200);
      expect(response.body.data).toEqual([]);
    });

    it('sees only its own enrollments', async () => {
      const response = await s1.get('/api/enrollments?pageSize=100').expect(200);
      const students = new Set<number>(
        response.body.data.map((row: { studentId: number }) => row.studentId),
      );
      expect([...students]).toEqual([fixtures.studentIds.s1]);
    });

    it('cannot read a subject roster', async () => {
      await s1.get(`/api/enrollments/subject/${fixtures.subjectIds.cs101}`).expect(403);
    });

    it('cannot export the student list', async () => {
      await s1.get('/api/students/export').expect(403);
    });
  });

  describe('Faculty restrictions', () => {
    it('cannot list students', async () => {
      await alice.get('/api/students').expect(403);
    });

    it('cannot read audit logs', async () => {
      await alice.get('/api/audit-logs').expect(403);
    });

    it('cannot open the admin dashboard', async () => {
      await alice.get('/api/dashboard/admin').expect(403);
    });

    it('can open the faculty dashboard', async () => {
      await alice.get('/api/dashboard/faculty').expect(200);
    });

    it('cannot open the student dashboard', async () => {
      await alice.get('/api/dashboard/student').expect(403);
    });

    it('sees only its own teaching assignments', async () => {
      const response = await alice.get('/api/assignments').expect(200);
      const facultyIds = new Set<number>(
        response.body.data.map((row: { facultyId: number }) => row.facultyId),
      );
      expect([...facultyIds]).toEqual([fixtures.facultyIds.alice]);
      expect(response.body.data.length).toBe(2);
    });

    it('sees only its own attendance sessions', async () => {
      const response = await alice.get('/api/attendance/sessions?pageSize=100').expect(200);
      const facultyIds = new Set<number>(
        response.body.data.map((row: { facultyId: number }) => row.facultyId),
      );
      expect([...facultyIds]).toEqual([fixtures.facultyIds.alice]);
    });

    it('cannot open a session belonging to another faculty member', async () => {
      const response = await alice.get(`/api/attendance/sessions/${fixtures.sessionIds.bobPast1}`).expect(403);
      expect(response.body.error.message).toMatch(/only view sessions for subjects you teach/i);
    });

    it('cannot mark attendance for another faculty member session', async () => {
      const response = await alice
        .post(`/api/attendance/sessions/${fixtures.sessionIds.bobPast1}/records`)
        .send({
          records: [{ studentId: fixtures.studentIds.s3, attendanceStatus: 'PRESENT' }],
        })
        .expect(403);
      expect(response.body.error.message).toMatch(/only mark attendance for subjects you teach/i);
    });

    it('cannot create a session for a subject it does not teach', async () => {
      const response = await alice
        .post('/api/attendance/sessions')
        .send({
          subjectId: fixtures.subjectIds.cs101,
          sectionId: fixtures.sectionIds.cs101B,
          attendanceDate: fixtures.dates.past1,
          sessionNumber: 7,
        })
        .expect(403);
      expect(response.body.error.message).toMatch(/not assigned to teach/i);
    });

    it('cannot view a student that is not enrolled in its classes', async () => {
      const response = await alice.get(`/api/students/${fixtures.studentIds.s3}`).expect(403);
      expect(response.body.error.message).toMatch(/enrolled in the classes you teach/i);
    });

    it('cannot read the attendance of a student outside its classes', async () => {
      const response = await alice
        .get(`/api/students/${fixtures.studentIds.s3}/attendance`)
        .expect(403);
      expect(response.body.error.message).toMatch(/enrolled in the classes you teach/i);
    });

    it('cannot read the attendance summary of a student outside its classes', async () => {
      const response = await alice
        .get(`/api/attendance/student/${fixtures.studentIds.s3}`)
        .expect(403);
      expect(response.body.error.message).toMatch(/do not teach any class/i);
    });

    it('cannot read the roster of a section it does not teach', async () => {
      const response = await alice
        .get(`/api/enrollments/subject/${fixtures.subjectIds.cs101}?sectionId=${fixtures.sectionIds.cs101B}`)
        .expect(200);
      expect(response.body.data).toEqual([]);
    });

    it('sees only enrollments for the classes it teaches', async () => {
      const response = await alice.get('/api/enrollments?pageSize=100').expect(200);
      const sectionIds = new Set<number>(
        response.body.data.map((row: { sectionId: number }) => row.sectionId),
      );
      expect([...sectionIds].sort()).toEqual(
        [fixtures.sectionIds.cs101A, fixtures.sectionIds.cs201A].sort(),
      );
    });

    it('cannot read the student list of another faculty member class', async () => {
      const response = await alice.get(`/api/students/${fixtures.studentIds.s1}`).expect(200);
      expect(response.body.data.rollNumber).toBe('CS1A01');
    });

    it('cannot create students', async () => {
      await alice
        .post('/api/students')
        .send({
          name: 'Nope Student',
          email: 'nope@attendease.test',
          password: 'Test@12345',
          rollNumber: 'CS9Z99',
          departmentId: fixtures.departmentId,
          semesterId: fixtures.semester1Id,
          section: 'A',
          admissionYear: 2026,
        })
        .expect(403);
    });

    it('can see its own class students', async () => {
      const response = await bob.get(`/api/students/${fixtures.studentIds.s3}`).expect(200);
      expect(response.body.data.rollNumber).toBe('CS1B01');
    });
  });

  describe('Administrator access', () => {
    it('can list students', async () => {
      const response = await admin.get('/api/students').expect(200);
      expect(response.body.data.length).toBe(4);
      expect(response.body.meta.total).toBe(4);
    });

    it('can list faculty', async () => {
      const response = await admin.get('/api/faculty').expect(200);
      expect(response.body.meta.total).toBe(2);
    });

    it('can read audit logs', async () => {
      await admin.get('/api/audit-logs').expect(200);
    });

    it('can open only the administrative dashboard', async () => {
      await admin.get('/api/dashboard/admin').expect(200);
      await admin.get('/api/dashboard/faculty').expect(403);
      await admin.get('/api/dashboard/student').expect(403);
    });

    it('can open any session roster', async () => {
      await admin.get(`/api/attendance/sessions/${fixtures.sessionIds.bobPast1}`).expect(200);
    });
  });
});
