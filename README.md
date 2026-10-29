# AttendEase — Student Attendance Management System

A production-ready attendance platform for academic institutions, built as a
DBMS project. **AttendEase** tracks classes conducted, records per-student
attendance, and turns the raw records into audit-ready reports for three roles:
**Administrator**, **Faculty** and **Student**.

The backend is an Express + TypeScript REST API on **MySQL 8** through
**Prisma**. The frontend is a React + TypeScript SPA built with Vite, Tailwind
CSS and shadcn-style Radix primitives. There is no mock data anywhere: every
number on every screen is read from MySQL at request time.

---

## Table of contents

1. [Feature overview](#feature-overview)
2. [Technology stack](#technology-stack)
3. [Repository layout](#repository-layout)
4. [Prerequisites](#prerequisites)
5. [Getting started](#getting-started)
6. [Database setup](#database-setup)
7. [Running the application](#running-the-application)
8. [Demo credentials](#demo-credentials)
9. [Testing](#testing)
10. [Production build](#production-build)
11. [Docker deployment](#docker-deployment)
12. [Environment variables](#environment-variables)
13. [API overview](#api-overview)
14. [Security model](#security-model)
15. [Attendance rules](#attendance-rules)
16. [Documentation](#documentation)
17. [Troubleshooting](#troubleshooting)

---

## Feature overview

### Administrator
- Dashboard with live totals (students, faculty, departments, subjects, classes
  conducted), today's attendance, average attendance rate, students below the
  threshold, a 30-day attendance trend chart, per-department and per-subject
  charts, and recent activity drawn from the audit log.
- Full CRUD for students, faculty, departments, academic years, semesters,
  subjects, sections, faculty-subject assignments and enrollments.
- Search, filtering, pagination and CSV export on every master table.
- System-wide attendance overview, nine report types, audit log browser and
  an attendance-policy settings screen.

### Faculty
- Dashboard listing assigned subjects and classes, student counts, today's
  sessions with completion status and subject-wise attendance rates.
- **Mark attendance**: pick subject → section → date → session number, create
  the session, load the roster, then mark every student *Present / Absent /
  Late / On Leave*, optionally add a remark, use *Mark all present* /
  *Mark all absent* / *Reset*, review the summary and submit.
- Duplicate sessions are refused by the server (HTTP 409), so a class can never
  be double-counted.
- Session history with per-session detail and cancellation.
- Reports scoped to the faculty member's own subjects only.

### Student
- Dashboard with overall attendance percentage, classes conducted, classes
  attended, absences, subject cards and a monthly trend chart.
- Subject-wise attendance breakdown, full history table and printable reports.
- Strictly read-only: the API rejects any attempt to write an attendance
  record for a student session.

---

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript 5.7, Vite 6, Tailwind CSS v4, Radix UI (shadcn-style), Lucide React, React Router 6, TanStack Query 5, React Hook Form + Zod, Recharts |
| Backend | Node.js 20+, Express 4, TypeScript (ESM), Zod, JWT (httpOnly cookie), bcryptjs, Helmet, CORS, express-rate-limit |
| Database | **MySQL 8.4**, Prisma ORM 6, SQL migrations, transactions |
| Testing | Vitest (backend integration + frontend unit), Playwright (E2E), Supertest |
| DevOps | npm workspaces, Docker, Docker Compose, nginx |

---

## Repository layout

```
attendease/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # data model, relations, indexes, constraints
│   │   ├── migrations/            # versioned SQL migrations
│   │   └── seed.ts                # idempotent demo data
│   ├── src/
│   │   ├── config/                # env parsing, Prisma client
│   │   ├── controllers/           # HTTP handlers (thin layer)
│   │   ├── middleware/            # auth, RBAC, CSRF, rate limit, errors
│   │   ├── routes/                # REST routers
│   │   ├── services/              # attendance + reporting domain logic
│   │   ├── validators/            # Zod request schemas
│   │   └── utils/                 # errors, responses, async wrapper
│   ├── tests/                     # Vitest integration suites
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/            # layout, ui primitives, shared widgets
│   │   ├── hooks/                 # auth + toast providers
│   │   ├── lib/                   # api client, navigation, utils
│   │   ├── pages/                 # admin / faculty / student / auth / error
│   │   └── types/                 # shared API types
│   ├── e2e/                       # Playwright specs + fixtures
│   ├── playwright.config.ts
│   └── Dockerfile
├── docs/                          # academic + engineering documentation
├── tests/                         # cross-cutting test notes
├── docker-compose.yml
└── .env.example
```

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 20 or newer | `node -v` |
| npm | 10 or newer | ships with Node |
| MySQL | **8.x** (8.0 / 8.4) | the project targets MySQL, **not** SQLite |
| Docker | optional | for the containerised stack |

---

## Getting started

```bash
# 1. install every workspace dependency
npm install

# 2. create your environment file
cp .env.example .env          # and also: cp .env.example backend/.env
#    then edit DATABASE_URL / JWT_SECRET in backend/.env
```

### 1. Create the database and the application user

Use a dedicated application account instead of `root`:

```sql
CREATE DATABASE attendance_management
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'attendease'@'localhost' IDENTIFIED BY '<LOCAL_DB_PASSWORD>';
CREATE USER IF NOT EXISTS 'attendease'@'127.0.0.1' IDENTIFIED BY '<LOCAL_DB_PASSWORD>';
GRANT ALL PRIVILEGES ON attendance_management.* TO 'attendease'@'localhost';
GRANT ALL PRIVILEGES ON attendance_management.* TO 'attendease'@'127.0.0.1';
FLUSH PRIVILEGES;
```

> Generate a strong local password, URL-encode it in `DATABASE_URL`, and store
> the real value only in `backend/.env` (which is git-ignored).

### 2. Apply migrations and seed

```bash
npm run db:migrate   # prisma migrate deploy - applies pending migrations only
npm run db:seed      # idempotent demo data
```

`prisma migrate deploy` never drops an existing database. Use
`npm run db:reset` (reset + seed) **only** on a throwaway database.

### 3. Verify the connection

```bash
curl http://localhost:5000/api/health
```

```json
{ "success": true, "data": { "status": "ok", "database": "connected", "uptime": 3, "timestamp": "..." } }
```

The health endpoint returns `503` when the database is unreachable, so it is
usable as a container readiness probe.

---

## Running the application

```bash
npm run dev
```

| Service | URL |
|---|---|
| Web client | http://localhost:5173 |
| REST API | http://localhost:5000 |
| Health check | http://localhost:5000/api/health |

The Vite dev server proxies `/api` to the API, so the browser only ever talks
to one origin and the session/CSRF cookies stay first-party.

Individual workspaces can be started on their own:

```bash
npm run dev:backend
npm run dev:frontend
```

---

## Demo credentials

The seed script creates fictional people only — no real student data.

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@attendease.edu` | `Attend@123` |
| Faculty | `arun.kumar@faculty.attendease.edu` | `Attend@123` |
| Faculty | `priya.nair@faculty.attendease.edu` | `Attend@123` |
| Faculty | `sanjay.iyer@faculty.attendease.edu` | `Attend@123` |
| Faculty | `meera.kulkarni@faculty.attendease.edu` | `Attend@123` |
| Faculty | `rahul.desai@faculty.attendease.edu` | `Attend@123` |
| Student | `aarav.sharma@students.attendease.edu` | `Attend@123` |
| Student | `diya.patel@students.attendease.edu` | `Attend@123` |
| Student | `vivaan.reddy@students.attendease.edu` | `Attend@123` |

> Change these before exposing the system to anyone. Demo credentials are
> development-only and are documented in `docs/`.

---

## Testing

```bash
npm run test          # backend integration + frontend unit suites
npm run test:e2e      # Playwright end-to-end suite
npm run typecheck     # tsc --noEmit on both workspaces
```

The database-backed suites require explicit connection URLs; no credentials are
stored in the repository:

```bash
export TEST_DATABASE_URL="mysql://attendease:<password>@127.0.0.1:3307/attendance_management_test"
export E2E_DATABASE_URL="mysql://attendease:<password>@127.0.0.1:3307/attendance_management_e2e"
```

| Suite | Location | Database |
|---|---|---|
| Backend API / domain / database | `backend/tests/` | `attendance_management_test` |
| Frontend unit + component | `frontend/src/**/*.test.ts(x)` | none (mocked fetch) |
| End-to-end journeys | `frontend/e2e/` | `attendance_management_e2e` |

Each layer uses its **own** MySQL schema, so automated tests never touch the
development or production data.

The end-to-end schema must exist once before the first Playwright run:

```sql
CREATE DATABASE attendance_management_e2e
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON attendance_management_e2e.* TO 'attendease'@'127.0.0.1';
FLUSH PRIVILEGES;
```

See `docs/10-test-report.md` for the executed test report.

---

## Production build

```bash
npm run build        # prisma generate + tsc for the API, vite build for the web
npm start            # node backend/dist/server.js
```

In production the API also serves the built SPA from `../frontend/dist`
(resolved relative to the process working directory), which allows a
single-container deployment.

---

## Docker deployment

```bash
cp .env.example .env
# set MYSQL_ROOT_PASSWORD, MYSQL_PASSWORD, DATABASE_URL, JWT_SECRET
docker compose up -d --build
```

The stack starts three services:

| Service | Role | Exposed |
|---|---|---|
| `db` | MySQL 8.4 with a persistent named volume | not published |
| `api` | Express API, runs `prisma migrate deploy` on start | internal `:5000` |
| `web` | nginx serving the built SPA, proxies `/api` to the API | `${WEB_PORT}:80` |

```bash
docker compose logs -f api
curl http://localhost:8080/api/health
```

No secret is baked into an image: every value is injected through the
environment at run time.

---

## Hosted deployment (Render + external MySQL)

The public instance runs as a single Docker web service built from
`Dockerfile.render`, which serves the API and the built SPA from one origin so
the http-only session cookie and CSRF double-submit work without cross-site
configuration. The database is a managed MySQL 8 instance, not a container.

| Setting | Value |
|---|---|
| Runtime | Docker, `./Dockerfile.render` |
| Health check | `GET /api/health` |
| Start command | `prisma migrate deploy && node dist/server.js` |
| Required env | `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`, `API_PORT=10000`, `APP_URL`, `API_URL`, `CORS_ORIGINS`, `SECURE_COOKIES=true`, `TRUST_PROXY=true` |
| Resource | Free instance — spins down after 15 minutes idle, so the first request afterwards takes about 50 seconds |

Remote databases cap concurrent connections, so include a matching
`connection_limit` in the `DATABASE_URL` query string (the hosted instance uses
`?sslaccept=accept_invalid_certs&connection_limit=2`).

---

## Environment variables

| Variable | Required | Default | Purpose |
|---|:--:|---|---|
| `DATABASE_URL` | ✔ | — | MySQL connection string for the app user |
| `JWT_SECRET` | ✔ | — | Signs the session cookie (≥ 32 random characters) |
| `NODE_ENV` | | `development` | `production` enables secure cookies + static hosting |
| `API_PORT` | | `5000` | Port the API listens on |
| `APP_URL` / `API_URL` | | `http://localhost:5173` / `http://localhost:5000` | Used for links and CORS |
| `JWT_EXPIRES_IN` | | `8h` | Session lifetime |
| `RESET_TOKEN_TTL_MINUTES` | | `30` | Password-reset token lifetime |
| `ATTENDANCE_THRESHOLD_PERCENT` | | `75` | Low-attendance alert threshold |
| `ATTENDANCE_COUNTED_STATUSES` | | `PRESENT,LATE` | Which statuses count as attended |
| `SECURE_COOKIES` | | `false` | `true` in production (HTTPS only) |
| `TRUST_PROXY` | | `false` | `true` when running behind nginx / a load balancer |
| `CORS_ORIGINS` | | `http://localhost:5173` | Comma-separated allowed origins |
| `RATE_LIMIT_WINDOW_MINUTES` | | `15` | Global rate-limit window |
| `RATE_LIMIT_MAX` | | `300` | Requests per window per client |
| `AUTH_RATE_LIMIT_MAX` | | `20` | Failed sign-in attempts per window |
| `LOG_LEVEL` | | `info` | `error` / `warn` / `info` / `debug` |

`.env` is git-ignored and must never be committed. `.env.example` holds only
placeholder values.

---

## API overview

All endpoints live under `/api` and return a consistent envelope:

```jsonc
// success
{ "success": true, "data": { ... }, "meta": { "page": 1, "pageSize": 20, "total": 57, "totalPages": 3 } }
// failure
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": { ... } } }
```

| Group | Prefix | Highlights |
|---|---|---|
| Authentication | `/api/auth` | `login`, `logout`, `me`, `forgot-password`, `reset-password` |
| Academic setup | `/api/departments`, `/api/academic-years`, `/api/semesters`, `/api/subjects`, `/api/sections`, `/api/academic-options` | admin-managed, unique codes |
| People | `/api/students`, `/api/faculty` | CRUD, search, pagination, CSV import/export |
| Teaching setup | `/api/assignments`, `/api/enrollments` | faculty-subject assignments, class roster |
| Attendance | `/api/attendance` | sessions, records, student/subject views |
| Reports | `/api/reports` | nine report types, CSV export |
| Dashboards | `/api/dashboard` | `admin`, `faculty`, `student` |
| Audit | `/api/audit-logs` | administrator-only activity trail |

Full request/response documentation: `docs/07-api-reference.md`.

---

## Security model

- **Passwords** are hashed with bcrypt (12 rounds, per-user salt). The plain
  password is never stored, logged or returned.
- **Sessions** use a JWT delivered in an `httpOnly`, `sameSite=lax` cookie. The
  token is never exposed to JavaScript.
- **CSRF**: because authentication is cookie-based, every mutating request must
  echo the `attendease_csrf` cookie in an `X-CSRF-Token` header. The comparison
  is timing-safe.
- **RBAC is enforced on the server.** The frontend hides links, but the API
  independently rejects a student reading another student's attendance and a
  faculty member touching an unrelated subject.
- **Input validation** with Zod on every request body, query string and path
  parameter; unknown fields are rejected (no mass assignment).
- **SQL injection** is structurally impossible: Prisma parameterises every
  query.
- **Rate limiting** on the whole API plus a tighter limit on authentication
  endpoints.
- **Security headers** via Helmet; CORS is an explicit allow-list.
- **Error responses** never contain stack traces or SQL fragments in
  production.
- **Audit log** records sign-ins, administrative changes and attendance
  submissions with actor, entity and timestamp.

Details: `docs/08-security.md`.

---

## Attendance rules

```
attendance % = ( classes attended / total eligible classes conducted ) × 100
```

- *Eligible* means the session happened in the past and was not cancelled.
- `PRESENT` and `LATE` count as attended.
- `ON_LEAVE` does **not** count by default (configurable through
  `ATTENDANCE_COUNTED_STATUSES`).
- Future and cancelled sessions never enter the denominator.
- The policy lives in one place (`eligibleSessionWhere()` / the attendance
  service) so dashboards, reports and exports cannot disagree.

---

## Documentation

| File | Contents |
|---|---|
| `docs/01-project-report.md` | Title, abstract, objectives, scope, requirements, architecture, screenshots, future work, conclusion |
| `docs/02-er-diagram.md` | Mermaid ER diagram and cardinality walk-through |
| `docs/03-relational-schema.md` | Relation-by-relation schema with keys and constraints |
| `docs/04-data-dictionary.md` | Every table, column, type, nullability and meaning |
| `docs/05-normalization.md` | 1NF → 3NF/BCNF derivation with before/after tables |
| `docs/06-sql-queries.md` | The SQL behind the application (joins, aggregates, `GROUP BY`/`HAVING`, subqueries, indexing) |
| `docs/07-api-reference.md` | Every endpoint with request and response examples |
| `docs/08-security.md` | Threat model and the controls that answer each threat |
| `docs/09-deployment.md` | Local, Docker and cloud deployment runbook |
| `docs/10-test-report.md` | Executed test report (name, result, failure reason, fix, final status) |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `User was denied access on the database` | The app user has no grant on the schema | Run the `GRANT` statements from *Getting started* |
| `Can't reach database server at 127.0.0.1:3307` | MySQL is not running on that port | Start MySQL 8 and confirm the port in `DATABASE_URL` |
| `Environment variable not found: DATABASE_URL` | `backend/.env` missing | `cp .env.example backend/.env` |
| `P1001: Can't reach database server` | Wrong host/port in `DATABASE_URL` | Check the port and the password encoding |
| Login returns `401` | Wrong demo password | All seeded accounts use `Attend@123` |
| Playwright fails to start the API | E2E schema missing | Create `attendance_management_e2e` and grant it (see *Testing*) |
| `429 Too Many Requests` | Rate limit reached | Wait for the window to expire or raise `RATE_LIMIT_MAX` |

---

## Licence

Academic project. All people, roll numbers, subjects and records in the seed
data are fictional.
