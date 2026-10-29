import { expect, type Page } from '@playwright/test';

export const DEMO_PASSWORD = 'Attend@123';

export const ACCOUNTS = {
  admin: { email: 'admin@attendease.edu', password: DEMO_PASSWORD },
  faculty: { email: 'arun.kumar@faculty.attendease.edu', password: DEMO_PASSWORD },
  student: { email: 'aarav.sharma@students.attendease.edu', password: DEMO_PASSWORD },
};

/** Signs a user in through the real login screen. */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  // `exact` matters: the reveal toggle is labelled "Show password" and would
  // otherwise match a substring query for "Password".
  await page.getByLabel('Password', { exact: true }).fill(password);

  // The submit button swaps its label to "Signing in…", so waiting for the
  // button to disappear returns as soon as the request *starts*. The session
  // cookie only exists once the response arrives, so the response itself has
  // to be awaited - otherwise a following page.goto() would abort the login.
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/auth/login') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign in' }).click();
  await loginResponse;

  await expect(page).not.toHaveURL(/\/login/);
}

/** A date in the past, so the server accepts the attendance session. */
export function yesterday(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

/** A date in the past that the seed script has not used yet. */
export function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}
