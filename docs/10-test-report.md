# 10 — Verified Test Report

## 1. Final status

**Final result: PASS.** All 291 automated tests executed successfully, both
workspaces type-check without errors, and both production builds completed.
The application was also exercised in a real browser against MySQL 8.4.

| Item | Result |
|---|---|
| Verification date | 2026-10-29 |
| Platform | Windows x64, Node.js 24.18.0, MySQL 8.4.0 |
| Backend integration/database tests | **235 passed**, 0 failed, 11 files |
| Frontend unit/component tests | **37 passed**, 0 failed, 6 files |
| Playwright browser journeys | **19 passed**, 0 failed, 3 specs |
| **Total automated tests** | **291 passed**, 0 failed |
| Backend TypeScript | 0 errors |
| Frontend TypeScript | 0 errors |
| Backend production build | `backend/dist` produced |
| Frontend production build | `frontend/dist` produced |
| Live API health | HTTP 200, `status: ok`, `database: connected` |
| Docker image execution | Not executed: Docker CLI is unavailable |

The final commands were:

```bash
npm run test:backend
npm run test:frontend
npm run test:e2e
npm run typecheck
npm run build
curl http://localhost:5000/api/health
```

The three test layers use isolated schemas. Backend tests use
`attendance_management_test`, Playwright uses `attendance_management_e2e`, and
the demonstration schema `attendance_management` is not reset by the tests.
The connection URLs were supplied through `TEST_DATABASE_URL` and
`E2E_DATABASE_URL`; no database credentials are stored in the repository.

---

## 2. Suite-level results

### 2.1 Backend — Vitest, Supertest, Prisma and MySQL

Final full-suite duration: 82.03 seconds.

| Suite | Passed | Failed | Main coverage |
|---|---:|---:|---|
| `academic.test.ts` | 28 | 0 | Departments, years, semesters, subjects, sections, academic options |
| `attendance.test.ts` | 28 | 0 | Session lifecycle, roster validation, transactional submission, idempotency, cancellation, filters |
| `attendance-policy.test.ts` | 10 | 0 | Counted statuses, eligible classes, thresholds, percentages |
| `auth.test.ts` | 27 | 0 | Login, cookies, CSRF, reset/change password, deactivation, health |
| `dashboards.test.ts` | 15 | 0 | Live totals, faculty scope, student summaries, alerts and charts |
| `database.test.ts` | 24 | 0 | Unique keys, foreign keys, transactions, indexes, history preservation |
| `rate-limit-api.test.ts` | 2 | 0 | Global request limit and standard headers |
| `rate-limit-auth.test.ts` | 2 | 0 | Failed-login throttling and successful-login handling |
| `rbac.test.ts` | 42 | 0 | Authentication and administrator/faculty/student authorization boundaries |
| `reports.test.ts` | 25 | 0 | Nine report types, filters, scoped results and CSV export |
| `students.test.ts` | 32 | 0 | Student CRUD, search/filter, import/export, reset and soft deactivation |
| **Total** | **235** | **0** | |

Expected Prisma constraint errors appear in the console during negative
unique-key, foreign-key and rollback tests. Those tests assert the errors and
pass; the log messages are not unhandled failures.

### 2.2 Frontend — Vitest and Testing Library

Final full-suite duration after separating the Vite and Vitest configuration:
29.90 seconds.

| Suite | Passed | Failed | Main coverage |
|---|---:|---:|---|
| `lib/utils.test.ts` | 8 | 0 | Formatting, tones, initials and dates |
| `lib/navigation.test.ts` | 6 | 0 | Role home pages and role-specific navigation |
| `lib/api.test.ts` | 7 | 0 | Cookies, CSRF, query strings and safe error handling |
| `components/attendance-display.test.tsx` | 6 | 0 | Status badges, percentages and progress bounds |
| `components/protected-route.test.tsx` | 4 | 0 | Session restoration and route-role guards |
| `pages/auth/login.test.tsx` | 6 | 0 | Validation, API errors, navigation and password visibility |
| **Total** | **37** | **0** | |

React Router prints its informational v7 future-flag warnings. They do not
represent failed assertions or runtime errors.

### 2.3 Browser — Playwright with bundled Chromium

Final full-suite duration: 3.3 minutes. Playwright reset and seeded the isolated
E2E schema, started an isolated API on port 5010 and web server on port 5174,
and ran with one worker.

| Spec | Passed | Failed | User journeys |
|---|---:|---:|---|
| `admin.spec.ts` | 6 | 0 | Live dashboard, navigation, student detail, audit, report/CSV, route denial |
| `faculty.spec.ts` | 6 | 0 | Teaching dashboard/navigation, assignments, attendance persistence, future-date rejection, route denial |
| `student.spec.ts` | 7 | 0 | Personal dashboard/history/subjects, report/CSV, route and cross-student denial |
| **Total** | **19** | **0** | |

---

## 3. Failures discovered and resolved

The final green result followed real defect fixes and test-infrastructure
corrections. No failing assertion was removed to obtain a pass.

| Area | Failure or root cause | Resolution | Final evidence |
|---|---|---|---|
| Dashboard authorization | Administrator accounts could open faculty/student frontend routes and dashboard APIs | Restricted each route and API dashboard to its owning role; added student/faculty denial cases | 42 RBAC tests and administrator browser route-denial journey pass |
| Login E2E helper | Waiting for the original Sign in button to become hidden returned when its label changed, allowing navigation to abort login | Await the actual `POST /api/auth/login` response and navigation away from `/login` | All 19 browser journeys pass |
| Session restoration | A transient network/5xx failure cleared an otherwise valid frontend session | Clear the user only for a real HTTP 401 | Frontend auth and browser reload journeys pass |
| Saved attendance reopening | Test searched for `Open session` although the restored active session button reads `Open` and the roster is already open | Assert the restored Step 2 roster and persisted marks directly | Create → mark → submit → reload journey passes |
| Student search | Clicking plain student-name text did not navigate because the explicit View link owns navigation | Click the accessible `View CSE1A01` link | Student detail journey passes |
| Report export | Two accessible buttons are named `Export CSV`, causing Playwright strict-mode ambiguity | Select the visible export button explicitly | Admin and student CSV downloads pass |
| Subject attendance | Test expected a table while the implemented page uses interactive subject cards | Assert live summary and both subject-card buttons | Subject attendance journey passes |
| Cross-student security test | The request used student ID 1, which is the signed-in student's own record | Request student ID 2 and require HTTP 403 `FORBIDDEN` | Browser and backend cross-student tests pass |
| Accessible headings | Top bar and page header both rendered an `h1`, creating ambiguous headings | Keep a single page `h1`; render top-bar context as a paragraph | Heading queries and accessibility snapshots pass |
| Progress display | Radix Progress did not receive its `value`, leaving bars indeterminate | Forward the calculated value to `ProgressPrimitive.Root` | Component tests and rendered progress bars pass |
| Duplicate sections | Duplicate creation returned 400 instead of the documented conflict | Raise a conflict, producing HTTP 409 | Academic API suite passes |
| Dashboard semantics | Classes conducted and marks recorded were conflated | Expose `totalClasses` and `totalRecords`; use eligible conducted classes consistently | Dashboard and attendance-policy suites pass |
| Rate-limit order | An exhausted failed-login window prevented the successful-login assertion | Execute successful-login checks before failed-attempt blocking | Both credential limiter tests pass |
| E2E database privileges | The application user could not initially access the E2E schema | Pre-provision the isolated schema and grant only that schema to the app user | Migration and seed complete during Playwright setup |
| E2E database creation | Global setup attempted server-level database creation as a non-admin app user | Make creation best-effort; keep schema creation as a one-time DBA step | Playwright setup completes without elevated app privileges |
| Prisma generate during E2E | Regeneration caused Windows engine-lock errors and restarted `tsx watch` | Reset with `--skip-generate`; generation remains part of the production build | Stable E2E setup and successful production generation |
| Browser selection | Desktop Chrome device settings selected the installed Chrome channel | Use Playwright's bundled Chromium explicitly | 19 tests complete in Chromium |
| Local MySQL startup | Git Bash converted the Windows `cmd /c` argument, so the start script was not invoked | Invoke the project script with the correct Windows-shell escaping | Port 3307 listens and health reports connected |
| Vite/Vitest types | Vite 6 plugin types conflicted with Vitest 2's nested Vite 5 types | Keep Vite runtime config and Vitest test config in separate files | TypeScript 0 errors; all 37 frontend tests still pass |
| Test selectors | Password, Faculty, Average attendance and Below threshold queries matched multiple elements | Use exact accessible names and scoped navigation queries | Strict Playwright locators pass |

---

## 4. Detailed executed test inventory

Every test listed in this section executed and passed in the final full runs.

### 4.1 `backend/tests/academic.test.ts` — 28/28

**Departments**

- lists the departments
- creates a department with an upper case code
- rejects a duplicate department code
- rejects a department with a missing name
- refuses to delete a department that is still linked
- updates a department
- does not let a faculty member manage departments

**Academic years**

- creates an academic year
- rejects an academic year whose end date precedes its start date
- rejects a malformed date
- refuses to delete an academic year that owns attendance history
- deactivates an academic year that has no history

**Semesters**

- creates a semester inside an academic year
- rejects a duplicate semester number in the same year
- filters the semesters by academic year
- refuses to delete a semester that still owns subjects

**Subjects**

- creates a subject with an upper case code
- rejects a subject code that is already taken
- rejects a subject that points at an unknown department
- filters the subjects by department and semester
- searches the subjects by code and name
- deactivates a subject that owns attendance history instead of deleting it

**Sections and academic options**

- creates a section offering
- rejects a duplicate section offering
- filters the sections by subject
- refuses to delete a section that owns attendance history
- returns the options the forms need
- requires a signed in user

### 4.2 `backend/tests/attendance.test.ts` — 28/28

**Session creation**

- creates a session and stores it in MySQL
- rejects a duplicate session slot with 409
- rejects a future attendance date with 400
- rejects a section that belongs to a different subject with 400
- rejects a subject with no faculty assignment with 400
- rejects a malformed date with 422
- rejects a malformed time with 422
- rejects a session number outside the allowed range with 422

**Session roster**

- returns the roster with the recorded statuses
- reports unmarked students in the summary
- returns 404 for an unknown session

**Transactional attendance submission**

- saves the marked statuses and records who marked them
- does not create duplicate records when the same session is submitted twice
- rejects a student who is not enrolled in the section
- rejects the same student twice in one submission
- rejects an empty submission with 422
- rejects an unknown attendance status with 422
- rejects a submission for an unknown session with 404
- rejects a submission for a cancelled session with 400

**Corrections, calculations and history**

- corrects a single record
- rejects an invalid status with 422
- returns 404 for an unknown record
- produces a monthly breakdown
- excludes a cancelled session from the attendance percentage
- paginates the record list
- filters the record list by status
- filters the record list by subject
- returns the sessions scheduled for today

### 4.3 `backend/tests/attendance-policy.test.ts` — 10/10

- uses the configured counted statuses
- counts PRESENT and LATE as attended but not ON_LEAVE
- excludes cancelled and future sessions from the denominator
- computes the overall percentage across every subject
- reports a lower percentage for a frequently absent student
- computes the percentage for a student in another section
- keeps the percentage to two decimal places
- reports zero for a student with no attendance at all
- flags students below the configured threshold
- honours a custom threshold

### 4.4 `backend/tests/auth.test.ts` — 27/27

**Login**

- signs a user in and returns the profile plus a CSRF token
- sets an http-only session cookie that is not readable from JavaScript
- never returns the password hash or the raw password
- rejects a wrong password with 401
- rejects an unknown email with the same message as a wrong password
- is case insensitive on the email address
- rejects a malformed email with 422
- rejects a missing password with 422
- refuses to sign in a deactivated account

**Current session and logout**

- returns the signed-in profile for a valid session
- rejects a request without a session cookie with 401
- rejects a tampered session cookie with 401
- rejects a session whose account was deactivated after login
- clears the session cookie
- requires a CSRF token
- rejects a mismatched CSRF token
- accepts the CSRF token that matches the double-submit cookie

**CSRF and passwords**

- blocks a POST without any CSRF token
- allows safe methods without a CSRF token
- does not disclose whether an email exists
- resets the password with a valid token and invalidates the old password
- rejects a reset with an unknown token
- rejects a reset with a weak password
- cannot reuse a reset token once it has been used
- changes the password when the current one is correct
- rejects the change when the current password is wrong

**Health**

- reports a healthy database connection

### 4.5 `backend/tests/dashboards.test.ts` — 15/15

**Administrator**

- reports totals that match the database
- never returns hardcoded statistics
- lists the students below the attendance threshold
- returns department and subject attendance breakdowns
- records the sign in in the audit trail

**Faculty**

- reports only the assignments the faculty member teaches
- counts the students enrolled in the faculty own classes
- reports the number of sessions held for each assignment
- returns per assignment attendance statistics
- scopes a second faculty member to their own classes

**Student**

- reports the student own overall attendance
- returns a card per subject
- raises a low attendance alert below the threshold
- raises no alert for a student above the threshold
- returns a monthly chart series

### 4.6 `backend/tests/database.test.ts` — 24/24

**Unique constraints**

- rejects a second user with the same email address
- rejects a second student with the same roll number
- rejects a second faculty member with the same faculty id
- rejects a second subject with the same subject code
- rejects a duplicate semester number inside the same academic year
- rejects a duplicate section offering
- rejects a duplicate faculty assignment for the same section
- rejects a duplicate enrollment for the same student and subject
- rejects a duplicate attendance session in the same slot
- rejects a second attendance record for the same student and session

**Referential integrity and transactions**

- refuses to delete a department that still owns students
- refuses to delete an academic year that still owns subjects
- cascades the semesters of a deleted academic year
- clears the assignment link of a session when the assignment is deleted
- refuses to delete a student who owns attendance history
- rolls back every statement when one of them fails
- rolls back an atomic batch when a later statement violates a constraint
- commits every statement when the batch succeeds

**Indexes and history**

- indexes the columns the attendance queries rely on
- indexes the attendance records by student and status
- indexes the lookup columns used by the list screens
- uses a unique index for the lookup keys
- uses a unique index for the attendance business keys
- keeps the attendance history of a deactivated student

### 4.7 Rate-limit suites — 4/4

**`rate-limit-auth.test.ts` — 2/2**

- does not count a successful sign in towards the limit
- blocks repeated failed sign in attempts

**`rate-limit-api.test.ts` — 2/2**

- blocks the requests that exceed the window limit
- exposes the standard rate limit headers

### 4.8 `backend/tests/rbac.test.ts` — 42/42

**Unauthenticated and student boundaries**

- rejects every protected endpoint with 401
- cannot list students
- cannot list faculty
- cannot read audit logs
- cannot open the admin dashboard
- can open the student dashboard
- cannot open the faculty dashboard
- can read its own student record
- cannot read another student record
- can read its own attendance summary
- cannot read another student attendance summary
- is pinned to its own records when listing attendance records
- cannot open a session roster
- cannot create an attendance session
- cannot submit attendance records
- sees no teaching assignments
- sees only its own enrollments
- cannot read a subject roster
- cannot export the student list

**Faculty boundaries**

- cannot list students
- cannot read audit logs
- cannot open the admin dashboard
- can open the faculty dashboard
- cannot open the student dashboard
- sees only its own teaching assignments
- sees only its own attendance sessions
- cannot open a session belonging to another faculty member
- cannot mark attendance for another faculty member session
- cannot create a session for a subject it does not teach
- cannot view a student that is not enrolled in its classes
- cannot read the attendance of a student outside its classes
- cannot read the attendance summary of a student outside its classes
- cannot read the roster of a section it does not teach
- sees only enrollments for the classes it teaches
- cannot read the student list of another faculty member class
- cannot create students
- can see its own class students

**Administrator boundaries**

- can list students
- can list faculty
- can read audit logs
- can open only the administrative dashboard
- can open any session roster

### 4.9 `backend/tests/reports.test.ts` — 25/25

**Report discovery and generation**

- lists all nine report types
- builds the student-wise report from the database
- builds the subject-wise report from the database
- builds the class-wise report from the database
- builds the department-wise report from the database
- builds the date-wise report from the database
- builds the monthly report from the database
- builds the semester-wise report from the database
- builds the low-attendance report from the database
- builds the faculty-wise report from the database
- produces one row per student with attendance
- sorts the student report by ascending percentage
- applies the subject filter
- applies the date range filter
- rejects an unknown report type with 422
- rejects an inverted date range with 422

**Scoping and CSV**

- never includes a section the faculty member does not teach
- rejects a subject the faculty member does not teach
- rejects a section the faculty member does not teach
- only reports the student own attendance
- cannot widen the scope with a studentId parameter
- returns a CSV attachment for every report type
- writes the column labels as the header row
- respects the same filters as the on screen report
- does not export unrelated students for a student account

### 4.10 `backend/tests/students.test.ts` — 32/32

**List, search and filters**

- returns a paginated list with pagination metadata
- sorts by roll number
- searches by student name
- searches by roll number
- filters by section
- filters by department
- filters by active state

**Creation and validation**

- creates a student and stores the account in the database
- never returns the password hash
- rejects a duplicate roll number with 409
- rejects a duplicate email with 409
- rejects an invalid email with 422
- rejects a weak password with 422
- rejects a missing roll number with 422
- rejects a section longer than 10 characters with 422
- normalises the section to upper case
- stores the email in lower case

**Details, update and account lifecycle**

- returns the student with enrollments and an attendance summary
- returns 404 for an unknown student
- rejects a non numeric id with 422
- updates the student and its linked user
- rejects an invalid payload with 422
- returns 404 for an unknown student
- deactivates the account without deleting the student row
- reactivates the account
- resets the password of a student

**Import and export**

- creates valid rows and reports the failures
- rejects an empty row set with 400
- rejects a non array payload with 400
- does not create a user for a row that fails validation
- returns a CSV attachment containing the real student rows
- escapes formula injection in exported cells

### 4.11 Frontend unit/component inventory — 37/37

**`lib/utils.test.ts` — 8/8**

- merges class names and lets the last utility win
- formats a date for the local locale
- falls back to a dash for a missing or invalid date
- formats a percentage with the requested precision
- falls back to a dash for a missing percentage
- derives the tone from the threshold
- builds initials from the first two words
- returns today as a calendar date

**`lib/navigation.test.ts` — 6/6**

- sends every role to its own dashboard
- labels every role
- gives the administrator the full management surface
- never shows the administrative links to a faculty member
- never shows the administrative links to a student
- keeps the student navigation read only

**`lib/api.test.ts` — 7/7**

- returns the data block of a successful response
- always sends the session cookie
- attaches the CSRF token to mutating requests
- never sends the CSRF token on a safe request
- builds the query string and drops empty values
- turns an error payload into an ApiError
- never leaks a stack trace in the error message

**`components/attendance-display.test.tsx` — 6/6**

- labels every attendance status
- shows a neutral badge when nothing is marked
- renders the percentage with one decimal place
- uses the danger tone below the threshold
- uses the success tone at the threshold
- clamps the progress bar to the valid range

**`components/protected-route.test.tsx` — 4/4**

- sends a visitor to the sign in screen
- renders the page for a user with the right role
- blocks a user whose role is not allowed
- lets any signed in user through when no role is required

**`pages/auth/login.test.tsx` — 6/6**

- renders the sign in form
- validates the email address before calling the server
- requires a password
- shows the message returned by the server for invalid credentials
- lands the administrator on the administrator dashboard
- toggles the visibility of the password

### 4.12 Playwright journey inventory — 19/19

**Administrator — 6/6**

- lands on the administrator dashboard with live totals
- sees the full administrative navigation
- searches for a student and opens the student record
- opens the audit log of the recent activity
- generates a report and exports it as CSV
- cannot reach the faculty or student area

**Faculty — 6/6**

- lands on the faculty dashboard with the teaching load
- sees only the teaching navigation
- lists the assigned subjects and classes
- creates a session, marks the class and submits the attendance
- rejects a session for a future date
- cannot reach the administrative area

**Student — 7/7**

- lands on the student dashboard with the attendance summary
- sees a read only navigation
- reads the own attendance history
- reads the subject wise attendance
- downloads the own report
- cannot reach the administrative area
- cannot read the attendance of another student

---

## 5. Release verification and limits

| Check | Evidence |
|---|---|
| Backend build | Prisma Client generated; TypeScript compiled to `backend/dist` |
| Frontend build | 2,421 modules transformed; production assets written to `frontend/dist` |
| Development application | API on `http://localhost:5000`, web on `http://localhost:5173` |
| Live database health | HTTP 200 with `database: connected` |
| Live administrator UI | Dashboard rendered 180 fictional students, 6 faculty, 14 subjects and live attendance metrics |
| Attendance persistence | Browser journey created session, marked roster, submitted, reloaded and verified saved marks |
| Report downloads | Browser journeys received `.csv` downloads for administrator and student reports |
| Authorization | UI route guards and server API role/ownership checks both exercised |

No public deployment, Docker image build, managed cloud database, domain or
HTTPS certificate is claimed. Those require external infrastructure and
credentials that were not available. Deployment-ready Dockerfiles, Compose,
nginx configuration and a manual VPS runbook are provided in `docs/09-deployment.md`.

*End of document 10.*
