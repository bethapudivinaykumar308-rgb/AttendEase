# 06 — SQL Queries Reference

**Document:** `docs/06-sql-queries.md`
**Project:** AttendEase — Student Attendance Management System
**Target database:** MySQL 8.x, schema `attendance_management`
**Source of truth for identifiers:** `backend/prisma/migrations/20260101000000_init/migration.sql`

---

## 6.0 Purpose and Conventions

This document collects the analytical and transactional SQL that underpins the
reporting and dashboard features of AttendEase. Every identifier used below —
table names, column names, index names and enum values — has been taken
verbatim from the initial migration, which is the physical definition of the
`attendance_management` schema. The Prisma model names (`attendanceSession`,
`attendanceRecord`, `academicYear`) are camelCase aliases of the same physical
tables; all SQL in this document uses the **physical snake_case names**.

### 6.0.1 Connecting

The application connects with the least-privilege account declared in
`.env.example`:

```text
DATABASE_URL="mysql://attendease:***@127.0.0.1:3306/attendance_management"
```

A query file may be executed with:

```bash
mysql --user=attendease --password --database=attendance_management < queries.sql
```

All queries below are written for MySQL 8.0 and use only features available in
that release: common table expressions, window functions, `ROLLUP`, `DATE_FORMAT`,
and `NULLIF`.

### 6.0.2 Naming conventions used in this document

| Convention | Meaning | Example |
|---|---|---|
| `snake_case` | Physical table and column name | `attendance_records.attendance_status` |
| `UPPER_CASE` | MySQL `ENUM` member or keyword | `attendance_status = 'PRESENT'` |
| `asn`, `ar`, `e`, `s`, `sub`, `f`, `u`, `d`, `sec` | Short aliases for joined tables | `asn` = `attendance_sessions` |
| `[bracketed]` | A literal value the reader must supply | `[1]` = a specific identifier |

### 6.0.3 The two attendance policies (used by almost every query)

Both policies are implemented in `backend/src/services/attendance.service.ts`
(`eligibleSessionWhere()` and `calculatePercentage()`) and are reflected in
`backend/src/config/env.ts`.

| Policy | Rule | Source |
|---|---|---|
| **Session eligibility** | A session counts only if `is_cancelled = FALSE` **and** `attendance_date <= CURDATE()` | `eligibleSessionWhere()` — `{ isCancelled: false, attendanceDate: { lte: startOfToday() } }` |
| **Counted as attended** | `PRESENT` + `LATE` (+ `ON_LEAVE` only if `ATTENDANCE_COUNTED_STATUSES` includes it; the shipped default is `PRESENT,LATE`) | `calculatePercentage()` / `env.countedStatuses` |
| **Low-attendance threshold** | Percentage strictly **below** 75 % | `ATTENDANCE_THRESHOLD_PERCENT=75`, `env.thresholdPercent` |

The SQL below uses the shipped default (`PRESENT`, `LATE`). Where the policy is
configuration dependent, the query contains a comment naming the alternative.

### 6.0.4 A note on the denominator

The service computes attendance as *attended records divided by eligible
sessions*, **not** by the number of records. A student for whom no record was
ever created still has that session in the denominator. The queries below
reproduce that behaviour deliberately: the session table is the driving table and
the record table is joined with `LEFT JOIN`, with `COUNT(DISTINCT asn.id)` used
as the denominator.

---

## 6.1 Analytical Queries

### 6.1.1 Q1 — Students below the 75 % attendance threshold

**Purpose.** The headline regulatory question: which students are at risk of
being barred from an examination because their attendance has fallen below the
configured threshold. This is the direct SQL equivalent of the `low-attendance`
report in `backend/src/services/report.service.ts` and of the "overall"
summary produced by `getStudentOverallSummary()`.

```sql
-- Q1: Students whose overall attendance percentage is below the 75% threshold.
-- Denominator  = eligible sessions (not cancelled, not in the future)
-- Numerator    = records with attendance_status IN ('PRESENT','LATE')
-- If ATTENDANCE_COUNTED_STATUSES includes ON_LEAVE, add 'ON_LEAVE' to the IN list.
SELECT
    s.id                          AS student_id,
    s.roll_number                 AS roll_number,
    u.name                        AS student_name,
    d.department_name             AS department,
    s.section                     AS student_section,
    COUNT(DISTINCT asn.id)        AS total_sessions,
    SUM(CASE WHEN ar.attendance_status = 'PRESENT' THEN 1 ELSE 0 END) AS present_count,
    SUM(CASE WHEN ar.attendance_status = 'LATE'    THEN 1 ELSE 0 END) AS late_count,
    SUM(CASE WHEN ar.attendance_status = 'ABSENT'  THEN 1 ELSE 0 END) AS absent_count,
    SUM(CASE WHEN ar.attendance_status = 'ON_LEAVE' THEN 1 ELSE 0 END) AS on_leave_count,
    SUM(CASE WHEN ar.attendance_status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END) AS attended_classes,
    ROUND(
        100.0 * SUM(CASE WHEN ar.attendance_status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END)
        / NULLIF(COUNT(DISTINCT asn.id), 0),
        2
    )                             AS attendance_percentage
FROM students s
JOIN users u
       ON u.id  = s.user_id
JOIN departments d
       ON d.id  = s.department_id
JOIN enrollments e
       ON e.student_id = s.id
JOIN attendance_sessions asn
       ON asn.subject_id        = e.subject_id
      AND asn.academic_year_id  = e.academic_year_id
      AND asn.is_cancelled      = FALSE
      AND asn.attendance_date  <= CURDATE()
LEFT JOIN attendance_records ar
       ON ar.attendance_session_id = asn.id
      AND ar.student_id            = s.id
WHERE e.section_id IS NULL
   OR asn.section_id = e.section_id
GROUP BY s.id, s.roll_number, u.name, d.department_name, s.section
HAVING attendance_percentage < 75
ORDER BY attendance_percentage ASC, s.roll_number ASC;
```

**Explanation.**

* `enrollments` defines the *curriculum* a student is measured against; a
  student who has no enrolment in a subject cannot be marked present in it.
* `attendance_sessions` is the driving table because it defines the
  denominator. `LEFT JOIN attendance_records` means a session with no marked
  record for that student still contributes 1 to `total_sessions` and 0 to
  `attended_classes` — exactly the behaviour of `getStudentSubjectSummaries()`.
* `WHERE e.section_id IS NULL OR asn.section_id = e.section_id` mirrors the
  section filter in the service: a student enrolled *without* a section
  attends every session of the subject, while a section-bound student is
  measured only against their own section's sessions.
* The join `asn.academic_year_id = e.academic_year_id` is a deliberate
  refinement on the service code, which fetches sessions by `subject_id` alone.
  It prevents a fan-out when the same student enrols the same subject in two
  academic years, and it matches the `enrollments_student_id_subject_id_academic_year_id_key`
  uniqueness rule.
* `HAVING attendance_percentage < 75` filters on the computed alias. MySQL
  permits aliases in `HAVING`; `COUNT(DISTINCT asn.id)` is used because the
  record join multiplies each session by at most one row per student
  (`attendance_records_attendance_session_id_student_id_key` is unique), but
  `DISTINCT` keeps the denominator correct even if that constraint were relaxed.

---

### 6.1.2 Q2 — Subject-wise attendance with `GROUP BY` and `HAVING`

**Purpose.** Which subjects are being attended poorly across the whole
institution? Mirrors `subjectWiseReport()` in `backend/src/services/report.service.ts`.

```sql
-- Q2: Subject-wise attendance across all sections.
-- HAVING keeps only subjects that actually have marked attendance and that
-- are below the subject-level target of 85%.
SELECT
    sub.id                                AS subject_id,
    sub.subject_code                      AS subject_code,
    sub.subject_name                      AS subject_name,
    d.department_name                     AS department,
    COUNT(DISTINCT asn.id)                AS sessions_conducted,
    COUNT(ar.id)                          AS attendance_records,
    SUM(CASE WHEN ar.attendance_status = 'PRESENT'  THEN 1 ELSE 0 END) AS present_count,
    SUM(CASE WHEN ar.attendance_status = 'LATE'     THEN 1 ELSE 0 END) AS late_count,
    SUM(CASE WHEN ar.attendance_status = 'ABSENT'   THEN 1 ELSE 0 END) AS absent_count,
    SUM(CASE WHEN ar.attendance_status = 'ON_LEAVE' THEN 1 ELSE 0 END) AS on_leave_count,
    ROUND(
        100.0 * SUM(CASE WHEN ar.attendance_status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END)
        / NULLIF(COUNT(ar.id), 0),
        2
    )                                     AS attendance_percentage
FROM attendance_sessions asn
JOIN subjects sub
       ON sub.id = asn.subject_id
JOIN departments d
       ON d.id  = sub.department_id
LEFT JOIN attendance_records ar
       ON ar.attendance_session_id = asn.id
WHERE asn.is_cancelled     = FALSE
  AND asn.attendance_date <= CURDATE()
GROUP BY sub.id, sub.subject_code, sub.subject_name, d.department_name
HAVING COUNT(ar.id) > 0
   AND attendance_percentage < 85
ORDER BY attendance_percentage ASC, sub.subject_code ASC;
```

**Explanation.**

* Here the **record** table determines the denominator (`COUNT(ar.id)`),
  matching `subjectWiseReport()`, which counts one "class" per session and one
  "attended" per record.
* `HAVING COUNT(ar.id) > 0` discards subjects that have no marked attendance at
  all; without it the division would be a division by zero, avoided here by
  `NULLIF` but still producing a meaningless `NULL` percentage.
* `GROUP BY` lists every non-aggregated column, which satisfies MySQL's
  `ONLY_FULL_GROUP_BY` mode (enabled by default since MySQL 5.7).

---

### 6.1.3 Q3 — Department-wise attendance (JOIN + GROUP BY)

**Purpose.** An institutional overview for the administrator dashboard.
Mirrors `departmentWiseReport()`.

```sql
-- Q3: Department-wise attendance percentage.
-- The department is reached through subjects.department_id, so the join path is
--   attendance_sessions -> subjects -> departments
SELECT
    d.id                                  AS department_id,
    d.department_code                     AS department_code,
    d.department_name                     AS department_name,
    COUNT(DISTINCT asn.id)                AS sessions_conducted,
    COUNT(ar.id)                          AS attendance_records,
    SUM(CASE WHEN ar.attendance_status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END) AS attended,
    ROUND(
        100.0 * SUM(CASE WHEN ar.attendance_status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END)
        / NULLIF(COUNT(ar.id), 0),
        2
    )                                     AS attendance_percentage
FROM departments d
JOIN subjects sub
       ON sub.department_id = d.id
JOIN attendance_sessions asn
       ON asn.subject_id = sub.id
JOIN attendance_records ar
       ON ar.attendance_session_id = asn.id
WHERE asn.is_cancelled     = FALSE
  AND asn.attendance_date <= CURDATE()
GROUP BY d.id, d.department_code, d.department_name
HAVING COUNT(ar.id) > 0
ORDER BY attendance_percentage ASC;
```

**Explanation.**

* An inner `JOIN` chain is used deliberately here because a department with no
  sessions has no attendance to report; Q11 compares this with the `LEFT JOIN`
  alternative.
* `sub.department_id` is the only link between a session and a department,
  because `attendance_sessions` stores the *subject* of the session, not the
  department. The same applies to the semester dimension, which is reached via
  `subjects.semester_id`.
* `d.department_code` is included in the projection because it is the natural
  short key for a department (`departments_department_code_key`).

---

### 6.1.4 Q4 — Students absent on a given date

#### 6.1.4.1 Q4a — students with a recorded absence

```sql
-- Q4a: Students recorded ABSENT (or ON_LEAVE) on a specific date.
SET @target_date = '2026-03-02';

SELECT
    s.id                  AS student_id,
    s.roll_number         AS roll_number,
    u.name                AS student_name,
    d.department_name     AS department,
    sub.subject_code      AS subject_code,
    sub.subject_name      AS subject_name,
    asn.section           AS section,
    asn.session_number    AS session_number,
    asn.start_time        AS start_time,
    asn.end_time          AS end_time,
    ar.attendance_status  AS status,
    ar.remarks            AS remarks
FROM attendance_sessions asn
JOIN subjects sub
       ON sub.id = asn.subject_id
JOIN attendance_records ar
       ON ar.attendance_session_id = asn.id
JOIN students s
       ON s.id = ar.student_id
JOIN users u
       ON u.id = s.user_id
JOIN departments d
       ON d.id = s.department_id
WHERE asn.attendance_date = @target_date
  AND asn.is_cancelled     = FALSE
  AND ar.attendance_status IN ('ABSENT', 'ON_LEAVE')
ORDER BY sub.subject_code ASC, s.roll_number ASC;
```

#### 6.1.4.2 Q4b — students enrolled but never marked on that date

This is the more useful diagnostic: it detects sessions in which the roster was
loaded but attendance was never saved.

```sql
-- Q4b: Enrolled students for whom NO attendance record exists on a given date.
SET @target_date = '2026-03-02';

SELECT
    s.id                AS student_id,
    s.roll_number       AS roll_number,
    u.name              AS student_name,
    sub.subject_code    AS subject_code,
    asn.section         AS section
FROM attendance_sessions asn
JOIN subjects sub
       ON sub.id = asn.subject_id
JOIN enrollments e
       ON e.subject_id        = asn.subject_id
      AND e.academic_year_id  = asn.academic_year_id
JOIN students s
       ON s.id = e.student_id
JOIN users u
       ON u.id = s.user_id
LEFT JOIN attendance_records ar
       ON ar.attendance_session_id = asn.id
      AND ar.student_id            = s.id
WHERE asn.attendance_date = @target_date
  AND asn.is_cancelled     = FALSE
  AND (e.section_id IS NULL OR e.section_id = asn.section_id)
  AND ar.id IS NULL
ORDER BY sub.subject_code ASC, s.roll_number ASC;
```

**Explanation.**

* Q4a reads the *recorded* truth; Q4b reads the *absence of a record*, which
  is a different thing and is the reason the schema separates `sessions` from
  `records`.
* `SET @target_date` defines a MySQL user variable so that the same date is
  used consistently in both statements; it may be replaced with a literal.
* `attendance_date` is a `DATE` column, so a direct equality comparison is
  correct and can use `attendance_sessions_attendance_date_idx`.

---

### 6.1.5 Q5 — Monthly attendance aggregation

**Purpose.** Trend analysis: how attendance developed month by month across the
institution. Mirrors `monthlyReport()` and `getStudentMonthlySummary()`.

```sql
-- Q5: Institution-wide monthly attendance aggregation.
SELECT
    DATE_FORMAT(asn.attendance_date, '%Y-%m')   AS month_key,
    DATE_FORMAT(asn.attendance_date, '%M %Y')   AS month_label,
    COUNT(DISTINCT asn.id)                      AS sessions_conducted,
    COUNT(ar.id)                                AS attendance_records,
    SUM(CASE WHEN ar.attendance_status = 'PRESENT'  THEN 1 ELSE 0 END) AS present_count,
    SUM(CASE WHEN ar.attendance_status = 'LATE'     THEN 1 ELSE 0 END) AS late_count,
    SUM(CASE WHEN ar.attendance_status = 'ABSENT'   THEN 1 ELSE 0 END) AS absent_count,
    SUM(CASE WHEN ar.attendance_status = 'ON_LEAVE' THEN 1 ELSE 0 END) AS on_leave_count,
    ROUND(
        100.0 * SUM(CASE WHEN ar.attendance_status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END)
        / NULLIF(COUNT(ar.id), 0),
        2
    )                                           AS attendance_percentage
FROM attendance_sessions asn
JOIN attendance_records ar
       ON ar.attendance_session_id = asn.id
WHERE asn.is_cancelled     = FALSE
  AND asn.attendance_date <= CURDATE()
GROUP BY DATE_FORMAT(asn.attendance_date, '%Y-%m'),
         DATE_FORMAT(asn.attendance_date, '%M %Y')
ORDER BY month_key ASC;
```

**Explanation.**

* `DATE_FORMAT(asn.attendance_date, '%Y-%m')` produces the same `YYYY-MM` key
  that `getStudentMonthlySummary()` builds in JavaScript with
  `formatDate(session.attendanceDate).slice(0, 7)`.
* Because the key is a text expression, the monthly aggregation cannot use the
  date index for grouping and must read every qualifying row. Where a
  restricted period is known, adding a range predicate on `attendance_date`
  keeps the row set small.
* A student-scoped monthly breakdown is given in T4 (Section 6.2).

---

### 6.1.6 Q6 — Faculty-wise attendance summary

**Purpose.** How many classes each member of the teaching staff has conducted,
and what the attendance in those classes looked like. Mirrors
`facultyWiseReport()`.

```sql
-- Q6: Faculty-wise sessions conducted and attendance recorded.
SELECT
    f.id                                  AS faculty_id,
    f.faculty_id                          AS faculty_code,
    u.name                                AS faculty_name,
    f.designation                         AS designation,
    dep.department_name                   AS department,
    COUNT(DISTINCT asn.id)                AS sessions_conducted,
    COUNT(ar.id)                          AS attendance_records,
    SUM(CASE WHEN ar.attendance_status = 'PRESENT'  THEN 1 ELSE 0 END) AS present_count,
    SUM(CASE WHEN ar.attendance_status = 'LATE'     THEN 1 ELSE 0 END) AS late_count,
    SUM(CASE WHEN ar.attendance_status = 'ABSENT'   THEN 1 ELSE 0 END) AS absent_count,
    SUM(CASE WHEN ar.attendance_status = 'ON_LEAVE' THEN 1 ELSE 0 END) AS on_leave_count,
    ROUND(
        100.0 * SUM(CASE WHEN ar.attendance_status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END)
        / NULLIF(COUNT(ar.id), 0),
        2
    )                                     AS attendance_percentage
FROM faculty f
JOIN users u
       ON u.id = f.user_id
JOIN departments dep
       ON dep.id = f.department_id
JOIN attendance_sessions asn
       ON asn.faculty_id = f.id
JOIN attendance_records ar
       ON ar.attendance_session_id = asn.id
WHERE asn.is_cancelled     = FALSE
  AND asn.attendance_date <= CURDATE()
GROUP BY f.id, f.faculty_id, u.name, f.designation, dep.department_name
ORDER BY sessions_conducted DESC, f.faculty_id ASC;
```

**Explanation.**

* The faculty *name* lives in `users.name`; `faculty.faculty_id` is the
  human-facing code (`faculty_faculty_id_key`), and `faculty.user_id` is the
  link to the shared `users` table. This is the split described in
  `docs/05-normalization.md`, Section 4.5.
* The percentage here measures the attendance *in the classes that member of
  staff conducted*; it is not a measure of that member's own attendance.
* `attendance_sessions_faculty_id_idx` supports the join predicate, so this
  query is index-driven rather than table-driven.

---

### 6.1.7 Q7 — Enrolled student count per subject (correlated subquery)

**Purpose.** How many students are registered against each subject? The
correlated subquery reads one subject row at a time and counts the enrolments
that reference it, which is the clearest illustration of a dependent
(sub-correlated) subquery in MySQL 8.

```sql
-- Q7: Number of enrolled students per subject, using a correlated subquery.
-- The subquery references `sub.id` and `sub.academic_year_id` from the outer
-- query, so it must be evaluated once per outer row.
SELECT
    sub.id                                        AS subject_id,
    sub.subject_code                              AS subject_code,
    sub.subject_name                              AS subject_name,
    sub.credits                                   AS credits,
    d.department_name                             AS department,
    (
        SELECT COUNT(*)
        FROM enrollments e
        WHERE e.subject_id       = sub.id
          AND e.academic_year_id = sub.academic_year_id
    )                                             AS enrolled_students,
    (
        SELECT COUNT(DISTINCT e.student_id)
        FROM enrollments e
        WHERE e.subject_id       = sub.id
          AND e.academic_year_id = sub.academic_year_id
    )                                             AS distinct_students
FROM subjects sub
JOIN departments d
       ON d.id = sub.department_id
WHERE sub.is_active = TRUE
ORDER BY enrolled_students DESC, sub.subject_code ASC;
```

**Explanation.**

* The inner `COUNT(*)` is *correlated* because its `WHERE` clause refers to
  `sub.id` and `sub.academic_year_id` from the enclosing `SELECT`.
* The second subquery adds `DISTINCT` on `e.student_id`. Under the
  `enrollments_student_id_subject_id_academic_year_id_key` uniqueness rule the
  two counts are identical; the second is retained to demonstrate the
  difference that appears when a subject is offered in several sections, which
  is modelled by the nullable `enrollments.section_id`.
* `enrollments_subject_id_idx` and `enrollments_academic_year_id_idx` exist
  precisely to make this correlated lookup efficient.
* The equivalent set-based form, which is usually faster on large data, is:

```sql
-- Q7b: Set-based equivalent of Q7 (no correlated subquery).
SELECT
    sub.id                 AS subject_id,
    sub.subject_code       AS subject_code,
    sub.subject_name       AS subject_name,
    COUNT(e.id)            AS enrolled_students,
    COUNT(DISTINCT e.student_id) AS distinct_students
FROM subjects sub
LEFT JOIN enrollments e
       ON e.subject_id       = sub.id
      AND e.academic_year_id = sub.academic_year_id
WHERE sub.is_active = TRUE
GROUP BY sub.id, sub.subject_code, sub.subject_name
ORDER BY enrolled_students DESC, sub.subject_code ASC;
```

Note that `COUNT(e.id)` (and not `COUNT(*)`) is required in the set-based form,
because `COUNT(*)` counts the outer row even when the `LEFT JOIN` produced no
match.

---

### 6.1.8 Q8 — Sessions with no attendance marked

**Purpose.** Data-quality monitoring: sessions that were created but for which
the roster was never saved. This is the operational counterpart of the
"attendance not marked" warning in the faculty dashboard.

```sql
-- Q8: Eligible sessions for which not a single attendance record exists.
SELECT
    asn.id                    AS session_id,
    asn.attendance_date       AS attendance_date,
    asn.session_number        AS session_number,
    asn.section               AS section,
    asn.start_time            AS start_time,
    asn.end_time              AS end_time,
    sub.subject_code          AS subject_code,
    sub.subject_name          AS subject_name,
    f.faculty_id              AS faculty_code,
    u.name                    AS faculty_name
FROM attendance_sessions asn
JOIN subjects sub
       ON sub.id = asn.subject_id
JOIN faculty f
       ON f.id = asn.faculty_id
JOIN users u
       ON u.id = f.user_id
LEFT JOIN attendance_records ar
       ON ar.attendance_session_id = asn.id
WHERE asn.is_cancelled     = FALSE
  AND asn.attendance_date <= CURDATE()
GROUP BY
    asn.id, asn.attendance_date, asn.session_number, asn.section,
    asn.start_time, asn.end_time,
    sub.subject_code, sub.subject_name,
    f.faculty_id, u.name
HAVING COUNT(ar.id) = 0
ORDER BY asn.attendance_date DESC, sub.subject_code ASC;
```

**Explanation.**

* The `LEFT JOIN` plus `HAVING COUNT(ar.id) = 0` idiom is the standard
  anti-join in SQL: it retains every session and discards those that produced
  at least one record. The equivalent form is

  ```sql
  -- ... WHERE asn.id NOT IN (SELECT attendance_session_id FROM attendance_records)
  ```

  which is generally slower because it prevents the optimiser from using an
  index on the subquery's column.
* The `GROUP BY` list repeats every projected column so that the query is
  valid under `ONLY_FULL_GROUP_BY`. Because the group key is the primary key
  `asn.id`, each group contains exactly one session.

---

### 6.1.9 Q9 — `HAVING` on session counts

**Purpose.** Identify subjects or staff with too little teaching activity for
the attendance figures to be meaningful.

```sql
-- Q9a: Subjects with fewer than five eligible sessions (HAVING on a count).
SELECT
    sub.id                        AS subject_id,
    sub.subject_code              AS subject_code,
    sub.subject_name              AS subject_name,
    COUNT(DISTINCT asn.id)        AS session_count,
    MIN(asn.attendance_date)      AS first_session,
    MAX(asn.attendance_date)      AS last_session
FROM subjects sub
JOIN attendance_sessions asn
       ON asn.subject_id = sub.id
WHERE asn.is_cancelled     = FALSE
  AND asn.attendance_date <= CURDATE()
GROUP BY sub.id, sub.subject_code, sub.subject_name
HAVING COUNT(DISTINCT asn.id) < 5
ORDER BY session_count ASC, sub.subject_code ASC;
```

```sql
-- Q9b: Faculty who have conducted at least three sessions in the period
--       (HAVING on a count, with a lower bound instead of an upper bound).
SELECT
    f.id                     AS faculty_id,
    f.faculty_id             AS faculty_code,
    u.name                   AS faculty_name,
    COUNT(DISTINCT asn.id)   AS session_count,
    COUNT(DISTINCT asn.subject_id) AS subjects_taught
FROM faculty f
JOIN users u
       ON u.id = f.user_id
JOIN attendance_sessions asn
       ON asn.faculty_id = f.id
WHERE asn.is_cancelled     = FALSE
  AND asn.attendance_date <= CURDATE()
  AND asn.attendance_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
GROUP BY f.id, f.faculty_id, u.name
HAVING COUNT(DISTINCT asn.id) >= 3
ORDER BY session_count DESC;
```

**Explanation.**

* `HAVING` is mandatory here: the aggregate `COUNT(DISTINCT asn.id)` does not
  exist while the rows are being filtered in `WHERE`, so the condition can only
  be applied after grouping.
* Q9b adds a ninety-day window so that the result describes a meaningful
  period rather than the entire history.

---

### 6.1.10 Q10 — An index-friendly query on the composite unique key

**Purpose.** Demonstrate the use of the composite unique index
`attendance_sessions_subject_id_section_id_academic_year_id_a_key`
(`subject_id`, `section_id`, `academic_year_id`, `attendance_date`,
`session_number`).

```sql
-- Q10: Sessions of one subject, in one section, in one academic year,
--       within a date window. Equality on the leading three columns of the
--       composite unique index makes the access path a range scan.
SELECT
    asn.id                 AS session_id,
    asn.attendance_date    AS attendance_date,
    asn.session_number     AS session_number,
    asn.section            AS section,
    asn.start_time         AS start_time,
    asn.end_time           AS end_time,
    asn.topic              AS topic,
    asn.is_cancelled       AS is_cancelled,
    asn.assignment_id      AS assignment_id
FROM attendance_sessions asn
WHERE asn.subject_id       = 1
  AND asn.section_id       = 1
  AND asn.academic_year_id = 1
  AND asn.attendance_date BETWEEN '2026-02-01' AND '2026-02-28';
```

**Verification with `EXPLAIN`:**

```sql
EXPLAIN FORMAT=TREE
SELECT asn.id
FROM attendance_sessions asn
WHERE asn.subject_id       = 1
  AND asn.section_id       = 1
  AND asn.academic_year_id = 1
  AND asn.attendance_date BETWEEN '2026-02-01' AND '2026-02-28';
```

A typical plan is:

```text
-> Index range scan on asn using index
   (subject_id, section_id, academic_year_id, attendance_date, session_number)
   with index condition pushdown
```

**Explanation.**

* The composite unique index is a *leftmost-prefix* index. Equality
  predicates on `subject_id`, `section_id` and `academic_year_id` (the first
  three columns) followed by a range predicate on `attendance_date` (the
  fourth column) use it fully.
* The same index also serves the three shorter prefixes, so a predicate on
  `subject_id` alone, or on `subject_id` plus `section_id`, is index-driven.
* It does **not** serve a predicate on `section_id` alone, nor a predicate on
  `attendance_date` alone, nor one on `is_cancelled`. Those are served by the
  dedicated secondary indexes listed in Section 6.3.
* The unique constraint itself enforces the business rule that one subject may
  have only one session per section, per academic year, per date, per slot
  number. Attempting to insert a duplicate produces MySQL error 1062
  (duplicate entry), which the Prisma layer surfaces as `P2002` and the API
  converts to HTTP 409 `UNIQUE_CONSTRAINT`.

---

### 6.1.11 Q11 — `INNER JOIN` versus `LEFT JOIN`

**Purpose.** Show, side by side, the semantic difference between the two join
types on the same data — a distinction that determines whether a row with no
activity appears in the result.

```sql
-- Q11a: INNER JOIN — departments that actually have attendance sessions.
SELECT
    d.department_name             AS department_name,
    COUNT(DISTINCT asn.id)        AS sessions_conducted
FROM departments d
JOIN subjects sub
       ON sub.department_id = d.id
JOIN attendance_sessions asn
       ON asn.subject_id = sub.id
GROUP BY d.department_name
ORDER BY d.department_name ASC;
```

```sql
-- Q11b: LEFT JOIN — every department, including those with no sessions.
SELECT
    d.department_name             AS department_name,
    COUNT(DISTINCT asn.id)        AS sessions_conducted
FROM departments d
LEFT JOIN subjects sub
       ON sub.department_id = d.id
LEFT JOIN attendance_sessions asn
       ON asn.subject_id = sub.id
GROUP BY d.department_name
ORDER BY d.department_name ASC;
```

```sql
-- Q11c: The two results compared in a single statement.
SELECT
    d.department_name                                     AS department_name,
    COUNT(DISTINCT asn.id)                                AS sessions_conducted,
    CASE WHEN COUNT(DISTINCT asn.id) = 0 THEN 'No sessions'
         ELSE 'Has sessions' END                          AS activity_state
FROM departments d
LEFT JOIN subjects sub
       ON sub.department_id = d.id
LEFT JOIN attendance_sessions asn
       ON asn.subject_id = sub.id
GROUP BY d.department_name
ORDER BY activity_state ASC, d.department_name ASC;
```

**Explanation.**

| Aspect | `INNER JOIN` (Q11a) | `LEFT JOIN` (Q11b) |
|---|---|---|
| Rows produced | Only departments with at least one session | Every row of `departments` |
| Count of sessions for a department with none | The department does not appear | `0` |
| Use in the application | Aggregate reports that require data (Q3) | Administrative listings and dashboards that must show empty states (e.g. the "no records" empty state in the React UI) |

* `COUNT(DISTINCT asn.id)` returns `0` rather than `1` for unmatched rows
  because `COUNT` ignores `NULL` values; `COUNT(*)` would wrongly return `1`.
* The `LEFT JOIN` must be applied to **every** table in the chain. Writing
  `FROM departments d LEFT JOIN subjects sub ON ... JOIN attendance_sessions
  asn ON ...` silently degrades to an inner join for the second table, because
  an inner join rejects the `NULL`-extended rows produced by the left join.

---

### 6.1.12 Q12 — Common table expression with a window function

**Purpose.** Rank each student's subjects by attendance and show that
student's average across subjects — a classic use of `RANK()` and a window
aggregate. MySQL 8 supports both.

```sql
-- Q12: For every student, rank their subjects by attendance percentage
--       (worst first) and show the student's own average across subjects.
WITH student_subject AS (
    -- Stage 1: one row per (student, subject) with the attendance figures.
    SELECT
        s.id                   AS student_id,
        s.roll_number          AS roll_number,
        u.name                 AS student_name,
        sub.id                 AS subject_id,
        sub.subject_code       AS subject_code,
        COUNT(DISTINCT asn.id) AS total_sessions,
        SUM(CASE WHEN ar.attendance_status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END) AS attended
    FROM students s
    JOIN users u
           ON u.id = s.user_id
    JOIN enrollments e
           ON e.student_id = s.id
    JOIN subjects sub
           ON sub.id = e.subject_id
    JOIN attendance_sessions asn
           ON asn.subject_id       = e.subject_id
          AND asn.academic_year_id = e.academic_year_id
          AND asn.is_cancelled     = FALSE
          AND asn.attendance_date <= CURDATE()
    LEFT JOIN attendance_records ar
           ON ar.attendance_session_id = asn.id
          AND ar.student_id            = s.id
    WHERE e.section_id IS NULL OR asn.section_id = e.section_id
    GROUP BY s.id, s.roll_number, u.name, sub.id, sub.subject_code
),
student_subject_percentage AS (
    -- Stage 2: derive the percentage once so that it can be both filtered
    -- and used as a window ordering key.
    SELECT
        student_id,
        roll_number,
        student_name,
        subject_id,
        subject_code,
        total_sessions,
        attended,
        ROUND(100.0 * attended / NULLIF(total_sessions, 0), 2) AS subject_percentage
    FROM student_subject
    WHERE total_sessions > 0
)
SELECT
    student_id,
    roll_number,
    student_name,
    subject_code,
    total_sessions,
    attended,
    subject_percentage,
    RANK() OVER (
        PARTITION BY student_id
        ORDER BY subject_percentage ASC
    )                                                  AS subject_rank_worst_first,
    ROUND(
        AVG(subject_percentage) OVER (PARTITION BY student_id),
        2
    )                                                  AS student_average_percentage,
    CASE
        WHEN AVG(subject_percentage) OVER (PARTITION BY student_id) < 75
            THEN 'Below threshold'
        ELSE 'Satisfactory'
    END                                                AS student_status
FROM student_subject_percentage
ORDER BY roll_number ASC, subject_rank_worst_first ASC;
```

**Explanation.**

* `WITH ... AS (...)` defines named result sets that behave like temporary
  views for the duration of the statement. The two stages separate the
  *aggregation* from the *window computation*, which keeps each stage
  readable.
* `RANK() OVER (PARTITION BY student_id ORDER BY subject_percentage ASC)`
  restarts the ranking for each student and assigns equal ranks to equal
  percentages.
* `AVG(...) OVER (PARTITION BY student_id)` is a window aggregate: it
  computes the student's mean subject percentage without collapsing the rows,
  so the individual subject rows are retained alongside the average.
* The `CASE` expression evaluates the window aggregate a second time in the
  same SELECT list. MySQL permits this; it is recomputed rather than reused,
  which is a small cost worth noting on very large data sets.

---

### 6.1.13 Q13 — Additional operational queries

```sql
-- Q13a: Class-wise (subject + section) attendance, joining through the
--        sections table so that the FK path is exercised.
SELECT
    sec.id                          AS section_id,
    sec.section                     AS section,
    sub.subject_code                AS subject_code,
    sub.subject_name                AS subject_name,
    COUNT(DISTINCT asn.id)          AS sessions_conducted,
    COUNT(ar.id)                    AS attendance_records,
    ROUND(
        100.0 * SUM(CASE WHEN ar.attendance_status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END)
        / NULLIF(COUNT(ar.id), 0),
        2
    )                               AS attendance_percentage
FROM sections sec
JOIN subjects sub
       ON sub.id = sec.subject_id
JOIN attendance_sessions asn
       ON asn.section_id = sec.id
LEFT JOIN attendance_records ar
       ON ar.attendance_session_id = asn.id
WHERE asn.is_cancelled     = FALSE
  AND asn.attendance_date <= CURDATE()
GROUP BY sec.id, sec.section, sub.subject_code, sub.subject_name
ORDER BY sub.subject_code ASC, sec.section ASC;
```

```sql
-- Q13b: Department roll-up with subtotals and a grand total (MySQL ROLLUP).
SELECT
    d.department_name  AS department_name,
    sub.subject_code   AS subject_code,
    COUNT(DISTINCT asn.id) AS sessions_conducted,
    ROUND(
        100.0 * SUM(CASE WHEN ar.attendance_status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END)
        / NULLIF(COUNT(ar.id), 0),
        2
    )                  AS attendance_percentage
FROM departments d
JOIN subjects sub
       ON sub.department_id = d.id
JOIN attendance_sessions asn
       ON asn.subject_id = sub.id
JOIN attendance_records ar
       ON ar.attendance_session_id = asn.id
WHERE asn.is_cancelled     = FALSE
  AND asn.attendance_date <= CURDATE()
GROUP BY d.department_name, sub.subject_code WITH ROLLUP;
```

```sql
-- Q13c: Recent activity from the audit trail.
SELECT
    al.id            AS log_id,
    al.created_at    AS created_at,
    al.action        AS action,
    al.entity_type   AS entity_type,
    al.entity_id     AS entity_id,
    u.name           AS performed_by,
    al.ip_address    AS ip_address,
    al.details       AS details
FROM audit_logs al
LEFT JOIN users u
       ON u.id = al.user_id
WHERE al.created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 7 DAY)
ORDER BY al.created_at DESC
LIMIT 100;
```

```sql
-- Q13d: Students with no attendance record at all in the current academic year
--        (a "never marked" watch list).
SELECT
    s.id                AS student_id,
    s.roll_number       AS roll_number,
    u.name              AS student_name,
    d.department_name   AS department
FROM students s
JOIN users u
       ON u.id = s.user_id
JOIN departments d
       ON d.id = s.department_id
JOIN enrollments e
       ON e.student_id = s.id
WHERE NOT EXISTS (
    SELECT 1
    FROM attendance_records ar
    JOIN attendance_sessions asn
           ON asn.id = ar.attendance_session_id
    WHERE ar.student_id = s.id
      AND asn.academic_year_id = e.academic_year_id
      AND asn.is_cancelled     = FALSE
      AND asn.attendance_date <= CURDATE()
)
GROUP BY s.id, s.roll_number, u.name, d.department_name
ORDER BY s.roll_number ASC;
```

---

## 6.2 Raw SQL translations of the service-layer aggregates

`backend/src/services/attendance.service.ts` implements the student's personal
attendance dashboard by issuing **three** separate Prisma queries and then
aggregating the results in JavaScript:

1. `prisma.enrollment.findMany(...)` — the student's enrolments with their
   subject, department, semester and section.
2. `prisma.attendanceSession.findMany(...)` — every *eligible* session for the
   enrolled subjects.
3. `prisma.attendanceRecord.findMany(...)` — the student's records for those
   sessions, which are then assembled into the `recordBySession` map.

The five translations below express the same semantics as single SQL
statements. The percentage arithmetic matches `calculatePercentage()`
exactly:

```text
TypeScript : Math.round((attended / total) * 10000) / 100
SQL        : ROUND(attended * 100.0 / total, 2)
```

and the "no data" case matches `if (total <= 0) return 0` through
`NULLIF(total, 0)` combined with `COALESCE(..., 0)`.

---

### 6.2.1 T1 — The eligible session set (`eligibleSessionWhere()`)

```sql
-- T1: Equivalent of eligibleSessionWhere():
--     { isCancelled: false, attendanceDate: { lte: startOfToday() } }
-- combined with the optional filters of sessionWhere().
SELECT
    asn.id             AS id,
    asn.subject_id     AS subject_id,
    asn.section_id     AS section_id,
    asn.attendance_date AS attendance_date
FROM attendance_sessions asn
WHERE asn.is_cancelled     = FALSE
  AND asn.attendance_date <= CURDATE()
  -- Optional filters, omitted in the service when not supplied:
  -- AND asn.subject_id       = ?
  -- AND asn.faculty_id       = ?
  -- AND asn.section_id       = ?
  -- AND asn.section          = ?
  -- AND asn.academic_year_id = ?
  -- AND asn.attendance_date BETWEEN ? AND ?
```

**Mapping.** `eligibleSessionWhere()` is a two-predicate Prisma filter;
`sessionWhere(filters)` adds the optional dimensions. The department filter
in the service is expressed as a relation predicate
(`where.subject = { departmentId: filters.departmentId }`), which in SQL
becomes a join to `subjects` rather than a column on `attendance_sessions`.

---

### 6.2.2 T2 — Subject-wise summary for one student (`getStudentSubjectSummaries()`)

```sql
-- T2: Per-subject attendance breakdown for one student.
-- Set @student_id to the student's primary key in `students`.
SET @student_id = 1;

SELECT
    sub.id                                              AS subject_id,
    sub.subject_code                                    AS subject_code,
    sub.subject_name                                    AS subject_name,
    sub.credits                                         AS credits,
    d.department_name                                   AS department_name,
    sem.semester_number                                 AS semester_number,
    ay.year_name                                        AS year_name,
    sec.section                                         AS section,
    COUNT(DISTINCT asn.id)                              AS total,
    SUM(CASE WHEN ar.attendance_status = 'PRESENT'  THEN 1 ELSE 0 END) AS present,
    SUM(CASE WHEN ar.attendance_status = 'LATE'     THEN 1 ELSE 0 END) AS late,
    SUM(CASE WHEN ar.attendance_status = 'ABSENT'   THEN 1 ELSE 0 END) AS absent,
    SUM(CASE WHEN ar.attendance_status = 'ON_LEAVE' THEN 1 ELSE 0 END) AS on_leave,
    SUM(CASE WHEN ar.attendance_status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END) AS attended,
    COALESCE(
        ROUND(
            100.0 * SUM(CASE WHEN ar.attendance_status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END)
            / NULLIF(COUNT(DISTINCT asn.id), 0),
            2
        ),
        0
    )                                                   AS percentage
FROM enrollments e
JOIN subjects sub
       ON sub.id = e.subject_id
JOIN departments d
       ON d.id  = sub.department_id
LEFT JOIN semesters sem
       ON sem.id = sub.semester_id
LEFT JOIN academic_years ay
       ON ay.id  = sem.academic_year_id
LEFT JOIN sections sec
       ON sec.id = e.section_id
LEFT JOIN attendance_sessions asn
       ON asn.subject_id        = e.subject_id
      AND asn.academic_year_id  = e.academic_year_id
      AND asn.is_cancelled      = FALSE
      AND asn.attendance_date  <= CURDATE()
      AND (e.section_id IS NULL OR asn.section_id = e.section_id)
LEFT JOIN attendance_records ar
       ON ar.attendance_session_id = asn.id
      AND ar.student_id            = @student_id
WHERE e.student_id = @student_id
GROUP BY
    sub.id, sub.subject_code, sub.subject_name, sub.credits,
    d.department_name, sem.semester_number, ay.year_name, sec.section
ORDER BY sub.subject_code ASC;
```

**Mapping and behaviour notes.**

* The service loads the enrolments first and then filters the session list by
  `sectionId` *in JavaScript*; in SQL the same filter is expressed as the
  join condition `(e.section_id IS NULL OR asn.section_id = e.section_id)` on
  the `LEFT JOIN attendance_sessions` clause. The join must remain a
  `LEFT JOIN`, otherwise a subject with no eligible session would disappear
  from the result instead of being reported with a zero percentage.
* `sub.semester_id` and `sec.section` are reached through
  `semesters.academic_year_id` and `enrollments.section_id` respectively.
* `total` is `COUNT(DISTINCT asn.id)` — the number of eligible sessions, not
  the number of records. This is the denominator that the service passes to
  `summarise(breakdown, subjectSessions.length)`.
* `COALESCE(..., 0)` reproduces `calculatePercentage()`'s `if (total <= 0)
  return 0`.

---

### 6.2.3 T3 — Overall attendance for one student (`getStudentOverallSummary()`)

```sql
-- T3: Overall attendance across every subject of one student.
SET @student_id = 1;

SELECT
    COUNT(DISTINCT asn.id)                              AS total,
    SUM(CASE WHEN ar.attendance_status = 'PRESENT'  THEN 1 ELSE 0 END) AS present,
    SUM(CASE WHEN ar.attendance_status = 'LATE'     THEN 1 ELSE 0 END) AS late,
    SUM(CASE WHEN ar.attendance_status = 'ABSENT'   THEN 1 ELSE 0 END) AS absent,
    SUM(CASE WHEN ar.attendance_status = 'ON_LEAVE' THEN 1 ELSE 0 END) AS on_leave,
    SUM(CASE WHEN ar.attendance_status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END) AS attended,
    COALESCE(
        ROUND(
            100.0 * SUM(CASE WHEN ar.attendance_status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END)
            / NULLIF(COUNT(DISTINCT asn.id), 0),
            2
        ),
        0
    )                                                   AS percentage
FROM enrollments e
JOIN attendance_sessions asn
       ON asn.subject_id       = e.subject_id
      AND asn.academic_year_id = e.academic_year_id
      AND asn.is_cancelled     = FALSE
      AND asn.attendance_date <= CURDATE()
      AND (e.section_id IS NULL OR asn.section_id = e.section_id)
LEFT JOIN attendance_records ar
       ON ar.attendance_session_id = asn.id
      AND ar.student_id            = @student_id
WHERE e.student_id = @student_id;
```

**Mapping.** The service calls `getStudentSubjectSummaries()` and then sums
the per-subject breakdowns and the per-subject totals. T3 is the direct
set-based equivalent. `COUNT(DISTINCT asn.id)` is required because a student
enrolled in several subjects would otherwise multiply the session count.

---

### 6.2.4 T4 — Monthly attendance breakdown for one student (`getStudentMonthlySummary()`)

```sql
-- T4: Month-by-month attendance for one student.
SET @student_id = 1;

SELECT
    DATE_FORMAT(asn.attendance_date, '%Y-%m')            AS month,
    DATE_FORMAT(asn.attendance_date, '%M %Y')            AS label,
    COUNT(DISTINCT asn.id)                               AS total,
    SUM(CASE WHEN ar.attendance_status = 'PRESENT'  THEN 1 ELSE 0 END) AS present,
    SUM(CASE WHEN ar.attendance_status = 'LATE'     THEN 1 ELSE 0 END) AS late,
    SUM(CASE WHEN ar.attendance_status = 'ABSENT'   THEN 1 ELSE 0 END) AS absent,
    SUM(CASE WHEN ar.attendance_status = 'ON_LEAVE' THEN 1 ELSE 0 END) AS on_leave,
    COALESCE(
        ROUND(
            100.0 * SUM(CASE WHEN ar.attendance_status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END)
            / NULLIF(COUNT(DISTINCT asn.id), 0),
            2
        ),
        0
    )                                                    AS percentage
FROM enrollments e
JOIN attendance_sessions asn
       ON asn.subject_id       = e.subject_id
      AND asn.academic_year_id = e.academic_year_id
      AND asn.is_cancelled     = FALSE
      AND asn.attendance_date <= CURDATE()
      AND (e.section_id IS NULL OR asn.section_id = e.section_id)
LEFT JOIN attendance_records ar
       ON ar.attendance_session_id = asn.id
      AND ar.student_id            = @student_id
WHERE e.student_id = @student_id
GROUP BY DATE_FORMAT(asn.attendance_date, '%Y-%m'),
         DATE_FORMAT(asn.attendance_date, '%M %Y')
ORDER BY month ASC;
```

**Mapping.** The service keys the monthly map on
`formatDate(session.attendanceDate).slice(0, 7)` and labels it with
`dayjs(`${month}-01`).format('MMM YYYY')`. The SQL uses
`DATE_FORMAT(..., '%Y-%m')` for the key and `'%M %Y'` for the label; the exact
label formatting (`MMM YYYY`) is applied in the presentation layer because
MySQL's `%b` abbreviated month name is locale-dependent.

---

### 6.2.5 T5 — The record lookup (`recordBySession` map)

```sql
-- T5: The student's attendance records for a given set of sessions, keyed by
--     session — the SQL equivalent of the `recordBySession` Map built in
--     getStudentSubjectSummaries() / getStudentMonthlySummary().
SET @student_id = 1;

SELECT
    ar.attendance_session_id   AS attendance_session_id,
    ar.attendance_status       AS attendance_status,
    ar.marked_by               AS marked_by,
    ar.marked_at               AS marked_at,
    ar.remarks                 AS remarks
FROM attendance_records ar
WHERE ar.student_id = @student_id
  AND ar.attendance_session_id IN (
      SELECT asn.id
      FROM attendance_sessions asn
      WHERE asn.is_cancelled     = FALSE
        AND asn.attendance_date <= CURDATE()
  )
ORDER BY ar.attendance_session_id ASC;
```

**Mapping.** In the service this is `prisma.attendanceRecord.findMany({ where:
{ studentId, attendanceSessionId: { in: sessionIds } } })`, where `sessionIds`
is the list of eligible session identifiers computed in the previous query. The
SQL subquery replaces the two-step "fetch identifiers, then fetch by list"
pattern with a single statement.

The uniqueness rule `attendance_records_attendance_session_id_student_id_key`
on `(attendance_session_id, student_id)` guarantees that at most one row is
returned per session, which is precisely the invariant the JavaScript `Map`
assumes.

---

### 6.2.6 Behavioural differences between the two implementations

| Aspect | Prisma service (TypeScript) | Raw SQL equivalent |
|---|---|---|
| Number of round trips | 3 per summary (enrolments, sessions, records) | 1 |
| Where the aggregation happens | In the Node.js process | In the database server |
| Memory footprint | All sessions and records loaded into the process | Only the aggregated rows are transferred |
| Rounding | `Math.round((attended / total) * 10000) / 100` | `ROUND(attended * 100.0 / total, 2)` — identical result |
| Zero-total case | `if (total <= 0) return 0` | `COALESCE(ROUND(... / NULLIF(total, 0), 2), 0)` |
| Counting of `ON_LEAVE` | Conditional on `env.countedStatuses` | Conditional on the `IN` list — add `'ON_LEAVE'` when `ATTENDANCE_COUNTED_STATUSES` contains it |
| Prisma portability | The same TypeScript runs against PostgreSQL and SQLite | The SQL in this document is MySQL 8 specific |

---

## 6.3 Index Choices on `attendance_sessions`

`attendance_sessions` is the busiest table in the schema: it is written on
every session creation and read by every report, dashboard widget and
attendance-marking screen. The migration creates the following indexes on it
(`backend/prisma/migrations/20260101000000_init/migration.sql`).

| Index (physical name) | Columns | Type | Rationale |
|---|---|---|---|
| `PRIMARY` | `id` | Primary key | Surrogate identifier; clustered index in InnoDB; every foreign key from `attendance_records.attendance_session_id` resolves through it. |
| `attendance_sessions_subject_id_idx` | `subject_id` | Secondary | Supports the subject filter of `sessionWhere()` (`filters.subjectId`), the subject dimension of the subject-wise and class-wise reports, and the join from `subjects` in Q2, Q3 and Q13a. Also the first column of the composite unique index. |
| `attendance_sessions_faculty_id_idx` | `faculty_id` | Secondary | Supports `filters.facultyId` and the faculty-wise report (Q6), and the join from `faculty` in Q8. Also required by the `ON DELETE RESTRICT` foreign key `attendance_sessions_faculty_id_fkey`, because MySQL must scan referencing rows before rejecting a delete. |
| `attendance_sessions_attendance_date_idx` | `attendance_date` | Secondary | The most frequently filtered column: the eligibility rule `attendance_date <= CURDATE()`, the date-wise report, the monthly report, and every `startDate`/`endDate` range filter. Also required by `attendance_sessions` foreign keys and by Q4, whose predicate is a pure date equality. |
| `attendance_sessions_academic_year_id_idx` | `academic_year_id` | Secondary | Supports `filters.academicYearId`, which is applied by every report filter panel, and the join from `academic_years` in the semester-wise report. |
| `attendance_sessions_section_id_idx` | `section_id` | Secondary | Supports `filters.sectionId` and the class-wise report (Q13a), and the join from `sections` when the section dimension is used rather than the denormalised `section` string. Also required by the `ON DELETE RESTRICT` foreign key `attendance_sessions_section_id_fkey`. |
| `attendance_sessions_subject_id_section_id_academic_year_id_a_key` | `subject_id`, `section_id`, `academic_year_id`, `attendance_date`, `session_number` | **Unique** | Enforces the business rule "one subject has at most one session per section, per academic year, per date, per slot" (Prisma name `unique_session_slot`). Doubles as the access path for the most common filter combination, demonstrated in Q10. |

### 6.3.1 Why the composite unique index is ordered as it is

* **Leading column `subject_id`.** Subject is the most selective and most
  frequently supplied filter; almost every screen operates within one subject.
* **`section_id` second.** The section narrows the subject to a single class.
* **`academic_year_id` third.** The academic year is usually chosen before the
  section but is less selective than the section itself.
* **`attendance_date` fourth.** A range predicate on the fourth column of a
  composite index is still served by the index after three equality
  predicates on the preceding columns.
* **`session_number` last.** It is only ever used as an equality predicate in
  the unique key, and it participates only in the duplicate check.

Because the index is a leftmost-prefix index, it also serves the shorter
prefixes — `subject_id`, `(subject_id, section_id)`,
`(subject_id, section_id, academic_year_id)` and
`(subject_id, section_id, academic_year_id, attendance_date)` — which
coincides with the filter combinations that the report UI actually offers.

It does **not** serve a predicate on `section_id` alone, on
`attendance_date` alone, on `is_cancelled`, or on the denormalised `section`
string; those cases are covered by the dedicated secondary indexes, except
`is_cancelled` and `section`, which are deliberately left unindexed because
they are low-cardinality residual filters that would add write cost without
improving selectivity.

### 6.3.2 Foreign-key support

MySQL requires an index on the referencing column of every foreign key.
`attendance_sessions` participates in four foreign keys — `subject_id`,
`faculty_id`, `academic_year_id` and `section_id` — all of which are covered
by the four single-column secondary indexes listed above, so no additional
index is needed for referential integrity. The two nullable references,
`created_by` and `assignment_id`, are *not* indexed, because MySQL permits a
foreign key whose referencing column is not indexed; the application only ever
follows these columns when displaying the audit trail.

### 6.3.3 Index coverage of `attendance_records`

The child table deserves a note because every reporting query joins through it.

| Index | Columns | Rationale |
|---|---|---|
| `PRIMARY` | `id` | Primary key and the target of the `PUT /api/attendance/records/:id` update. |
| `attendance_records_student_id_idx` | `student_id` | Every student-scoped report and the student dashboard filter by student first. |
| `attendance_records_attendance_status_idx` | `attendance_status` | Supports filtering and counting by status, for example `attendance_status = 'ABSENT'` in Q4a. |
| `attendance_records_attendance_session_id_student_id_key` | `attendance_session_id`, `student_id` | **Unique.** Enforces "one status per student per session" and simultaneously serves the session-first join used by every aggregate query. It also supports the composite lookup `WHERE attendance_session_id = ? AND student_id = ?` used when a single student's status is updated. |

---

## 6.4 Coverage of the Required Query Topics

| Required topic | Query | Section |
|---|---|---|
| Students below the 75 % attendance threshold | Q1 | 6.1.1 |
| Subject-wise attendance with `GROUP BY` and `HAVING` | Q2 | 6.1.2 |
| Department-wise attendance with `JOIN` + `GROUP BY` | Q3 | 6.1.3 |
| Students absent on a given date | Q4a (recorded absences) and Q4b (enrolled but unmarked) | 6.1.4 |
| Monthly aggregation | Q5 (institution) and T4 (per student) | 6.1.5, 6.2.4 |
| Faculty-wise attendance summary | Q6 | 6.1.6 |
| Enrolled student count per subject using a correlated subquery | Q7 (and the set-based equivalent Q7b) | 6.1.7 |
| Sessions with no attendance marked | Q8 | 6.1.8 |
| A `HAVING` clause on session counts | Q9a and Q9b | 6.1.9 |
| An index-friendly query using the composite unique key | Q10 | 6.1.10 |
| `INNER JOIN` versus `LEFT JOIN` comparison | Q11a, Q11b, Q11c | 6.1.11 |
| A query using a CTE with a window function | Q12 | 6.1.12 |
| Raw SQL for the key service-layer aggregates | T1 – T5 | 6.2 |
| Explanation of the `attendance_sessions` index choices | Section 6.3 | 6.3 |

---

## 6.5 Identifier Reference

All identifiers used in this document, verified against
`backend/prisma/migrations/20260101000000_init/migration.sql`.

| Table | Primary key | Columns referenced in this document |
|---|---|---|
| `users` | `id` | `id`, `name`, `email`, `role`, `is_active` |
| `password_reset_tokens` | `id` | `user_id`, `token_hash`, `expires_at`, `used_at` |
| `departments` | `id` | `id`, `department_name`, `department_code` |
| `academic_years` | `id` | `id`, `year_name`, `start_date`, `end_date`, `is_active` |
| `semesters` | `id` | `id`, `semester_number`, `academic_year_id`, `is_active` |
| `sections` | `id` | `id`, `subject_id`, `section`, `academic_year_id` |
| `students` | `id` | `id`, `user_id`, `roll_number`, `department_id`, `semester_id`, `section`, `admission_year` |
| `faculty` | `id` | `id`, `user_id`, `faculty_id`, `department_id`, `designation` |
| `subjects` | `id` | `id`, `subject_code`, `subject_name`, `department_id`, `semester_id`, `academic_year_id`, `credits`, `is_active` |
| `faculty_subjects` | `id` | `id`, `faculty_id`, `subject_id`, `academic_year_id`, `section_id` |
| `enrollments` | `id` | `id`, `student_id`, `subject_id`, `academic_year_id`, `section_id` |
| `attendance_sessions` | `id` | `id`, `subject_id`, `faculty_id`, `academic_year_id`, `section_id`, `section`, `attendance_date`, `start_time`, `end_time`, `session_number`, `topic`, `is_cancelled`, `created_by`, `assignment_id` |
| `attendance_records` | `id` | `id`, `attendance_session_id`, `student_id`, `attendance_status`, `marked_by`, `remarks`, `marked_at` |
| `audit_logs` | `id` | `id`, `user_id`, `action`, `entity_type`, `entity_id`, `details`, `ip_address`, `created_at` |

Enum members referenced: `users.role` (`ADMIN`, `FACULTY`, `STUDENT`) and
`attendance_records.attendance_status` (`PRESENT`, `ABSENT`, `LATE`,
`ON_LEAVE`).

---

*End of document 06.*
