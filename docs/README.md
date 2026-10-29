# AttendEase — Student Attendance Management System

**A DBMS course project implemented with React + Vite, Express (REST), Prisma ORM and MySQL 8.**

This directory contains the complete academic documentation set for the AttendEase project. Every
statement about table names, column names, constraints, indexes, endpoints and status codes in these
documents has been verified against the live source tree:

| Artefact | Path (relative to the project root) |
| --- | --- |
| Authoritative data model | `backend/prisma/schema.prisma` |
| Applied SQL migration | `backend/prisma/migrations/20260101000000_init/migration.sql` |
| Demo data generator | `backend/prisma/seed.ts` |
| Attendance domain services | `backend/src/services/attendance.service.ts`, `backend/src/services/report.service.ts` |
| REST layer | `backend/src/routes/*.routes.ts`, `backend/src/controllers/*.controller.ts` |
| Security middleware | `backend/src/middleware/*.ts`, `backend/src/config/env.ts` |
| Environment template | `.env.example` |

---

## Document index

| # | Document | Description |
| --- | --- | --- |
| 01 | [Project Report](./01-project-report.md) | The full academic write-up: title page, abstract, introduction, problem statement, objectives, comparison with the existing system, scope, functional and non-functional requirements, three-tier architecture, database design, ER diagram, relational schema, data dictionary, normalisation analysis, sample SQL queries, testing, screenshots, future enhancements and conclusion. |
| 02 | [ER Diagram](./02-er-diagram.md) | A Mermaid `erDiagram` covering all fourteen Prisma models with verified cardinalities (including the named `SessionSection` and `SessionCreator` relations), plus a Mermaid `flowchart` of the attendance-marking workflow. |
| 03 | [Relational Schema](./03-relational-schema.md) | The exact `CREATE TABLE` / `ALTER TABLE` DDL reproduced verbatim from `migration.sql` for every table, followed by a per-table column table giving MySQL type, nullability, key, default and description. |
| 04 | [Data Dictionary](./04-data-dictionary.md) | One row per column of every table: Table, Column, Type, Key (PK/FK/UNIQUE), Null, Default and Description. |
| 05 | [Normalisation](./05-normalization.md) | Definitions of 1NF, 2NF, 3NF and BCNF; a per-table normal-form mapping; a justification of the deliberate denormalisation in `attendance_sessions.section`, the two bridge tables (`enrollments`, `faculty_subjects`) and the five named unique constraints; and the insertion/update/deletion anomalies removed at each step. |
| 06 | [SQL Queries](./06-sql-queries.md) | Twenty-one runnable MySQL 8 queries against the `attendance_management` schema, plus the raw SQL equivalents of the five aggregate routines implemented in the Prisma service layer, and an explanation of the `attendance_sessions` index choices. |
| 07 | [API Reference](./07-api-reference.md) | Every REST endpoint grouped by resource, with HTTP method, path, required role, request body/query parameters, and the success and error status codes each one can return. |
| 08 | [Security](./08-security.md) | How the implementation satisfies each stated security requirement: bcrypt password hashing, httpOnly/SameSite cookies, JWT sessions, double-submit CSRF protection, server-side RBAC, Zod validation, rate limiting, security headers, CORS allow-listing, absence of frontend secrets, Prisma parameterisation, audit logging, account deactivation and password-reset tokens. |
| 09 | [Deployment Runbook](./09-deployment.md) | Every supported topology (local development, local production build, Docker Compose, single VPS, managed MySQL), the exact commands, the release checklist and the verification log. |
| 10 | [Test Report](./10-test-report.md) | The executed test report: every suite, every test name, the result, the reason for each failure that was found, the fix that was applied and the final status. |

---

## Quick reference

| Item | Value |
| --- | --- |
| Database | MySQL 8.x, schema name `attendance_management` |
| Schema definition | Prisma (`backend/prisma/schema.prisma`), 14 models, 2 enums |
| Migration | `20260101000000_init` |
| API framework | Express 4.21 (`backend/src`) |
| ORM | Prisma Client 6.2 |
| Frontend | React 18 + Vite 6 + TypeScript + Tailwind CSS 4 (`frontend/src`) |
| Auth | JWT in an httpOnly cookie (`attendease_token`) + double-submit CSRF cookie (`attendease_csrf`) |
| Roles | `ADMIN`, `FACULTY`, `STUDENT` |
| Attendance statuses | `PRESENT`, `ABSENT`, `LATE`, `ON_LEAVE` |
| Default attendance threshold | 75 % (`ATTENDANCE_THRESHOLD_PERCENT`) |
| Success envelope | `{ "success": true, "data": ... }`, plus `"meta"` on paginated responses |
| Error envelope | `{ "success": false, "error": { "code", "message", "details" } }` |

## Repository layout

```text
attendease/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma                 # source of truth for the data model
│   │   ├── migrations/20260101000000_init/migration.sql
│   │   └── seed.ts                       # idempotent demo data generator
│   ├── src/
│   │   ├── app.ts                        # Express application assembly
│   │   ├── server.ts                     # HTTP server bootstrap
│   │   ├── config/                       # env schema (Zod) and Prisma client
│   │   ├── controllers/                  # HTTP handlers
│   │   ├── middleware/                   # auth, csrf, error, rate limit, validation
│   │   ├── routes/                       # route tables and role guards
│   │   ├── services/                     # attendance, report, auth and audit services
│   │   ├── validators/                   # Zod request schemas
│   │   └── utils/                        # response envelope, errors, CSV, crypto, dates
│   ├── tests/                            # Vitest integration + database suites
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/                   # reusable UI and layout
│   │   ├── hooks/                        # auth context, academic option loader
│   │   ├── lib/                          # fetch wrapper, navigation model
│   │   └── pages/                        # admin / faculty / student / auth screens
│   ├── e2e/                              # Playwright journeys for the three roles
│   ├── playwright.config.ts
│   └── Dockerfile
├── tests/                                # index of the automated test layers
├── docs/                                 # this documentation set
├── docker-compose.yml                    # MySQL 8 + API + web stack
└── .env.example
```
