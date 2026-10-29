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

function isoDate(offsetDays: number): string {
  const base = new Date();
  const date = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + offsetDays, 0, 0, 0, 0),
  );
  return date.toISOString().slice(0, 10);
}

describe('Attendance workflow', () => {
  beforeAll(async () => {
    fixtures = await seedFixtures();
    admin = await login(app, fixtures.admin.email, TEST_PASSWORD);
    alice = await login(app, fixtures.facultyAlice.email, TEST_PASSWORD);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/attendance/sessions', () => {
    it('creates a session and stores it in MySQL', async () => {
      const response = await alice
        .post('/api/attendance/sessions')
        .send({
          subjectId: fixtures.subjectIds.cs101,
          sectionId: fixtures.sectionIds.cs101A,
          attendanceDate: isoDate(-3),
          startTime: '09:30',
          endTime: '10:30',
          topic: 'Loops and iteration',
          sessionNumber: 4,
        })
        .expect(201);

      expect(response.body.data.id).toBeGreaterThan(0);
      expect(response.body.data.section).toBe('A');
      expect(response.body.data.attendanceDate).toBe(isoDate(-3));

      const stored = await prisma.attendanceSession.findUnique({
        where: { id: response.body.data.id },
      });
      expect(stored).not.toBeNull();
      expect(stored!.topic).toBe('Loops and iteration');
      expect(stored!.assignmentId).toBe(fixtures.assignmentIds.cs101A);
    });

    it('rejects a duplicate session slot with 409', async () => {
      const payload = {
        subjectId: fixtures.subjectIds.cs101,
        sectionId: fixtures.sectionIds.cs101A,
        attendanceDate: isoDate(-3),
        sessionNumber: 4,
      };

      const response = await alice.post('/api/attendance/sessions').send(payload).expect(409);
      expect(response.body.error.code).toBe('CONFLICT');
      expect(response.body.error.message).toMatch(/already exists/i);
    });

    it('rejects a future attendance date with 400', async () => {
      const response = await alice
        .post('/api/attendance/sessions')
        .send({
          subjectId: fixtures.subjectIds.cs101,
          sectionId: fixtures.sectionIds.cs101A,
          attendanceDate: isoDate(3),
          sessionNumber: 1,
        })
        .expect(400);

      expect(response.body.error.message).toMatch(/future date/i);
    });

    it('rejects a section that belongs to a different subject with 400', async () => {
      const response = await alice
        .post('/api/attendance/sessions')
        .send({
          subjectId: fixtures.subjectIds.cs101,
          sectionId: fixtures.sectionIds.cs201A,
          attendanceDate: isoDate(-2),
          sessionNumber: 1,
        })
        .expect(400);

      expect(response.body.error.message).toMatch(/does not belong to the selected subject/i);
    });

    it('rejects a subject with no faculty assignment with 400', async () => {
      const orphanSection = await prisma.section.create({
        data: {
          subjectId: fixtures.subjectIds.cs102,
          section: 'A',
          academicYearId: fixtures.academicYearId,
        },
      });

      const response = await admin
        .post('/api/attendance/sessions')
        .send({
          subjectId: fixtures.subjectIds.cs102,
          sectionId: orphanSection.id,
          attendanceDate: isoDate(-2),
          sessionNumber: 1,
        })
        .expect(400);

      expect(response.body.error.message).toMatch(/No faculty member is assigned/i);
    });

    it('rejects a malformed date with 422', async () => {
      await alice
        .post('/api/attendance/sessions')
        .send({
          subjectId: fixtures.subjectIds.cs101,
          sectionId: fixtures.sectionIds.cs101A,
          attendanceDate: '03-04-2026',
          sessionNumber: 1,
        })
        .expect(422);
    });

    it('rejects a malformed time with 422', async () => {
      await alice
        .post('/api/attendance/sessions')
        .send({
          subjectId: fixtures.subjectIds.cs101,
          sectionId: fixtures.sectionIds.cs101A,
          attendanceDate: isoDate(-2),
          startTime: 'half past nine',
          sessionNumber: 1,
        })
        .expect(422);
    });

    it('rejects a session number outside the allowed range with 422', async () => {
      await alice
        .post('/api/attendance/sessions')
        .send({
          subjectId: fixtures.subjectIds.cs101,
          sectionId: fixtures.sectionIds.cs101A,
          attendanceDate: isoDate(-2),
          sessionNumber: 99,
        })
        .expect(422);
    });
  });

  describe('GET /api/attendance/sessions/:id', () => {
    it('returns the roster with the recorded statuses', async () => {
      const response = await alice
        .get(`/api/attendance/sessions/${fixtures.sessionIds.past1}`)
        .expect(200);

      expect(response.body.data.roster.length).toBe(2);
      expect(response.body.data.roster[0].rollNumber).toBe('CS1A01');
      expect(response.body.data.summary).toMatchObject({ present: 1, absent: 1, unmarked: 0 });
    });

    it('reports unmarked students in the summary', async () => {
      const response = await alice
        .get(`/api/attendance/sessions/${fixtures.sessionIds.dbms1}`)
        .expect(200);
      expect(response.body.data.summary.unmarked).toBe(0);
    });

    it('returns 404 for an unknown session', async () => {
      await alice.get('/api/attendance/sessions/999999').expect(404);
    });
  });

  describe('POST /api/attendance/sessions/:id/records', () => {
    let sessionId: number;

    beforeAll(async () => {
      const created = await alice
        .post('/api/attendance/sessions')
        .send({
          subjectId: fixtures.subjectIds.cs101,
          sectionId: fixtures.sectionIds.cs101A,
          attendanceDate: isoDate(-6),
          sessionNumber: 6,
        })
        .expect(201);
      sessionId = created.body.data.id;
    });

    it('saves the marked statuses and records who marked them', async () => {
      const response = await alice
        .post(`/api/attendance/sessions/${sessionId}/records`)
        .send({
          records: [
            { studentId: fixtures.studentIds.s1, attendanceStatus: 'PRESENT' },
            { studentId: fixtures.studentIds.s2, attendanceStatus: 'ABSENT', remarks: 'Not present' },
          ],
        })
        .expect(200);

      expect(response.body.data.summary).toMatchObject({ present: 1, absent: 1 });
      expect(response.body.data.total).toBe(2);

      const records = await prisma.attendanceRecord.findMany({
        where: { attendanceSessionId: sessionId },
      });
      expect(records.length).toBe(2);
      expect(records.every((record) => record.markedById === fixtures.facultyAlice.userId)).toBe(true);
      expect(records.find((r) => r.studentId === fixtures.studentIds.s2)?.remarks).toBe('Not present');
    });

    it('does not create duplicate records when the same session is submitted twice', async () => {
      await alice
        .post(`/api/attendance/sessions/${sessionId}/records`)
        .send({
          records: [
            { studentId: fixtures.studentIds.s1, attendanceStatus: 'ABSENT' },
            { studentId: fixtures.studentIds.s2, attendanceStatus: 'PRESENT' },
          ],
        })
        .expect(200);

      const records = await prisma.attendanceRecord.findMany({
        where: { attendanceSessionId: sessionId },
      });
      expect(records.length).toBe(2);
      expect(records.find((r) => r.studentId === fixtures.studentIds.s1)?.attendanceStatus).toBe(
        'ABSENT',
      );
    });

    it('rejects a student who is not enrolled in the section', async () => {
      const response = await alice
        .post(`/api/attendance/sessions/${sessionId}/records`)
        .send({
          records: [{ studentId: fixtures.studentIds.s3, attendanceStatus: 'PRESENT' }],
        })
        .expect(400);

      expect(response.body.error.message).toMatch(/not enrolled in this section/i);
    });

    it('rejects the same student twice in one submission', async () => {
      const response = await alice
        .post(`/api/attendance/sessions/${sessionId}/records`)
        .send({
          records: [
            { studentId: fixtures.studentIds.s1, attendanceStatus: 'PRESENT' },
            { studentId: fixtures.studentIds.s1, attendanceStatus: 'ABSENT' },
          ],
        })
        .expect(400);

      expect(response.body.error.message).toMatch(/submitted more than once/i);
    });

    it('rejects an empty submission with 422', async () => {
      await alice.post(`/api/attendance/sessions/${sessionId}/records`).send({ records: [] }).expect(422);
    });

    it('rejects an unknown attendance status with 422', async () => {
      await alice
        .post(`/api/attendance/sessions/${sessionId}/records`)
        .send({
          records: [{ studentId: fixtures.studentIds.s1, attendanceStatus: 'MAYBE' }],
        })
        .expect(422);
    });

    it('rejects a submission for an unknown session with 404', async () => {
      await alice
        .post('/api/attendance/sessions/999999/records')
        .send({
          records: [{ studentId: fixtures.studentIds.s1, attendanceStatus: 'PRESENT' }],
        })
        .expect(404);
    });

    it('rejects a submission for a cancelled session with 400', async () => {
      const response = await alice
        .post(`/api/attendance/sessions/${fixtures.sessionIds.cancelled}/records`)
        .send({
          records: [{ studentId: fixtures.studentIds.s1, attendanceStatus: 'PRESENT' }],
        })
        .expect(400);

      expect(response.body.error.message).toMatch(/cancelled/i);
    });
  });

  describe('PUT /api/attendance/records/:id', () => {
    it('corrects a single record', async () => {
      const record = await prisma.attendanceRecord.findFirstOrThrow({
        where: { attendanceSessionId: fixtures.sessionIds.past1, studentId: fixtures.studentIds.s2 },
      });

      const response = await alice
        .put(`/api/attendance/records/${record.id}`)
        .send({ attendanceStatus: 'ON_LEAVE', remarks: 'Medical leave' })
        .expect(200);

      expect(response.body.data.attendanceStatus).toBe('ON_LEAVE');

      const updated = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: record.id } });
      expect(updated.attendanceStatus).toBe('ON_LEAVE');
      expect(updated.remarks).toBe('Medical leave');
    });

    it('rejects an invalid status with 422', async () => {
      const record = await prisma.attendanceRecord.findFirstOrThrow({
        where: { attendanceSessionId: fixtures.sessionIds.past1 },
      });

      await alice
        .put(`/api/attendance/records/${record.id}`)
        .send({ attendanceStatus: 'SICK' })
        .expect(422);
    });

    it('returns 404 for an unknown record', async () => {
      await alice
        .put('/api/attendance/records/999999')
        .send({ attendanceStatus: 'PRESENT' })
        .expect(404);
    });
  });

  describe('Attendance percentage policy', () => {
    it('produces a monthly breakdown', async () => {
      const response = await admin
        .get(`/api/attendance/student/${fixtures.studentIds.s1}`)
        .expect(200);

      expect(Array.isArray(response.body.data.monthly)).toBe(true);
      expect(response.body.data.monthly.length).toBeGreaterThan(0);
      expect(response.body.data.monthly[0]).toHaveProperty('month');
      expect(response.body.data.monthly[0].breakdown).toHaveProperty('percentage');
    });
  });

  describe('POST /api/attendance/sessions/:id/cancel', () => {
    it('excludes a cancelled session from the attendance percentage', async () => {
      const created = await alice
        .post('/api/attendance/sessions')
        .send({
          subjectId: fixtures.subjectIds.cs101,
          sectionId: fixtures.sectionIds.cs101A,
          attendanceDate: isoDate(-4),
          sessionNumber: 5,
        })
        .expect(201);

      const sessionId = created.body.data.id;

      await alice
        .post(`/api/attendance/sessions/${sessionId}/records`)
        .send({
          records: [
            { studentId: fixtures.studentIds.s1, attendanceStatus: 'PRESENT' },
            { studentId: fixtures.studentIds.s2, attendanceStatus: 'PRESENT' },
          ],
        })
        .expect(200);

      const before = await admin.get(`/api/attendance/student/${fixtures.studentIds.s1}`).expect(200);
      const beforeTotal = before.body.data.subjects.find(
        (subject: { subjectCode: string }) => subject.subjectCode === 'CS101',
      ).breakdown.total;

      await alice.post(`/api/attendance/sessions/${sessionId}/cancel`).expect(200);

      const after = await admin.get(`/api/attendance/student/${fixtures.studentIds.s1}`).expect(200);
      const afterTotal = after.body.data.subjects.find(
        (subject: { subjectCode: string }) => subject.subjectCode === 'CS101',
      ).breakdown.total;

      expect(afterTotal).toBe(beforeTotal - 1);
    });
  });

  describe('GET /api/attendance/records', () => {
    it('paginates the record list', async () => {
      const response = await admin.get('/api/attendance/records?page=1&pageSize=5').expect(200);
      expect(response.body.data.length).toBe(5);
      expect(response.body.meta.pageSize).toBe(5);
      expect(response.body.meta.total).toBeGreaterThan(5);
    });

    it('filters the record list by status', async () => {
      const response = await admin.get('/api/attendance/records?status=PRESENT&pageSize=100').expect(200);
      const statuses = new Set(
        response.body.data.map((record: { attendanceStatus: string }) => record.attendanceStatus),
      );
      expect([...statuses]).toEqual(['PRESENT']);
    });

    it('filters the record list by subject', async () => {
      const response = await admin
        .get(`/api/attendance/records?subjectId=${fixtures.subjectIds.cs201}&pageSize=100`)
        .expect(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      const subjectIds = new Set(
        response.body.data.map((record: { session: { subject: { id: number } } }) => record.session.subject.id),
      );
      expect([...subjectIds]).toEqual([fixtures.subjectIds.cs201]);
    });
  });

  describe('GET /api/attendance/sessions/today', () => {
    it('returns the sessions scheduled for today', async () => {
      const response = await admin.get('/api/attendance/sessions/today').expect(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });
});
