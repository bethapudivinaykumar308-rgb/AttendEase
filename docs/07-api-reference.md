# 07 — REST API Reference

**Document:** `docs/07-api-reference.md`
**Project:** AttendEase — Student Attendance Management System
**Base URL (development):** `http://localhost:5000/api`
**Source of truth:** `backend/src/routes/*.routes.ts`, `backend/src/controllers/*.controller.ts`,
`backend/src/validators/*.validator.ts`

---

## 7.0 Conventions

### 7.0.1 Base URL and transport

| Property | Value | Source |
|---|---|---|
| API mount point | `/api` | `backend/src/app.ts` — `app.use('/api', apiRouter)` |
| Development base URL | `http://localhost:5000/api` | `API_PORT` default `5000` in `backend/src/config/env.ts` |
| Frontend origin | `http://localhost:5173` | `APP_URL` default in `backend/src/config/env.ts` |
| Development proxy | `frontend/vite.config.ts` proxies `/api` to `VITE_API_PROXY` (default `http://localhost:5000`) | `frontend/vite.config.ts` |
| Protocol | HTTPS in production (`SECURE_COOKIES=true` also marks the session cookie `Secure`) | `backend/src/config/env.ts`, `backend/src/controllers/auth.controller.ts` |
| Request body format | `application/json` (limit 1 MB); `application/x-www-form-urlencoded` also accepted | `backend/src/app.ts` |
| Response format | JSON, except the CSV export endpoints | `backend/src/utils/response.ts` |

### 7.0.2 Response envelope

Every JSON response uses one of two shapes, produced by
`backend/src/utils/response.ts`.

**Success (single resource):**

```json
{
  "success": true,
  "data": { }
}
```

**Success (paginated collection):**

```json
{
  "success": true,
  "data": [ ],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "total": 42,
    "totalPages": 5
  }
}
```

`meta.totalPages` is `Math.max(1, Math.ceil(total / pageSize))`, so it is never
zero.

**Error:**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The submitted data is invalid",
    "details": [ { "field": "email", "message": "Enter a valid email address" } ]
  }
}
```

`details` is present only when the error carries one.

### 7.0.3 Authentication

Two mechanisms are accepted, in this order (`backend/src/middleware/auth.ts`,
`extractToken`):

1. The session cookie `attendease_token` — an `httpOnly`, `SameSite=Lax` JWT
   set by `POST /api/auth/login`.
2. The `Authorization: Bearer <jwt>` header — used by non-browser clients and
   automated tests.

The JWT payload is `{ sub, role, name, email }` and is signed with
`JWT_SECRET` (`JWT_EXPIRES_IN`, default `8h`).

### 7.0.4 CSRF protection

Every state-changing request (`POST`, `PUT`, `PATCH`, `DELETE`) to `/api`
must carry the CSRF token in two places:

* the readable cookie `attendease_csrf`, and
* the header `X-CSRF-Token`.

The comparison uses `crypto.timingSafeEqual`. The four exempt paths are
`/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/reset-password`
and `/api/health` (`backend/src/middleware/csrf.ts`, `EXEMPT_PATHS`). A
missing or mismatched token produces **403 `FORBIDDEN`**.

### 7.0.5 Common status codes

| Status | `error.code` | Raised when |
|---|---|---|
| 200 | — | Successful read, update or delete |
| 201 | — | Resource created (`sendSuccess(res, data, 201)`) |
| 400 | `BAD_REQUEST` | Semantic validation failure in a controller, e.g. "The selected section does not belong to the selected subject" |
| 401 | `UNAUTHORIZED` | No token, invalid/expired token, or the account no longer exists |
| 403 | `FORBIDDEN` | Role not permitted, deactivated account, ownership check failed, or CSRF token missing/invalid |
| 404 | `NOT_FOUND` | The referenced record does not exist |
| 404 | `ROUTE_NOT_FOUND` | The path is not a registered route (`notFoundHandler`) |
| 409 | `CONFLICT` | A controller detected a duplicate before the database did |
| 409 | `UNIQUE_CONSTRAINT` | Prisma error `P2002` — a unique index rejected the write |
| 409 | `FOREIGN_KEY_CONSTRAINT` | Prisma error `P2003` — the write would break a relationship |
| 422 | `VALIDATION_ERROR` | Zod schema failed; `details` lists each field and message |
| 429 | `RATE_LIMITED` | The API rate limiter rejected the request |
| 500 | `INTERNAL_SERVER_ERROR` | Unhandled exception; the message is generic in production |

Mapping is centralised in `backend/src/middleware/error.ts`.

### 7.0.6 Pagination and common query parameters

Where a `paginationSchema` is applied, the following query parameters are
accepted (`backend/src/validators/common.validator.ts`):

| Parameter | Type | Default | Validation |
|---|---|---|---|
| `page` | integer | `1` | `>= 1` |
| `pageSize` | integer | `10` | `1`–`100` |
| `search` | string | — | trimmed, optional |
| `sortBy` | string | — | trimmed, optional |
| `sortOrder` | `asc` \| `desc` | — | optional |

Identifiers in path parameters are validated as positive integers
(`idParam`, `studentIdParam`, `subjectIdParam`). Dates are supplied as
`YYYY-MM-DD` strings and converted to UTC midnight
(`dateOnlyString`, `parseDateOnly`), so that MySQL `DATE` columns are free of
timezone drift.

### 7.0.7 Role notation

The **Role** column below uses the notation of the route guards in
`backend/src/routes/`:

| Notation | Meaning |
|---|---|
| `Public` | No guard; the route is reachable without a session |
| `Any` | `requireAuth` — any authenticated, active account |
| `ADMIN` | `requireRole('ADMIN')` |
| `ADMIN, FACULTY` | `requireRole('ADMIN', 'FACULTY')` |

`requireRole(...)` expands to `[requireAuth, checkRole]`
(`backend/src/middleware/auth.ts`), so the role check always runs *after* the
session check and `req.user` is guaranteed to be populated.

---

## 7.1 Health

### 7.1.1 `GET /api/health`

Liveness and readiness probe. Executes `SELECT 1` against the database.

| | |
|---|---|
| **Role** | Public |
| **Request** | No body, no query parameters |
| **200** | `data.status = "ok"`, `data.database = "connected"`, `data.uptime` (seconds), `data.timestamp` (ISO 8601) |
| **503** | `data.status = "degraded"`, `data.database = "unavailable"`; `success` is `false` |

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "database": "connected",
    "uptime": 1834,
    "timestamp": "2026-03-02T09:15:22.104Z"
  }
}
```

---

## 7.2 Authentication and Session

All paths are relative to `/api/auth`. Source: `backend/src/routes/auth.routes.ts`.

### 7.2.1 `POST /api/auth/login`

| | |
|---|---|
| **Role** | Public (CSRF exempt) |
| **Body** | `email` (string, valid e-mail, lower-cased), `password` (string, 1–128 characters) |
| **200** | `data.user` (profile with the role-specific student/faculty record) and `data.csrfToken`; sets cookies `attendease_token` (httpOnly) and `attendease_csrf` (readable) |
| **400** | `BAD_REQUEST` — malformed body |
| **401** | `UNAUTHORIZED` — "Incorrect email or password" or "This account has been deactivated…" |
| **422** | `VALIDATION_ERROR` — invalid e-mail format or missing password |

The response deliberately does not distinguish "unknown e-mail" from "wrong
password"; a hash comparison is executed in both cases so that response time
does not disclose whether an account exists
(`backend/src/services/auth.service.ts`, `authenticate`).

### 7.2.2 `POST /api/auth/forgot-password`

| | |
|---|---|
| **Role** | Public (CSRF exempt) |
| **Body** | `email` (string, valid e-mail) |
| **200** | `data.message` = "If an account exists for that email, a password reset link has been sent." In **non-production** builds only, `data.resetToken` contains the raw token so that the flow can be completed without an SMTP server |
| **400 / 422** | Malformed body or invalid e-mail |

The HTTP status is 200 whether or not the address exists, which prevents
account enumeration. An audit entry with action `PASSWORD_RESET_REQUESTED` is
written in every case.

### 7.2.3 `POST /api/auth/reset-password`

| | |
|---|---|
| **Role** | Public (CSRF exempt) |
| **Body** | `token` (string, at least 20 characters), `password` (string, 8–128 characters with a lower-case letter, an upper-case letter and a digit) |
| **200** | `data.message` = "Your password has been reset. You can sign in now." |
| **400** | `BAD_REQUEST` — "This reset link is invalid or has expired. Please request a new one." |
| **422** | `VALIDATION_ERROR` — weak password or malformed token |

The token is stored only as a SHA-256 hash (`password_reset_tokens.token_hash`);
the reset consumes the token by setting `used_at` and deleting the user's
remaining unused tokens, all inside one transaction.

### 7.2.4 `GET /api/auth/me`

| | |
|---|---|
| **Role** | Any |
| **200** | `data.user` (id, name, e-mail, role, `isActive`, `createdAt`, and the nested `student` or `faculty` record) and `data.csrfToken`; refreshes the `attendease_csrf` cookie |
| **401** | Missing, invalid or expired token |
| **403** | Account deactivated |

### 7.2.5 `POST /api/auth/logout`

| | |
|---|---|
| **Role** | Any |
| **200** | `data.message` = "Signed out successfully"; clears the `attendease_token` and `attendease_csrf` cookies |
| **401** | Missing or invalid token |

### 7.2.6 `PUT /api/auth/password`

| | |
|---|---|
| **Role** | Any |
| **Body** | `currentPassword` (string, at least 1 character), `password` (new password, same strength policy as above) |
| **200** | `data.message` = "Password updated successfully" |
| **400** | `BAD_REQUEST` — "Your current password is incorrect" |
| **401** | Not signed in |
| **422** | `VALIDATION_ERROR` — weak new password |

### 7.2.7 `PUT /api/auth/profile`

| | |
|---|---|
| **Role** | Any |
| **Body** | `name` (string, 2–120 characters, optional) |
| **200** | `data.user` — the refreshed profile |
| **400** | `BAD_REQUEST` — "Nothing to update" when the body contains no name |
| **401** | Not signed in |
| **422** | `VALIDATION_ERROR` — name shorter than 2 characters |

---

## 7.3 Academic Master Data

All five academic resources follow an identical five-route shape:

| Method | Path | Role | Purpose |
|---|---|---|---|
| `GET` | `/{resource}/` | Any | Paginated list |
| `POST` | `/{resource}/` | ADMIN | Create |
| `GET` | `/{resource}/:id` | Any | Fetch one |
| `PUT` | `/{resource}/:id` | ADMIN | Update |
| `DELETE` | `/{resource}/:id` | ADMIN | Delete or deactivate |

`{resource}` is one of `departments`, `academic-years`, `semesters`,
`subjects`, `sections`. Source: `backend/src/routes/academic.routes.ts`.

### 7.3.1 Departments — `/api/departments`

| Method | Path | Role | Query / Body | Success | Notable errors |
|---|---|---|---|---|---|
| `GET` | `/` | Any | `page`, `pageSize`, `search` (matches `department_name` or `department_code`) | 200 paginated; each row includes `_count` with `students`, `faculty`, `subjects` | — |
| `POST` | `/` | ADMIN | `departmentName` (2–120), `departmentCode` (2–20, upper-cased) | 201 with the created department | 409 `UNIQUE_CONSTRAINT` on a duplicate code |
| `GET` | `/:id` | Any | — | 200 with the department and its `_count` | 404 `NOT_FOUND` |
| `PUT` | `/:id` | ADMIN | Any subset of the creation body | 200 with the updated department | 404 `NOT_FOUND`; 409 `UNIQUE_CONSTRAINT` |
| `DELETE` | `/:id` | ADMIN | — | 200 with `data.message` = "Department deleted" | 404 `NOT_FOUND`; **400** "This department is still linked to students, faculty or subjects. Remove those records first." |

### 7.3.2 Academic years — `/api/academic-years`

| Method | Path | Role | Query / Body | Success | Notable errors |
|---|---|---|---|---|---|
| `GET` | `/` | Any | `page`, `pageSize` | 200 paginated, ordered by `start_date` descending; each row includes `_count` with `semesters`, `subjects`, `sessions` | — |
| `POST` | `/` | ADMIN | `yearName` (2–20), `startDate` (`YYYY-MM-DD`), `endDate` (`YYYY-MM-DD`), `isActive` (boolean, optional) | 201 with the created academic year | 422 `VALIDATION_ERROR` when `endDate <= startDate`; 409 `UNIQUE_CONSTRAINT` on a duplicate `year_name` |
| `GET` | `/:id` | Any | — | 200 with the academic year and its `semesters` | 404 `NOT_FOUND` |
| `PUT` | `/:id` | ADMIN | Any subset of the creation body | 200 with the updated academic year | 404 `NOT_FOUND`; 422 `VALIDATION_ERROR` |
| `DELETE` | `/:id` | ADMIN | — | 200 "Academic year deleted" | 404 `NOT_FOUND`; **400** "This academic year already has subjects or attendance history and cannot be deleted. Deactivate it instead." |

### 7.3.3 Semesters — `/api/semesters`

| Method | Path | Role | Query / Body | Success | Notable errors |
|---|---|---|---|---|---|
| `GET` | `/` | Any | `page`, `pageSize`, `academicYearId` | 200 paginated; each row includes the parent `academicYear` and `_count` with `students`, `subjects` | — |
| `POST` | `/` | ADMIN | `semesterNumber` (1–12), `academicYearId`, `startDate`, `endDate`, `isActive` (optional) | 201 with the created semester and its academic year | 422 `VALIDATION_ERROR` when `endDate <= startDate`; 409 `UNIQUE_CONSTRAINT` on `(academic_year_id, semester_number)` |
| `GET` | `/:id` | Any | — | 200 with the semester, its academic year and `_count` | 404 `NOT_FOUND` |
| `PUT` | `/:id` | ADMIN | Any subset of the creation body | 200 with the updated semester | 404 `NOT_FOUND`; 422 `VALIDATION_ERROR` |
| `DELETE` | `/:id` | ADMIN | — | 200 "Semester deleted" | 404 `NOT_FOUND`; **400** "This semester is linked to students or subjects and cannot be deleted. Deactivate it instead." |

### 7.3.4 Subjects — `/api/subjects`

| Method | Path | Role | Query / Body | Success | Notable errors |
|---|---|---|---|---|---|
| `GET` | `/` | Any | `page`, `pageSize`, `search`, `departmentId`, `semesterId`, `academicYearId`, `isActive` (`true`\|`false`) | 200 paginated, ordered by `subject_code`; each row includes `department`, `semester` (with `academicYear`), `academicYear` and `_count` with `enrollments`, `assignments`, `sessions` | — |
| `POST` | `/` | ADMIN | `subjectCode` (2–40, upper-cased), `subjectName` (2–160), `departmentId`, `semesterId`, `academicYearId`, `credits` (0–20, default 3), `isActive` (optional) | 201 with the created subject | 409 `UNIQUE_CONSTRAINT` on a duplicate `subject_code`; 409 `FOREIGN_KEY_CONSTRAINT` if the referenced ids do not exist |
| `GET` | `/:id` | Any | — | 200 with the subject, its department, semester, academic year, `sections`, `assignments` (with the assigned faculty) and `_count` | 404 `NOT_FOUND` |
| `PUT` | `/:id` | ADMIN | Any subset of the creation body | 200 with the updated subject | 404 `NOT_FOUND`; 409 `UNIQUE_CONSTRAINT` / `FOREIGN_KEY_CONSTRAINT` |
| `DELETE` | `/:id` | ADMIN | — | 200 "Subject deleted" **or** 200 with the deactivated subject and `data.message` = "This subject has attendance history, so it was deactivated instead of deleted." | 404 `NOT_FOUND` |

The delete endpoint degrades to a soft delete (`is_active = false`) when the
subject already has attendance sessions, so that historical attendance is never
destroyed.

### 7.3.5 Sections — `/api/sections`

| Method | Path | Role | Query / Body | Success | Notable errors |
|---|---|---|---|---|---|
| `GET` | `/` | Any | `page`, `pageSize`, `subjectId`, `academicYearId` | 200 paginated; each row includes `subject`, `academicYear` and `_count` with `enrollments`, `assignments`, `sessions` | — |
| `POST` | `/` | ADMIN | `subjectId`, `academicYearId`, `section` (1–10 characters, upper-cased) | 201 with the created section | 409 `CONFLICT` "This section already exists for the selected subject and year"; 409 `UNIQUE_CONSTRAINT` on `(subject_id, section, academic_year_id)` |
| `GET` | `/:id` | Any | — | 200 with the section, its subject, academic year, `assignments` (with faculty) and `_count` | 404 `NOT_FOUND` |
| `PUT` | `/:id` | ADMIN | Any subset of the creation body | 200 with the updated section | 404 `NOT_FOUND`; 409 `UNIQUE_CONSTRAINT` |
| `DELETE` | `/:id` | ADMIN | — | 200 "Section deleted" | 404 `NOT_FOUND`; **400** "This section already has attendance history and cannot be deleted. Remove the sessions first." |

### 7.3.6 `GET /api/academic-options/`

| | |
|---|---|
| **Role** | Any |
| **200** | `data.departments`, `data.academicYears`, `data.semesters`, `data.subjects` (active only), `data.sections` — the complete filter-option set used by the React filter panels in one round trip |
| **401** | Not signed in |

---

## 7.4 People

### 7.4.1 Students — `/api/students`

Source: `backend/src/routes/people.routes.ts`,
`backend/src/controllers/students.controller.ts`.

| Method | Path | Role | Request | Success | Notable errors |
|---|---|---|---|---|---|
| `GET` | `/` | ADMIN | `page`, `pageSize`, `search` (name, e-mail or roll number), `departmentId`, `semesterId`, `academicYearId`, `section`, `isActive` | 200 paginated, ordered by roll number; each row includes the user, department and semester | — |
| `GET` | `/export` | ADMIN | None | 200 `text/csv` download named `students.csv`; columns: Roll Number, Name, Email, Department, Department Code, Semester, Academic Year, Section, Admission Year, Status | — |
| `POST` | `/import` | ADMIN | `{ "rows": [ { "name", "email", "rollNumber", "departmentCode", "semesterNumber", "section", "admissionYear", "password" } ] }` | 200 with `data.created`, `data.skipped`, `data.errors[]` — per-row failures are reported in the payload rather than aborting the import | 400 "No rows were provided for import" |
| `POST` | `/` | ADMIN | `name`, `email`, `password` (strength policy), `rollNumber` (2–40), `departmentId`, `semesterId`, `section` (1–10, upper-cased), `admissionYear` (1990–2100) | 201 with the created student (user + student record) | 409 `CONFLICT` "An account with this email already exists" or "A student with this roll number already exists"; 422 `VALIDATION_ERROR` |
| `GET` | `/:id` | Any | — | 200 with the student, their `enrollments` (with subject, academic year and section), `summary` (overall percentage) and `subjectSummaries` | 404 `NOT_FOUND`; **403** for a `STUDENT` requesting another student ("You can only view your own student record"); **403** for a `FACULTY` who teaches none of that student's subjects |
| `PUT` | `/:id` | ADMIN | Any subset of `name`, `email`, `rollNumber`, `departmentId`, `semesterId`, `section`, `admissionYear`, `isActive` | 200 with the updated student | 404 `NOT_FOUND`; 409 `UNIQUE_CONSTRAINT`; 422 `VALIDATION_ERROR` |
| `DELETE` | `/:id` | ADMIN | — | 200 `data.message` = "Student deactivated" — the account is deactivated, never hard-deleted | 404 `NOT_FOUND` |
| `POST` | `/:id/reactivate` | ADMIN | — | 200 "Student reactivated" | 404 `NOT_FOUND` |
| `POST` | `/:id/reset-password` | ADMIN | `password` (strength policy) | 200 "Password reset successfully" | 404 `NOT_FOUND`; 422 `VALIDATION_ERROR` |
| `GET` | `/:id/attendance` | Any | — | 200 with `data.overall`, `data.subjects`, `data.monthly` | 404 `NOT_FOUND`; **403** for a `STUDENT` requesting another student |

Notes:

* The bulk import resolves `departmentCode` to a department and
  `semesterNumber` to the most recent **active** academic year; rows that
  cannot be resolved are reported in `data.errors`.
* A row without an explicit `password` receives the default `Attend@123`.
* `DELETE` on a student performs a soft delete: `users.is_active` is set to
  `false` and the attendance history in `attendance_records` is preserved.

### 7.4.2 Faculty — `/api/faculty`

| Method | Path | Role | Request | Success | Notable errors |
|---|---|---|---|---|---|
| `GET` | `/` | ADMIN | `page`, `pageSize`, `search` (name, e-mail, faculty id or designation), `departmentId`, `isActive` | 200 paginated, ordered by faculty id; each row includes the user, department and `_count.assignments` | — |
| `GET` | `/export` | ADMIN | None | 200 `text/csv` download named `faculty.csv`; columns: Faculty ID, Name, Email, Department, Designation, Assigned Subjects, Status | — |
| `POST` | `/` | ADMIN | `name`, `email`, `password`, `facultyId` (2–40), `departmentId`, `designation` (2–80) | 201 with the created faculty member | 409 `CONFLICT` "An account with this email already exists" or "A faculty member with this ID already exists"; 422 `VALIDATION_ERROR` |
| `GET` | `/:id` | Any | — | 200 with the faculty member, their `assignments` (with subject, section and academic year) and `sessionCount` | 404 `NOT_FOUND` |
| `PUT` | `/:id` | ADMIN | Any subset of `name`, `email`, `facultyId`, `departmentId`, `designation`, `isActive` | 200 with the updated faculty member | 404 `NOT_FOUND`; 409 `UNIQUE_CONSTRAINT`; 422 `VALIDATION_ERROR` |
| `DELETE` | `/:id` | ADMIN | — | 200 "Faculty member deactivated" | 404 `NOT_FOUND` |
| `POST` | `/:id/reactivate` | ADMIN | — | 200 "Faculty member reactivated" | 404 `NOT_FOUND` |
| `POST` | `/:id/reset-password` | ADMIN | `password` (strength policy) | 200 "Password reset successfully" | 404 `NOT_FOUND`; 422 `VALIDATION_ERROR` |

---

## 7.5 Assignments and Enrollments

### 7.5.1 Faculty-subject assignments — `/api/assignments`

Source: `backend/src/controllers/assignments.controller.ts`.

| Method | Path | Role | Request | Success | Notable errors |
|---|---|---|---|---|---|
| `GET` | `/` | Any | `page`, `pageSize`, `search`, `facultyId`, `subjectId`, `academicYearId`, `sectionId` | 200 paginated; each row includes faculty, subject, section, academic year and `_count.sessions` | — |
| `POST` | `/` | ADMIN | `facultyId`, `subjectId`, `sectionId`, `academicYearId` | 201 with the created assignment | 404 `NOT_FOUND` if faculty, subject or section is missing; 400 "The selected section does not belong to the selected subject"; 400 "The selected section belongs to a different academic year"; 409 `CONFLICT` "This faculty member is already assigned to this subject and section" |
| `PUT` | `/:id` | ADMIN | Any subset of the creation body | 200 with the updated assignment | 404 `NOT_FOUND`; 409 `UNIQUE_CONSTRAINT` |
| `DELETE` | `/:id` | ADMIN | — | 200 "Assignment removed" | 404 `NOT_FOUND`; **400** "This assignment already has attendance sessions recorded against it and cannot be removed." |

Scoping: a `FACULTY` caller receives only their own assignments; an `ADMIN`
may filter by `facultyId` and `subjectId`.

### 7.5.2 Student enrolments — `/api/enrollments`

| Method | Path | Role | Request | Success | Notable errors |
|---|---|---|---|---|---|
| `GET` | `/` | Any | `page`, `pageSize`, `search`, `subjectId`, `sectionId`, `academicYearId`, `studentId` | 200 paginated; each row includes student (with user), subject, section and academic year | — |
| `POST` | `/` | ADMIN | `studentIds` (array of positive integers, at least 1), `subjectId`, `academicYearId`, `sectionId` (optional) | 201 with `data.created`, `data.skipped` and `data.message` | 404 `NOT_FOUND` if the subject or section is missing; 400 "The selected section does not belong to the selected subject"; 422 `VALIDATION_ERROR` |
| `DELETE` | `/:id` | ADMIN | — | 200 "Enrollment removed" | 404 `NOT_FOUND`; **400** "This student already has attendance records for the subject, so the enrollment cannot be removed." |
| `GET` | `/subject/:subjectId` | Any | `sectionId` (optional query parameter) | 200 with an array of roster entries: `studentId`, `rollNumber`, `name`, `email`, `section`, `isActive`, `enrollmentId` | 403 `FORBIDDEN` — "You are not assigned to teach this subject" (faculty) or "Students cannot view subject rosters" (student) |

The `POST` endpoint is idempotent: students who are already enrolled are
counted in `data.skipped` rather than rejected, and the database uniqueness
rule `(student_id, subject_id, academic_year_id)` guarantees that a duplicate
row cannot be created.

---

## 7.6 Attendance

All paths are relative to `/api/attendance`. Source:
`backend/src/routes/attendance.routes.ts`,
`backend/src/controllers/attendance.controller.ts`.

### 7.6.1 `GET /api/attendance/sessions`

| | |
|---|---|
| **Role** | Any |
| **Query** | `page`, `pageSize`, `search` (subject name, subject code or topic), `subjectId`, `facultyId`, `sectionId`, `academicYearId`, `departmentId`, `date`, `startDate`, `endDate`, `status` |
| **200** | Paginated sessions ordered by `attendance_date` descending then `session_number` descending; each row includes `subject` (with department), `faculty` (with user name), `sectionOffering`, `academicYear`, `_count.records` and a computed `summary` of the four statuses |
| **401** | Not signed in |

### 7.6.2 `GET /api/attendance/sessions/today`

| | |
|---|---|
| **Role** | Any |
| **200** | A non-paginated array of the sessions whose `attendance_date` is today, ordered by `start_time` ascending, each with the same `summary` block as above |
| **401** | Not signed in |

This route is registered **before** `GET /sessions/:id` so that the literal
segment `today` is not captured by the `:id` parameter.

### 7.6.3 `POST /api/attendance/sessions`

| | |
|---|---|
| **Role** | ADMIN, FACULTY |
| **Body** | `subjectId` (positive integer), `sectionId` (positive integer), `attendanceDate` (`YYYY-MM-DD`), `startTime` (optional, `HH:MM` or `H:MM AM/PM`), `endTime` (optional, same format), `topic` (optional, at most 200 characters), `sessionNumber` (1–20, default 1), `facultyId` (optional positive integer) |
| **201** | The created session with `subject`, `faculty`, `sectionOffering` and `academicYear` |
| **400** | "Attendance cannot be recorded for a future date"; "Section not found"; "The selected section does not belong to the selected subject"; "No faculty member is assigned to this subject and section. Create the assignment first." |
| **403** | "You are not assigned to teach this subject and section" (faculty only) |
| **404** | The referenced section does not exist |
| **409** | `CONFLICT` — "Session {n} already exists for {code} on {date}." (raised before the insert when the `unique_session_slot` slot is taken) |
| **422** | `VALIDATION_ERROR` — malformed body |

Notes:

* The faculty member is **derived from the matching `faculty_subjects`
  assignment**, not from the request body. The optional `facultyId` field in
  `createSessionSchema` is accepted by the validator but not read by the
  controller.
* The academic year is taken from the section (`section.academicYearId`), so
  the session and the section can never disagree about the year.
* The section label is copied into `attendance_sessions.section`, the
  denormalised snapshot described in `docs/05-normalization.md`, Section 4.1.

### 7.6.4 `GET /api/attendance/sessions/:id`

| | |
|---|---|
| **Role** | Any |
| **200** | The session with `subject`, `faculty`, `sectionOffering`, `academicYear`, a `roster` array (`studentId`, `rollNumber`, `name`, `email`, `section`, `isActive`, `attendanceStatus`, `remarks`, `recordId`, `markedBy`, `markedAt`) and a `summary` that includes an `unmarked` count |
| **403** | "You can only view sessions for subjects you teach" — raised only for a `FACULTY` whose `faculty_id` differs from the session's |
| **404** | "Attendance session not found" |

### 7.6.5 `POST /api/attendance/sessions/:id/records`

| | |
|---|---|
| **Role** | ADMIN, FACULTY |
| **Body** | `{ "records": [ { "studentId", "attendanceStatus", "remarks" } ] }` — at least 1 and at most 1000 entries; `attendanceStatus` is one of `PRESENT`, `ABSENT`, `LATE`, `ON_LEAVE`; `remarks` is optional and at most 255 characters |
| **200** | `data.message` = "Attendance saved for {n} student(s)", `data.summary` (the four status counts) and `data.total` |
| **400** | "This session has been cancelled"; "One or more students are not enrolled in this section and cannot be marked." (with `details.studentIds`); "The same student was submitted more than once" |
| **403** | "You can only mark attendance for subjects you teach" |
| **404** | "Attendance session not found" |
| **422** | `VALIDATION_ERROR` — fewer than 1 or more than 1000 records, unknown status value |

The submission is executed as a single database transaction using an upsert
keyed on `(attendance_session_id, student_id)`, so submitting the same
roster twice updates the existing records rather than creating duplicates.

### 7.6.6 `POST /api/attendance/sessions/:id/cancel`

| | |
|---|---|
| **Role** | ADMIN, FACULTY |
| **200** | `data.message` = "Session cancelled. It no longer counts towards attendance." The session's `is_cancelled` flag is set; existing records are retained |
| **404** | "Attendance session not found" |

### 7.6.7 `PUT /api/attendance/records/:id`

| | |
|---|---|
| **Role** | ADMIN, FACULTY |
| **Body** | `attendanceStatus` (`PRESENT` \| `ABSENT` \| `LATE` \| `ON_LEAVE`), `remarks` (optional, at most 255 characters) |
| **200** | The updated record, including the student's roll number and name |
| **403** | "You can only correct attendance for subjects you teach" |
| **404** | "Attendance record not found" |
| **422** | `VALIDATION_ERROR` — unknown status value |

The update also refreshes `marked_by` and `marked_at`, and writes an audit
entry with action `UPDATE` recording the previous and new status.

### 7.6.8 `GET /api/attendance/records`

| | |
|---|---|
| **Role** | Any |
| **Query** | `page`, `pageSize`, `studentId`, `status`, `subjectId`, `sectionId`, `academicYearId`, `departmentId`, `facultyId`, `startDate`, `endDate` |
| **200** | Paginated records ordered by session date descending then roll number ascending; each row includes the session (id, date, subject, section) and the student (id, roll number, department, name) |
| **401** | Not signed in |

### 7.6.9 `GET /api/attendance/student/:studentId`

| | |
|---|---|
| **Role** | ADMIN, FACULTY, STUDENT |
| **200** | `data.student` (id, roll number, name), `data.overall`, `data.subjects` (per-subject breakdown) and `data.monthly` |
| **403** | "You can only view your own attendance" (student); "You do not teach any subject this student is enrolled in" (faculty) |
| **404** | "Student not found" |

### 7.6.10 `GET /api/attendance/subject/:subjectId`

| | |
|---|---|
| **Role** | ADMIN, FACULTY |
| **200** | `data.subject`, `data.totalSessions`, `data.attended`, `data.percentage` and `data.summary` (the four status counts) over all eligible sessions of the subject |
| **403** | "You do not teach this subject" |
| **404** | "Subject not found" |

---

## 7.7 Reports

All paths are relative to `/api/reports`. Source:
`backend/src/routes/attendance.routes.ts` (`reportsRouter`),
`backend/src/controllers/reports.controller.ts`.

### 7.7.1 `GET /api/reports/types`

| | |
|---|---|
| **Role** | Any |
| **200** | `data` is an array of `{ "value", "label" }` objects for the nine report types: `student-wise`, `subject-wise`, `class-wise`, `department-wise`, `date-wise`, `monthly`, `semester-wise`, `low-attendance`, `faculty-wise` |
| **401** | Not signed in |

### 7.7.2 `GET /api/reports/`

| | |
|---|---|
| **Role** | Any |
| **Query** | `reportType` (**required**, one of the nine values above), `academicYearId`, `semesterId`, `departmentId`, `subjectId`, `sectionId`, `section`, `studentId`, `facultyId`, `startDate`, `endDate`, `status`, `threshold` (1–100), plus the standard pagination parameters |
| **200** | `data.title`, `data.columns[]` (`key`, `label`, optional `align`) and `data.rows[]`; the `low-attendance` type additionally returns `data.summary` with `Threshold` and `Students below threshold` |
| **400** | `BAD_REQUEST` — "End date must be on or after the start date" (raised by the `reportQuerySchema` refinement) |
| **403** | "You do not teach the selected subject" (faculty requesting a subject they do not teach); "No student profile is linked to this account" (student without a student record) |
| **422** | `VALIDATION_ERROR` — missing or unknown `reportType`, malformed date range |

Scoping applied by `scopeFilters`:

* `ADMIN` — the filters are used unchanged.
* `FACULTY` — the report is restricted to the subjects the caller teaches; if
  `subjectId` is absent it defaults to the first taught subject.
* `STUDENT` — the report is restricted to the caller's own student record.

### 7.7.3 `GET /api/reports/export`

| | |
|---|---|
| **Role** | Any |
| **Query** | Identical to `GET /api/reports/` |
| **200** | `text/csv` download named `attendance-{reportType}-report.csv`, with the report's own column labels as the header row |
| **400 / 403 / 422** | As for `GET /api/reports/` |

CSV cells that begin with `=`, `+`, `-` or `@` are prefixed with a single
quote so that spreadsheet software treats them as text rather than executing
them (`backend/src/utils/csv.ts`).

---

## 7.8 Dashboard

All paths are relative to `/api/dashboard`. Source:
`backend/src/routes/dashboard.routes.ts`,
`backend/src/controllers/dashboard.controller.ts`.

### 7.8.1 `GET /api/dashboard/admin`

| | |
|---|---|
| **Role** | ADMIN |
| **200** | `data.stats` (`totalStudents`, `totalFaculty`, `totalDepartments`, `totalSubjects`, `totalSessions`, `todaySessions`, `activeStudents`, `averageAttendance`, `studentsBelowThreshold`, `threshold`), `data.trend` (seven-day series), `data.departmentAttendance`, `data.subjectAttendance`, `data.belowThreshold` (up to ten students, each with `studentId`, `name`, `rollNumber` and `percentage`), `data.recentSessions`, `data.recentUsers`, `data.recentAuditLogs` |
| **403** | Not an administrator |

`totalSessions` counts **classes actually conducted**: sessions whose date has
passed and that have not been cancelled. Cancelled and future sessions are
excluded, so the figure always matches the denominator used by the attendance
percentage.

### 7.8.2 `GET /api/dashboard/faculty`

| | |
|---|---|
| **Role** | FACULTY |
| **200** | `data.stats` (`assignedSubjects`, `assignedClasses`, `totalStudents`, `totalEnrollments`, `todaySessions`), `data.assignments` (each with a `sessionCount`), `data.assignmentStatistics`, `data.subjectStatistics`, `data.recentSessions` |
| **200 (no faculty record)** | `data.stats` is `{}` and `data.assignments` and `data.sessions` are empty arrays — the endpoint degrades gracefully rather than failing |
| **403** | The role is neither administrator nor faculty |

`data.subjectStatistics` and `data.assignmentStatistics` separate two
different quantities so that the percentage can never be computed against the
wrong denominator:

| Field | Meaning |
|---|---|
| `present`, `absent`, `late`, `onLeave` | The number of attendance records with that status |
| `totalClasses` | Classes **conducted** for that subject or assignment (past, not cancelled) |
| `totalRecords` | Attendance **records** stored for that subject or assignment |
| `percentage` | `(present + late) / totalRecords × 100`, rounded to two decimals |

### 7.8.3 `GET /api/dashboard/student`

| | |
|---|---|
| **Role** | STUDENT |
| **200** | `data.overall`, `data.subjects`, `data.monthly`, `data.alerts` (low-attendance alerts with `type`, `severity`, `title`, `message`, `subjectId`) and `data.threshold` |
| **200 (no student record)** | `data.overall` is `null` and the remaining arrays are empty |
| **403** | The role is not one of the three permitted roles |

An alert has severity `critical` when the subject percentage is more than 15
points below the threshold, and `warning` otherwise.

---

## 7.9 Audit Log

All paths are relative to `/api/audit-logs`. Source:
`backend/src/routes/dashboard.routes.ts` (`auditRouter`),
`backend/src/controllers/audit.controller.ts`.

### 7.9.1 `GET /api/audit-logs`

| | |
|---|---|
| **Role** | ADMIN |
| **Query** | `page`, `pageSize`, `search` (action, entity type or user name), `action`, `entityType`, `userId`, `startDate`, `endDate` |
| **200** | Paginated entries ordered by `created_at` descending; each entry includes the acting user's id, name, e-mail and role |
| **403** | Not an administrator |

### 7.9.2 `GET /api/audit-logs/export`

| | |
|---|---|
| **Role** | ADMIN |
| **Query** | `action`, `entityType` (both optional) |
| **200** | `text/csv` download named `audit-logs.csv`; columns: Timestamp, User, Role, Action, Entity Type, Entity ID, Details, IP Address. At most 5000 rows are exported |
| **403** | Not an administrator |

---

## 7.10 Complete Endpoint Index

Seventy-eight routes are registered under `/api`.

| # | Method | Path | Role | Request | Success |
|---|---|---|---|---|---|
| 1 | `GET` | `/api/health` | Public | — | 200 / 503 |
| 2 | `POST` | `/api/auth/login` | Public | body | 200 |
| 3 | `POST` | `/api/auth/forgot-password` | Public | body | 200 |
| 4 | `POST` | `/api/auth/reset-password` | Public | body | 200 |
| 5 | `GET` | `/api/auth/me` | Any | — | 200 |
| 6 | `POST` | `/api/auth/logout` | Any | — | 200 |
| 7 | `PUT` | `/api/auth/password` | Any | body | 200 |
| 8 | `PUT` | `/api/auth/profile` | Any | body | 200 |
| 9 | `GET` | `/api/departments/` | Any | query | 200 |
| 10 | `POST` | `/api/departments/` | ADMIN | body | 201 |
| 11 | `GET` | `/api/departments/:id` | Any | — | 200 |
| 12 | `PUT` | `/api/departments/:id` | ADMIN | body | 200 |
| 13 | `DELETE` | `/api/departments/:id` | ADMIN | — | 200 |
| 14 | `GET` | `/api/academic-years/` | Any | query | 200 |
| 15 | `POST` | `/api/academic-years/` | ADMIN | body | 201 |
| 16 | `GET` | `/api/academic-years/:id` | Any | — | 200 |
| 17 | `PUT` | `/api/academic-years/:id` | ADMIN | body | 200 |
| 18 | `DELETE` | `/api/academic-years/:id` | ADMIN | — | 200 |
| 19 | `GET` | `/api/semesters/` | Any | query | 200 |
| 20 | `POST` | `/api/semesters/` | ADMIN | body | 201 |
| 21 | `GET` | `/api/semesters/:id` | Any | — | 200 |
| 22 | `PUT` | `/api/semesters/:id` | ADMIN | body | 200 |
| 23 | `DELETE` | `/api/semesters/:id` | ADMIN | — | 200 |
| 24 | `GET` | `/api/subjects/` | Any | query | 200 |
| 25 | `POST` | `/api/subjects/` | ADMIN | body | 201 |
| 26 | `GET` | `/api/subjects/:id` | Any | — | 200 |
| 27 | `PUT` | `/api/subjects/:id` | ADMIN | body | 200 |
| 28 | `DELETE` | `/api/subjects/:id` | ADMIN | — | 200 |
| 29 | `GET` | `/api/sections/` | Any | query | 200 |
| 30 | `POST` | `/api/sections/` | ADMIN | body | 201 |
| 31 | `GET` | `/api/sections/:id` | Any | — | 200 |
| 32 | `PUT` | `/api/sections/:id` | ADMIN | body | 200 |
| 33 | `DELETE` | `/api/sections/:id` | ADMIN | — | 200 |
| 34 | `GET` | `/api/academic-options/` | Any | — | 200 |
| 35 | `GET` | `/api/students/` | ADMIN | query | 200 |
| 36 | `GET` | `/api/students/export` | ADMIN | — | 200 CSV |
| 37 | `POST` | `/api/students/import` | ADMIN | body | 200 |
| 38 | `POST` | `/api/students/` | ADMIN | body | 201 |
| 39 | `GET` | `/api/students/:id` | Any | — | 200 |
| 40 | `PUT` | `/api/students/:id` | ADMIN | body | 200 |
| 41 | `DELETE` | `/api/students/:id` | ADMIN | — | 200 |
| 42 | `POST` | `/api/students/:id/reactivate` | ADMIN | — | 200 |
| 43 | `POST` | `/api/students/:id/reset-password` | ADMIN | body | 200 |
| 44 | `GET` | `/api/students/:id/attendance` | Any | — | 200 |
| 45 | `GET` | `/api/faculty/` | ADMIN | query | 200 |
| 46 | `GET` | `/api/faculty/export` | ADMIN | — | 200 CSV |
| 47 | `POST` | `/api/faculty/` | ADMIN | body | 201 |
| 48 | `GET` | `/api/faculty/:id` | Any | — | 200 |
| 49 | `PUT` | `/api/faculty/:id` | ADMIN | body | 200 |
| 50 | `DELETE` | `/api/faculty/:id` | ADMIN | — | 200 |
| 51 | `POST` | `/api/faculty/:id/reactivate` | ADMIN | — | 200 |
| 52 | `POST` | `/api/faculty/:id/reset-password` | ADMIN | body | 200 |
| 53 | `GET` | `/api/assignments/` | Any | query | 200 |
| 54 | `POST` | `/api/assignments/` | ADMIN | body | 201 |
| 55 | `PUT` | `/api/assignments/:id` | ADMIN | body | 200 |
| 56 | `DELETE` | `/api/assignments/:id` | ADMIN | — | 200 |
| 57 | `GET` | `/api/enrollments/` | Any | query | 200 |
| 58 | `POST` | `/api/enrollments/` | ADMIN | body | 201 |
| 59 | `DELETE` | `/api/enrollments/:id` | ADMIN | — | 200 |
| 60 | `GET` | `/api/enrollments/subject/:subjectId` | Any | query | 200 |
| 61 | `GET` | `/api/attendance/sessions` | Any | query | 200 |
| 62 | `GET` | `/api/attendance/sessions/today` | Any | — | 200 |
| 63 | `POST` | `/api/attendance/sessions` | ADMIN, FACULTY | body | 201 |
| 64 | `GET` | `/api/attendance/sessions/:id` | Any | — | 200 |
| 65 | `POST` | `/api/attendance/sessions/:id/records` | ADMIN, FACULTY | body | 200 |
| 66 | `POST` | `/api/attendance/sessions/:id/cancel` | ADMIN, FACULTY | — | 200 |
| 67 | `PUT` | `/api/attendance/records/:id` | ADMIN, FACULTY | body | 200 |
| 68 | `GET` | `/api/attendance/records` | Any | query | 200 |
| 69 | `GET` | `/api/attendance/student/:studentId` | ADMIN, FACULTY, STUDENT | — | 200 |
| 70 | `GET` | `/api/attendance/subject/:subjectId` | ADMIN, FACULTY | — | 200 |
| 71 | `GET` | `/api/reports/types` | Any | — | 200 |
| 72 | `GET` | `/api/reports/export` | Any | query | 200 CSV |
| 73 | `GET` | `/api/reports/` | Any | query | 200 |
| 74 | `GET` | `/api/dashboard/admin` | ADMIN | — | 200 |
| 75 | `GET` | `/api/dashboard/faculty` | FACULTY | — | 200 |
| 76 | `GET` | `/api/dashboard/student` | STUDENT | — | 200 |
| 77 | `GET` | `/api/audit-logs/` | ADMIN | query | 200 |
| 78 | `GET` | `/api/audit-logs/export` | ADMIN | query | 200 CSV |

### 7.10.1 Routes by required role

| Role | Count | Routes |
|---|---|---|
| Public (no guard) | 4 | 1–4 |
| Any authenticated (`requireAuth` only) | 28 | 5, 6, 7, 8, 9, 11, 14, 16, 19, 21, 24, 26, 29, 31, 34, 39, 44, 48, 53, 57, 60, 61, 62, 64, 68, 71, 72, 73 |
| `ADMIN` only | 38 | 10, 12, 13, 15, 17, 18, 20, 22, 23, 25, 27, 28, 30, 32, 33, 35, 36, 37, 38, 40, 41, 42, 43, 45, 46, 47, 49, 50, 51, 52, 54, 55, 56, 58, 59, 74, 77, 78 |
| `ADMIN` or `FACULTY` | 5 | 63, 65, 66, 67, 70 |
| `ADMIN`, `FACULTY` or `STUDENT` | 1 | 69 |
| `FACULTY` only | 1 | 75 |
| `STUDENT` only | 1 | 76 |

Total: 4 + 28 + 38 + 5 + 1 + 1 + 1 = **78**.

---

## 7.11 Authorisation Scope Notes

These notes describe the current, integration-tested controller behaviour.

| # | Endpoint(s) | Current behaviour |
|---|---|---|
| 1 | `GET /api/attendance/sessions/:id` | Administrators may inspect any roster; faculty are restricted to their own sessions; students receive 403 because rosters contain other students' details. |
| 2 | `GET /api/attendance/records` | Students are pinned to their own `studentId` even if the query requests another student. Faculty results are restricted to sessions they teach. |
| 3 | `GET /api/assignments` | Faculty receive only their own assignments and students receive an empty list. |
| 4 | `GET /api/attendance/sessions` | A `STUDENT` receives an empty, correctly paginated list rather than an error. Personal attendance is available through the student attendance endpoints. |
| 5 | `GET /api/students/export`, `GET /api/faculty/export`, `GET /api/audit-logs/export` | These exports do not accept arbitrary filter queries. Audit export caps the result at 5000 rows. |
| 6 | `POST /api/students/import` | The controller requires a non-empty `rows` array and validates each row. A row without a password receives the documented fictional demo default; production deployments should issue unique passwords through the reset flow. |

---

## 7.12 Route Registration Notes

* **Literal segments are registered before parameter segments.** In
  `backend/src/routes/people.routes.ts`, `GET /students/export` is declared
  before `GET /students/:id`; in `backend/src/routes/attendance.routes.ts`,
  `GET /sessions/today` is declared before `GET /sessions/:id`; and in
  `backend/src/routes/assignments.routes.ts`, `GET /enrollments/subject/:subjectId`
  uses a literal `subject` segment. Express matches on the exact number of
  path segments, so `/students/5/attendance` cannot be captured by
  `/students/:id`.
* **Guards run before validation.** In every route declaration the
  authentication and role middleware precede the `validate()` middleware, so
  an unauthenticated caller receives 401 rather than a validation error.
* **Audit logging** is applied inside the controllers rather than as
  middleware, so it only covers actions that reach a controller; reads are
  not logged.

---

*End of document 07.*
