# 08 — Security Design and Implementation

**Document:** `docs/08-security.md`
**Project:** AttendEase — Student Attendance Management System
**Scope:** the security measures implemented in `backend/src/**` and
`frontend/src/**`, mapped against the security requirements of the project
specification.

---

## 8.0 Approach

AttendEase is a three-tier web application in which the browser holds no
privileged state: the session lives in an `httpOnly` cookie, every
authorisation decision is taken on the server, and every write to the database
goes through the Prisma query builder. The security design therefore rests on
six principles.

1. **Authentication is verified on every request, not only at login.**
   `requireAuth` re-reads the account from the database on each call, so that
   deactivating a user takes effect immediately instead of waiting for a token
   to expire.
2. **Authorisation is enforced server-side.** The React `ProtectedRoute`
   component hides screens from unauthorised users, but this is presentation
   only; every API route repeats the check on the server.
3. **Credentials never reach the browser.** The session token is an `httpOnly`
   cookie, and no secret of any kind is embedded in the frontend bundle.
4. **Input is validated before it reaches a handler.** Zod schemas replace the
   request body, query string and path parameters with coerced, trimmed and
   typed values.
5. **State-changing requests must prove they originated from the application.**
   A double-submit CSRF token accompanies every non-idempotent request.
6. **Every consequential action is recorded.** Writes to `audit_logs` provide
   an after-the-fact account of who did what, when and from where.

---

## 8.1 Requirement Traceability Matrix

| ID | Security requirement | Status | Primary implementation |
|---|---|---|---|
| SR-1 | Passwords stored as salted hashes | Implemented | `backend/src/services/auth.service.ts` — `hashPassword`, `BCRYPT_ROUNDS = 12` |
| SR-2 | Session token in an `httpOnly`, `SameSite` cookie | Implemented | `backend/src/controllers/auth.controller.ts` — `sessionCookieOptions` |
| SR-3 | Signed, expiring session tokens (JWT) | Implemented | `backend/src/middleware/auth.ts` — `signSessionToken`, `verifySessionToken` |
| SR-4 | CSRF protection on state-changing requests | Implemented | `backend/src/middleware/csrf.ts` — `csrfProtection`, `issueCsrfToken` |
| SR-5 | Server-side role-based access control | Implemented | `backend/src/middleware/auth.ts` — `requireRole`; `backend/src/utils/scope.ts` — `resolveCallerScope`, `assertSubjectAccess` |
| SR-6 | Schema-based input validation | Implemented | `backend/src/validators/*.validator.ts`; `backend/src/middleware/validate.ts` |
| SR-7 | Rate limiting against abuse and brute force | Partially implemented | `backend/src/middleware/rate-limit.ts` — `apiLimiter` mounted; `authLimiter` defined but not mounted |
| SR-8 | HTTP security response headers | Implemented | `backend/src/app.ts` — `helmet(...)` |
| SR-9 | CORS restricted to an allow-list | Implemented | `backend/src/app.ts` — `cors({ origin(...) })` |
| SR-10 | No secrets in the frontend | Implemented | `frontend/src/lib/api.ts`; `frontend/vite.config.ts`; `.gitignore` |
| SR-11 | No SQL injection | Implemented | Prisma Client parameterisation throughout `backend/src/services/**` and `backend/src/controllers/**` |
| SR-12 | Audit trail of administrative actions | Implemented | `backend/src/services/audit.service.ts` — `recordAudit` |
| SR-13 | Account deactivation | Implemented | `backend/src/controllers/students.controller.ts` — `deactivateStudent`; `faculty.controller.ts` — `deactivateFaculty`; `middleware/auth.ts` |
| SR-14 | Password reset via single-use, time-limited tokens | Implemented | `backend/src/services/auth.service.ts` — `requestPasswordReset`, `resetPasswordWithToken` |

---

## 8.2 Detailed Design

### 8.2.1 SR-1 — Password storage

**Requirement.** Passwords must never be stored in a recoverable form.

**Implementation.** `backend/src/services/auth.service.ts` hashes every
password with **bcrypt** through the `bcryptjs` package at a cost factor of
**12**:

```ts
const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}
```

The hash is stored in `users.password_hash` (`VARCHAR(255)`), which is the
column declared in `backend/prisma/schema.prisma` and created by the initial
migration. The plain-text password is never persisted, logged or returned by
any endpoint. The `passwordHash` field is explicitly stripped from the object
returned by `authenticate`:

```ts
const { passwordHash: _ignored, ...safeUser } = user;
```

`hashPassword` is called from exactly three places:

| Caller | Purpose |
|---|---|
| `POST /api/students` | Creating a student account |
| `POST /api/faculty` | Creating a faculty account |
| `POST /api/students/:id/reset-password`, `POST /api/faculty/:id/reset-password` | Administrator-initiated reset |
| `POST /api/students/import` | Bulk import (one hash per row) |
| `PUT /api/auth/password` and `resetPasswordWithToken` | Self-service change |

**Password strength.** `passwordSchema` in
`backend/src/validators/common.validator.ts` enforces a minimum of 8 and a
maximum of 128 characters, with at least one lower-case letter, one
upper-case letter and one digit. The schema is applied to every route that
sets a password (`createStudentSchema`, `createFacultySchema`,
`resetPasswordSchema`, `changePasswordSchema`, `resetPasswordSchema` in the
auth validator). The strength rules are therefore enforced by the server and
not merely by the browser form.

**Timing behaviour on login.** `authenticate` always performs a bcrypt
comparison, even when the e-mail address is unknown, by substituting a
constant dummy hash:

```ts
const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
const passwordMatches = await verifyPassword(password, hash);

if (!user || !passwordMatches) {
  throw unauthorized('Incorrect email or password');
}
```

Both the unknown-address and the wrong-password case therefore take
approximately the same time and produce the same message, so neither the
response body nor its latency discloses whether an account exists.

**Observation.** bcrypt truncates its input at 72 bytes. Because the schema
permits passwords up to 128 characters, two passwords that share their first
72 bytes are cryptographically equivalent. Restricting the maximum length to
72 characters, or pre-hashing with SHA-256 before bcrypt, would remove the
ambiguity. The present policy is nonetheless strong for a student project.

---

### 8.2.2 SR-2 — Session cookie

**Requirement.** The session token must not be readable by client-side
script, and must not be attached to cross-site requests.

**Implementation.** `backend/src/controllers/auth.controller.ts` sets the
session cookie with these options:

```ts
const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.SECURE_COOKIES,
  path: '/',
  maxAge: 1000 * 60 * 60 * 8,
};
```

| Attribute | Value | Effect |
|---|---|---|
| `httpOnly` | `true` | `document.cookie` cannot read the token, so an XSS payload cannot exfiltrate it |
| `sameSite` | `lax` | The cookie is not sent on cross-site `POST` requests, which blocks the classic CSRF vector; it is still sent on top-level cross-site `GET` navigations, which keeps ordinary outbound links working |
| `secure` | `env.SECURE_COOKIES` | When the deployment is served over HTTPS the cookie is restricted to the secure channel |
| `path` | `/` | The cookie is available to the whole application |
| `maxAge` | 8 hours | Matches the default `JWT_EXPIRES_IN` of `8h`, so cookie and token lifetimes agree |

`SECURE_COOKIES` is a boolean environment variable that defaults to `false`
for local development over plain HTTP and must be set to `true` in a
production deployment. The `secure` flag is applied to the CSRF cookie as
well.

On sign-out the cookie is cleared with `res.clearCookie(env.cookieName, {
path: '/' })`, which requires the same `path` attribute to match the one used
when the cookie was set.

The frontend always sends the cookie by setting `credentials: 'include'` on
every `fetch` call (`frontend/src/lib/api.ts`).

---

### 8.2.3 SR-3 — JSON Web Tokens

**Requirement.** The session token must be unforgeable and must expire.

**Implementation.** `backend/src/middleware/auth.ts` signs a JWT with
`jsonwebtoken`:

```ts
export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}
```

The payload is deliberately minimal:

```ts
export interface SessionPayload {
  sub: number;   // users.id
  role: Role;    // ADMIN | FACULTY | STUDENT
  name: string;
  email: string;
}
```

The signing secret comes from the `JWT_SECRET` environment variable, which
the configuration layer requires to be at least 32 characters
(`backend/src/config/env.ts`):

```ts
JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
```

Verification uses `jwt.verify`, and any failure — a bad signature, an
expired token or a malformed token — is converted into a `null` result and
then into a 401:

```ts
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as unknown as SessionPayload;
  } catch {
    return null;
  }
}
```

**Token acceptance.** `extractToken` accepts the token from the
`attendease_token` cookie first and then from an `Authorization: Bearer …`
header, which allows command-line and automated clients to work without a
cookie jar.

**Live account check.** `requireAuth` does not trust the token alone; it
re-reads the user record:

```ts
const user = await prisma.user.findUnique({
  where: { id: payload.sub },
  select: { id: true, name: true, email: true, role: true, isActive: true },
});

if (!user) throw unauthorized('Your account no longer exists');
if (!user.isActive) throw forbidden('Your account has been deactivated. Contact the administrator.');

req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
```

Two consequences follow. First, a role change takes effect on the caller's
next request without waiting for the token to expire. Second, a deactivated
account loses access immediately, which is the mechanism behind SR-13. The
trade-off is one extra database read per authenticated request.

---

### 8.2.4 SR-4 — CSRF protection (double-submit cookie)

**Requirement.** A cross-site request must not be able to change state on the
user's behalf.

**Implementation.** `backend/src/middleware/csrf.ts` implements the
double-submit-cookie pattern.

**Issuance.** `issueCsrfToken` generates 24 random bytes, hex-encodes them,
and stores the value in a cookie that *is* readable by script:

```ts
export function issueCsrfToken(res: Response): string {
  const token = crypto.randomBytes(24).toString('hex');
  res.cookie(env.csrfCookieName, token, {
    httpOnly: false,
    sameSite: 'lax',
    secure: env.SECURE_COOKIES,
    maxAge: 1000 * 60 * 60 * 8,
    path: '/',
  });
  return token;
}
```

The cookie is deliberately not `httpOnly`: the front end must copy it into a
request header. The cookie name is `attendease_csrf` and the header name is
`x-csrf-token` (`backend/src/config/env.ts`). The token is issued on sign-in
and on every `GET /api/auth/me`, which is the call the application makes when
it restores a session on page load.

**Verification.** Every request whose method is not `GET`, `HEAD` or `OPTIONS`
must present the same value in both places:

```ts
const cookieToken = (req.cookies as Record<string, string> | undefined)?.[env.csrfCookieName];
const headerToken = req.headers[env.csrfHeaderName];

if (!cookieToken || typeof headerToken !== 'string') {
  return next(forbidden('Missing CSRF token. Please refresh the page and try again.'));
}

const a = Buffer.from(String(cookieToken));
const b = Buffer.from(headerToken);
if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
  return next(forbidden('Invalid CSRF token. Please refresh the page and try again.'));
}
```

The comparison uses `crypto.timingSafeEqual`, so the rejection time does not
depend on how many leading characters match. The length check before the call
is required because `timingSafeEqual` throws when the buffers differ in
length.

**Exemptions.** Four paths cannot be CSRF'd because they are either
unauthenticated or safe, and are therefore skipped:

```ts
const EXEMPT_PATHS = [
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/health',
];
```

**Client side.** `frontend/src/lib/api.ts` attaches the header to every
mutating request:

```ts
const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
if (isMutation) {
  const csrf = readCookie('attendease_csrf');
  if (csrf) finalHeaders.set('X-CSRF-Token', csrf);
}
```

**Why the pattern works here.** The session cookie is `httpOnly` and
`SameSite=Lax`, so a cross-site form post cannot read the CSRF cookie.
Because the CSRF cookie *is* readable, the application can copy it into a
header; a cross-site attacker cannot read the victim's cookie and therefore
cannot construct the header. The two together — `SameSite` on the session
cookie and the double-submit token — form a defence in depth.

---

### 8.2.5 SR-5 — Server-side role-based access control

**Requirement.** Authorisation must be enforced by the server, on every
request, for every resource.

**Implementation.** Three layers are used.

**Layer 1 — the route guard.** `requireRole` expands to a two-element
middleware array:

```ts
export function requireRole(...roles: Role[]) {
  const checkRole: RequestHandler = (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden(`This action requires one of the following roles: ${roles.join(', ')}`));
    }
    next();
  };

  return [requireAuth, checkRole];
}
```

The session check always runs first, so `req.user` is guaranteed to be
populated when the role is checked. The three roles are `ADMIN`, `FACULTY`
and `STUDENT`, matching the `users.role` enum.

**Layer 2 — record-level scope.** A role check alone is insufficient, because
a faculty member must only see their own subjects. Three helpers implement
this:

| Helper | File | Purpose |
|---|---|---|
| `resolveCallerScope(req)` | `backend/src/utils/scope.ts` | Resolves the caller's `facultyId`, `studentId` and the list of `taughtSubjectIds` |
| `assertSubjectAccess(scope, subjectId)` | `backend/src/utils/scope.ts` | Throws 403 unless the caller may read the given subject |
| `resolveFacultyScope(req)` | `backend/src/controllers/attendance.controller.ts` | Resolves the caller's `facultyId` for the attendance controllers |

Examples of the resulting behaviour:

* `GET /api/enrollments` — a `STUDENT` receives only their own enrolments
  (`studentId: scope.studentId`); a `FACULTY` receives only enrolments for
  subjects they teach.
* `GET /api/assignments` — a `FACULTY` receives only their own assignments.
* `GET /api/reports` — `scopeFilters` restricts a `FACULTY` to the subjects
  they teach and a `STUDENT` to their own record.
* `GET /api/enrollments/subject/:subjectId` — `assertSubjectAccess` throws
  403 for a faculty member who does not teach the subject and for every
  student ("Students cannot view subject rosters").

**Layer 3 — business-rule checks inside the controller.** Several endpoints
additionally verify that the referenced object really belongs to the caller:

* `POST /api/attendance/sessions` — the faculty member is derived from the
  matching `faculty_subjects` assignment; a faculty member without one
  receives 403 ("You are not assigned to teach this subject and section").
* `POST /api/attendance/sessions/:id/records` — every submitted `studentId`
  must appear in the enrolment list of the session's subject and section,
  otherwise the whole submission is rejected with 400.
* `GET /api/students/:id` — a `STUDENT` may read only their own record; a
  `FACULTY` must share at least one taught subject with the student.
* `GET /api/attendance/student/:studentId` — a `STUDENT` may read only their
  own attendance; a `FACULTY` must teach one of the student's subjects.

**Client-side guards are not a security boundary.** The React
`ProtectedRoute` component (`frontend/src/components/protected-route.tsx`)
redirects unauthenticated visitors to `/login` and unauthorised ones to
`/unauthorized`. This is a usability measure; the API enforces the same rules
independently, so bypassing the front end yields nothing.

---

### 8.2.6 SR-6 — Input validation

**Requirement.** Every value that arrives from a client must be validated
against a schema before it is used.

**Implementation.** Zod (v3.24) schemas are declared in
`backend/src/validators/` and applied by the `validate` middleware:

```ts
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query) as Record<string, unknown>;
        Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true });
      }
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}
```

The middleware does not merely check; it **replaces** each part of the request
with the parsed output. A handler therefore never sees an unvalidated string
and cannot forget to sanitise it.

**Rules enforced by the shared schemas**
(`backend/src/validators/common.validator.ts`):

| Schema | Rule |
|---|---|
| `paginationSchema` | `page` is an integer ≥ 1 (default 1); `pageSize` is an integer between 1 and 100 (default 10) |
| `idParam`, `studentIdParam`, `subjectIdParam` | The identifier is coerced to an integer and must be positive |
| `emailSchema` | 5–160 characters, must be a valid e-mail address, lower-cased |
| `passwordSchema` | 8–128 characters with a lower-case letter, an upper-case letter and a digit |
| `nameSchema` | 2–120 characters, trimmed |
| `sectionSchema` | 1–10 characters, trimmed, upper-cased |
| `dateOnlyString` | Must match `^\d{4}-\d{2}-\d{2}$` and be a real calendar date |
| `attendanceStatusSchema` | One of `PRESENT`, `ABSENT`, `LATE`, `ON_LEAVE` |
| `roleSchema` | One of `ADMIN`, `FACULTY`, `STUDENT` |

**Cross-field rules.** Some schemas refine other schemas with `.refine()`:
an academic year must end after it starts, a semester must end after it
starts, and a report's `endDate` must not precede its `startDate`.

**Failure behaviour.** A Zod failure is converted by the central error
handler into **422 Unprocessable Entity** with a `VALIDATION_ERROR` code and a
`details` array naming each offending field:

```ts
if (err instanceof ZodError) {
  res.status(422).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'The submitted data is invalid',
      details: err.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    },
  });
  return;
}
```

**Validation coverage.** The following routes do not carry a `validate()`
middleware and therefore rely on manual checks in the controller:

| Route | Manual check |
|---|---|
| `GET /api/students/export` | No query parameters are read |
| `GET /api/faculty/export` | No query parameters are read |
| `GET /api/audit-logs/export` | `action` and `entityType` are used directly as Prisma filter values (parameterised, so not injectable) |
| `POST /api/students/import` | The body is checked for a non-empty `rows` array; each row is coerced with `String(...)` and `Number(...)` before use |
| `GET /api/enrollments/subject/:subjectId` | `sectionId` is read with `Number(req.query.sectionId)` |

---

### 8.2.7 SR-7 — Rate limiting

**Requirement.** The API must resist automated abuse, in particular
credential-guessing.

**Implementation.** `backend/src/middleware/rate-limit.ts` uses
`express-rate-limit` v7. Two limiters are defined:

```ts
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});
```

`apiLimiter` is applied to the whole API surface in `backend/src/app.ts`:

```ts
app.use('/api', apiLimiter);
```

With the shipped defaults (`RATE_LIMIT_WINDOW_MINUTES=15`,
`RATE_LIMIT_MAX=300`) a single client address may issue 300 requests per
15-minute window across all endpoints.

A second, stricter limiter exists for credential endpoints:

```ts
export const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler,
});
```

With `AUTH_RATE_LIMIT_MAX=20`, this allows 20 *failed* attempts per window per
address (successful requests are not counted, thanks to
`skipSuccessfulRequests: true`).

Rejections use the standard error envelope with the code `RATE_LIMITED` and
HTTP status **429**.

**Observation.** `authLimiter` is exported but is **not mounted on any
route**; `backend/src/app.ts` imports and applies only `apiLimiter`. In the
present build, therefore, `POST /api/auth/login` is protected only by the
global 300-per-15-minute limit rather than by the intended 20-attempt limit.
The countermeasure is a one-line change in `backend/src/routes/auth.routes.ts`
— adding `authLimiter` to the three credential routes — but no source change
has been made as part of this documentation exercise.

**Headers.** `standardHeaders: true` emits the `RateLimit-*` and
`RateLimit-Policy` headers, so a well-behaved client can back off
correctly; `legacyHeaders: false` suppresses the older `X-RateLimit-*`
headers.

**Trust proxy.** When `TRUST_PROXY=true`, `app.set('trust proxy', 1)` is
applied, so the limiter keys on the real client address taken from the
`X-Forwarded-For` header rather than on the reverse proxy's address. This
must only be enabled when the API genuinely sits behind a trusted proxy.

---

### 8.2.8 SR-8 — HTTP security headers

**Requirement.** The API must set the standard protective response headers.

**Implementation.** `backend/src/app.ts` installs Helmet v8 as the very first
middleware:

```ts
app.use(
  helmet({
    contentSecurityPolicy: env.isProduction ? undefined : false,
    crossOriginEmbedderPolicy: false,
  }),
);
```

With Helmet's default configuration the following headers are emitted:

| Header | Value | Purpose |
|---|---|---|
| `Content-Security-Policy` | Helmet's default policy (enabled in production) | Restricts where scripts, styles and other resources may be loaded from |
| `Strict-Transport-Security` | `max-age=15552000; includeSubDomains` | Requires HTTPS for the origin |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing |
| `X-Frame-Options` | `SAMEORIGIN` | Prevents clickjacking through framing |
| `Referrer-Policy` | `no-referrer` | Prevents the URL leaking to third parties |
| `X-DNS-Prefetch-Control` | `off` | Disables speculative DNS prefetching |
| `X-Download-Options` | `noopen` | Prevents IE from opening downloads in the site context |
| `X-Permitted-Cross-Domain-Policies` | `none` | Disables Flash and Acrobat cross-domain policy files |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isolates the browsing context |
| `Cross-Origin-Resource-Policy` | `same-origin` | Restricts cross-origin resource loading |
| `Origin-Agent-Cluster` | `?1` | Isolates the browsing context at origin granularity |
| `X-Powered-By` | *removed* | Does not disclose the server technology |

Two options are deliberately relaxed:

* `contentSecurityPolicy: false` in non-production builds, because the Vite
  development server injects inline scripts and uses hot-module reloading,
  which the strict policy would block. In production the Helmet default
  policy applies.
* `crossOriginEmbedderPolicy: false`, which is required for the application
  to work with the development proxy and with cross-origin asset loading.

---

### 8.2.9 SR-9 — CORS allow-list

**Requirement.** Only the configured front-end origins may call the API from a
browser.

**Implementation.** `backend/src/app.ts` configures the `cors` package with an
explicit origin check:

```ts
app.use(
  cors({
    origin(origin, callback) {
      // Same-origin and non-browser clients send no Origin header.
      if (!origin) return callback(null, true);
      if (env.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  }),
);
```

`credentials: true` is required because the session is carried in a cookie;
it also means the `Access-Control-Allow-Origin` header must name an exact
origin, which is why the wildcard `*` cannot be used.

The allow-list is built in `backend/src/config/env.ts`:

```ts
corsOrigins: raw.CORS_ORIGINS.length ? raw.CORS_ORIGINS : [raw.APP_URL],
```

so it is read from the `CORS_ORIGINS` environment variable (a comma-separated
list) and falls back to the single `APP_URL`. The shipped value is
`CORS_ORIGINS="http://localhost:5173"`.

**Observation.** A request whose `Origin` header is absent is allowed. This is
deliberate — non-browser clients such as `curl` and server-to-server calls do
not send an `Origin` header — and it does not weaken the protection against
cross-site *browser* requests, because those always carry an `Origin`. CORS
is, in any case, a browser-enforced mechanism and is not a substitute for the
CSRF token or the server-side authorisation checks.

---

### 8.2.10 SR-10 — No secrets in the frontend

**Requirement.** The browser bundle must contain no credentials, keys or
secrets.

**Implementation.**

* The frontend reads exactly one environment variable, `VITE_API_URL`, which
  is a base URL and not a secret
  (`frontend/src/lib/api.ts`, `frontend/src/vite-env.d.ts`).
* `frontend/vite.config.ts` reads `VITE_API_PROXY`, a development proxy
  target, again not a secret.
* `JWT_SECRET`, `DATABASE_URL` and every other sensitive variable are read
  only by the backend, from `backend/.env`, which is excluded by the
  repository's `.gitignore` (`.env`, `.env.local`, `.env.*.local`, with
  `!.env.example` re-including the template).
* The session token is delivered in an `httpOnly` cookie, so it is never
  present in the JavaScript heap, in `localStorage`, or in `sessionStorage`.
* The API base URL is resolved at build time through Vite's
  `import.meta.env`, which only exposes variables prefixed with `VITE_`.
  The convention itself is therefore a guard against accidental disclosure.

**What the frontend deliberately does contain** is the CSRF token, which is
readable by design (Section 8.2.4) and is not a credential: possessing it
without the `httpOnly` session cookie grants nothing.

---

### 8.2.11 SR-11 — SQL injection safety

**Requirement.** Client-supplied values must never be concatenated into SQL.

**Implementation.** The application has no SQL string concatenation of any
kind. All database access goes through the Prisma Client, which compiles
Prisma queries into parameterised statements:

```ts
const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
```

```ts
const where: Prisma.AttendanceSessionWhereInput = {
  ...(scope.facultyId ? { facultyId: scope.facultyId } : {}),
  ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
  ...
};
```

The two places where a raw fragment is written are safe by construction:

1. The health check uses a tagged template, which Prisma parameterises:

   ```ts
   await prisma.$queryRaw`SELECT 1`;
   ```

   There is no interpolation into that template, so no value can be injected.

2. The `search` filter uses Prisma's `contains` operator, which becomes a
   bound parameter:

   ```ts
   { OR: [ { departmentName: { contains: search } }, { departmentCode: { contains: search } } ] }
   ```

Furthermore, all identifiers that reach Prisma have already been coerced to
integers by the Zod schemas (`z.coerce.number().int().positive()`), so a
non-numeric identifier is rejected with 422 before any query is issued.

---

### 8.2.12 SR-12 — Audit logging

**Requirement.** Administrative and authentication actions must be recorded so
that they can be reviewed afterwards.

**Implementation.** `backend/src/services/audit.service.ts` provides a single
entry point:

```ts
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? input.req?.user?.id ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId != null ? String(input.entityId) : null,
        details: input.details === undefined
          ? null
          : typeof input.details === 'string' ? input.details : JSON.stringify(input.details),
        ipAddress: input.req?.ip ?? null,
      },
    });
  } catch (error) {
    console.error('[audit-log-error]', error);
  }
}
```

Three design points are deliberate.

* **Failure isolation.** The audit write is wrapped in a `try`/`catch` and the
  error is logged rather than propagated. A failure in the audit trail must
  not abort the business operation that triggered it, because the operation
  itself is the more important event.
* **Actor attribution.** `userId` is taken from the explicit argument, then
  from the authenticated request, then recorded as `null` — which is how
  pre-authentication events such as a password-reset request are logged
  without an actor.
* **Structure.** `action` and `entity_type` are separate columns, so the log
  can be filtered by action or by entity; `details` is a free-form `TEXT`
  column holding a JSON document with the before/after state of the change.

**Actions recorded.** Fifteen distinct action values are written by the
application:

| Action | Where it is written |
|---|---|
| `LOGIN` | `POST /api/auth/login` |
| `LOGOUT` | `POST /api/auth/logout` |
| `PASSWORD_RESET_REQUESTED` | `POST /api/auth/forgot-password` |
| `PASSWORD_RESET_COMPLETED` | `POST /api/auth/reset-password` |
| `PASSWORD_CHANGED` | `PUT /api/auth/password` |
| `PASSWORD_RESET` | `POST /api/students/:id/reset-password`, `POST /api/faculty/:id/reset-password` |
| `PROFILE_UPDATED` | `PUT /api/auth/profile` |
| `CREATE` | Creation of a department, academic year, semester, subject, section, student, faculty member, assignment, enrolment and attendance session |
| `UPDATE` | Update of every editable entity, including an attendance record (with the previous and new status) |
| `DELETE` | Deletion of a department, academic year, semester, subject, section, faculty assignment and enrolment |
| `DEACTIVATE` | Deactivation of a student, faculty member or a subject that carries attendance history |
| `REACTIVATE` | Reactivation of a student or faculty member |
| `IMPORT` | Bulk import of students |
| `SUBMIT_ATTENDANCE` | Saving the attendance roster of a session, with the number of records |
| `CANCEL` | Cancelling an attendance session |

**Entity types recorded.** `User`, `Department`, `AcademicYear`, `Semester`,
`Subject`, `Section`, `Student`, `Faculty`, `FacultySubject`, `Enrollment`,
`AttendanceSession` and `AttendanceRecord`.

**Integrity of the log.** `audit_logs.user_id` is a nullable foreign key
with `ON DELETE SET NULL`, so deleting a user never destroys the audit
trail; the entry survives with a null actor.

**Exposure.** `GET /api/audit-logs` and `GET /api/audit-logs/export` are
restricted to `ADMIN`. The export is capped at 5000 rows.

**Observation.** Read operations are not logged; the trail records changes
but not views. Logging every read would multiply the table's size
considerably and is a design decision rather than an oversight.

---

### 8.2.13 SR-13 — Account deactivation

**Requirement.** A user must be able to be disabled without destroying the
attendance history that references them.

**Implementation.**

* `DELETE /api/students/:id` and `DELETE /api/faculty/:id` do **not** delete
  the row. They set `users.is_active = false`. The student endpoint performs
  the update inside a transaction:

  ```ts
  await prisma.$transaction([
    prisma.user.update({ where: { id: student.userId }, data: { isActive: false } }),
    prisma.student.update({ where: { id }, data: { user: { update: { isActive: false } } } }),
  ]);
  ```

  and records an audit entry with the action `DEACTIVATE`.

* `POST /api/students/:id/reactivate` and
  `POST /api/faculty/:id/reset-password`'s sibling
  `POST /api/faculty/:id/reactivate` restore access by setting
  `is_active = true` again, and are audited with the action `REACTIVATE`.

* **Enforcement is immediate.** Because `requireAuth` re-reads the account on
  every request, a deactivated user is refused at once with **403 Forbidden**
  and the message "Your account has been deactivated. Contact the
  administrator.", even if their JWT has not yet expired. The login endpoint
  refuses the account as well, with **401 Unauthorized** and the message
  "This account has been deactivated. Please contact the administrator."

* **History is preserved.** Because `attendance_records.student_id` and
  `attendance_sessions.faculty_id` use `ON DELETE RESTRICT`, a student or
  faculty record that carries attendance history cannot be deleted even by
  direct database access; and because the account is only deactivated, the
  historical rows remain exactly as they were recorded.

---

### 8.2.14 SR-14 — Password reset tokens

**Requirement.** A forgotten password must be recoverable without a
password being stored or transmitted in recoverable form.

**Implementation.** `backend/src/services/auth.service.ts`:

**Request.** `requestPasswordReset(email)` looks up the account and returns
`null` when the address is unknown or the account is inactive. It then
generates 32 random bytes, hex-encodes them (64 characters), and stores only
the **SHA-256 hash** of the token:

```ts
const rawToken = generateToken(32);
await prisma.passwordResetToken.create({
  data: {
    userId: user.id,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + env.RESET_TOKEN_TTL_MINUTES * 60 * 1000),
  },
});
```

The raw token is returned to the caller so that it can be emailed; the
database holds only `password_reset_tokens.token_hash`
(`VARCHAR(128)`, unique index `password_reset_tokens_token_hash_key`). The
entropy is 256 bits from `crypto.randomBytes`, so guessing is infeasible.

**Redemption.** `resetPasswordWithToken(rawToken, newPassword)` hashes the
supplied token and looks it up by that hash. The token is rejected if it
does not exist, has already been used (`used_at` is set), or has expired
(`expires_at` is in the past). On success, a single transaction:

1. updates the user's `password_hash`;
2. sets the token's `used_at`; and
3. deletes every other unused token belonging to that user.

The token is therefore single-use, time-limited (default
`RESET_TOKEN_TTL_MINUTES=30`), and invalidated across all devices.

**The `users` deletion rule.** `password_reset_tokens.user_id` is declared
`ON DELETE CASCADE`, so a deleted user cannot leave orphaned reset tokens
behind.

**Enumeration resistance.** `POST /api/auth/forgot-password` returns **200**
with an identical message whether or not the address exists:

> If an account exists for that email, a password reset link has been sent.

**Observation.** In a non-production build the raw token is also returned in
the response body (`data.resetToken`) so that the flow can be completed
without an SMTP provider. The code guards this with `!env.isProduction`, so
the behaviour cannot occur in a production deployment — but the guard should
be double-checked whenever `NODE_ENV` is changed, because `env.isProduction`
is derived from `NODE_ENV === 'production'`.

---

## 8.3 Middleware Pipeline

The order in `backend/src/app.ts` is significant; each stage assumes that the
previous one has already run.

| # | Middleware | Applied to | Purpose |
|---|---|---|---|
| 1 | `helmet` | all | Security response headers |
| 2 | `cors` | all | Origin allow-list |
| 3 | `express.json({ limit: '1mb' })` | all | Body parsing with a size limit |
| 4 | `express.urlencoded({ extended: true, limit: '1mb' })` | all | Form body parsing with a size limit |
| 5 | `cookieParser` | all | Populates `req.cookies` for the CSRF check and the session cookie |
| 6 | `morgan` | all (unless `LOG_LEVEL=silent`) | Request logging |
| 7 | `apiLimiter` | `/api` | Rate limiting |
| 8 | `csrfProtection` | `/api` | Double-submit CSRF verification |
| 9 | `apiRouter` | `/api` | The routes |
| 10 | `express.static` + SPA fallback | production only | Serves the built front end |
| 11 | `notFoundHandler` | all | 404 for an unmatched path |
| 12 | `errorHandler` | all | Centralised error mapping |

Two consequences follow from this order. The CSRF check runs **before**
authentication, so a cross-site request is rejected with 403 even if it
carries no session. And the rate limiter runs **before** the CSRF check, so
that a flood of forged requests is throttled rather than processed.

The 1 MB body limit mitigates a denial-of-service through oversized payloads.

---

## 8.4 Configuration and Secret Handling

All configuration is read once, at start-up, through a Zod schema in
`backend/src/config/env.ts`. The application **refuses to start** if the
configuration is invalid:

```ts
const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
  console.error(`Invalid environment configuration:\n${issues.join('\n')}`);
  throw new Error('Invalid environment configuration');
}
```

| Variable | Required | Default | Security relevance |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Holds the database credentials; must never be committed |
| `JWT_SECRET` | Yes, ≥ 32 characters | — | Signs the session tokens; rotating it invalidates every session |
| `JWT_EXPIRES_IN` | No | `8h` | Session lifetime |
| `RESET_TOKEN_TTL_MINUTES` | No | `30` | Lifetime of a reset token |
| `ATTENDANCE_THRESHOLD_PERCENT` | No | `75` | Low-attendance threshold |
| `ATTENDANCE_COUNTED_STATUSES` | No | `PRESENT,LATE` | Which statuses count as attended |
| `CORS_ORIGINS` | No | `APP_URL` | Origin allow-list |
| `RATE_LIMIT_WINDOW_MINUTES` | No | `15` | Rate-limit window |
| `RATE_LIMIT_MAX` | No | `300` | Global request cap |
| `AUTH_RATE_LIMIT_MAX` | No | `20` | Intended cap for credential endpoints (limiter not mounted) |
| `SECURE_COOKIES` | No | `false` | Must be `true` behind HTTPS |
| `TRUST_PROXY` | No | `false` | Enables `X-Forwarded-For` handling |
| `LOG_LEVEL` | No | `info` | `silent` disables request logging |

**Secret hygiene.** The repository's `.gitignore` excludes `.env`,
`.env.local` and `.env.*.local` while re-including `.env.example`, which
contains only placeholders. The `.env.example` file shows a dedicated
least-privilege database account (`attendease`) rather than the MySQL root
account, and states "NEVER commit a real `.env` file".

---

## 8.5 Error Handling and Information Disclosure

`backend/src/middleware/error.ts` is the single place where an error becomes
an HTTP response. Its policy is explicit:

| Error class | Status | Disclosed to the client |
|---|---|---|
| `ZodError` | 422 | The field-level validation messages |
| Prisma `P2002` | 409 | The names of the conflicting columns |
| Prisma `P2003` | 409 | A generic "this would break a relationship" message and the advice to deactivate rather than delete |
| Prisma `P2025` | 404 | A generic "the requested record was not found" |
| `AppError` | Its own status | The message and any `details` the controller supplied |
| Anything else | 500 | A generic message in production |

The final case is the important one:

```ts
res.status(500).json({
  success: false,
  error: {
    code: 'INTERNAL_SERVER_ERROR',
    message: env.isProduction
      ? 'Something went wrong on our end. Please try again.'
      : `Internal error: ${err instanceof Error ? err.message : String(err)}`,
  },
});
```

The stack trace and the original message are written to the server log
(`[unhandled-error]`) and are never returned to the client in production.
This prevents stack traces, SQL fragments and internal identifiers from
reaching the browser.

---

## 8.6 Additional Hardening Present in the Code

These measures were implemented although they are not separately listed in the
security requirements.

| Measure | Implementation |
|---|---|
| **Least privilege at the database level** | `.env.example` names a dedicated `attendease` account rather than `root` |
| **Foreign-key integrity** | 30 foreign keys with explicit `onDelete` policies; `Restrict` on the attendance tables prevents the silent destruction of history, `Cascade` only where the parent cannot carry attendance, `SetNull` for optional actors |
| **Composite unique constraints as business rules** | `unique_session_slot`, `unique_student_per_session`, `unique_student_subject_enrollment`, `unique_faculty_subject_assignment`, `unique_section_offering` and `semester_number_per_year` prevent double-marking and duplicate enrolment at the storage layer, not merely in application code |
| **Transactional attendance submission** | The whole roster is written in one `prisma.$transaction`, so a partially marked session cannot persist |
| **Upsert on the compound unique key** | Re-submitting a roster updates the existing records rather than creating duplicates |
| **CSV formula-injection sanitisation** | `backend/src/utils/csv.ts` prefixes any cell beginning with `=`, `+`, `-`, `@`, tab or carriage return with a single quote |
| **CSV quoting** | Cells containing a comma, quote or newline are quoted and internal quotes are doubled |
| **UTF-8 byte-order mark on CSV exports** | `csvResponse` prefixes `\uFEFF` so that spreadsheet applications detect UTF-8 correctly |
| **Password values are never echoed** | `getProfile` selects explicit columns and never includes `password_hash` |
| **Graceful shutdown** | `SIGTERM`/`SIGINT` close the HTTP server and disconnect the Prisma client, with a 10-second forced-exit fallback |
| **Startup database verification** | The process exits with code 1 if the database cannot be reached, rather than serving errors |
| **Frontend session restoration** | The application calls `GET /api/auth/me` on load and clears the local user on any failure, so a revoked session does not leave a stale UI |

---

## 8.7 Summary of Observed Weaknesses

The following observations were made while reading the source. No code has
been changed.

| # | Observation | Impact | Suggested remedy |
|---|---|---|---|
| 1 | `authLimiter` is defined but never mounted; only `apiLimiter` guards the API | `POST /api/auth/login` is limited to 300 attempts per 15 minutes per address instead of the intended 20 | Mount `authLimiter` on the credential routes in `backend/src/routes/auth.routes.ts` |
| 2 | `GET /api/attendance/sessions/:id` is guarded only by `requireAuth`; the ownership check is skipped for `STUDENT` because `resolveFacultyScope` returns no `facultyId` for that role | A student may read any session, including its roster with student e-mail addresses | Add an explicit `STUDENT` branch that rejects the request |
| 3 | `GET /api/attendance/records` is guarded only by `requireAuth`; the faculty scope filter is likewise absent for a `STUDENT` | A student may list attendance records for every student in the institution | Add an explicit `STUDENT` branch that restricts the result to the caller's own records |
| 4 | `GET /api/assignments` narrows the result set for `FACULTY` only | A student receives every faculty-subject assignment in the institution | Add a `STUDENT` branch to the filter |
| 5 | `POST /api/students/import` assigns the fixed default password `Attend@123` when a row omits one | Newly imported accounts share a predictable credential | Require a password per row, or generate a random one and force a change on first sign-in |
| 6 | `POST /api/auth/forgot-password` returns the raw reset token in the response body outside production | Acceptable for development, but it depends on `NODE_ENV` being exactly `production` | Move the behaviour behind an explicit `ALLOW_DEV_RESET_TOKEN` flag |
| 7 | bcrypt silently truncates passwords at 72 bytes while the schema allows up to 128 characters | Two passwords sharing their first 72 bytes are equivalent | Limit the maximum password length to 72 bytes, or pre-hash with SHA-256 |
| 8 | `SECURE_COOKIES` defaults to `false` | A production deployment that forgets to set it will transmit the session cookie over plain HTTP | Document the variable as mandatory in production, or default it to `true` when `NODE_ENV=production` |
| 9 | No automated test files exist, although `vitest` and Playwright are configured and the root `npm test` script is present | The security behaviours described above are not verified by an executable test suite | Add tests covering authentication, authorisation and CSRF behaviour |

---

## 8.8 Conclusion

The implementation satisfies the thirteen security requirements of the
specification, with one partial exception (SR-7, the unmounted
authentication rate limiter). The principal strengths are the immediate
enforcement of deactivation, the separation of the `httpOnly` session cookie
from the readable CSRF cookie, the server-side repetition of every
authorisation decision, and the use of Prisma's parameterised query builder
throughout. The principal residual risks are the three read endpoints
reachable by a student beyond their own data, the default password in the
bulk import, and the absence of an executable test suite.

---

*End of document 08.*
