# Appendix C — Data Dictionary

This appendix describes every column of every table in the `attendance_management` database.

**Source of truth.** The types, nullability and defaults are transcribed from
`backend/prisma/migrations/20260101000000_init/migration.sql`. The key designation for foreign
keys is read from the `ALTER TABLE ... ADD CONSTRAINT` block of the same file, and the semantic
descriptions are read from `backend/prisma/schema.prisma` and from the controllers that populate
each column.

**Column count.** The database has **104 columns** across fourteen tables:

| Table | Columns | Table | Columns |
| --- | --- | --- | --- |
| `users` | 8 | `subjects` | 9 |
| `password_reset_tokens` | 6 | `faculty_subjects` | 6 |
| `departments` | 4 | `enrollments` | 6 |
| `academic_years` | 6 | `attendance_sessions` | 16 |
| `semesters` | 7 | `attendance_records` | 8 |
| `sections` | 5 | `audit_logs` | 8 |
| `students` | 9 | `faculty` | 6 |

**Key legend.**

| Legend | Meaning |
| --- | --- |
| `PK` | Primary key |
| `FK` | Foreign key, with the referenced table and the `ON DELETE` action |
| `UK` | Unique key — the column or the indicated column list is unique |
| `PK, FK` | A column that is both the primary key and a foreign key (none occur in this schema) |
| *(blank)* | Ordinary attribute |

---

## D.1 `users`

Stores the account of every person who can sign in: an administrator, a member of staff or a
student. The academic particulars of a student or a member of staff live in `students` and
`faculty` respectively; this table holds only what is needed to authenticate and to authorise.

| Table | Column | Type | Key | Null | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `users` | `id` | `INTEGER` | PK | NO | AUTO_INCREMENT | Surrogate key of the account. Referenced by `students.user_id`, `faculty.user_id`, `password_reset_tokens.user_id`, `attendance_sessions.created_by`, `attendance_records.marked_by` and `audit_logs.user_id`. |
| `users` | `name` | `VARCHAR(120)` | | NO | — | Display name of the person. Shown throughout the interface and used in the free-text search of the student, faculty and audit lists. Upper bound enforced by `nameSchema` in the validator layer. |
| `users` | `email` | `VARCHAR(160)` | UK | NO | — | The login address and the natural key of the account. The application lower-cases it on write (`emailSchema` transforms to lower case; `createStudent` and `createFaculty` also lower-case explicitly) and looks it up lower-cased. A duplicate address is reported as HTTP 409. |
| `users` | `password_hash` | `VARCHAR(255)` | | NO | — | The bcrypt digest of the account password, produced with a cost factor of 12 by `hashPassword()` in `auth.service.ts`. The plaintext is never stored, never logged and never returned by any endpoint. The column is 255 characters to accommodate the length of a bcrypt digest. |
| `users` | `role` | `ENUM('ADMIN','FACULTY','STUDENT')` | | NO | — | The authorisation role of the account. The value is embedded in the JWT and checked by `requireRole(...)` on the server; it also drives the navigation shown in the interface. Indexed by `users_role_idx`. |
| `users` | `is_active` | `BOOLEAN` | | NO | `true` | Soft-delete flag. When set to `false` the account cannot sign in (`authenticate` rejects it) and any existing session loses access on the next request, because `requireAuth` re-reads the account from the database rather than trusting the token. Indexed by `users_is_active_idx`. |
| `users` | `created_at` | `DATETIME(3)` | | NO | `CURRENT_TIMESTAMP(3)` | Instant at which the account was created, with millisecond precision. |
| `users` | `updated_at` | `DATETIME(3)` | | NO | — | Instant of the last update, maintained by the Prisma `@updatedAt` attribute. Has no database default, so it must always be supplied by the ORM. |

---

## D.2 `password_reset_tokens`

Holds the single-use tokens issued by the forgotten-password flow. The raw token is returned to
the caller exactly once and is never stored; only its SHA-256 digest is persisted, so a database
dump cannot be used to reset anybody's password.

| Table | Column | Type | Key | Null | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `password_reset_tokens` | `id` | `INTEGER` | PK | NO | AUTO_INCREMENT | Surrogate key of the token row. |
| `password_reset_tokens` | `user_id` | `INTEGER` | FK → `users.id`, `ON DELETE CASCADE` | NO | — | The account the token was issued for. The cascade removes outstanding tokens when the account is removed. Indexed by `password_reset_tokens_user_id_idx`. |
| `password_reset_tokens` | `token_hash` | `VARCHAR(128)` | UK | NO | — | The SHA-256 hex digest of the raw token, produced by `hashToken()` in `utils/crypto.ts`. A SHA-256 digest is 64 hexadecimal characters, so 128 characters gives ample headroom. Unique, and the column on which the reset lookup is performed. |
| `password_reset_tokens` | `expires_at` | `DATETIME(3)` | | NO | — | The instant after which the token is refused. Set to `now + RESET_TOKEN_TTL_MINUTES × 60 × 1000`, defaulting to thirty minutes. Indexed by `password_reset_tokens_expires_at_idx` so that expired tokens can be swept efficiently. |
| `password_reset_tokens` | `used_at` | `DATETIME(3)` | | YES | — | The instant at which the token was consumed. A row with a non-null `used_at` is refused by `resetPasswordWithToken`, which is what makes the token single-use. The value is set in the same transaction that updates the password. |
| `password_reset_tokens` | `created_at` | `DATETIME(3)` | | NO | `CURRENT_TIMESTAMP(3)` | The instant at which the token was issued. |

---

## D.3 `departments`

The organisational units of the institution. Every student, every member of staff and every
subject belongs to exactly one department.

| Table | Column | Type | Key | Null | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `departments` | `id` | `INTEGER` | PK | NO | AUTO_INCREMENT | Surrogate key of the department. Referenced by `students.department_id`, `faculty.department_id` and `subjects.department_id`, each with `ON DELETE RESTRICT`. |
| `departments` | `department_name` | `VARCHAR(120)` | | NO | — | The full name of the department, e.g. `Computer Science & Engineering`. Upper bound enforced by `departmentBodySchema`. |
| `departments` | `department_code` | `VARCHAR(20)` | UK | NO | — | The short institutional code, e.g. `CSE`. The application upper-cases it on write. The natural key of the department and the value used to resolve a department during bulk student import. Unique; a duplicate is reported as HTTP 409. |
| `departments` | `created_at` | `DATETIME(3)` | | NO | `CURRENT_TIMESTAMP(3)` | The instant at which the department was created. |

---

## D.4 `academic_years`

The academic calendar. Every semester, subject, section, teaching assignment, enrolment and
attendance session is scoped to one academic year, which is what makes it possible to run two
academic years in parallel.

| Table | Column | Type | Key | Null | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `academic_years` | `id` | `INTEGER` | PK | NO | AUTO_INCREMENT | Surrogate key of the academic year. Referenced by `semesters`, `sections`, `subjects`, `faculty_subjects`, `enrollments` and `attendance_sessions`. |
| `academic_years` | `year_name` | `VARCHAR(20)` | UK | NO | — | The display label of the year, e.g. `2025-26`. The natural key. Unique; a duplicate is reported as HTTP 409. |
| `academic_years` | `start_date` | `DATE` | | NO | — | The first day of the academic year. Stored as a `DATE` at UTC midnight, so the value is immune to timezone drift. |
| `academic_years` | `end_date` | `DATE` | | NO | — | The last day of the academic year. The application validates that `end_date` is after `start_date` (`academicYearBodySchema` refine). |
| `academic_years` | `is_active` | `BOOLEAN` | | NO | `true` | Soft-delete flag. The current running year is the one flagged active. Indexed by `academic_years_is_active_idx`. |
| `academic_years` | `created_at` | `DATETIME(3)` | | NO | `CURRENT_TIMESTAMP(3)` | The instant at which the academic year was created. |

---

## D.5 `semesters`

A semester within an academic year. A student is attached to a semester, and a subject is offered
in a semester.

| Table | Column | Type | Key | Null | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `semesters` | `id` | `INTEGER` | PK | NO | AUTO_INCREMENT | Surrogate key of the semester. Referenced by `students.semester_id` and `subjects.semester_id`, both with `ON DELETE RESTRICT`. |
| `semesters` | `semester_number` | `INTEGER` | UK (compound) | NO | — | The ordinal of the semester within its academic year, conventionally 1 to 6. The application restricts it to 1–12. Together with `academic_year_id` it forms the compound unique key `semesters_academic_year_id_semester_number_key` (named `semester_number_per_year` in the Prisma schema). |
| `semesters` | `academic_year_id` | `INTEGER` | FK → `academic_years.id`, `ON DELETE CASCADE` | NO | — | The academic year to which the semester belongs. The cascade is safe because a semester cannot carry attendance history of its own. Indexed by `semesters_academic_year_id_idx`. |
| `semesters` | `start_date` | `DATE` | | NO | — | The first day of the semester. |
| `semesters` | `end_date` | `DATE` | | NO | — | The last day of the semester. The application validates that `end_date` is after `start_date` (`semesterBodySchema` refine). |
| `semesters` | `is_active` | `BOOLEAN` | | NO | `true` | Soft-delete flag. The application uses it, together with the academic year's own flag, to resolve the semester in which a bulk student import should place a student. |
| `semesters` | `created_at` | `DATETIME(3)` | | NO | `CURRENT_TIMESTAMP(3)` | The instant at which the semester was created. |

---

## D.6 `sections`

A teaching section of a subject — for example section `A` or `B` of `CSE101` in the academic year
`2025-26`. Sections exist in their own table rather than as a free-text attribute of a subject so
that a section has a referential identity: it can be assigned to a member of staff, enrolled in
students, and referenced by an attendance session.

| Table | Column | Type | Key | Null | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `sections` | `id` | `INTEGER` | PK | NO | AUTO_INCREMENT | Surrogate key of the section offering. Referenced by `faculty_subjects.section_id` (`CASCADE`), `enrollments.section_id` (`SET NULL`) and `attendance_sessions.section_id` (`RESTRICT`, named relation `SessionSection`). |
| `sections` | `subject_id` | `INTEGER` | FK → `subjects.id`, `ON DELETE CASCADE` | NO | — | The subject that this section delivers. The application additionally checks that a submitted `subjectId` matches `section.subject_id` before accepting a session or an assignment. Indexed by `sections_subject_id_idx`. |
| `sections` | `section` | `VARCHAR(10)` | UK (compound) | NO | — | The label of the section, e.g. `A`. The application trims and upper-cases it (`sectionSchema`). Together with `subject_id` and `academic_year_id` it forms the compound unique key `sections_subject_id_section_academic_year_id_key` (named `unique_section_offering` in the Prisma schema). |
| `sections` | `academic_year_id` | `INTEGER` | FK → `academic_years.id`, `ON DELETE CASCADE` | NO | — | The academic year in which the section is offered. Part of the compound unique key. Indexed by `sections_academic_year_id_idx`. |
| `sections` | `created_at` | `DATETIME(3)` | | NO | `CURRENT_TIMESTAMP(3)` | The instant at which the section was created. |

---

## D.7 `students`

The student profile. A student always has exactly one linked account, which carries the name, the
e-mail address and the active flag.

| Table | Column | Type | Key | Null | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `students` | `id` | `INTEGER` | PK | NO | AUTO_INCREMENT | Surrogate key of the student record. Referenced by `enrollments.student_id` (`CASCADE`) and `attendance_records.student_id` (`RESTRICT`). |
| `students` | `user_id` | `INTEGER` | UK, FK → `users.id`, `ON DELETE CASCADE` | NO | — | The account linked to the student. The unique constraint makes the relationship one-to-one, so a single account can never be linked to two student records. |
| `students` | `roll_number` | `VARCHAR(40)` | UK | NO | — | The institutional roll number, e.g. `CSE2025001`. The natural key of a student; used to order rosters and reports, and used during bulk import to detect a duplicate. A duplicate is reported as HTTP 409. |
| `students` | `department_id` | `INTEGER` | FK → `departments.id`, `ON DELETE RESTRICT` | NO | — | The department in which the student is enrolled. Restricted, because a student is part of the department's history. Indexed by `students_department_id_idx`. |
| `students` | `semester_id` | `INTEGER` | FK → `semesters.id`, `ON DELETE RESTRICT` | NO | — | The semester in which the student is currently enrolled. Restricted for the same reason. Indexed by `students_semester_id_idx`. |
| `students` | `section` | `VARCHAR(10)` | | NO | — | The label of the cohort's current home section. A snapshot of the cohort's section rather than a foreign key, since a student may change section and the value describes the present, not the past. The authoritative per-subject section is `enrollments.section_id`. Indexed by `students_section_idx` because the class-wise report compares it with `attendance_sessions.section`. |
| `students` | `admission_year` | `INTEGER` | | NO | — | The calendar year in which the student was admitted. The application restricts it to the range 1990–2100. |
| `students` | `created_at` | `DATETIME(3)` | | NO | `CURRENT_TIMESTAMP(3)` | The instant at which the student record was created. |
| `students` | `updated_at` | `DATETIME(3)` | | NO | — | The instant of the last update, maintained by the Prisma `@updatedAt` attribute. |

---

## D.8 `faculty`

The staff profile. A member of staff always has exactly one linked account.

| Table | Column | Type | Key | Null | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `faculty` | `id` | `INTEGER` | PK | NO | AUTO_INCREMENT | Surrogate key of the staff record. Referenced by `faculty_subjects.faculty_id` (`CASCADE`) and `attendance_sessions.faculty_id` (`RESTRICT`). |
| `faculty` | `user_id` | `INTEGER` | UK, FK → `users.id`, `ON DELETE CASCADE` | NO | — | The account linked to the member of staff. The unique constraint makes the relationship one-to-one. |
| `faculty` | `faculty_id` | `VARCHAR(40)` | UK | NO | — | The institutional staff identifier, e.g. `FAC-1001`. The natural key. Unique; a duplicate is reported as HTTP 409. |
| `faculty` | `department_id` | `INTEGER` | FK → `departments.id`, `ON DELETE RESTRICT` | NO | — | The department to which the member of staff belongs. Restricted because the assignment and session history depend on it. Indexed by `faculty_department_id_idx`. |
| `faculty` | `designation` | `VARCHAR(80)` | | NO | — | The academic rank, e.g. `Associate Professor`. Upper bound enforced by `createFacultySchema`. |
| `faculty` | `created_at` | `DATETIME(3)` | | NO | `CURRENT_TIMESTAMP(3)` | The instant at which the staff record was created. |

---

## D.9 `subjects`

A subject offered by a department in a particular semester of a particular academic year. The
`credits` column carries the credit weight used in the subject-wise reports.

| Table | Column | Type | Key | Null | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `subjects` | `id` | `INTEGER` | PK | NO | AUTO_INCREMENT | Surrogate key of the subject. Referenced by `sections.subject_id` (`CASCADE`), `faculty_subjects.subject_id` (`CASCADE`), `enrollments.subject_id` (`CASCADE`) and `attendance_sessions.subject_id` (`RESTRICT`). |
| `subjects` | `subject_code` | `VARCHAR(40)` | UK | NO | — | The institutional subject code, e.g. `CSE101`. The natural key. The application upper-cases it on write. Unique; a duplicate is reported as HTTP 409. Also the term searched by the free-text filter on the session list. |
| `subjects` | `subject_name` | `VARCHAR(160)` | | NO | — | The full title of the subject, e.g. `Database Management Systems`. |
| `subjects` | `department_id` | `INTEGER` | FK → `departments.id`, `ON DELETE RESTRICT` | NO | — | The department that offers the subject. Used to scope the reports and the session list. Indexed by `subjects_department_id_idx`. |
| `subjects` | `semester_id` | `INTEGER` | FK → `semesters.id`, `ON DELETE RESTRICT` | NO | — | The semester in which the subject is offered. Indexed by `subjects_semester_id_idx`. |
| `subjects` | `academic_year_id` | `INTEGER` | FK → `academic_years.id`, `ON DELETE RESTRICT` | NO | — | The academic year in which the subject is offered. Indexed by `subjects_academic_year_id_idx`. |
| `subjects` | `credits` | `INTEGER` | | NO | `3` | The credit weight of the subject. The application restricts it to 0–20 and reports it in the subject-wise student summary. |
| `subjects` | `is_active` | `BOOLEAN` | | NO | `true` | Soft-delete flag. A subject that already carries attendance sessions is deactivated rather than deleted, so that the historical figures survive. The `academic-options` endpoint returns only active subjects. |
| `subjects` | `created_at` | `DATETIME(3)` | | NO | `CURRENT_TIMESTAMP(3)` | The instant at which the subject was created. |

---

## D.10 `faculty_subjects`

The teaching-assignment bridge. It records which member of staff teaches which subject, in which
section, in which academic year, and it is the register that authorises the creation of an
attendance session.

| Table | Column | Type | Key | Null | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `faculty_subjects` | `id` | `INTEGER` | PK | NO | AUTO_INCREMENT | Surrogate key of the assignment. Referenced by `attendance_sessions.assignment_id` with `ON DELETE SET NULL`. |
| `faculty_subjects` | `faculty_id` | `INTEGER` | FK → `faculty.id`, `ON DELETE CASCADE`; UK (compound) | NO | — | The member of staff who holds the assignment. Part of the compound unique key `faculty_subjects_faculty_id_subject_id_section_id_academic_y_key` (named `unique_faculty_subject_assignment` in the Prisma schema). |
| `faculty_subjects` | `subject_id` | `INTEGER` | FK → `subjects.id`, `ON DELETE CASCADE`; UK (compound) | NO | — | The subject taught. Part of the compound unique key. Indexed by `faculty_subjects_subject_id_idx`, which serves the faculty scope resolution (`resolveCallerScope`) and the report scoping. |
| `faculty_subjects` | `academic_year_id` | `INTEGER` | FK → `academic_years.id`, `ON DELETE CASCADE`; UK (compound) | NO | — | The academic year of the teaching commitment. Part of the compound unique key. Indexed by `faculty_subjects_academic_year_id_idx`. |
| `faculty_subjects` | `section_id` | `INTEGER` | FK → `sections.id`, `ON DELETE CASCADE`; UK (compound) | NO | — | The section in which the subject is taught. Part of the compound unique key. The application validates that `section.subject_id` equals `subject_id` and that `section.academic_year_id` equals `academic_year_id` before the assignment is accepted. |
| `faculty_subjects` | `created_at` | `DATETIME(3)` | | NO | `CURRENT_TIMESTAMP(3)` | The instant at which the assignment was created. |

---

## D.11 `enrollments`

The enrolment bridge. It records that a student is registered for a subject in an academic year,
optionally within a particular section. This table is also the authoritative roster: the
application marks nobody who does not appear in it.

| Table | Column | Type | Key | Null | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `enrollments` | `id` | `INTEGER` | PK | NO | AUTO_INCREMENT | Surrogate key of the enrolment. |
| `enrollments` | `student_id` | `INTEGER` | FK → `students.id`, `ON DELETE CASCADE`; UK (compound) | NO | — | The registered student. Part of the compound unique key `enrollments_student_id_subject_id_academic_year_id_key` (named `unique_student_subject_enrollment` in the Prisma schema). |
| `enrollments` | `subject_id` | `INTEGER` | FK → `subjects.id`, `ON DELETE CASCADE`; UK (compound) | NO | — | The subject registered for. Part of the compound unique key. Indexed by `enrollments_subject_id_idx`, which serves the roster query. |
| `enrollments` | `academic_year_id` | `INTEGER` | FK → `academic_years.id`, `ON DELETE CASCADE`; UK (compound) | NO | — | The year of registration. Part of the compound unique key; it is what allows a student to re-enrol in the same subject code in a later year. Indexed by `enrollments_academic_year_id_idx`. |
| `enrollments` | `section_id` | `INTEGER` | FK → `sections.id`, `ON DELETE SET NULL` | YES | `NULL` | The section within which the student is registered. Nullable because a student may be registered for an elective before the section is decided; the application then treats the enrolment as covering every session of the subject. Indexed by `enrollments_section_id_idx`. The `SET NULL` action keeps the enrolment — and therefore the student's registration history — intact if the section is removed. |
| `enrollments` | `created_at` | `DATETIME(3)` | | NO | `CURRENT_TIMESTAMP(3)` | The instant at which the enrolment was created. |

---

## D.12 `attendance_sessions`

One lecture delivered to one section. This is the unit of attendance. A subject taught three
times in a day produces three sessions, distinguished by `session_number`.

| Table | Column | Type | Key | Null | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `attendance_sessions` | `id` | `INTEGER` | PK | NO | AUTO_INCREMENT | Surrogate key of the session. Referenced by `attendance_records.attendance_session_id` with `ON DELETE CASCADE`. |
| `attendance_sessions` | `subject_id` | `INTEGER` | FK → `subjects.id`, `ON DELETE RESTRICT`; UK (compound) | NO | — | The subject delivered. Restricted because the session is part of the subject's attendance history. Part of the compound unique key. Indexed by `attendance_sessions_subject_id_idx`. |
| `attendance_sessions` | `faculty_id` | `INTEGER` | FK → `faculty.id`, `ON DELETE RESTRICT` | NO | — | The member of staff who conducted the session. This is the column against which the faculty scope filter is applied, so a faculty member sees only their own sessions. Indexed by `attendance_sessions_faculty_id_idx`. |
| `attendance_sessions` | `academic_year_id` | `INTEGER` | FK → `academic_years.id`, `ON DELETE RESTRICT`; UK (compound) | NO | — | The academic year of the session. Part of the compound unique key. Indexed by `attendance_sessions_academic_year_id_idx`. |
| `attendance_sessions` | `section_id` | `INTEGER` | FK → `sections.id`, `ON DELETE RESTRICT` (named relation `SessionSection`); UK (compound) | NO | — | The section that attended the session. Part of the compound unique key. Indexed by `attendance_sessions_section_id_idx`. The referential restriction is the second half of the guarantee that a session's history cannot be removed by deleting a section. |
| `attendance_sessions` | `section` | `VARCHAR(10)` | | NO | — | A snapshot of the section label taken from `sections.section` when the session was created. It is written once and never updated. It preserves the label in force at the time of the lecture, so that a later re-labelling of the section does not retroactively rewrite the historical record. It is never used as a join key; every grouping joins to `sections` and uses `section_id`. See [`05-normalization.md`](./05-normalization.md) Section 4.1. |
| `attendance_sessions` | `attendance_date` | `DATE` | UK (compound) | NO | — | The calendar date of the lecture. Stored as a `DATE` at UTC midnight and transported as a `YYYY-MM-DD` string. Part of the compound unique key. Indexed by `attendance_sessions_attendance_date_idx`, which serves the date-range filters, the "today" query and the eligibility test `attendance_date <= CURDATE()`. |
| `attendance_sessions` | `start_time` | `VARCHAR(20)` | | YES | — | The start time of the lecture, entered as free text by the faculty member, e.g. `09:30` or `9:30 AM`. The validator accepts the pattern `^\d{1,2}:\d{2}(\s?[AP]M)?$`. Used only to order the sessions of a day; it is never used in a comparison or an arithmetic operation. |
| `attendance_sessions` | `end_time` | `VARCHAR(20)` | | YES | — | The end time of the lecture, in the same free-text format as `start_time`. |
| `attendance_sessions` | `session_number` | `INTEGER` | UK (compound) | NO | `1` | The ordinal of the lecture within the day for that subject and section. The validator restricts it to 1–20. Part of the compound unique key, and the column that makes multiple lectures in one day representable. |
| `attendance_sessions` | `topic` | `VARCHAR(200)` | | YES | — | An optional description of what was covered. Searched by the free-text filter on the session list, together with the subject name and the subject code. |
| `attendance_sessions` | `is_cancelled` | `BOOLEAN` | | NO | `false` | Marks the session as cancelled. A cancelled session is retained in the database but excluded from every percentage computation by `eligibleSessionWhere()`, and marking attendance against it is refused with HTTP 400. |
| `attendance_sessions` | `created_by` | `INTEGER` | FK → `users.id`, `ON DELETE SET NULL` (named relation `SessionCreator`) | YES | `NULL` | The account that created the session. Nullable because the seed script creates historical sessions with `createdById: null`. The `SET NULL` action means that removing a user account never removes the sessions that the account created. |
| `attendance_sessions` | `assignment_id` | `INTEGER` | FK → `faculty_subjects.id`, `ON DELETE SET NULL` | YES | `NULL` | The teaching assignment that authorised the session. `createSession` requires a matching `faculty_subjects` row and stores its identifier here, which makes the authorisation traceable. The `SET NULL` action keeps the session if the assignment is removed. |
| `attendance_sessions` | `created_at` | `DATETIME(3)` | | NO | `CURRENT_TIMESTAMP(3)` | The instant at which the session was created. |
| `attendance_sessions` | `updated_at` | `DATETIME(3)` | | NO | — | The instant of the last update, maintained by the Prisma `@updatedAt` attribute. |

---

## D.13 `attendance_records`

One student's state in one session. This is the fact on which every percentage and every report
is computed.

| Table | Column | Type | Key | Null | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `attendance_records` | `id` | `INTEGER` | PK | NO | AUTO_INCREMENT | Surrogate key of the record. |
| `attendance_records` | `attendance_session_id` | `INTEGER` | FK → `attendance_sessions.id`, `ON DELETE CASCADE`; UK (compound) | NO | — | The session in which the mark was given. Part of the compound unique key `attendance_records_attendance_session_id_student_id_key` (named `unique_student_per_session` in the Prisma schema). The cascade removes the records of a deleted session; sessions that carry history are therefore never deleted in practice. |
| `attendance_records` | `student_id` | `INTEGER` | FK → `students.id`, `ON DELETE RESTRICT`; UK (compound) | NO | — | The student the mark concerns. Part of the compound unique key. Restricted, so that a student who carries attendance history cannot be deleted — the student is deactivated instead. Indexed by `attendance_records_student_id_idx`, which serves every per-student summary. |
| `attendance_records` | `attendance_status` | `ENUM('PRESENT','ABSENT','LATE','ON_LEAVE')` | | NO | — | The recorded state. `PRESENT` and `LATE` count as attended under the default `ATTENDANCE_COUNTED_STATUSES` policy; `ON_LEAVE` counts only if the deployment has included it. Indexed by `attendance_records_attendance_status_idx`, which serves the status filter on the record list. |
| `attendance_records` | `marked_by` | `INTEGER` | FK → `users.id`, `ON DELETE SET NULL` (named relation `MarkedBy`) | YES | `NULL` | The account that recorded the mark, or that last corrected it. Nullable because the seed script creates historical records with `markedById: null`. The `SET NULL` action preserves the record when the account is removed. |
| `attendance_records` | `remarks` | `VARCHAR(255)` | | YES | — | A free-text remark attached to the mark, for example the reason for an approved leave. The validator restricts it to 255 characters, matching the column width. |
| `attendance_records` | `marked_at` | `DATETIME(3)` | | NO | `CURRENT_TIMESTAMP(3)` | The instant at which the mark was recorded or last changed. The application overwrites it explicitly on every upsert and on every correction. |
| `attendance_records` | `updated_at` | `DATETIME(3)` | | NO | — | The instant of the last update, maintained by the Prisma `@updatedAt` attribute. |

---

## D.14 `audit_logs`

The audit trail. Every mutating operation writes one row here.

| Table | Column | Type | Key | Null | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `audit_logs` | `id` | `INTEGER` | PK | NO | AUTO_INCREMENT | Surrogate key of the audit entry. |
| `audit_logs` | `user_id` | `INTEGER` | FK → `users.id`, `ON DELETE SET NULL` | YES | `NULL` | The account that performed the action. Null for system actions and for entries written before the user was known. The `SET NULL` action preserves the entry when the account is removed, which is what keeps the trail defensible. Indexed by `audit_logs_user_id_idx`. |
| `audit_logs` | `action` | `VARCHAR(60)` | | NO | — | The action performed. The values written by the application are `LOGIN`, `LOGOUT`, `CREATE`, `UPDATE`, `DELETE`, `DEACTIVATE`, `REACTIVATE`, `IMPORT`, `SUBMIT_ATTENDANCE`, `CANCEL`, `PROFILE_UPDATED`, `PASSWORD_CHANGED`, `PASSWORD_RESET`, `PASSWORD_RESET_REQUESTED` and `PASSWORD_RESET_COMPLETED`. Filterable on the audit-log screen. |
| `audit_logs` | `entity_type` | `VARCHAR(60)` | | NO | — | The kind of entity acted upon. The values written by the application are `User`, `Student`, `Faculty`, `Department`, `AcademicYear`, `Semester`, `Subject`, `Section`, `FacultySubject`, `Enrollment`, `AttendanceSession` and `AttendanceRecord`. Filterable on the audit-log screen. |
| `audit_logs` | `entity_id` | `VARCHAR(64)` | | YES | — | The identifier of the entity acted upon. Stored as text because the referenced table varies from row to row; the service converts a numeric identifier with `String(input.entityId)`. |
| `audit_logs` | `details` | `TEXT` | | YES | — | A JSON payload describing the change, e.g. `{"from":"ABSENT","to":"PRESENT"}` for a correction or `{"recordCount":45}` for an attendance submission. The service serialises a non-string value with `JSON.stringify`. |
| `audit_logs` | `ip_address` | `VARCHAR(45)` | | YES | — | The IP address of the client that made the request, taken from `req.ip`. 45 characters accommodates the longest possible IPv6 textual representation. |
| `audit_logs` | `created_at` | `DATETIME(3)` | | NO | `CURRENT_TIMESTAMP(3)` | The instant at which the action occurred. Indexed by `audit_logs_created_at_idx`, which serves the chronological listing and the date-range filter. |

---

## D.15 Enumeration reference

### `users.role`

| Value | Meaning | Scope of authority |
| --- | --- | --- |
| `ADMIN` | Administrator | Full access to master data, people, allocation, attendance, reports, dashboards and the audit log. |
| `FACULTY` | Member of staff | Access limited to the subjects and sections assigned to them: their own sessions, their own classes, their own students and the reports scoped to those subjects. |
| `STUDENT` | Student | Read access to their own attendance record, their own subjects and their own reports. |

### `attendance_records.attendance_status`

| Value | Meaning | Counted as attended by default |
| --- | --- | --- |
| `PRESENT` | The student was present in the class | Yes |
| `ABSENT` | The student was not present | No |
| `LATE` | The student arrived after the class had begun | Yes |
| `ON_LEAVE` | The student was on an approved leave | No — the status may be added to `ATTENDANCE_COUNTED_STATUSES` to count it |

The set of statuses that count as attended is held in `ATTENDANCE_COUNTED_STATUSES` in the
environment, which defaults to `PRESENT,LATE`. Both the application and the analytical queries in
[`06-sql-queries.md`](./06-sql-queries.md) apply the same rule, so a percentage computed in the
interface and a percentage computed in SQL are directly comparable.

---

## D.16 Reserved and derived values

| Value | Where it appears | Meaning |
| --- | --- | --- |
| `attendance_sessions.is_cancelled = true` | `attendance_sessions` | The session does not count towards any percentage. |
| `attendance_sessions.section_number = 1` (default) | `attendance_sessions` | The first lecture of the day for that subject and section. |
| `attendance_sessions.created_by IS NULL` | `attendance_sessions` | The session was created outside the application, or its creator has been removed. |
| `attendance_records.marked_by IS NULL` | `attendance_records` | The record was created outside the application, or its marker has been removed. |
| `enrollments.section_id IS NULL` | `enrollments` | The student is registered for the subject without a fixed section. |
| `attendance_records.attendance_status = 'ON_LEAVE'` | `attendance_records` | The absence was authorised. |
| `users.is_active = false` | `users` | The account is deactivated and cannot sign in. |
| `subjects.is_active = false` | `subjects` | The subject is deactivated; its attendance history is retained. |
| `academic_years.is_active = false`, `semesters.is_active = false` | `academic_years`, `semesters` | The year or semester is closed. |
| `password_reset_tokens.used_at IS NOT NULL` | `password_reset_tokens` | The token has been consumed and can no longer be used. |
| `audit_logs.user_id IS NULL` | `audit_logs` | The action was performed by the system rather than by a person. |
