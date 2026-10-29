# Automated tests

The test code lives next to the code it exercises; this directory is the index.

| Layer | Location | Runner | Database | Command |
|---|---|---|---|---|
| Backend — API, domain, security | [`backend/tests/`](../backend/tests) | Vitest + Supertest | `attendance_management_test` | `npm run test:backend` |
| Backend — database contract | [`backend/tests/database.test.ts`](../backend/tests/database.test.ts) | Vitest + Prisma | `attendance_management_test` | included above |
| Frontend — unit & component | [`frontend/src/**/*.test.ts(x)`](../frontend/src) | Vitest + Testing Library | none | `npm run test:frontend` |
| End-to-end — three role journeys | [`frontend/e2e/`](../frontend/e2e) | Playwright | `attendance_management_e2e` | `npm run test:e2e` |

## Why three schemas

The suites create, mutate and delete rows. Running them against the
development or production schema would destroy real data, so each layer gets
its own MySQL database:

```
attendance_management        development / demo data      (never touched by tests)
attendance_management_test   backend Vitest suites       (reset before every run)
attendance_management_e2e    Playwright end-to-end suite (reset before every run)
```

The application user needs a grant on each of them; see
[`docs/09-deployment.md`](../docs/09-deployment.md) §2.2.

## Running everything

```bash
# Required for the database-backed suites; never commit these values.
export TEST_DATABASE_URL="mysql://attendease:<password>@127.0.0.1:3307/attendance_management_test"
export E2E_DATABASE_URL="mysql://attendease:<password>@127.0.0.1:3307/attendance_management_e2e"

npm run typecheck     # tsc --noEmit, both workspaces
npm run test:backend  # backend integration + database suites
npm run test:frontend # frontend unit + component suites
npm run test:e2e      # Playwright (boots isolated API/web servers; needs MySQL + Chromium)
```

The suites are independent: the backend suite, the frontend suite and the
end-to-end suite can each be run on their own. `npm run test` runs the
backend and frontend suites together; `npm run test:e2e` runs Playwright
separately because it boots its own API and web server.

## End-to-end journeys

| Spec | Journey | Assertions |
|---|---|---|
| [`admin.spec.ts`](../frontend/e2e/admin.spec.ts) | Administrator | dashboard totals, full navigation, student search and detail, audit log, report + CSV export, blocked from the faculty area |
| [`faculty.spec.ts`](../frontend/e2e/faculty.spec.ts) | Faculty | dashboard, teaching-only navigation, My Subjects / My Classes, create session → mark → submit → reload, future-date rejection, blocked from admin student list |
| [`student.spec.ts`](../frontend/e2e/student.spec.ts) | Student | dashboard, read-only navigation, My Attendance, Subject Attendance, report + CSV download, blocked from admin area, cannot read another student's attendance |

The executed results, including every failure that was found and fixed, are
recorded in [`docs/10-test-report.md`](../docs/10-test-report.md).
