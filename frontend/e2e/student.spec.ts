import { expect, test } from '@playwright/test';
import { ACCOUNTS, signIn } from './helpers';

test.describe('Student journey', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.student.email, ACCOUNTS.student.password);
  });

  test('lands on the student dashboard with the attendance summary', async ({ page }) => {
    await expect(page).toHaveURL(/\/student$/);
    await expect(page.getByRole('heading', { name: 'My Dashboard' })).toBeVisible();
    await expect(page.getByText('Overall attendance')).toBeVisible();
    await expect(page.getByText('Classes conducted')).toBeVisible();
  });

  test('sees a read only navigation', async ({ page }) => {
    const sidebar = page.locator('aside');
    await expect(sidebar.getByRole('link', { name: 'My Attendance' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Subject Attendance' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Mark Attendance' })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: 'Students' })).toHaveCount(0);
  });

  test('reads the own attendance history', async ({ page }) => {
    await page.goto('/student/attendance');
    await expect(page.getByRole('heading', { name: 'My Attendance' })).toBeVisible();
    await expect(page.getByRole('table').first()).toBeVisible({ timeout: 20_000 });
  });

  test('reads the subject wise attendance', async ({ page }) => {
    await page.goto('/student/subjects');
    await expect(page.getByRole('heading', { name: 'Subject Attendance' })).toBeVisible();
    await expect(page.getByText('2 of 2 subjects meet the 75% requirement')).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole('button', { name: /View attendance records for Programming Fundamentals/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /View attendance records for Data Structures/ }),
    ).toBeVisible();
  });

  test('downloads the own report', async ({ page }) => {
    await page.goto('/student/reports');
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();

    await page.getByRole('button', { name: 'Generate report' }).click();
    await expect(page.getByRole('table').first()).toBeVisible({ timeout: 20_000 });

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.csv$/);
  });

  test('cannot reach the administrative area', async ({ page }) => {
    await page.goto('/admin/students');
    await expect(page).toHaveURL(/\/unauthorized/);
  });

  test('cannot read the attendance of another student', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const response = await fetch('/api/students/2/attendance', { credentials: 'include' });
      return { status: response.status, payload: await response.json().catch(() => null) };
    });

    expect(result.status).toBe(403);
    expect(result.payload.error.code).toBe('FORBIDDEN');
  });
});
