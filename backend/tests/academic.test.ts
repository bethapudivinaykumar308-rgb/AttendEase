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
let faculty: ApiSession;

describe('Academic structure', () => {
  beforeAll(async () => {
    fixtures = await seedFixtures();
    admin = await login(app, fixtures.admin.email, TEST_PASSWORD);
    faculty = await login(app, fixtures.facultyAlice.email, TEST_PASSWORD);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Departments', () => {
    it('lists the departments', async () => {
      const response = await admin.get('/api/departments').expect(200);
      expect(response.body.meta.total).toBeGreaterThan(0);
      expect(response.body.data[0]).toHaveProperty('departmentCode');
    });

    it('creates a department with an upper case code', async () => {
      const response = await admin
        .post('/api/departments')
        .send({ departmentName: 'Electronics', departmentCode: 'ece' })
        .expect(201);

      expect(response.body.data.departmentCode).toBe('ECE');
    });

    it('rejects a duplicate department code', async () => {
      const response = await admin
        .post('/api/departments')
        .send({ departmentName: 'Duplicate', departmentCode: 'CSE' })
        .expect(409);
      expect(response.body.error.code).toBe('UNIQUE_CONSTRAINT');
    });

    it('rejects a department with a missing name', async () => {
      const response = await admin
        .post('/api/departments')
        .send({ departmentCode: 'XXX' })
        .expect(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('refuses to delete a department that is still linked', async () => {
      const response = await admin
        .del(`/api/departments/${fixtures.departmentId}`)
        .expect(400);
      expect(response.body.error.message).toMatch(/linked/i);
    });

    it('updates a department', async () => {
      const created = await admin
        .post('/api/departments')
        .send({ departmentName: 'Mechanical', departmentCode: 'MEC' })
        .expect(201);

      const response = await admin
        .put(`/api/departments/${created.body.data.id}`)
        .send({ departmentName: 'Mechanical Engineering' })
        .expect(200);

      expect(response.body.data.departmentName).toBe('Mechanical Engineering');

      await admin.del(`/api/departments/${created.body.data.id}`).expect(200);
    });

    it('does not let a faculty member manage departments', async () => {
      await faculty
        .post('/api/departments')
        .send({ departmentName: 'Unauthorized', departmentCode: 'UNA' })
        .expect(403);
    });
  });

  describe('Academic years', () => {
    it('creates an academic year', async () => {
      const response = await admin
        .post('/api/academic-years')
        .send({ yearName: '2027', startDate: '2027-01-01', endDate: '2027-12-31' })
        .expect(201);

      expect(response.body.data.yearName).toBe('2027');
      expect(response.body.data.isActive).toBe(true);
    });

    it('rejects an academic year whose end date precedes its start date', async () => {
      const response = await admin
        .post('/api/academic-years')
        .send({ yearName: '2028', startDate: '2028-12-31', endDate: '2028-01-01' })
        .expect(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a malformed date', async () => {
      await admin
        .post('/api/academic-years')
        .send({ yearName: '2029', startDate: 'not-a-date', endDate: '2029-12-31' })
        .expect(422);
    });

    it('refuses to delete an academic year that owns attendance history', async () => {
      const response = await admin
        .del(`/api/academic-years/${fixtures.academicYearId}`)
        .expect(400);
      expect(response.body.error.message).toMatch(/cannot be deleted/i);
    });

    it('deactivates an academic year that has no history', async () => {
      const created = await admin
        .post('/api/academic-years')
        .send({ yearName: '2030', startDate: '2030-01-01', endDate: '2030-12-31' })
        .expect(201);

      const response = await admin
        .put(`/api/academic-years/${created.body.data.id}`)
        .send({ isActive: false })
        .expect(200);

      expect(response.body.data.isActive).toBe(false);
    });
  });

  describe('Semesters', () => {
    it('creates a semester inside an academic year', async () => {
      const response = await admin
        .post('/api/semesters')
        .send({
          semesterNumber: 3,
          academicYearId: fixtures.academicYearId,
          startDate: '2026-06-01',
          endDate: '2026-12-31',
        })
        .expect(201);

      expect(response.body.data.semesterNumber).toBe(3);
    });

    it('rejects a duplicate semester number in the same year', async () => {
      const response = await admin
        .post('/api/semesters')
        .send({
          semesterNumber: 1,
          academicYearId: fixtures.academicYearId,
          startDate: '2026-01-01',
          endDate: '2026-06-30',
        })
        .expect(409);
      expect(response.body.error.code).toBe('UNIQUE_CONSTRAINT');
    });

    it('filters the semesters by academic year', async () => {
      const response = await admin
        .get(`/api/semesters?academicYearId=${fixtures.academicYearId}`)
        .expect(200);
      expect(response.body.meta.total).toBe(3);
    });

    it('refuses to delete a semester that still owns subjects', async () => {
      const response = await admin
        .del(`/api/semesters/${fixtures.semester1Id}`)
        .expect(400);
      expect(response.body.error.message).toMatch(/linked/i);
    });
  });

  describe('Subjects', () => {
    it('creates a subject with an upper case code', async () => {
      const response = await admin
        .post('/api/subjects')
        .send({
          subjectCode: 'cs103',
          subjectName: 'Operating Systems',
          departmentId: fixtures.departmentId,
          semesterId: fixtures.semester2Id,
          academicYearId: fixtures.academicYearId,
          credits: 4,
        })
        .expect(201);

      expect(response.body.data.subjectCode).toBe('CS103');
      expect(response.body.data.credits).toBe(4);
    });

    it('rejects a subject code that is already taken', async () => {
      const response = await admin
        .post('/api/subjects')
        .send({
          subjectCode: 'CS101',
          subjectName: 'Duplicate subject',
          departmentId: fixtures.departmentId,
          semesterId: fixtures.semester1Id,
          academicYearId: fixtures.academicYearId,
        })
        .expect(409);
      expect(response.body.error.code).toBe('UNIQUE_CONSTRAINT');
    });

    it('rejects a subject that points at an unknown department', async () => {
      const response = await admin
        .post('/api/subjects')
        .send({
          subjectCode: 'CS999',
          subjectName: 'Orphan subject',
          departmentId: 999999,
          semesterId: fixtures.semester1Id,
          academicYearId: fixtures.academicYearId,
        })
        .expect(409);
      expect(response.body.error.code).toBe('FOREIGN_KEY_CONSTRAINT');
    });

    it('filters the subjects by department and semester', async () => {
      const response = await admin
        .get(
          `/api/subjects?departmentId=${fixtures.departmentId}&semesterId=${fixtures.semester1Id}`,
        )
        .expect(200);
      expect(response.body.meta.total).toBe(2);
    });

    it('searches the subjects by code and name', async () => {
      const response = await admin.get('/api/subjects?search=Database').expect(200);
      expect(response.body.meta.total).toBe(1);
      expect(response.body.data[0].subjectCode).toBe('CS201');
    });

    it('deactivates a subject that owns attendance history instead of deleting it', async () => {
      const response = await admin
        .del(`/api/subjects/${fixtures.subjectIds.cs101}`)
        .expect(200);

      expect(response.body.data.isActive).toBe(false);
      expect(response.body.data.message).toMatch(/deactivated/i);

      const stored = await prisma.subject.findUnique({
        where: { id: fixtures.subjectIds.cs101 },
      });
      expect(stored).not.toBeNull();

      const records = await prisma.attendanceRecord.count({
        where: { session: { subjectId: fixtures.subjectIds.cs101 } },
      });
      expect(records).toBeGreaterThan(0);
    });
  });

  describe('Sections', () => {
    it('creates a section offering', async () => {
      const response = await admin
        .post('/api/sections')
        .send({
          subjectId: fixtures.subjectIds.cs201,
          academicYearId: fixtures.academicYearId,
          section: 'c',
        })
        .expect(201);

      expect(response.body.data.section).toBe('C');
    });

    it('rejects a duplicate section offering', async () => {
      const response = await admin
        .post('/api/sections')
        .send({
          subjectId: fixtures.subjectIds.cs101,
          academicYearId: fixtures.academicYearId,
          section: 'A',
        })
        .expect(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('filters the sections by subject', async () => {
      const response = await admin
        .get(`/api/sections?subjectId=${fixtures.subjectIds.cs101}`)
        .expect(200);
      expect(response.body.meta.total).toBe(2);
    });

    it('refuses to delete a section that owns attendance history', async () => {
      const response = await admin
        .del(`/api/sections/${fixtures.sectionIds.cs101A}`)
        .expect(400);
      expect(response.body.error.message).toMatch(/attendance history/i);
    });
  });

  describe('Academic options', () => {
    it('returns the options the forms need', async () => {
      const response = await admin.get('/api/academic-options').expect(200);
      expect(Array.isArray(response.body.data.departments)).toBe(true);
      expect(Array.isArray(response.body.data.academicYears)).toBe(true);
      expect(Array.isArray(response.body.data.semesters)).toBe(true);
      expect(Array.isArray(response.body.data.subjects)).toBe(true);
    });

    it('requires a signed in user', async () => {
      await api.get('/api/academic-options').expect(401);
    });
  });
});
