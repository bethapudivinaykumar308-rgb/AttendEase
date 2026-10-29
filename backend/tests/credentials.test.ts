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

let counter = 0;
const createdStudentIds: number[] = [];
const createdFacultyIds: number[] = [];
const createdUserIds: number[] = [];

function nextRoll(): string {
  counter += 1;
  return `CS9X${String(counter).padStart(2, '0')}`;
}

async function createStudent(payload: Record<string, unknown>) {
  const response = await admin
    .post('/api/students')
    .send({
      departmentId: fixtures.departmentId,
      semesterId: fixtures.semester1Id,
      section: 'A',
      admissionYear: 2026,
      ...payload,
    })
    .expect(201);

  createdStudentIds.push(response.body.data.id);
  createdUserIds.push(response.body.data.user.id);
  return response;
}

async function createFacultyMember(payload: Record<string, unknown>) {
  const response = await admin
    .post('/api/faculty')
    .send({
      departmentId: fixtures.departmentId,
      designation: 'Assistant Professor',
      ...payload,
    })
    .expect(201);

  createdFacultyIds.push(response.body.data.id);
  createdUserIds.push(response.body.data.user.id);
  return response;
}

const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)\S{8,72}$/;

describe('Administrator-issued credentials', () => {
  beforeAll(async () => {
    fixtures = await seedFixtures();
    admin = await login(app, fixtures.admin.email, TEST_PASSWORD);
    faculty = await login(app, fixtures.facultyAlice.email, TEST_PASSWORD);
  });

  // These tests add accounts to the shared schema, so everything they create is
  // removed again to keep the fixture counts other suites assert on intact.
  afterAll(async () => {
    await prisma.faculty.deleteMany({ where: { id: { in: createdFacultyIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  describe('POST /api/students', () => {
    it('generates an email address and a policy-compliant temporary password', async () => {
      const response = await createStudent({ name: 'Meera Krishnan', rollNumber: nextRoll() });

      const { email, temporaryPassword } = response.body.data.credentials;
      expect(email).toBe('meera.krishnan@students.attendease.edu');
      expect(temporaryPassword).toMatch(PASSWORD_POLICY);
      expect(response.body.data.user.email).toBe(email);
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');

      // The generated password is the one that actually signs in.
      const session = await login(app, email, temporaryPassword);
      expect(session.user.role).toBe('STUDENT');
      expect(session.user.email).toBe(email);
    });

    it('adds a numeric suffix when the generated address is already taken', async () => {
      const rollNumber = nextRoll();
      const response = await createStudent({ name: 'Meera Krishnan', rollNumber });

      expect(response.body.data.credentials.email).toBe(
        'meera.krishnan2@students.attendease.edu',
      );
    });

    it('derives the address from the name when an honorific is used', async () => {
      const response = await createStudent({ name: 'Dr. Naveen Chandra', rollNumber: nextRoll() });

      expect(response.body.data.credentials.email).toBe(
        'naveen.chandra@students.attendease.edu',
      );
    });

    it('still honours an address and password supplied by the administrator', async () => {
      const rollNumber = nextRoll();
      const response = await createStudent({
        name: 'Fixed Credentials',
        email: 'fixed.credentials@attendease.test',
        password: 'Chosen@12345',
        rollNumber,
      });

      expect(response.body.data.credentials.email).toBe('fixed.credentials@attendease.test');
      expect(response.body.data.credentials.temporaryPassword).toBe('Chosen@12345');
      await login(app, 'fixed.credentials@attendease.test', 'Chosen@12345');
    });

    it('refuses account creation from a faculty session', async () => {
      await faculty
        .post('/api/students')
        .send({
          name: 'Not Allowed',
          rollNumber: nextRoll(),
          departmentId: fixtures.departmentId,
          semesterId: fixtures.semester1Id,
          section: 'A',
          admissionYear: 2026,
        })
        .expect(403);
    });
  });

  describe('POST /api/faculty', () => {
    it('generates credentials on the faculty domain', async () => {
      const response = await createFacultyMember({
        name: 'Dr. Latha Subramanian',
        facultyId: `FAC-90${++counter}`,
      });

      const { email, temporaryPassword } = response.body.data.credentials;
      expect(email).toBe('latha.subramanian@faculty.attendease.edu');
      expect(temporaryPassword).toMatch(PASSWORD_POLICY);

      const session = await login(app, email, temporaryPassword);
      expect(session.user.role).toBe('FACULTY');
    });

    it('refuses account creation from a faculty session', async () => {
      await faculty
        .post('/api/faculty')
        .send({
          name: 'Not Allowed',
          facultyId: `FAC-91${++counter}`,
          departmentId: fixtures.departmentId,
          designation: 'Lecturer',
        })
        .expect(403);
    });
  });

  describe('password resets', () => {
    it('issues a new generated student password that replaces the old one', async () => {
      const created = await createStudent({ name: 'Reset Target', rollNumber: nextRoll() });
      const { email, temporaryPassword: firstPassword } = created.body.data.credentials;

      const reset = await admin
        .post(`/api/students/${created.body.data.id}/reset-password`)
        .send({})
        .expect(200);

      const secondPassword = reset.body.data.password;
      expect(secondPassword).toMatch(PASSWORD_POLICY);
      expect(secondPassword).not.toBe(firstPassword);

      await api.post('/api/auth/login').send({ email, password: firstPassword }).expect(401);
      await login(app, email, secondPassword);
    });

    it('issues a new generated faculty password that replaces the old one', async () => {
      const created = await createFacultyMember({
        name: 'Reset Faculty',
        facultyId: `FAC-92${++counter}`,
      });
      const { email, temporaryPassword: firstPassword } = created.body.data.credentials;

      const reset = await admin
        .post(`/api/faculty/${created.body.data.id}/reset-password`)
        .send({})
        .expect(200);

      const secondPassword = reset.body.data.password;
      expect(secondPassword).toMatch(PASSWORD_POLICY);
      expect(secondPassword).not.toBe(firstPassword);

      await api.post('/api/auth/login').send({ email, password: firstPassword }).expect(401);
      await login(app, email, secondPassword);
    });

    it('refuses a reset from a faculty session', async () => {
      await faculty
        .post(`/api/faculty/${createdFacultyIds[0]}/reset-password`)
        .send({})
        .expect(403);

      await faculty
        .post(`/api/students/${fixtures.studentIds.s1}/reset-password`)
        .send({})
        .expect(403);
    });
  });
});
