# Appendix D — Normalisation Analysis

This appendix analyses the AttendEase schema against the normal forms, maps every table to the
highest normal form it satisfies, and justifies each design decision against the schema as it is
actually implemented.

**Source of truth.** The analysis is based on `backend/prisma/schema.prisma` and on the physical
constraints created by `backend/prisma/migrations/20260101000000_init/migration.sql`. The
functional dependencies stated below are the ones the schema actually declares; an analysis based
on assumptions about the domain rather than on the implemented constraints would be worthless.

---

## 1. The normal forms

### 1.1 First normal form (1NF)

A relation is in **1NF** if every attribute is atomic — it holds a single value from the domain of
its type — and if there are no repeating groups. Formally: every determinant has at least one
candidate key beneath it, and every attribute is a single-valued column.

In this schema 1NF is established structurally:

| Requirement | How it is met |
| --- | --- |
| Atomic attributes | Every column holds one scalar. The set-valued attributes that a flat design would require — "the subjects a student takes", "the students in a section" — are held in the bridge tables `enrollments` and `faculty_subjects` as one row per pair. |
| No repeating groups | There is no column such as `subject1, subject2, subject3`. The repeating group that a flat register design would need — one attendance column per student per date per subject — is represented by one row per student per session in `attendance_records`. |
| Explicit domain constraints | Every column has a declared type with a length, an enumeration or a boolean, so that a domain violation is rejected by the storage engine rather than by convention. |

### 1.2 Second normal form (2NF)

A relation is in **2NF** if it is in 1NF and every non-prime attribute is fully functionally
dependent on **every** candidate key. In other words, no non-prime attribute may depend on only
part of a composite candidate key.

Every relation in this schema has a **single-column** surrogate primary key, and every composite
unique constraint is a genuine *candidate key* rather than the primary key. Because no non-prime
attribute depends on any composite candidate key in this schema — no relation carries an
attribute that is derivable from only part of a multi-column key — every relation in the schema is
in 2NF. The only relation that is not in 3NF is `attendance_sessions`, and it violates 3NF for the
reason given in Section 4.1, not for a 2NF reason.

### 1.3 Third normal form (3NF)

A relation is in **3NF** if it is in 2NF and no non-prime attribute is transitively dependent on
any candidate key — that is, for every non-trivial dependency `X → A` in which `A` is non-prime,
`X` must be a superkey.

In practice, a relation in 3NF has the following shape: all the facts about an entity are stored
in one row of one relation, and every other fact that appears alongside them is either a key of
that relation or a reference to a key of another relation.

### 1.4 Boyce–Codd normal form (BCNF)

A relation is in **BCNF** if, for every non-trivial functional dependency `X → A` that holds in the
relation, `X` is a **superkey**. BCNF is stricter than 3NF in exactly one respect: 3NF permits a
non-prime attribute to depend on a determinant that is not a superkey provided the determinant is a
candidate key and the dependent attribute is itself prime. BCNF removes that concession.

The practical consequence of BCNF is that a relation in BCNF has **no determinants other than its
candidate keys**. A relation that violates BCNF always has some piece of information that is
determined by something other than the identity of the row — and that piece of information
therefore belongs in a relation of its own.

### 1.5 Summary of the definitions used

| Form | Test applied |
| --- | --- |
| 1NF | Every attribute atomic; no repeating groups |
| 2NF | 1NF, and no non-prime attribute depends on part of a composite candidate key |
| 3NF | 2NF, and no non-prime attribute is transitively dependent on a candidate key |
| BCNF | Every determinant is a superkey |

---

## 2. Candidate keys of the schema

The candidate keys determine every normal-form conclusion that follows. They are read directly from
the unique constraints in the migration.

| Table | Primary key | Candidate key(s) | Prime attributes |
| --- | --- | --- | --- |
| `users` | `id` | `email` | `id`, `email` |
| `password_reset_tokens` | `id` | `token_hash` | `id`, `token_hash` |
| `departments` | `id` | `department_code` | `id`, `department_code` |
| `academic_years` | `id` | `year_name` | `id`, `year_name` |
| `semesters` | `id` | `(academic_year_id, semester_number)` | `id`, `academic_year_id`, `semester_number` |
| `sections` | `id` | `(subject_id, section, academic_year_id)` | `id`, `subject_id`, `section`, `academic_year_id` |
| `subjects` | `id` | `subject_code` | `id`, `subject_code` |
| `students` | `id` | `user_id`, `roll_number` | `id`, `user_id`, `roll_number` |
| `faculty` | `id` | `user_id`, `faculty_id` | `id`, `user_id`, `faculty_id` |
| `faculty_subjects` | `id` | `(faculty_id, subject_id, section_id, academic_year_id)` | `id`, `faculty_id`, `subject_id`, `section_id`, `academic_year_id` |
| `enrollments` | `id` | `(student_id, subject_id, academic_year_id)` | `id`, `student_id`, `subject_id`, `academic_year_id` |
| `attendance_sessions` | `id` | `(subject_id, section_id, academic_year_id, attendance_date, session_number)` | `id`, `subject_id`, `section_id`, `academic_year_id`, `attendance_date`, `session_number` |
| `attendance_records` | `id` | `(attendance_session_id, student_id)` | `id`, `attendance_session_id`, `student_id` |
| `audit_logs` | `id` | — | `id` |

A consequence of this table is worth stating explicitly, because it governs the whole design:
**no relation in the schema has a composite candidate key that coincides with its primary key.**
Every relation carries a single-column surrogate key for reference efficiency, and the business
candidate key is enforced separately as a unique index. This is why every relation is in 2NF — the
partial-dependency failure mode of 2NF cannot arise.

---

## 3. Mapping every table to its normal form

| Table | Highest form | Determinants other than candidate keys | Justification |
| --- | --- | --- | --- |
| `users` | **BCNF** | None | The only determinants are `id` and `email`, both candidate keys. `role` is determined by nothing other than the row identity; the fact that a user has role `FACULTY` does not determine the name of a faculty record, because there may be none. |
| `password_reset_tokens` | **BCNF** | None | `id` and `token_hash` are candidate keys. `expires_at` and `used_at` are facts about the token instance, not about the user. Note that `token_hash → user_id` does **not** hold — a hash identifies the token, and the token belongs to exactly one user, so the dependency runs the other way, from the key to the attributes. |
| `departments` | **BCNF** | None | `department_code → department_name` holds, and `department_code` is a candidate key, so the dependency is trivial with respect to BCNF. |
| `academic_years` | **BCNF** | None | `year_name → start_date, end_date, is_active` holds; `year_name` is a candidate key. |
| `semesters` | **BCNF** | None | The determinant `(academic_year_id, semester_number)` is a candidate key. `academic_year_id` alone is *not* a determinant of `semester_number`, because a year contains several semesters; and `semester_number` alone is not a determinant of `academic_year_id`, because the same ordinal recurs in every year. The composite is therefore the minimal determinant and it is a candidate key. |
| `sections` | **BCNF** | None | The determinant `(subject_id, section, academic_year_id)` is a candidate key. `subject_id` alone does not determine `section` — a subject has several sections — and `section` alone determines nothing at all, because the label "A" recurs in every subject. |
| `subjects` | **BCNF** | None | `subject_code → subject_name` holds and `subject_code` is a candidate key. `department_id` does not determine `subject_code` — a department offers many subjects — and `semester_id` does not either. |
| `students` | **BCNF** | None | `user_id` and `roll_number` are both candidate keys. `department_id` does not determine `section`, `semester_id` or `roll_number`; `semester_id` does not determine `section` either, because the schema declares no such dependency — `students.section` is a free attribute recording the cohort's current home section, not a derived one. |
| `faculty` | **BCNF** | None | `user_id` and `faculty_id` are both candidate keys. `department_id` does not determine `designation` or `faculty_id`. |
| `faculty_subjects` | **BCNF** | None | The four-column determinant is the candidate key. `faculty_id` does not determine `subject_id`, `section_id` or `academic_year_id`, because a member of staff teaches several subjects in several sections across several years; and no pair or triple of the four columns is a determinant either, because each combination of three leaves a genuine choice of the fourth. |
| `enrollments` | **BCNF** | None | The three-column determinant is the candidate key. `section_id` is a genuine attribute of the enrolment and not determined by the key: the same student may be enrolled in the same subject in the same year in one section, and two students may share the same section — but the section is a *choice* recorded with the enrolment, not a consequence of it. That is precisely why `section_id` is nullable: a student may be registered before the section is decided. |
| `attendance_sessions` | **2NF** | `section_id → section` | The one deliberate exception; see Section 4.1. |
| `attendance_records` | **BCNF** | None | The two-column determinant is the candidate key. `attendance_status` is not determined by the session (a session has many statuses) nor by the student (a student has many statuses across sessions). `marked_by` is not determined by the key either — any member of staff with the assignment may mark the class. |
| `audit_logs` | **BCNF** | None | `id` is the only determinant. `action` does not determine `entity_type` (the same action applies to many entity types) and `entity_type` does not determine `entity_id` (many rows of the same type are acted upon). |

### 3.1 The single deviation, stated precisely

`attendance_sessions` carries the dependency

```text
attendance_sessions.section_id  →  attendance_sessions.section
```

`section_id` is **not** a superkey — many sessions reference the same section — and `section` is a
**non-prime** attribute — it is not part of any candidate key. The dependency is therefore a
transitive dependency of a non-prime attribute on a non-key attribute, which is a violation of 3NF
and of BCNF. The relation is in 2NF, because no non-prime attribute depends on part of a composite
candidate key.

Section 4.1 sets out why this departure is accepted, and Section 4.1.4 sets out the cost.

---

## 4. Justification of the principal design decisions

### 4.1 Why `attendance_sessions` denormalises `section` alongside `section_id`

#### 4.1.1 What the schema actually does

`attendance_sessions` has two columns that both identify the section of the lecture:

```prisma
sectionId  Int    @map("section_id")
section    String @db.VarChar(10)
```

`section_id` is a genuine foreign key to `sections.id` (`ON DELETE RESTRICT`, named relation
`SessionSection`). `section` is a plain `VARCHAR(10)` attribute with no constraint of any kind
beyond its type. It is written once, at session creation, from the referenced section:

```ts
// backend/src/controllers/attendance.controller.ts, createSession
const section = await prisma.section.findUnique({ where: { id: sectionId }, ... });
...
const session = await prisma.attendanceSession.create({
  data: {
    ...
    sectionId,
    section: section.section,   // <-- the snapshot
    ...
  },
});
```

It is never updated afterwards. `updateSession` does not exist; the only mutation applied to a
session after creation is `cancelSession`, which sets `is_cancelled = TRUE` and touches nothing
else.

#### 4.1.2 The reason: a session is a historical event

`attendance_sessions` is a ledger of things that happened on a particular date to a particular
class. The label that was on the roll sheet on that day is part of the record of what happened,
and it is not the same thing as the label the section carries today.

A department restructures its sections from time to time — "A" becomes "A1", "B" is merged into
"A2", a section is renamed when a new subject code replaces an old one. If the session referred
only to `section_id`, then re-labelling the section would retroactively rewrite the historical
record: a report run today about a lecture given in March would show the label the section
carries today, which is not the label that was printed on the register in March. The students'
transcripts, the faculty member's own recollection and the institution's archived returns for that
year all use the March label. The database would then disagree with every one of them.

Storing the snapshot keeps the historical reading stable and independent of mutable master data.
It is the database equivalent of writing the date on a signed attendance register: the register is
a record of an event, and the label that was current at the time of the event is part of it.

#### 4.1.3 The four conditions that keep the departure bounded

A denormalisation is only acceptable if it cannot diverge from its source. This one satisfies four
conditions.

1. **It is written once.** The value is set at creation and is never rewritten. There is no code
   path in the application that updates `attendance_sessions.section`.
2. **It is a pure copy of the referenced value at the moment of writing.** The value can only ever
   equal `sections.section` for the referenced row at the instant of creation, so it cannot
   contradict the database.
3. **It is never used as a join key.** Every grouping and every join in the application and in the
   analytical queries joins to `sections` and uses `section_id`. The snapshot is used only for
   display and for the free-text `section` filter.
4. **It is nullable never, and constrained to the same domain.** The column is `NOT NULL` with a
   `VARCHAR(10)` width identical to `sections.section`, so it cannot hold a value that the source
   could not hold.

#### 4.1.4 The cost, stated honestly

The cost is that the same fact — the section label — is stored twice, and a query that filters on
the label rather than on the identifier is matching a copy. The application confines this to one
place: the class-wise report compares `students.section` with `attendance_sessions.section`, and
both of those are snapshots of the same kind of label written by the same application, so the
comparison is internally consistent.

The alternative — dropping the column and always joining to `sections` — was rejected because it
makes the historical reading of a session depend on mutable master data, which is exactly the
failure mode that the soft-deletion policy of the schema (Section 4.6) exists to prevent. A second
alternative — deriving the label from the join and accepting that a re-labelling rewrites history —
was rejected on the same ground.

#### 4.1.5 The analogous snapshot on `students`

`students.section` is the second snapshot in the schema, and it deserves a separate note because
it is not a historical snapshot but a current one. It records the section of the cohort the
student belongs to *now*. It is refreshed when the student is moved between sections by
`updateStudent`. It is indexed (`students_section_idx`) because the class-wise report filters on
it, and it exists so that a student's own record can be read without joining to `sections`.

The authoritative statement of which section a student sits in **for a particular subject** is
`enrollments.section_id`, not `students.section`. A student enrolled in an elective without a
section has `enrollments.section_id IS NULL` and is treated by the application as attending every
session of that subject, whereas `students.section` continues to describe the cohort's home
section. The two are different facts about the same student, and the schema keeps them apart.

### 4.2 Why `enrollments` is a bridge table resolving the many-to-many between students and subjects

#### 4.2.1 The relationship that has to be modelled

A student takes several subjects; a subject is taken by several students. The relationship is
many-to-many. A relation cannot hold a many-to-many relationship, and the two conventional
workarounds are both wrong:

- **A list on the student** (`students.subjects = 'CSE101,CSE102,CSE103'`) violates 1NF
  immediately — the attribute is not atomic — and makes "which students are in CSE101?" unanswerable
  without string manipulation, which is exactly the kind of logic that belongs in the database
  engine.
- **A list on the subject** (`subjects.students = '1,7,19,42'`) violates 1NF in the same way, and
  additionally loses the ability to record anything *about* the relationship — such as the section
  in which a particular student sits, or the year in which the registration was made.

#### 4.2.2 What the bridge table holds and why

`enrollments` resolves the relationship with one row per (student, subject, academic year)
combination, and it carries two further attributes that a bare bridge would not need:

| Attribute | Why it must be on the bridge and not on either end |
| --- | --- |
| `academic_year_id` | The relationship itself is time-dependent. A subject code is offered in several years, and a student may re-enrol in the same subject code in a later year — as a repeat, as a laboratory course, or as a syllabus that has been revised. Without the year on the bridge, the composite key would be `(student_id, subject_id)`, a student could never re-enrol, and the historical rows of the earlier year would be conflated with those of the later one. Placing the year on the bridge makes the key `(student_id, subject_id, academic_year_id)`, which is exactly the constraint the business requires. |
| `section_id` (nullable) | Which section of the subject the student sits in is a property of the **relationship**, not of the student and not of the subject. The same student may sit in section A for one subject and section B for another; the same subject may run two parallel sections with entirely different students. A section cannot be recorded on `students` because that would force one section per student across all subjects; it cannot be recorded on `subjects` because that would force one section per subject across all students. It belongs on the relationship. It is nullable because a student may be registered for an elective before the section is decided; the application then treats the enrolment as covering every session of that subject, which is what `getStudentSubjectSummaries` does when `enrollment.sectionId` is absent. |

#### 4.2.3 What the bridge enables

| Requirement | How the bridge satisfies it |
| --- | --- |
| The roster of a class | `SELECT ... FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.subject_id = ? AND e.section_id = ? ORDER BY s.roll_number` — this is the query the marking screen runs, and it is the reason an unenrolled student can never be marked. |
| The subjects of a student | `SELECT ... FROM enrollments e JOIN subjects sub ON sub.id = e.subject_id WHERE e.student_id = ?` — the basis of every student summary. |
| The students of a subject in a year | `WHERE e.subject_id = ? AND e.academic_year_id = ?` — the year being on the bridge is what makes this a single-index query. |
| The count of students per subject | A correlated subquery over `enrollments` — the count is derived, never stored, so it cannot go stale. |
| The percentage denominator | A session is a slot; the student attends it only if an enrolment exists for the subject and the section matches. |

#### 4.2.4 The integrity guarantee

The compound unique constraint `unique_student_subject_enrollment` over
`(student_id, subject_id, academic_year_id)` states the business rule precisely: *a student is
registered at most once for a given subject in a given academic year*. It is enforced by MySQL, not
by the application. The application complements it rather than duplicating it: `createEnrollments`
filters out the students who are already enrolled before inserting, and reports the number created
and the number skipped, so a repeated bulk enrolment is a no-op rather than an error. The three
single-column indexes on `subject_id`, `academic_year_id` and `section_id` serve the three
directions in which the table is queried — by subject (roster), by year (audit of a cohort) and by
section (roster of one class) — none of which is served by the compound key, because the compound
key is ordered by student first.

### 4.3 Why `faculty_subjects` is a bridge resolving the many-to-many between faculty, subjects, sections and years

#### 4.3.1 The relationship that has to be modelled

The teaching relationship is a richer many-to-many than the enrolment one:

- A member of staff teaches several subjects.
- A subject is taught by several members of staff — co-teaching is common at the undergraduate
  level.
- A particular teaching commitment is specific to a **section** and to an **academic year**. The
  same member of staff may teach the same subject code in section A this year and in section B
  next year.

There is therefore no single pair of entities to join between; the relationship has four
participants.

#### 4.3.2 What the bridge holds and why

`faculty_subjects` carries four foreign keys — `faculty_id`, `subject_id`, `section_id` and
`academic_year_id` — and the compound unique constraint `unique_faculty_subject_assignment` over
exactly those four columns.

| Attribute | Why it must be on the bridge |
| --- | --- |
| `faculty_id` | The member of staff who holds the commitment. Belongs on the relationship, because a member of staff holds several. |
| `subject_id` | The subject taught. Belongs on the relationship, because a subject is taught by several and by different people in different sections. |
| `section_id` | The section in which it is taught. Belongs on the relationship: the same member of staff teaches the same subject in two different sections, and the same subject is taught in two sections by two different members of staff. It cannot live on `subjects`, because a subject runs several sections; it cannot live on `faculty`, because a member of staff teaches several sections of the same subject. |
| `academic_year_id` | The year of the commitment. Belongs on the relationship, because the same teaching commitment is renewed each year and the historical assignments must be distinguishable. It also keeps the bridge consistent with the rest of the schema, in which every time-scoped structure carries `academic_year_id`. |

#### 4.3.3 What the constraint states

`unique_faculty_subject_assignment` over `(faculty_id, subject_id, section_id, academic_year_id)`
forbids an exact duplicate of the four-tuple and permits everything else. Concretely:

| Situation | Permitted? | Reason |
| --- | --- | --- |
| The same member of staff, subject, section and year twice | **No** | The constraint forbids it. `createAssignment` answers HTTP 409. |
| Two members of staff assigned to the same subject, section and year | Yes | Co-teaching is legitimate. |
| The same member of staff assigned to the same subject in two sections of the same year | Yes | The section differs, so the four-tuple differs. |
| The same member of staff assigned to the same subject and section in two different years | Yes | The year differs, so the four-tuple differs. |
| The same member of staff assigned to two different subjects in the same section and year | Yes | The subject differs. The application additionally verifies that `section.subject_id` equals the submitted `subject_id`, so this combination cannot arise from a section belonging to another subject. |

The application reinforces the consistency of the bridge with two additional checks that a unique
constraint cannot express: the section must belong to the subject, and the section must belong to
the academic year. Both are verified in `createAssignment` and both are refused with HTTP 400.

#### 4.3.4 The second function of the bridge: the authorisation register

`faculty_subjects` is not merely a descriptive many-to-many resolution. It is the register that
**authorises the creation of an attendance session**, and the application uses it as such:

```ts
// backend/src/controllers/attendance.controller.ts, createSession
const assignment = await prisma.facultySubject.findFirst({
  where: {
    subjectId,
    sectionId,
    academicYearId: section.academicYearId,
    ...(scope.facultyId ? { facultyId: scope.facultyId } : {}),
  },
  ...
});

if (!assignment) {
  if (!scope.isAdmin) {
    throw forbidden('You are not assigned to teach this subject and section');
  }
  throw badRequest('No faculty member is assigned to this subject and section. Create the assignment first.');
}
```

The identifier of the row that authorised the session is then stored in
`attendance_sessions.assignment_id`, which makes the authorisation traceable for the life of the
session. A session therefore cannot exist without a teaching commitment behind it, and a faculty
member can create a session only for a commitment that names them.

The deletion rule is consistent with this: `deleteAssignment` refuses with HTTP 400 when the
assignment already has sessions attached.

### 4.4 How the five named unique constraints enforce integrity

| Constraint | Columns | Rule enforced | Where the rule is also checked in the application | Failure mode prevented |
| --- | --- | --- | --- | --- |
| `unique_session_slot` | `subject_id`, `section_id`, `academic_year_id`, `attendance_date`, `session_number` | A class may not be scheduled twice in the same slot. Two lectures of the same subject on the same day are distinguished by `session_number`. | `createSession` probes the key with `prisma.attendanceSession.findUnique({ where: { unique_session_slot: {...} } })` and answers HTTP 409 with a message naming the subject code and the date. The seed script uses the same key to make its session creation idempotent. | Double-booking. Two members of staff recording attendance for the same class slot, which would produce two disjoint sets of records for one class and make the denominator ambiguous. |
| `unique_student_per_session` | `attendance_session_id`, `student_id` | A student may hold at most one attendance state in a session. | `submitRecords` uses the key as the `where` clause of an `upsert` inside a transaction, so a repeated submission updates the existing record. | Duplicate marks. Two rows for the same student in the same session would double-count the student in every aggregate and would make the percentage exceed 100 %. |
| `unique_student_subject_enrollment` | `student_id`, `subject_id`, `academic_year_id` | A student is registered at most once for a subject in an academic year. | `createEnrollments` selects the already-enrolled students, filters them out, inserts the remainder with `createMany` and reports both counts. The seed script uses the key for an idempotent `upsert`. | Duplicate registration, which would put a student twice on the same roster and would inflate every subject head-count. |
| `unique_faculty_subject_assignment` | `faculty_id`, `subject_id`, `section_id`, `academic_year_id` | A teaching commitment is not duplicated. | `createAssignment` probes the key and answers HTTP 409. The seed script uses the key for an idempotent `upsert`. | Duplicate assignment, which would make "the faculty member who teaches this class" ambiguous and would let two members of staff each believe they own the same class. |
| `unique_section_offering` | `subject_id`, `section`, `academic_year_id` | A section label is unique within a subject and an academic year. | `createSection` probes the key and answers HTTP 400 with the message "This section already exists for the selected subject and year". The seed script uses the key for an idempotent `upsert`. | Duplicate section offerings, which would split one class into two rosters and would make the session-slot uniqueness meaningless, because two different `section_id` values could occupy the same label. |

Six further single-column unique constraints guard natural keys and one-to-one links:
`users_email_key`, `students_roll_number_key`, `students_user_id_key`, `faculty_faculty_id_key`,
`faculty_user_id_key`, `subjects_subject_code_key`, `departments_department_code_key`,
`academic_years_year_name_key`, `password_reset_tokens_token_hash_key` and the composite
`semesters_academic_year_id_semester_number_key`. Each of these is translated by the error
handler from Prisma error `P2002` into an HTTP 409 response with the conflicting fields named.

### 4.5 Why `users` is separated from `students` and `faculty`

`users` holds the four attributes that every authenticatable person has — a name, an e-mail
address, a password hash, a role and an active flag — and nothing else. `students` and `faculty`
hold the institutional attributes that only one kind of person has.

The alternative, a single wide `persons` table with nullable columns for `roll_number`,
`faculty_id`, `designation` and `department_id`, would put a mutuality violation of 1NF into the
schema: for a student row, `roll_number` would be non-null and `faculty_id` null; for a faculty
row, the reverse. Every constraint on the roll number would have to be written as
`CHECK (roll_number IS NOT NULL OR faculty_id IS NOT NULL)`, and the natural key of the table
would be ambiguous. Splitting the relation removes the problem at the root: `students.user_id` is
`UNIQUE`, so one account is linked to at most one student record, and the roll-number uniqueness
is a plain single-column unique index with no qualification.

### 4.6 Why the referential actions are chosen as they are

The `onDelete` rule is the database-level expression of the requirement that history must survive.
The rule applied throughout is:

| Action | Applied to | Rationale |
| --- | --- | --- |
| `RESTRICT` | Every foreign key that leads to attendance history — `students.department_id`, `students.semester_id`, `faculty.department_id`, `subjects.department_id`, `subjects.semester_id`, `subjects.academic_year_id`, `attendance_sessions.subject_id`, `attendance_sessions.faculty_id`, `attendance_sessions.academic_year_id`, `attendance_sessions.section_id`, `attendance_records.student_id` | The parent is part of the historical record. The delete is refused by the storage engine, and the application explains that the record must be deactivated instead. |
| `SET NULL` | Every foreign key that records an actor or an optional attribution — `enrollments.section_id`, `attendance_sessions.assignment_id`, `attendance_sessions.created_by`, `attendance_records.marked_by`, `audit_logs.user_id` | The link records provenance, not a dependency. Removing the actor must not remove the fact. |
| `CASCADE` | Only where the child rows cannot themselves carry attendance history — `password_reset_tokens.user_id`, `semesters.academic_year_id`, `sections.subject_id`, `sections.academic_year_id`, `students.user_id`, `faculty.user_id`, the four `faculty_subjects` keys, `enrollments.student_id`, `enrollments.subject_id`, `enrollments.academic_year_id`, `attendance_records.attendance_session_id` | A reset token belongs to its account, a semester belongs to its year, an enrolment to its student, a record to its session. Removing the parent removes the dependents, and no orphaned fact is created. |

Note that `attendance_records.attendance_session_id` uses `CASCADE` while
`attendance_sessions.subject_id` uses `RESTRICT`. This is deliberate and consistent: a session
that carries attendance history can never be deleted in the first place — the controller refuses —
so the cascade only ever fires in a database in which that history has already been removed
deliberately, and it guarantees that no record can outlive the session it belongs to.

The application reinforces the policy in the controllers, so that the user is given guidance
rather than a raw constraint violation:

| Operation | Application behaviour |
| --- | --- |
| Delete a department that still has students, staff or subjects | HTTP 400 — "This department is still linked to students, faculty or subjects. Remove those records first." |
| Delete an academic year that has subjects or sessions | HTTP 400 — advises deactivation |
| Delete a semester that has students or subjects | HTTP 400 — advises deactivation |
| Delete a subject that has sessions | The subject is **deactivated** (`is_active = false`) and the response explains why |
| Delete a section that has sessions | HTTP 400 |
| Delete an assignment that has sessions | HTTP 400 |
| Delete an enrolment for which the student already has records | HTTP 400 |
| Delete a student or deactivate a member of staff | The account is **deactivated** (`is_active = false`); every attendance row is retained |

---

## 5. Anomalies removed by each normalisation step

The following table states, for each normalisation step, the concrete anomaly that the step
eliminates, the manifestation of that anomaly in a flat attendance register, and the construct in
this schema that removes it.

### 5.1 Insertion anomalies

| Anomaly | How it appears in a flat design | Step at which it is removed | The construct that removes it |
| --- | --- | --- | --- |
| A student cannot be registered without inventing attendance data | The flat register has one row per student per subject with counters, so a student who has not yet attended anything cannot be recorded at all — or must be recorded with fabricated zeros | 1NF | `students` is a relation in its own right, holding only the student's particulars. `attendance_records` is a separate relation whose rows are created only when a session exists. |
| A subject cannot be offered without inventing a department | The flat register repeats the department name in every student-subject row | 1NF | `subjects` references `departments.id`; the department name is stored once. |
| A member of staff cannot be recorded without inventing teaching data | The flat register names the teacher in free text in every subject row | 1NF | `faculty` and `users` are separate relations; `faculty_subjects` links them to the subjects they teach. |
| A teaching commitment cannot be recorded without a session | The flat register can only say who taught a subject by recording it in a row that also carries a date | 3NF (bridge) | `faculty_subjects` exists independently of any session, so a commitment can be registered before the term begins. `attendance_sessions.assignment_id` then refers back to it. |
| An enrolment cannot be recorded without a session | The flat register can only show that a student takes a subject by having a row for a date on which the subject was taught | 3NF (bridge) | `enrollments` is independent of any session, so a student can be registered before the first lecture. This is what allows the roster to be authoritative. |
| A section cannot exist without a session | The flat register can only show "section A" by writing it in a dated row | 3NF | `sections` is a relation in its own right with a compound unique key. |

### 5.2 Update anomalies

| Anomaly | How it appears in a flat design | Step at which it is removed | The construct that removes it |
| --- | --- | --- | --- |
| A department rename requires updating every student-subject row | The department name is repeated in every row; missing one produces two different names for the same department | 1NF | `subjects.department_id`, `students.department_id` and `faculty.department_id` store a key, not a name. The name exists once, in `departments`. |
| A student name change corrupts the marks recorded against them | The name is repeated in every dated row; updating one copy and not the others makes the same person appear under two names | 1NF | The name lives in `users`; `attendance_records` references `student_id`. One update fixes every occurrence. |
| A subject code change requires updating every row | The code and the name are repeated together | 1NF / 3NF | `subjects` holds the code and the name once, both determined by the code, which is a candidate key. |
| The same subject appears with two different names in two rows | A typo in one row creates a second "subject" | 3NF | `subject_code` is unique and the name is functionally dependent on the code alone; the name is stored once per code. |
| A section is re-labelled and the historical records change | The section label is stored in the attendance row | 2NF (accepted exception) | The snapshot on `attendance_sessions.section` preserves the historical label. This anomaly is *deliberately* not removed — see Section 4.1.2. |
| A student's section is changed and the historical record changes | The cohort section is stored in the attendance row | 3NF | `attendance_sessions.section` is the snapshot of the class, not of the student; `students.section` describes the present. The two are not conflated. |
| A member of staff's designation is changed | The designation is repeated in every assignment row | 1NF | `faculty.designation` is stored once. |
| An academic year is renamed | The year name is repeated | 1NF | `academic_years.year_name` is stored once; every dependent row carries the key. |

### 5.3 Deletion anomalies

| Anomaly | How it appears in a flat design | Step at which it is removed | The construct that removes it |
| --- | --- | --- | --- |
| Deleting a student deletes the marks of other students | The flat register holds the marks in the same row as the student, so the only way to remove the student is to remove the row | 3NF | `attendance_records.student_id` is `ON DELETE RESTRICT`, and the student is in any case deactivated rather than deleted. The marks are in their own relation. |
| Deleting a subject deletes a term's attendance | The subject's history shares the subject's row | 3NF | `attendance_sessions.subject_id` is `ON DELETE RESTRICT`; the subject is deactivated instead. |
| Deleting an academic year deletes a term's attendance | The same problem at the level of the year | 3NF | `attendance_sessions.academic_year_id` is `ON DELETE RESTRICT`. |
| Deleting a member of staff deletes the sessions they conducted | The flat register records the teacher in the same row as the marks | 3NF | `attendance_sessions.faculty_id` is `ON DELETE RESTRICT`; the account is deactivated instead. |
| Deleting a section deletes the sessions it attended | The same problem at the level of the class | 3NF | `attendance_sessions.section_id` is `ON DELETE RESTRICT`. |
| Deleting a user deletes the sessions they created or the marks they recorded | The actor is recorded in the same row as the fact | 3NF | `attendance_sessions.created_by` and `attendance_records.marked_by` are `ON DELETE SET NULL`: the fact survives, the attribution is lost, and the audit trail records what happened. |
| Deleting an enrolment deletes a student's registration history | The flat register cannot distinguish "never enrolled" from "no attendance yet" | 3NF | `enrollments` is a relation in its own right, and `enrollments.student_id` cascades only because an enrolment without a student has no meaning. |
| Deleting a section orphans the enrolments | The section is part of the enrolment | 3NF | `enrollments.section_id` is `ON DELETE SET NULL`, so the registration survives even when the section is removed. |

### 5.4 Redundancy anomalies

| Redundant fact | Where it would be stored in a flat design | Where it is derived in this schema |
| --- | --- | --- |
| The number of students enrolled in a subject | A counter column on `subjects` | A correlated subquery over `enrollments` (Query 7 in [`06-sql-queries.md`](./06-sql-queries.md)) |
| A student's attendance percentage | A counter column on `students` | Computed from `attendance_records` and the eligible sessions on every request |
| The number of sessions held for a subject | A counter column on `subjects` | `COUNT(DISTINCT attendance_sessions.id)` with the eligible-session predicate |
| The number of sessions a member of staff has conducted | A counter column on `faculty` | `COUNT(*)` over `attendance_sessions` filtered by `faculty_id` |
| The number of students present in a session | A counter column on `attendance_sessions` | `SUM(CASE WHEN attendance_status = 'PRESENT' THEN 1 ELSE 0 END)` over `attendance_records` |

Every derived figure is recomputed from the base facts rather than stored, which is what makes the
dashboard, the on-screen report and the exported CSV incapable of disagreeing with one another.

---

## 6. Conclusion of the analysis

1. All fourteen relations are in **first normal form**: every attribute is atomic, and the
   set-valued relationships of the domain are held in bridge tables as one row per pair.
2. All fourteen relations are in **second normal form**: every relation has a single-column
   surrogate primary key, so no non-prime attribute can depend on part of a composite candidate
   key.
3. Thirteen of the fourteen relations are in **third normal form**, and all fourteen except
   `attendance_sessions` are in **Boyce–Codd normal form**: in every one of them the only
   determinants are candidate keys.
4. The single exception is `attendance_sessions.section`, a snapshot of the section label
   preserved for historical fidelity. The departure is deliberate, is confined to one column of
   one relation, is written once, is never used as a join key, and is documented in Section 4.1.
5. The two bridge tables, `enrollments` and `faculty_subjects`, are what make it possible to
   attribute `academic_year_id` and `section_id` to a *relationship* rather than to either of its
   participants, and they carry the five compound unique constraints that make the business rules
   enforceable by the database.
6. The `onDelete` rules translate the requirement that history must survive into a property of
   the schema itself, so that the guarantee holds even if the application is bypassed.

The schema therefore sits at the third normal form with one documented, bounded and functionally
justified exception, and every business rule that can be expressed as a constraint is expressed as
a constraint.
