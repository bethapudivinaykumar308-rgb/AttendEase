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
let student: ApiSession;

const REPORT_TYPES = [
  'student-wise',
  'subject-wise',
  'class-wise',
  'department-wise',
  'date-wise',
  'monthly',
  'semester-wise',
  'low-attendance',
  'faculty-wise',
];

describe('Reports', () => {
  beforeAll(async () => {
    fixtures = await seedFixtures();
    admin = await login(app, fixtures.admin.email, TEST_PASSWORD);
    alice = await login(app, fixtures.facultyAlice.email, TEST_PASSWORD);
    student = await login(app, fixtures.students[0].email, TEST_PASSWORD);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/reports/types', () => {
    it('lists all nine report types', async () => {
      const response = await admin.get('/api/reports/types').expect(200);
      expect(response.body.data).toHaveLength(9);
      expect(response.body.data.map((entry: { value: string }) => entry.value)).toEqual(
        REPORT_TYPES,
      );
      expect(response.body.data[0]).toHaveProperty('label');
    });
  });

  describe('GET /api/reports', () => {
    for (const reportType of REPORT_TYPES) {
      it(`builds the ${reportType} report from the database`, async () => {
        const response = await admin.get(`/api/reports?reportType=${reportType}`).expect(200);

        expect(response.body.success).toBe(true);
        expect(typeof response.body.data.title).toBe('string');
        expect(Array.isArray(response.body.data.columns)).toBe(true);
        expect(Array.isArray(response.body.data.rows)).toBe(true);
        expect(response.body.data.rows.length).toBeGreaterThan(0);
        expect(response.body.data.columns.length).toBeGreaterThan(0);
      });
    }

    it('produces one row per student with attendance', async () => {
      const response = await admin.get('/api/reports?reportType=student-wise').expect(200);
      const rollNumbers = response.body.data.rows.map(
        (row: { rollNumber: string }) => row.rollNumber,
      );
      expect(rollNumbers).toContain('CS1A01');
      expect(rollNumbers).toContain('CS1B02');
    });

    it('sorts the student report by ascending percentage', async () => {
      const response = await admin.get('/api/reports?reportType=student-wise').expect(200);
      const percentages = response.body.data.rows.map(
        (row: { percentage: number }) => row.percentage,
      );
      expect([...percentages].sort((a, b) => a - b)).toEqual(percentages);
    });

    it('applies the subject filter', async () => {
      const response = await admin
        .get(`/api/reports?reportType=subject-wise&subjectId=${fixtures.subjectIds.cs201}`)
        .expect(200);

      expect(response.body.data.rows).toHaveLength(1);
      expect(response.body.data.rows[0].subjectCode).toBe('CS201');
    });

    it('applies the date range filter', async () => {
      const response = await admin
        .get(`/api/reports?reportType=date-wise&startDate=${fixtures.dates.past1}&endDate=${fixtures.dates.past1}`)
        .expect(200);

      expect(response.body.data.rows).toHaveLength(1);
      expect(response.body.data.rows[0].date).toBe(fixtures.dates.past1);
    });

    it('rejects an unknown report type with 422', async () => {
      await admin.get('/api/reports?reportType=invented').expect(422);
    });

    it('rejects an inverted date range with 422', async () => {
      await admin
        .get('/api/reports?reportType=student-wise&startDate=2026-05-01&endDate=2026-01-01')
        .expect(422);
    });
  });

  describe('Faculty scoping', () => {
    it('never includes a section the faculty member does not teach', async () => {
      const response = await alice.get('/api/reports?reportType=class-wise').expect(200);

      const sections = response.body.data.rows.map((row: { section: string }) => row.section);
      expect(sections.every((section: string) => section === 'A')).toBe(true);
    });

    it('rejects a subject the faculty member does not teach', async () => {
      const response = await alice
        .get(`/api/reports?reportType=subject-wise&subjectId=${fixtures.subjectIds.cs102}`)
        .expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects a section the faculty member does not teach', async () => {
      const response = await alice
        .get(`/api/reports?reportType=class-wise&sectionId=${fixtures.sectionIds.cs101B}`)
        .expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Student scoping', () => {
    it('only reports the student own attendance', async () => {
      const response = await student.get('/api/reports?reportType=student-wise').expect(200);

      const rollNumbers = response.body.data.rows.map(
        (row: { rollNumber: string }) => row.rollNumber,
      );
      expect(rollNumbers).toEqual(['CS1A01']);
    });

    it('cannot widen the scope with a studentId parameter', async () => {
      const response = await student
        .get(`/api/reports?reportType=student-wise&studentId=${fixtures.studentIds.s3}`)
        .expect(200);

      const rollNumbers = response.body.data.rows.map(
        (row: { rollNumber: string }) => row.rollNumber,
      );
      expect(rollNumbers).toEqual(['CS1A01']);
    });
  });

  describe('GET /api/reports/export', () => {
    it('returns a CSV attachment for every report type', async () => {
      for (const reportType of REPORT_TYPES) {
        const response = await admin.get(`/api/reports/export?reportType=${reportType}`).expect(200);

        expect(response.headers['content-type']).toContain('text/csv');
        expect(response.headers['content-disposition']).toContain(
          `attendance-${reportType}-report.csv`,
        );
        expect(response.text.split('\r\n').length).toBeGreaterThan(1);
      }
    });

    it('writes the column labels as the header row', async () => {
      const response = await admin
        .get('/api/reports/export?reportType=student-wise')
        .expect(200);

      const header = response.text.replace(/^\uFEFF/, '').split('\r\n')[0];
      expect(header).toContain('Roll Number');
      expect(header).toContain('Attendance %');
      expect(response.text).toContain('CS1A01');
    });

    it('respects the same filters as the on screen report', async () => {
      const response = await admin
        .get(`/api/reports/export?reportType=subject-wise&subjectId=${fixtures.subjectIds.cs201}`)
        .expect(200);

      expect(response.text).toContain('CS201');
      expect(response.text).not.toContain('CS101');
    });

    it('does not export unrelated students for a student account', async () => {
      const response = await student
        .get('/api/reports/export?reportType=student-wise')
        .expect(200);

      expect(response.text).toContain('CS1A01');
      expect(response.text).not.toContain('CS1B01');
    });
  });
});
