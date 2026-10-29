import { expect, test } from '@playwright/test';
import { ACCOUNTS, signIn } from './helpers';

test.describe('Administrator journey', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password);
  });

  test('lands on the administrator dashboard with live totals', async ({ page }) => {
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // The stat cards are fed by the API, never by hardcoded numbers.
    await expect(page.getByText('Total students')).toBeVisible();
    await expect(page.getByText('Total faculty')).toBeVisible();
    await expect(page.getByText('Average attendance', { exact: true })).toBeVisible();
    await expect(page.getByText('Below threshold', { exact: true })).toBeVisible();
  });

  test('sees the full administrative navigation', async ({ page }) => {
    const sidebar = page.locator('aside');
    await expect(sidebar.getByRole('link', { name: 'Students', exact: true })).toBeVisible();
    // `exact` matters: the sidebar also carries "Faculty Assignments".
    await expect(sidebar.getByRole('link', { name: 'Faculty', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Subjects', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Audit Logs', exact: true })).toBeVisible();
  });

  test('searches for a student and opens the student record', async ({ page }) => {
    await page.goto('/admin/students');
    await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible();

    await page.getByPlaceholder('Search by name, roll number or email…').fill('Aarav Sharma');
    await expect(page.getByText('Aarav Sharma').first()).toBeVisible();

    await page.getByRole('link', { name: 'View CSE1A01' }).click();
    await expect(page).toHaveURL(/\/admin\/students\/\d+/);
  });

  test('opens the audit log of the recent activity', async ({ page }) => {
    await page.goto('/admin/audit-logs');
    await expect(page.getByRole('heading', { name: 'Audit logs' })).toBeVisible();
    await expect(page.getByText('LOGIN').first()).toBeVisible();
  });

  test('generates a report and exports it as CSV', async ({ page }) => {
    await page.goto('/admin/reports');
    await expect(page.getByRole('heading', { name: 'Attendance reports' })).toBeVisible();

    await page.getByRole('button', { name: 'Generate report' }).click();
    await expect(page.getByRole('table').first()).toBeVisible({ timeout: 20_000 });

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV', exact: true }).first().click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.csv$/);
  });

  test('cannot reach the faculty or student area', async ({ page }) => {
    await page.goto('/faculty');
    await expect(page).toHaveURL(/\/unauthorized/);
    await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
  });
});
