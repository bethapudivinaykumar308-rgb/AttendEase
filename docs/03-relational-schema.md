# Appendix B — Relational Schema

This appendix reproduces the physical schema of the `attendance_management` database exactly as it
is created in MySQL 8 by the applied migration.

**Source of truth.** Every statement below is transcribed verbatim from
`backend/prisma/migrations/20260101000000_init/migration.sql`. Nothing is paraphrased and no
column, index or constraint has been invented. Where Prisma's schema file and the migration differ
in naming — which is the case for the named compound unique keys — the discrepancy is recorded in
the note at the end of this appendix.

**Physical characteristics.** All fourteen tables are created with
`DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`, which permits the full Unicode range
and is case-insensitive for comparison. All primary keys are `INTEGER NOT NULL AUTO_INCREMENT`,
which in MySQL 8 is a 32-bit signed integer with an automatically managed auto-increment counter.
Every table declares its primary key as the final `PRIMARY KEY` clause, followed by the foreign
keys added in a separate `ALTER TABLE` block.

---

## B.1 Table inventory

| # | Table | Primary key | Purpose |
| --- | --- | --- | --- |
| 1 | `users` | `id` | Accounts, credentials and role |
| 2 | `password_reset_tokens` | `id` | Single-use password reset tokens |
| 3 | `departments` | `id` | Teaching departments |
| 4 | `academic_years` | `id` | Academic calendar |
| 5 | `semesters` | `id` | Semesters within an academic year |
| 6 | `sections` | `id` | Teaching sections of a subject |
| 7 | `students` | `id` | Student particulars |
| 8 | `faculty` | `id` | Staff particulars |
| 9 | `subjects` | `id` | Subjects offered |
| 10 | `faculty_subjects` | `id` | Teaching assignments (bridge) |
| 11 | `enrollments` | `id` | Student registrations (bridge) |
| 12 | `attendance_sessions` | `id` | One lecture of one section |
| 13 | `attendance_records` | `id` | One student's state in one session |
| 14 | `audit_logs` | `id` | Audit trail |

---

## B.2 Data definition language

### B.2.1 `users`

```sql
-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(160) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('ADMIN', 'FACULTY', 'STUDENT') NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_role_idx`(`role`),
    INDEX `users_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

| Column | MySQL type | Null | Key | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | NO | PK | auto-increment | Surrogate key of the account |
| `name` | `VARCHAR(120)` | NO | | — | Display name of the person |
| `email` | `VARCHAR(160)` | NO | UNIQUE (`users_email_key`) | — | Login address; stored lower-cased by the application |
| `password_hash` | `VARCHAR(255)` | NO | | — | bcrypt digest of the password, cost factor 12; the plaintext is never stored |
| `role` | `ENUM('ADMIN','FACULTY','STUDENT')` | NO | INDEX (`users_role_idx`) | — | Authorisation role of the account |
| `is_active` | `BOOLEAN` | NO | INDEX (`users_is_active_idx`) | `true` | Soft-delete flag; a deactivated account cannot sign in and loses access immediately |
| `created_at` | `DATETIME(3)` | NO | | `CURRENT_TIMESTAMP(3)` | Instant of creation |
| `updated_at` | `DATETIME(3)` | NO | | — (maintained by Prisma `@updatedAt`) | Instant of the last update |

### B.2.2 `password_reset_tokens`

```sql
-- CreateTable
CREATE TABLE `password_reset_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `token_hash` VARCHAR(128) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `password_reset_tokens_token_hash_key`(`token_hash`),
    INDEX `password_reset_tokens_user_id_idx`(`user_id`),
    INDEX `password_reset_tokens_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

| Column | MySQL type | Null | Key | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | NO | PK | auto-increment | Surrogate key of the token row |
| `user_id` | `INTEGER` | NO | FK → `users.id` (`ON DELETE CASCADE`) | — | The account the token was issued for |
| `token_hash` | `VARCHAR(128)` | NO | UNIQUE (`password_reset_tokens_token_hash_key`) | — | SHA-256 hex digest of the token; the raw token is never stored |
| `expires_at` | `DATETIME(3)` | NO | INDEX (`password_reset_tokens_expires_at_idx`) | — | Instant after which the token is rejected (TTL from `RESET_TOKEN_TTL_MINUTES`) |
| `used_at` | `DATETIME(3)` | YES | | — | Set when the token is consumed; a token with a non-null value is refused |
| `created_at` | `DATETIME(3)` | NO | | `CURRENT_TIMESTAMP(3)` | Instant of issue |

### B.2.3 `departments`

```sql
-- CreateTable
CREATE TABLE `departments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `department_name` VARCHAR(120) NOT NULL,
    `department_code` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `departments_department_code_key`(`department_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

| Column | MySQL type | Null | Key | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | NO | PK | auto-increment | Surrogate key of the department |
| `department_name` | `VARCHAR(120)` | NO | | — | Full name of the department |
| `department_code` | `VARCHAR(20)` | NO | UNIQUE (`departments_department_code_key`) | — | Short institutional code, upper-cased by the application; the natural key |
| `created_at` | `DATETIME(3)` | NO | | `CURRENT_TIMESTAMP(3)` | Instant of creation |

### B.2.4 `academic_years`

```sql
-- CreateTable
CREATE TABLE `academic_years` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `year_name` VARCHAR(20) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `academic_years_year_name_key`(`year_name`),
    INDEX `academic_years_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

| Column | MySQL type | Null | Key | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | NO | PK | auto-increment | Surrogate key of the academic year |
| `year_name` | `VARCHAR(20)` | NO | UNIQUE (`academic_years_year_name_key`) | — | Display label such as `2025-26`; the natural key |
| `start_date` | `DATE` | NO | | — | First day of the academic year |
| `end_date` | `DATE` | NO | | — | Last day of the academic year; the application validates `end_date > start_date` |
| `is_active` | `BOOLEAN` | NO | INDEX (`academic_years_is_active_idx`) | `true` | Soft-delete flag; the current running year is active |
| `created_at` | `DATETIME(3)` | NO | | `CURRENT_TIMESTAMP(3)` | Instant of creation |

### B.2.5 `semesters`

```sql
-- CreateTable
CREATE TABLE `semesters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `semester_number` INTEGER NOT NULL,
    `academic_year_id` INTEGER NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `semesters_academic_year_id_idx`(`academic_year_id`),
    UNIQUE INDEX `semesters_academic_year_id_semester_number_key`(`academic_year_id`, `semester_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

| Column | MySQL type | Null | Key | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | NO | PK | auto-increment | Surrogate key of the semester |
| `semester_number` | `INTEGER` | NO | part of the compound UNIQUE key | — | Ordinal of the semester within its year; the application restricts it to 1–12 |
| `academic_year_id` | `INTEGER` | NO | FK → `academic_years.id` (`ON DELETE CASCADE`); INDEX (`semesters_academic_year_id_idx`) | — | The owning academic year |
| `start_date` | `DATE` | NO | | — | First day of the semester |
| `end_date` | `DATE` | NO | | — | Last day of the semester; validated to be after `start_date` |
| `is_active` | `BOOLEAN` | NO | | `true` | Soft-delete flag |
| `created_at` | `DATETIME(3)` | NO | | `CURRENT_TIMESTAMP(3)` | Instant of creation |

The compound unique index enforces that a semester number occurs at most once within an academic
year. In the Prisma schema this key is named `semester_number_per_year`; the physical MySQL index
name is `semesters_academic_year_id_semester_number_key` (see Section B.4).

### B.2.6 `sections`

```sql
-- CreateTable
CREATE TABLE `sections` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subject_id` INTEGER NOT NULL,
    `section` VARCHAR(10) NOT NULL,
    `academic_year_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sections_subject_id_idx`(`subject_id`),
    INDEX `sections_academic_year_id_idx`(`academic_year_id`),
    UNIQUE INDEX `sections_subject_id_section_academic_year_id_key`(`subject_id`, `section`, `academic_year_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

| Column | MySQL type | Null | Key | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | NO | PK | auto-increment | Surrogate key of the section offering |
| `subject_id` | `INTEGER` | NO | FK → `subjects.id` (`ON DELETE CASCADE`); INDEX (`sections_subject_id_idx`) | — | The subject this section delivers |
| `section` | `VARCHAR(10)` | NO | part of the compound UNIQUE key | — | Section label such as `A` or `B`; upper-cased by the application |
| `academic_year_id` | `INTEGER` | NO | FK → `academic_years.id` (`ON DELETE CASCADE`); INDEX (`sections_academic_year_id_idx`) | — | The year in which the section is offered |
| `created_at` | `DATETIME(3)` | NO | | `CURRENT_TIMESTAMP(3)` | Instant of creation |

### B.2.7 `students`

```sql
-- CreateTable
CREATE TABLE `students` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `roll_number` VARCHAR(40) NOT NULL,
    `department_id` INTEGER NOT NULL,
    `semester_id` INTEGER NOT NULL,
    `section` VARCHAR(10) NOT NULL,
    `admission_year` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `students_user_id_key`(`user_id`),
    UNIQUE INDEX `students_roll_number_key`(`roll_number`),
    INDEX `students_department_id_idx`(`department_id`),
    INDEX `students_semester_id_idx`(`semester_id`),
    INDEX `students_section_idx`(`section`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

| Column | MySQL type | Null | Key | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | NO | PK | auto-increment | Surrogate key of the student record |
| `user_id` | `INTEGER` | NO | UNIQUE (`students_user_id_key`); FK → `users.id` (`ON DELETE CASCADE`) | — | The linked account; the unique constraint makes the relationship one-to-one |
| `roll_number` | `VARCHAR(40)` | NO | UNIQUE (`students_roll_number_key`) | — | Institutional roll number; the natural key of a student |
| `department_id` | `INTEGER` | NO | FK → `departments.id` (`ON DELETE RESTRICT`); INDEX (`students_department_id_idx`) | — | Owning department |
| `semester_id` | `INTEGER` | NO | FK → `semesters.id` (`ON DELETE RESTRICT`); INDEX (`students_semester_id_idx`) | — | Current semester of the student |
| `section` | `VARCHAR(10)` | NO | INDEX (`students_section_idx`) | — | Label of the cohort's current home section |
| `admission_year` | `INTEGER` | NO | | — | Calendar year in which the student was admitted; the application restricts it to 1990–2100 |
| `created_at` | `DATETIME(3)` | NO | | `CURRENT_TIMESTAMP(3)` | Instant of creation |
| `updated_at` | `DATETIME(3)` | NO | | — (maintained by Prisma `@updatedAt`) | Instant of the last update |

### B.2.8 `faculty`

```sql
-- CreateTable
CREATE TABLE `faculty` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `faculty_id` VARCHAR(40) NOT NULL,
    `department_id` INTEGER NOT NULL,
    `designation` VARCHAR(80) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `faculty_user_id_key`(`user_id`),
    UNIQUE INDEX `faculty_faculty_id_key`(`faculty_id`),
    INDEX `faculty_department_id_idx`(`department_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

| Column | MySQL type | Null | Key | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | NO | PK | auto-increment | Surrogate key of the staff record |
| `user_id` | `INTEGER` | NO | UNIQUE (`faculty_user_id_key`); FK → `users.id` (`ON DELETE CASCADE`) | — | The linked account; the unique constraint makes the relationship one-to-one |
| `faculty_id` | `VARCHAR(40)` | NO | UNIQUE (`faculty_faculty_id_key`) | — | Institutional staff identifier, e.g. `FAC-1001`; the natural key |
| `department_id` | `INTEGER` | NO | FK → `departments.id` (`ON DELETE RESTRICT`); INDEX (`faculty_department_id_idx`) | — | Owning department |
| `designation` | `VARCHAR(80)` | NO | | — | Academic rank, e.g. `Associate Professor` |
| `created_at` | `DATETIME(3)` | NO | | `CURRENT_TIMESTAMP(3)` | Instant of creation |

### B.2.9 `subjects`

```sql
-- CreateTable
CREATE TABLE `subjects` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subject_code` VARCHAR(40) NOT NULL,
    `subject_name` VARCHAR(160) NOT NULL,
    `department_id` INTEGER NOT NULL,
    `semester_id` INTEGER NOT NULL,
    `academic_year_id` INTEGER NOT NULL,
    `credits` INTEGER NOT NULL DEFAULT 3,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `subjects_subject_code_key`(`subject_code`),
    INDEX `subjects_department_id_idx`(`department_id`),
    INDEX `subjects_semester_id_idx`(`semester_id`),
    INDEX `subjects_academic_year_id_idx`(`academic_year_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

| Column | MySQL type | Null | Key | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | NO | PK | auto-increment | Surrogate key of the subject |
| `subject_code` | `VARCHAR(40)` | NO | UNIQUE (`subjects_subject_code_key`) | — | Institutional subject code, e.g. `CSE101`; the natural key; upper-cased by the application |
| `subject_name` | `VARCHAR(160)` | NO | | — | Full title of the subject |
| `department_id` | `INTEGER` | NO | FK → `departments.id` (`ON DELETE RESTRICT`); INDEX (`subjects_department_id_idx`) | — | Owning department |
| `semester_id` | `INTEGER` | NO | FK → `semesters.id` (`ON DELETE RESTRICT`); INDEX (`subjects_semester_id_idx`) | — | The semester in which the subject is offered |
| `academic_year_id` | `INTEGER` | NO | FK → `academic_years.id` (`ON DELETE RESTRICT`); INDEX (`subjects_academic_year_id_idx`) | — | The year in which the subject is offered |
| `credits` | `INTEGER` | NO | | `3` | Credit weight of the subject; the application restricts it to 0–20 |
| `is_active` | `BOOLEAN` | NO | | `true` | Soft-delete flag; a subject with attendance history is deactivated rather than deleted |
| `created_at` | `DATETIME(3)` | NO | | `CURRENT_TIMESTAMP(3)` | Instant of creation |

### B.2.10 `faculty_subjects`

```sql
-- CreateTable
CREATE TABLE `faculty_subjects` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `faculty_id` INTEGER NOT NULL,
    `subject_id` INTEGER NOT NULL,
    `academic_year_id` INTEGER NOT NULL,
    `section_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `faculty_subjects_subject_id_idx`(`subject_id`),
    INDEX `faculty_subjects_academic_year_id_idx`(`academic_year_id`),
    UNIQUE INDEX `faculty_subjects_faculty_id_subject_id_section_id_academic_y_key`(`faculty_id`, `subject_id`, `section_id`, `academic_year_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

| Column | MySQL type | Null | Key | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | NO | PK | auto-increment | Surrogate key of the assignment |
| `faculty_id` | `INTEGER` | NO | FK → `faculty.id` (`ON DELETE CASCADE`); part of the compound UNIQUE key | — | The member of staff who teaches |
| `subject_id` | `INTEGER` | NO | FK → `subjects.id` (`ON DELETE CASCADE`); INDEX (`faculty_subjects_subject_id_idx`); part of the compound UNIQUE key | — | The subject taught |
| `academic_year_id` | `INTEGER` | NO | FK → `academic_years.id` (`ON DELETE CASCADE`); INDEX (`faculty_subjects_academic_year_id_idx`); part of the compound UNIQUE key | — | The year of the teaching commitment |
| `section_id` | `INTEGER` | NO | FK → `sections.id` (`ON DELETE CASCADE`); part of the compound UNIQUE key | — | The section in which the subject is taught |
| `created_at` | `DATETIME(3)` | NO | | `CURRENT_TIMESTAMP(3)` | Instant of creation |

The compound unique index enforces that a given member of staff is not assigned twice to the same
subject, in the same section, in the same year. In the Prisma schema this key is named
`unique_faculty_subject_assignment`; the physical index name is
`faculty_subjects_faculty_id_subject_id_section_id_academic_y_key` (see Section B.4).

### B.2.11 `enrollments`

```sql
-- CreateTable
CREATE TABLE `enrollments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_id` INTEGER NOT NULL,
    `subject_id` INTEGER NOT NULL,
    `academic_year_id` INTEGER NOT NULL,
    `section_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `enrollments_subject_id_idx`(`subject_id`),
    INDEX `enrollments_academic_year_id_idx`(`academic_year_id`),
    INDEX `enrollments_section_id_idx`(`section_id`),
    UNIQUE INDEX `enrollments_student_id_subject_id_academic_year_id_key`(`student_id`, `subject_id`, `academic_year_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

| Column | MySQL type | Null | Key | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | NO | PK | auto-increment | Surrogate key of the enrolment |
| `student_id` | `INTEGER` | NO | FK → `students.id` (`ON DELETE CASCADE`); part of the compound UNIQUE key | — | The registered student |
| `subject_id` | `INTEGER` | NO | FK → `subjects.id` (`ON DELETE CASCADE`); INDEX (`enrollments_subject_id_idx`); part of the compound UNIQUE key | — | The subject registered for |
| `academic_year_id` | `INTEGER` | NO | FK → `academic_years.id` (`ON DELETE CASCADE`); INDEX (`enrollments_academic_year_id_idx`); part of the compound UNIQUE key | — | The year of registration |
| `section_id` | `INTEGER` | YES | FK → `sections.id` (`ON DELETE SET NULL`); INDEX (`enrollments_section_id_idx`) | `NULL` | The section within which the student is registered; null means "registered for the subject, section not yet fixed" |
| `created_at` | `DATETIME(3)` | NO | | `CURRENT_TIMESTAMP(3)` | Instant of creation |

In the Prisma schema this compound unique key is named `unique_student_subject_enrollment`; the
physical index name is `enrollments_student_id_subject_id_academic_year_id_key` (see Section B.4).

### B.2.12 `attendance_sessions`

```sql
-- CreateTable
CREATE TABLE `attendance_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subject_id` INTEGER NOT NULL,
    `faculty_id` INTEGER NOT NULL,
    `academic_year_id` INTEGER NOT NULL,
    `section_id` INTEGER NOT NULL,
    `section` VARCHAR(10) NOT NULL,
    `attendance_date` DATE NOT NULL,
    `start_time` VARCHAR(20) NULL,
    `end_time` VARCHAR(20) NULL,
    `session_number` INTEGER NOT NULL DEFAULT 1,
    `topic` VARCHAR(200) NULL,
    `is_cancelled` BOOLEAN NOT NULL DEFAULT false,
    `created_by` INTEGER NULL,
    `assignment_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `attendance_sessions_subject_id_idx`(`subject_id`),
    INDEX `attendance_sessions_faculty_id_idx`(`faculty_id`),
    INDEX `attendance_sessions_attendance_date_idx`(`attendance_date`),
    INDEX `attendance_sessions_academic_year_id_idx`(`academic_year_id`),
    INDEX `attendance_sessions_section_id_idx`(`section_id`),
    UNIQUE INDEX `attendance_sessions_subject_id_section_id_academic_year_id_a_key`(`subject_id`, `section_id`, `academic_year_id`, `attendance_date`, `session_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

| Column | MySQL type | Null | Key | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | NO | PK | auto-increment | Surrogate key of the session |
| `subject_id` | `INTEGER` | NO | FK → `subjects.id` (`ON DELETE RESTRICT`); INDEX (`attendance_sessions_subject_id_idx`); part of the compound UNIQUE key | — | The subject delivered |
| `faculty_id` | `INTEGER` | NO | FK → `faculty.id` (`ON DELETE RESTRICT`); INDEX (`attendance_sessions_faculty_id_idx`) | — | The member of staff who conducted the session |
| `academic_year_id` | `INTEGER` | NO | FK → `academic_years.id` (`ON DELETE RESTRICT`); INDEX (`attendance_sessions_academic_year_id_idx`); part of the compound UNIQUE key | — | The academic year of the session |
| `section_id` | `INTEGER` | NO | FK → `sections.id` (`ON DELETE RESTRICT`, named relation `SessionSection`); INDEX (`attendance_sessions_section_id_idx`); part of the compound UNIQUE key | — | The section that attended the session |
| `section` | `VARCHAR(10)` | NO | | — | **Snapshot** of the section label at the moment the session was created; a deliberate, bounded denormalisation |
| `attendance_date` | `DATE` | NO | INDEX (`attendance_sessions_attendance_date_idx`); part of the compound UNIQUE key | — | The calendar date of the lecture; stored at UTC midnight |
| `start_time` | `VARCHAR(20)` | YES | | — | Free-text start time entered by the faculty member, e.g. `09:30 AM`; used only for ordering the day's sessions |
| `end_time` | `VARCHAR(20)` | YES | | — | Free-text end time, e.g. `10:30 AM` |
| `session_number` | `INTEGER` | NO | part of the compound UNIQUE key | `1` | Ordinal of the lecture within the day; the application restricts it to 1–20 |
| `topic` | `VARCHAR(200)` | YES | | — | Optional topic covered in the session |
| `is_cancelled` | `BOOLEAN` | NO | | `false` | When true the session is excluded from every percentage computation but retained in the database |
| `created_by` | `INTEGER` | YES | FK → `users.id` (`ON DELETE SET NULL`, named relation `SessionCreator`) | `NULL` | The account that created the session |
| `assignment_id` | `INTEGER` | YES | FK → `faculty_subjects.id` (`ON DELETE SET NULL`) | `NULL` | The teaching assignment that authorised the session |
| `created_at` | `DATETIME(3)` | NO | | `CURRENT_TIMESTAMP(3)` | Instant of creation |
| `updated_at` | `DATETIME(3)` | NO | | — (maintained by Prisma `@updatedAt`) | Instant of the last update |

In the Prisma schema this compound unique key is named `unique_session_slot`; the physical index
name is `attendance_sessions_subject_id_section_id_academic_year_id_a_key` (see Section B.4).

### B.2.13 `attendance_records`

```sql
-- CreateTable
CREATE TABLE `attendance_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `attendance_session_id` INTEGER NOT NULL,
    `student_id` INTEGER NOT NULL,
    `attendance_status` ENUM('PRESENT', 'ABSENT', 'LATE', 'ON_LEAVE') NOT NULL,
    `marked_by` INTEGER NULL,
    `remarks` VARCHAR(255) NULL,
    `marked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `attendance_records_student_id_idx`(`student_id`),
    INDEX `attendance_records_attendance_status_idx`(`attendance_status`),
    UNIQUE INDEX `attendance_records_attendance_session_id_student_id_key`(`attendance_session_id`, `student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

| Column | MySQL type | Null | Key | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | NO | PK | auto-increment | Surrogate key of the record |
| `attendance_session_id` | `INTEGER` | NO | FK → `attendance_sessions.id` (`ON DELETE CASCADE`); part of the compound UNIQUE key | — | The session in which the mark was given |
| `student_id` | `INTEGER` | NO | FK → `students.id` (`ON DELETE RESTRICT`); INDEX (`attendance_records_student_id_idx`); part of the compound UNIQUE key | — | The student the mark concerns |
| `attendance_status` | `ENUM('PRESENT','ABSENT','LATE','ON_LEAVE')` | NO | INDEX (`attendance_records_attendance_status_idx`) | — | The recorded state |
| `marked_by` | `INTEGER` | YES | FK → `users.id` (`ON DELETE SET NULL`, named relation `MarkedBy`) | `NULL` | The account that recorded or last corrected the mark |
| `remarks` | `VARCHAR(255)` | YES | | — | Free-text remark, e.g. the reason for an approved leave |
| `marked_at` | `DATETIME(3)` | NO | | `CURRENT_TIMESTAMP(3)` | Instant at which the mark was recorded or last changed |
| `updated_at` | `DATETIME(3)` | NO | | — (maintained by Prisma `@updatedAt`) | Instant of the last update |

In the Prisma schema this compound unique key is named `unique_student_per_session`; the physical
index name is `attendance_records_attendance_session_id_student_id_key` (see Section B.4).

### B.2.14 `audit_logs`

```sql
-- CreateTable
CREATE TABLE `audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `action` VARCHAR(60) NOT NULL,
    `entity_type` VARCHAR(60) NOT NULL,
    `entity_id` VARCHAR(64) NULL,
    `details` TEXT NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_user_id_idx`(`user_id`),
    INDEX `audit_logs_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

| Column | MySQL type | Null | Key | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | NO | PK | auto-increment | Surrogate key of the audit entry |
| `user_id` | `INTEGER` | YES | FK → `users.id` (`ON DELETE SET NULL`); INDEX (`audit_logs_user_id_idx`) | `NULL` | The account that performed the action; null for system actions or after the account is removed |
| `action` | `VARCHAR(60)` | NO | | — | The action performed, e.g. `CREATE`, `UPDATE`, `DEACTIVATE`, `LOGIN`, `SUBMIT_ATTENDANCE`, `PASSWORD_RESET` |
| `entity_type` | `VARCHAR(60)` | NO | INDEX (`audit_logs_entity_type_entity_id_idx`) | — | The kind of entity acted upon, e.g. `AttendanceSession` |
| `entity_id` | `VARCHAR(64)` | YES | INDEX (`audit_logs_entity_type_entity_id_idx`) | — | The identifier of the entity acted upon, stored as text because the referenced table varies |
| `details` | `TEXT` | YES | | — | JSON payload describing the change, e.g. `{ "from": "ABSENT", "to": "PRESENT" }` |
| `ip_address` | `VARCHAR(45)` | YES | | — | The client IP address; 45 characters accommodates an IPv6 address |
| `created_at` | `DATETIME(3)` | NO | INDEX (`audit_logs_created_at_idx`) | `CURRENT_TIMESTAMP(3)` | Instant at which the action occurred |

---

## B.3 Foreign-key constraints

The migration adds the thirty foreign keys in a separate `ALTER TABLE` block. The statements are
reproduced verbatim below.

```sql
-- AddForeignKey
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `semesters` ADD CONSTRAINT `semesters_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sections` ADD CONSTRAINT `sections_subject_id_fkey` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sections` ADD CONSTRAINT `sections_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `students` ADD CONSTRAINT `students_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `students` ADD CONSTRAINT `students_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `students` ADD CONSTRAINT `students_semester_id_fkey` FOREIGN KEY (`semester_id`) REFERENCES `semesters`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faculty` ADD CONSTRAINT `faculty_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faculty` ADD CONSTRAINT `faculty_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subjects` ADD CONSTRAINT `subjects_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subjects` ADD CONSTRAINT `subjects_semester_id_fkey` FOREIGN KEY (`semester_id`) REFERENCES `semesters`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subjects` ADD CONSTRAINT `subjects_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faculty_subjects` ADD CONSTRAINT `faculty_subjects_faculty_id_fkey` FOREIGN KEY (`faculty_id`) REFERENCES `faculty`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faculty_subjects` ADD CONSTRAINT `faculty_subjects_subject_id_fkey` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faculty_subjects` ADD CONSTRAINT `faculty_subjects_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faculty_subjects` ADD CONSTRAINT `faculty_subjects_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_subject_id_fkey` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_subject_id_fkey` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_faculty_id_fkey` FOREIGN KEY (`faculty_id`) REFERENCES `faculty`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_assignment_id_fkey` FOREIGN KEY (`assignment_id`) REFERENCES `faculty_subjects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_attendance_session_id_fkey` FOREIGN KEY (`attendance_session_id`) REFERENCES `attendance_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_marked_by_fkey` FOREIGN KEY (`marked_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
```

### B.3.1 Referential-action summary

| Action | Count | Foreign keys |
| --- | --- | --- |
| `ON DELETE CASCADE` | 14 | `password_reset_tokens.user_id`, `semesters.academic_year_id`, `sections.subject_id`, `sections.academic_year_id`, `students.user_id`, `faculty.user_id`, `faculty_subjects.faculty_id`, `faculty_subjects.subject_id`, `faculty_subjects.academic_year_id`, `faculty_subjects.section_id`, `enrollments.student_id`, `enrollments.subject_id`, `enrollments.academic_year_id`, `attendance_records.attendance_session_id` |
| `ON DELETE RESTRICT` | 11 | `students.department_id`, `students.semester_id`, `faculty.department_id`, `subjects.department_id`, `subjects.semester_id`, `subjects.academic_year_id`, `attendance_sessions.subject_id`, `attendance_sessions.faculty_id`, `attendance_sessions.academic_year_id`, `attendance_sessions.section_id`, `attendance_records.student_id` |
| `ON DELETE SET NULL` | 5 | `enrollments.section_id`, `attendance_sessions.assignment_id`, `attendance_sessions.created_by`, `attendance_records.marked_by`, `audit_logs.user_id` |
| **Total** | **30** | Every `ON UPDATE` action is `CASCADE`. |

The classification rule is that a `RESTRICT` is applied wherever the parent is referenced by
attendance history, a `SET NULL` wherever the link records an actor or an optional attribution,
and a `CASCADE` only where the child rows cannot themselves carry attendance history.

---

## B.4 Index inventory

| Table | Index | Type | Columns | Purpose |
| --- | --- | --- | --- | --- |
| `users` | `PRIMARY` | PRIMARY KEY | `id` | Row identifier |
| `users` | `users_email_key` | UNIQUE | `email` | Login lookup and uniqueness of the address |
| `users` | `users_role_idx` | INDEX | `role` | Role-based queries on the account |
| `users` | `users_is_active_idx` | INDEX | `is_active` | Filtering active accounts |
| `password_reset_tokens` | `PRIMARY` | PRIMARY KEY | `id` | Row identifier |
| `password_reset_tokens` | `password_reset_tokens_token_hash_key` | UNIQUE | `token_hash` | Token lookup by digest |
| `password_reset_tokens` | `password_reset_tokens_user_id_idx` | INDEX | `user_id` | Tokens belonging to an account; cascading delete |
| `password_reset_tokens` | `password_reset_tokens_expires_at_idx` | INDEX | `expires_at` | Expiry sweeps |
| `departments` | `PRIMARY` | PRIMARY KEY | `id` | Row identifier |
| `departments` | `departments_department_code_key` | UNIQUE | `department_code` | Natural-key lookup and uniqueness |
| `academic_years` | `PRIMARY` | PRIMARY KEY | `id` | Row identifier |
| `academic_years` | `academic_years_year_name_key` | UNIQUE | `year_name` | Natural-key lookup and uniqueness |
| `academic_years` | `academic_years_is_active_idx` | INDEX | `is_active` | Filtering the current year |
| `semesters` | `PRIMARY` | PRIMARY KEY | `id` | Row identifier |
| `semesters` | `semesters_academic_year_id_semester_number_key` | UNIQUE | `academic_year_id`, `semester_number` | One semester number per year |
| `semesters` | `semesters_academic_year_id_idx` | INDEX | `academic_year_id` | Listing the semesters of a year |
| `sections` | `PRIMARY` | PRIMARY KEY | `id` | Row identifier |
| `sections` | `sections_subject_id_section_academic_year_id_key` | UNIQUE | `subject_id`, `section`, `academic_year_id` | One label per subject per year |
| `sections` | `sections_subject_id_idx` | INDEX | `subject_id` | Listing the sections of a subject |
| `sections` | `sections_academic_year_id_idx` | INDEX | `academic_year_id` | Listing the sections of a year |
| `students` | `PRIMARY` | PRIMARY KEY | `id` | Row identifier |
| `students` | `students_user_id_key` | UNIQUE | `user_id` | One account to one student |
| `students` | `students_roll_number_key` | UNIQUE | `roll_number` | Natural-key lookup and uniqueness |
| `students` | `students_department_id_idx` | INDEX | `department_id` | Listing students of a department |
| `students` | `students_semester_id_idx` | INDEX | `semester_id` | Listing students of a semester |
| `students` | `students_section_idx` | INDEX | `section` | Filtering by cohort section |
| `faculty` | `PRIMARY` | PRIMARY KEY | `id` | Row identifier |
| `faculty` | `faculty_user_id_key` | UNIQUE | `user_id` | One account to one staff member |
| `faculty` | `faculty_faculty_id_key` | UNIQUE | `faculty_id` | Natural-key lookup and uniqueness |
| `faculty` | `faculty_department_id_idx` | INDEX | `department_id` | Listing staff of a department |
| `subjects` | `PRIMARY` | PRIMARY KEY | `id` | Row identifier |
| `subjects` | `subjects_subject_code_key` | UNIQUE | `subject_code` | Natural-key lookup and uniqueness |
| `subjects` | `subjects_department_id_idx` | INDEX | `department_id` | Listing subjects of a department |
| `subjects` | `subjects_semester_id_idx` | INDEX | `semester_id` | Listing subjects of a semester |
| `subjects` | `subjects_academic_year_id_idx` | INDEX | `academic_year_id` | Listing subjects of a year |
| `faculty_subjects` | `PRIMARY` | PRIMARY KEY | `id` | Row identifier |
| `faculty_subjects` | `faculty_subjects_faculty_id_subject_id_section_id_academic_y_key` | UNIQUE | `faculty_id`, `subject_id`, `section_id`, `academic_year_id` | One assignment per teaching commitment |
| `faculty_subjects` | `faculty_subjects_subject_id_idx` | INDEX | `subject_id` | Listing the staff assigned to a subject |
| `faculty_subjects` | `faculty_subjects_academic_year_id_idx` | INDEX | `academic_year_id` | Listing the assignments of a year |
| `enrollments` | `PRIMARY` | PRIMARY KEY | `id` | Row identifier |
| `enrollments` | `enrollments_student_id_subject_id_academic_year_id_key` | UNIQUE | `student_id`, `subject_id`, `academic_year_id` | One registration per student, subject and year |
| `enrollments` | `enrollments_subject_id_idx` | INDEX | `subject_id` | Roster of a subject |
| `enrollments` | `enrollments_academic_year_id_idx` | INDEX | `academic_year_id` | Registrations of a year |
| `enrollments` | `enrollments_section_id_idx` | INDEX | `section_id` | Roster of a section |
| `attendance_sessions` | `PRIMARY` | PRIMARY KEY | `id` | Row identifier |
| `attendance_sessions` | `attendance_sessions_subject_id_section_id_academic_year_id_a_key` | UNIQUE | `subject_id`, `section_id`, `academic_year_id`, `attendance_date`, `session_number` | One session per slot |
| `attendance_sessions` | `attendance_sessions_subject_id_idx` | INDEX | `subject_id` | Sessions of a subject |
| `attendance_sessions` | `attendance_sessions_faculty_id_idx` | INDEX | `faculty_id` | Sessions of a faculty member (the scope filter) |
| `attendance_sessions` | `attendance_sessions_attendance_date_idx` | INDEX | `attendance_date` | Date ranges and "today" |
| `attendance_sessions` | `attendance_sessions_academic_year_id_idx` | INDEX | `academic_year_id` | Sessions of a year |
| `attendance_sessions` | `attendance_sessions_section_id_idx` | INDEX | `section_id` | Sessions of a section |
| `attendance_records` | `PRIMARY` | PRIMARY KEY | `id` | Row identifier |
| `attendance_records` | `attendance_records_attendance_session_id_student_id_key` | UNIQUE | `attendance_session_id`, `student_id` | One record per student per session |
| `attendance_records` | `attendance_records_student_id_idx` | INDEX | `student_id` | Per-student history |
| `attendance_records` | `attendance_records_attendance_status_idx` | INDEX | `attendance_status` | Filtering by status |
| `audit_logs` | `PRIMARY` | PRIMARY KEY | `id` | Row identifier |
| `audit_logs` | `audit_logs_user_id_idx` | INDEX | `user_id` | Entries of one user |
| `audit_logs` | `audit_logs_entity_type_entity_id_idx` | INDEX | `entity_type`, `entity_id` | History of one entity |
| `audit_logs` | `audit_logs_created_at_idx` | INDEX | `created_at` | Chronological listing and date ranges |

Totals: **14 primary keys, 15 unique indexes (9 single-column and 6 compound), 30 secondary
indexes, 59 indexes in all.**

---

## B.5 Note on the naming of the compound unique keys

The Prisma schema gives a name to each compound unique key so that the generated client can refer
to it in a `where` clause. The physical MySQL index names produced by `prisma migrate` follow a
different convention, and the two do not correspond. The mapping is:

| Prisma constraint name | Prisma column list | Physical MySQL index name |
| --- | --- | --- |
| `unique_session_slot` | `subjectId`, `sectionId`, `academicYearId`, `attendanceDate`, `sessionNumber` | `attendance_sessions_subject_id_section_id_academic_year_id_a_key` |
| `unique_student_per_session` | `attendanceSessionId`, `studentId` | `attendance_records_attendance_session_id_student_id_key` |
| `unique_student_subject_enrollment` | `studentId`, `subjectId`, `academicYearId` | `enrollments_student_id_subject_id_academic_year_id_key` |
| `unique_faculty_subject_assignment` | `facultyId`, `subjectId`, `sectionId`, `academicYearId` | `faculty_subjects_faculty_id_subject_id_section_id_academic_y_key` |
| `unique_section_offering` | `subjectId`, `section`, `academicYearId` | `sections_subject_id_section_academic_year_id_key` |
| `semester_number_per_year` | `academicYearId`, `semesterNumber` | `semesters_academic_year_id_semester_number_key` |

The constraint itself is identical in both places — the same columns, in the same order, with the
same uniqueness semantics — so the integrity guarantee is unaffected. What differs is only the
label. The application uses the Prisma names (`prisma.attendanceSession.findUnique({ where: {
unique_session_slot: { ... } } })`), whereas an administrator writing raw SQL must use the
physical names listed above.

This is the discrepancy between the schema file and the migration. It is documented here rather
than corrected, because the migration has already been applied and renaming a MySQL index is a
separate migration in its own right.
