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

let payloadCounter = 0;

function newStudentPayload(overrides: Record<string, unknown> = {}) {
  payloadCounter += 1;
  return {
    name: 'Test Student',
    email: `test.student.${payloadCounter}@attendease.test`,
    password: 'Test@12345',
    rollNumber: `CS1C${String(payloadCounter).padStart(2, '0')}`,
    departmentId: fixtures.departmentId,
    semesterId: fixtures.semester1Id,
    section: 'C',
    admissionYear: 2026,
    ...overrides,
  };
}

describe('Student administration', () => {
  beforeAll(async () => {
    fixtures = await seedFixtures();
    admin = await login(app, fixtures.admin.email, TEST_PASSWORD);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/students', () => {
    it('returns a paginated list with pagination metadata', async () => {
      const response = await admin.get('/api/students?page=1&pageSize=2').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.meta).toMatchObject({ page: 1, pageSize: 2, total: 4, totalPages: 2 });
    });

    it('sorts by roll number', async () => {
      const response = await admin.get('/api/students?pageSize=10').expect(200);
      const rollNumbers = response.body.data.map((row: { rollNumber: string }) => row.rollNumber);
      expect(rollNumbers).toEqual([...rollNumbers].sort());
    });

    it('searches by student name', async () => {
      const response = await admin.get('/api/students?search=Ravi').expect(200);
      expect(response.body.meta.total).toBe(1);
      expect(response.body.data[0].rollNumber).toBe('CS1A02');
    });

    it('searches by roll number', async () => {
      const response = await admin.get('/api/students?search=CS1B01').expect(200);
      expect(response.body.meta.total).toBe(1);
      expect(response.body.data[0].user.name).toBe('Gita Menon');
    });

    it('filters by section', async () => {
      const response = await admin.get('/api/students?section=B').expect(200);
      expect(response.body.meta.total).toBe(2);
    });

    it('filters by department', async () => {
      const response = await admin
        .get(`/api/students?departmentId=${fixtures.departmentId}`)
        .expect(200);
      expect(response.body.meta.total).toBe(4);
    });

    it('filters by active state', async () => {
      const response = await admin.get('/api/students?isActive=true').expect(200);
      expect(response.body.meta.total).toBe(4);
    });
  });

  describe('POST /api/students', () => {
    const conflictTarget = {
      email: 'conflict.target@attendease.test',
      rollNumber: 'CSCONF1',
    };

    beforeAll(async () => {
      await admin
        .post('/api/students')
        .send(newStudentPayload({ ...conflictTarget }))
        .expect(201);
    });

    it('creates a student and stores the account in the database', async () => {
      const payload = newStudentPayload();
      const response = await admin.post('/api/students').send(payload).expect(201);

      expect(response.body.data.rollNumber).toBe(payload.rollNumber);
      expect(response.body.data.user.email).toBe(payload.email);

      const stored = await prisma.student.findUnique({
        where: { rollNumber: payload.rollNumber },
        include: { user: true },
      });
      expect(stored).not.toBeNull();
      expect(stored!.user.passwordHash).not.toBe('Test@12345');
      expect(stored!.user.passwordHash.startsWith('$2')).toBe(true);
    });

    it('never returns the password hash', async () => {
      const response = await admin.post('/api/students').send(newStudentPayload()).expect(201);
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });

    it('rejects a duplicate roll number with 409', async () => {
      const response = await admin
        .post('/api/students')
        .send(
          newStudentPayload({
            email: 'other@attendease.test',
            rollNumber: conflictTarget.rollNumber,
          }),
        )
        .expect(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('rejects a duplicate email with 409', async () => {
      const response = await admin
        .post('/api/students')
        .send(newStudentPayload({ email: conflictTarget.email, rollNumber: 'CS1C99' }))
        .expect(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('rejects an invalid email with 422', async () => {
      await admin
        .post('/api/students')
        .send(newStudentPayload({ email: 'not-an-email', rollNumber: 'CS1C98' }))
        .expect(422);
    });

    it('rejects a weak password with 422', async () => {
      await admin
        .post('/api/students')
        .send(newStudentPayload({ password: 'weak', rollNumber: 'CS1C97' }))
        .expect(422);
    });

    it('rejects a missing roll number with 422', async () => {
      const payload = newStudentPayload();
      delete (payload as Record<string, unknown>).rollNumber;
      await admin.post('/api/students').send(payload).expect(422);
    });

    it('rejects a section longer than 10 characters with 422', async () => {
      await admin
        .post('/api/students')
        .send(newStudentPayload({ section: 'ABCDEFGHIJK', rollNumber: 'CS1C96' }))
        .expect(422);
    });

    it('normalises the section to upper case', async () => {
      const response = await admin
        .post('/api/students')
        .send(newStudentPayload({ section: 'd', rollNumber: 'CS1D01' }))
        .expect(201);
      expect(response.body.data.section).toBe('D');
    });

    it('stores the email in lower case', async () => {
      const response = await admin
        .post('/api/students')
        .send(newStudentPayload({ email: 'Mixed.Case@attendease.test', rollNumber: 'CS1D02' }))
        .expect(201);
      expect(response.body.data.user.email).toBe('mixed.case@attendease.test');
    });
  });

  describe('GET /api/students/:id', () => {
    it('returns the student with enrollments and an attendance summary', async () => {
      const response = await admin
        .get(`/api/students/${fixtures.studentIds.s1}`)
        .expect(200);

      expect(response.body.data.rollNumber).toBe('CS1A01');
      expect(response.body.data.enrollments.length).toBe(2);
      expect(response.body.data.summary).toBeDefined();
      expect(response.body.data.summary.percentage).toBe(80);
    });

    it('returns 404 for an unknown student', async () => {
      await admin.get('/api/students/999999').expect(404);
    });

    it('rejects a non numeric id with 422', async () => {
      await admin.get('/api/students/not-a-number').expect(422);
    });
  });

  describe('PUT /api/students/:id', () => {
    it('updates the student and its linked user', async () => {
      const response = await admin
        .put(`/api/students/${fixtures.studentIds.s4}`)
        .send({ name: 'Anil Verma Rao', section: 'B' })
        .expect(200);

      expect(response.body.data.user.name).toBe('Anil Verma Rao');
      expect(response.body.data.section).toBe('B');
    });

    it('rejects an invalid payload with 422', async () => {
      await admin
        .put(`/api/students/${fixtures.studentIds.s4}`)
        .send({ admissionYear: 1800 })
        .expect(422);
    });

    it('returns 404 for an unknown student', async () => {
      await admin.put('/api/students/999999').send({ name: 'Ghost Student' }).expect(404);
    });
  });

  describe('Deactivation keeps the attendance history', () => {
    it('deactivates the account without deleting the student row', async () => {
      const before = await prisma.attendanceRecord.count({
        where: { studentId: fixtures.studentIds.s1 },
      });
      expect(before).toBeGreaterThan(0);

      const response = await admin.del(`/api/students/${fixtures.studentIds.s1}`).expect(200);
      expect(response.body.data.message).toMatch(/deactivated/i);

      const student = await prisma.student.findUnique({
        where: { id: fixtures.studentIds.s1 },
        include: { user: true },
      });
      expect(student).not.toBeNull();
      expect(student!.user.isActive).toBe(false);

      const after = await prisma.attendanceRecord.count({
        where: { studentId: fixtures.studentIds.s1 },
      });
      expect(after).toBe(before);
    });

    it('reactivates the account', async () => {
      await admin.post(`/api/students/${fixtures.studentIds.s1}/reactivate`).expect(200);

      const student = await prisma.student.findUnique({
        where: { id: fixtures.studentIds.s1 },
        include: { user: true },
      });
      expect(student!.user.isActive).toBe(true);
    });

    it('resets the password of a student', async () => {
      await admin
        .post(`/api/students/${fixtures.studentIds.s4}/reset-password`)
        .send({ password: 'Reset@12345' })
        .expect(200);

      await api
        .post('/api/auth/login')
        .send({ email: fixtures.students[3].email, password: 'Reset@12345' })
        .expect(200);
    });
  });

  describe('POST /api/students/import', () => {
    it('creates valid rows and reports the failures', async () => {
      const response = await admin
        .post('/api/students/import')
        .send({
          rows: [
            {
              name: 'Import One',
              email: 'import.one@attendease.test',
              rollNumber: 'IMP001',
              departmentCode: 'CSE',
              semesterNumber: 1,
              section: 'A',
              admissionYear: 2026,
            },
            {
              name: 'Import Two',
              email: 'import.two@attendease.test',
              rollNumber: 'IMP002',
              departmentCode: 'CSE',
              semesterNumber: 1,
              section: 'A',
              admissionYear: 2026,
              password: 'Explicit@123',
            },
            {
              name: 'Bad Department',
              email: 'import.bad@attendease.test',
              rollNumber: 'IMP003',
              departmentCode: 'XXX',
              semesterNumber: 1,
              section: 'A',
              admissionYear: 2026,
            },
            {
              name: 'Duplicate Roll',
              email: 'import.dup@attendease.test',
              rollNumber: 'CS1A01',
              departmentCode: 'CSE',
              semesterNumber: 1,
              section: 'A',
              admissionYear: 2026,
            },
          ],
        })
        .expect(200);

      expect(response.body.data.created).toBe(2);
      expect(response.body.data.errors.length).toBe(2);
      expect(response.body.data.errors.join(' ')).toMatch(/department code XXX was not found/i);
      expect(response.body.data.errors.join(' ')).toMatch(/roll number already exists/i);
      expect(response.body.data.defaultPasswordApplied).toBe(1);
    });

    it('rejects an empty row set with 400', async () => {
      await admin.post('/api/students/import').send({ rows: [] }).expect(400);
    });

    it('rejects a non array payload with 400', async () => {
      await admin.post('/api/students/import').send({ rows: 'nope' }).expect(400);
    });

    it('does not create a user for a row that fails validation', async () => {
      const before = await prisma.user.count();
      await admin
        .post('/api/students/import')
        .send({
          rows: [
            {
              name: 'No Department',
              email: 'import.nodept@attendease.test',
              rollNumber: 'IMP009',
              departmentCode: 'ZZZ',
              semesterNumber: 1,
              section: 'A',
            },
          ],
        })
        .expect(200);

      const after = await prisma.user.count();
      expect(after).toBe(before);
    });
  });

  describe('GET /api/students/export', () => {
    it('returns a CSV attachment containing the real student rows', async () => {
      const response = await admin.get('/api/students/export').expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('students.csv');

      const lines = response.text.trim().split('\r\n');
      expect(lines[0]).toContain('Roll Number');
      expect(lines.length).toBeGreaterThan(1);
      expect(response.text).toContain('CS1A01');
    });

    it('escapes formula injection in exported cells', async () => {
      await admin
        .post('/api/students')
        .send(
          newStudentPayload({
            name: '=cmd|calc',
            email: 'formula@attendease.test',
            rollNumber: 'CS1F01',
          }),
        )
        .expect(201);

      const response = await admin.get('/api/students/export').expect(200);
      expect(response.text).not.toMatch(/^=cmd/m);
      expect(response.text).toContain("'=cmd|calc");
    });
  });
});
