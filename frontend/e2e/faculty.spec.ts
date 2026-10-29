import { expect, test } from '@playwright/test';
import { ACCOUNTS, daysAgo, signIn } from './helpers';

test.describe('Faculty journey', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.faculty.email, ACCOUNTS.faculty.password);
  });

  test('lands on the faculty dashboard with the teaching load', async ({ page }) => {
    await expect(page).toHaveURL(/\/faculty$/);
    await expect(page.getByRole('heading', { name: 'Faculty dashboard' })).toBeVisible();
    await expect(page.getByText('Assigned subjects')).toBeVisible();
    await expect(page.getByText('Students taught')).toBeVisible();
  });

  test('sees only the teaching navigation', async ({ page }) => {
    const sidebar = page.locator('aside');
    await expect(sidebar.getByRole('link', { name: 'My Subjects' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Mark Attendance' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Students' })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: 'Audit Logs' })).toHaveCount(0);
  });

  test('lists the assigned subjects and classes', async ({ page }) => {
    await page.goto('/faculty/subjects');
    await expect(page.getByRole('heading', { name: 'My Subjects' })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();

    await page.goto('/faculty/classes');
    await expect(page.getByRole('heading', { name: 'My Classes' })).toBeVisible();
  });

  test('creates a session, marks the class and submits the attendance', async ({ page }) => {
    await page.goto('/faculty/attendance');
    await expect(page.getByRole('heading', { name: 'Mark attendance' })).toBeVisible();

    // Step 1 - pick the subject and the section.
    await page.locator('#session-subject').click();
    await page.getByRole('option').first().click();
    await page.locator('#session-section').click();
    await page.getByRole('option').first().click();

    // A date and session number the seed script has not used yet.
    await page.locator('#session-date').fill(daysAgo(3));
    await page.locator('#session-number').fill('9');
    await page.locator('#session-topic').fill('End to end test session');
    await page.getByRole('button', { name: 'Create session' }).click();

    // Step 2 - the roster of the class appears.
    await expect(page.getByText('Step 2 · Mark the students')).toBeVisible({ timeout: 20_000 });
    const roster = page.getByRole('row');
    await expect(roster.first()).toBeVisible();

    // Mark everybody present with the bulk action, then submit.
    await page.getByRole('button', { name: 'Select all present' }).click();
    // Every row now carries a status, so no badge may still read "Not marked".
    await expect(page.getByText('Not marked')).toHaveCount(0);
    await expect(page.getByText('Unmarked').locator('..')).toContainText('0');

    await page.getByRole('button', { name: 'Submit attendance' }).click();
    await expect(page.getByText('Attendance saved')).toBeVisible({ timeout: 20_000 });

    // The record is persisted: reloading the page shows the same session and
    // the marks that were submitted.
    await page.reload();
    await page.locator('#session-date').fill(daysAgo(3));
    const slot = page.getByText('Session #9 · End to end test session').first();
    await expect(slot).toBeVisible({ timeout: 20_000 });

    await expect(page.getByText('Step 2 · Mark the students')).toBeVisible();
    await expect(page.getByText('Session #9 · End to end test session').first()).toBeVisible();
    await expect(page.getByText('Not marked')).toHaveCount(0);
    await expect(page.getByText('Present').first()).toBeVisible();
  });

  test('rejects a session for a future date', async ({ page }) => {
    await page.goto('/faculty/attendance');

    await page.locator('#session-subject').click();
    await page.getByRole('option').first().click();
    await page.locator('#session-section').click();
    await page.getByRole('option').first().click();

    // The screen keeps the selection in the query string.
    await expect(page).toHaveURL(/subjectId=\d+/);
    const params = new URL(page.url()).searchParams;
    const subjectId = Number(params.get('subjectId'));
    const sectionId = Number(params.get('sectionId'));

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const offset = tomorrow.getTimezoneOffset();
    const value = new Date(tomorrow.getTime() - offset * 60_000).toISOString().slice(0, 10);

    // The date input caps the value at today, so the request is sent directly
    // to prove the server performs the same check.
    const result = await page.evaluate(
      async ({ subjectId, sectionId, date }) => {
        const csrf = document.cookie
          .split(';')
          .map((part) => part.trim())
          .find((part) => part.startsWith('attendease_csrf='))
          ?.split('=')[1];

        const response = await fetch('/api/attendance/sessions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({
            subjectId,
            sectionId,
            attendanceDate: date,
            sessionNumber: 1,
          }),
        });

        return { status: response.status, payload: await response.json() };
      },
      { subjectId, sectionId, date: value },
    );

    expect(result.status).toBe(400);
    expect(result.payload.error.message).toMatch(/future|date/i);
  });

  test('cannot reach the administrative area', async ({ page }) => {
    await page.goto('/admin/students');
    await expect(page).toHaveURL(/\/unauthorized/);
  });
});
