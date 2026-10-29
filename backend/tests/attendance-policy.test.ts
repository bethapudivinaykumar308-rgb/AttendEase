import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { env } from '../src/config/env.js';
import { seedFixtures, TEST_PASSWORD, type Fixtures } from './setup/fixtures.js';
import { login, type ApiSession } from './setup/helpers.js';

/**
 * The percentage policy is asserted on a pristine fixture set, so the
 * expected numbers are exact and not affected by sessions created elsewhere.
 */
const app = createApp();
const api = request(app);
let fixtures: Fixtures;
let admin: ApiSession;

describe('Attendance percentage policy', () => {
  beforeAll(async () => {
    fixtures = await seedFixtures();
    admin = await login(app, fixtures.admin.email, TEST_PASSWORD);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('uses the configured counted statuses', () => {
    expect(env.countedStatuses).toEqual(['PRESENT', 'LATE']);
    expect(env.thresholdPercent).toBe(75);
  });

  it('counts PRESENT and LATE as attended but not ON_LEAVE', async () => {
    const response = await admin
      .get(`/api/attendance/student/${fixtures.studentIds.s1}`)
      .expect(200);

    const cs101 = response.body.data.subjects.find(
      (subject: { subjectCode: string }) => subject.subjectCode === 'CS101',
    );

    expect(cs101.breakdown).toMatchObject({
      present: 1,
      late: 1,
      onLeave: 1,
      absent: 0,
      total: 3,
      attended: 2,
    });
    expect(cs101.breakdown.percentage).toBe(66.67);
  });

  it('excludes cancelled and future sessions from the denominator', async () => {
    const response = await admin
      .get(`/api/attendance/student/${fixtures.studentIds.s1}`)
      .expect(200);

    const cs101 = response.body.data.subjects.find(
      (subject: { subjectCode: string }) => subject.subjectCode === 'CS101',
    );

    // The fixture holds five sessions for this class: three eligible, one
    // cancelled and one in the future.
    expect(cs101.breakdown.total).toBe(3);
  });

  it('computes the overall percentage across every subject', async () => {
    const response = await admin
      .get(`/api/attendance/student/${fixtures.studentIds.s1}`)
      .expect(200);

    // CS101: 2 attended of 3, CS201: 2 attended of 2.
    expect(response.body.data.overall.total).toBe(5);
    expect(response.body.data.overall.attended).toBe(4);
    expect(response.body.data.overall.percentage).toBe(80);
  });

  it('reports a lower percentage for a frequently absent student', async () => {
    const response = await admin
      .get(`/api/attendance/student/${fixtures.studentIds.s2}`)
      .expect(200);

    const cs101 = response.body.data.subjects.find(
      (subject: { subjectCode: string }) => subject.subjectCode === 'CS101',
    );
    expect(cs101.breakdown.absent).toBe(2);
    expect(cs101.breakdown.attended).toBe(1);
    expect(cs101.breakdown.percentage).toBe(33.33);

    expect(response.body.data.overall.total).toBe(5);
    expect(response.body.data.overall.attended).toBe(3);
    expect(response.body.data.overall.percentage).toBe(60);
  });

  it('computes the percentage for a student in another section', async () => {
    const response = await admin
      .get(`/api/attendance/student/${fixtures.studentIds.s4}`)
      .expect(200);

    expect(response.body.data.overall.total).toBe(2);
    expect(response.body.data.overall.attended).toBe(1);
    expect(response.body.data.overall.percentage).toBe(50);
  });

  it('keeps the percentage to two decimal places', async () => {
    const response = await admin
      .get(`/api/attendance/student/${fixtures.studentIds.s1}`)
      .expect(200);

    const cs101 = response.body.data.subjects.find(
      (subject: { subjectCode: string }) => subject.subjectCode === 'CS101',
    );
    expect(cs101.breakdown.percentage).toBe(66.67);
    expect(Number.isInteger(cs101.breakdown.percentage)).toBe(false);
  });

  it('reports zero for a student with no attendance at all', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'No Records',
        email: 'no.records@attendease.test',
        passwordHash: 'x',
        role: 'STUDENT',
      },
    });
    const student = await prisma.student.create({
      data: {
        userId: user.id,
        rollNumber: 'CS1Z01',
        departmentId: fixtures.departmentId,
        semesterId: fixtures.semester1Id,
        section: 'A',
        admissionYear: 2026,
      },
    });

    const response = await admin
      .get(`/api/attendance/student/${student.id}`)
      .expect(200);

    expect(response.body.data.overall.total).toBe(0);
    expect(response.body.data.overall.percentage).toBe(0);
  });

  it('flags students below the configured threshold', async () => {
    const response = await admin
      .get('/api/reports?reportType=low-attendance')
      .expect(200);

    const rollNumbers = response.body.data.rows.map(
      (row: { rollNumber: string }) => row.rollNumber,
    );
    expect(rollNumbers).toContain('CS1A02');
    expect(rollNumbers).toContain('CS1B02');
    expect(rollNumbers).not.toContain('CS1A01');
  });

  it('honours a custom threshold', async () => {
    const response = await admin
      .get('/api/reports?reportType=low-attendance&threshold=90')
      .expect(200);

    const rollNumbers = response.body.data.rows.map(
      (row: { rollNumber: string }) => row.rollNumber,
    );
    expect(rollNumbers).toContain('CS1A01');
    expect(response.body.data.summary.Threshold).toBe('90%');
  });
});
