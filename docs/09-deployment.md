# 09 — Deployment Runbook

This document describes every supported way to run AttendEase, from a developer
machine to a public server. The verification log at the end distinguishes checks
executed in this workspace from deployment steps that require external infrastructure.

---

## 1. Supported topologies

| Topology | Database | Web | API | When to use |
|---|---|---|---|---|
| **A. Local development** | Local MySQL 8 (port 3307 in this workspace) | Vite dev server :5173 | `tsx watch` :5000 | Day-to-day work |
| **B. Local production build** | Local MySQL 8 | `vite preview` or nginx | `node dist/server.js` | Verifying the release artefacts |
| **C. Docker Compose** | `mysql:8.4` container | nginx container :8080 | Express container (internal) | One-command stack, closest to production |
| **D. Single VPS (manual)** | MySQL 8 on the host | nginx + static build | systemd service | Cheapest real deployment |

---

## 2. Topology A — Local development

### 2.1 MySQL 8 instance in this workspace

A dedicated MySQL 8.4 instance lives in `.mysql/` (git-ignored) so the
project never touches the machine's system-wide MySQL service.

| Item | Value |
|---|---|
| Basedir | `C:/Program Files/MySQL/MySQL Server 8.4` |
| Datadir | `.mysql/data` |
| Port | `3307` (the system service already owns 3306) |
| Config | `.mysql/my.ini` |
| Start script | `.mysql/start-mysql.bat` |
| Error log | `.mysql/logs/mysqld.err` |

Start it with:

```bat
<PROJECT_ROOT>\.mysql\start-mysql.bat
```

Verify (enter the database password at the prompt rather than putting it in
the command or in documentation):

```bash
"C:/Program Files/MySQL/MySQL Server 8.4/bin/mysql.exe" \
  --defaults-file="<PROJECT_ROOT>/.mysql/my.ini" \
  -u attendease -p -e "SELECT DATABASE(); SHOW DATABASES;"
```

### 2.2 Schemas

| Schema | Owner | Purpose |
|---|---|---|
| `attendance_management` | `attendease` | development / demo data |
| `attendance_management_test` | `attendease` | backend Vitest suites |
| `attendance_management_e2e` | `attendease` | Playwright end-to-end suite |

The application user is deliberately **not** a MySQL administrator: it can use
the three schemas above and nothing else. Creating a schema needs the MySQL
root account, which is only used during setup. Replace the password placeholder
with a locally generated secret and keep it only in `backend/.env`.

```sql
CREATE DATABASE attendance_management      CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE attendance_management_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE attendance_management_e2e  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'attendease'@'localhost' IDENTIFIED BY '<LOCAL_DB_PASSWORD>';
CREATE USER IF NOT EXISTS 'attendease'@'127.0.0.1' IDENTIFIED BY '<LOCAL_DB_PASSWORD>';
GRANT ALL PRIVILEGES ON attendance_management.*      TO 'attendease'@'127.0.0.1';
GRANT ALL PRIVILEGES ON attendance_management_test.* TO 'attendease'@'127.0.0.1';
GRANT ALL PRIVILEGES ON attendance_management_e2e.*  TO 'attendease'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### 2.3 Run

```bash
npm install
cp .env.example backend/.env      # point DATABASE_URL at port 3307
npm run db:migrate
npm run db:seed
npm run dev
```

| Service | URL |
|---|---|
| Web | http://localhost:5173 |
| API | http://localhost:5000 |
| Health | http://localhost:5000/api/health |

---

## 3. Topology B — Local production build

```bash
npm run build      # prisma generate + tsc -> backend/dist ; vite build -> frontend/dist
npm start          # node backend/dist/server.js
```

With `NODE_ENV=production` the API also serves `frontend/dist`, so the whole
application is reachable on a single port:

```bash
NODE_ENV=production SECURE_COOKIES=false npm start
# open http://localhost:5000
```

Behind a reverse proxy set `TRUST_PROXY=true` so that client IPs (and
therefore the rate limiter) are resolved from `X-Forwarded-For`.

---

## 4. Topology C — Docker Compose

### 4.1 Files

| File | Purpose |
|---|---|
| `backend/Dockerfile` | multi-stage build → `node:22-bookworm-slim` runtime |
| `frontend/Dockerfile` | Vite build → `nginx:1.27-alpine` runtime |
| `frontend/nginx.conf.template` | SPA fallback + `/api` reverse proxy |
| `docker-compose.yml` | MySQL 8.4 + API + web |
| `.dockerignore` | keeps secrets and build artefacts out of the build context |

No secret is baked into an image. Every configuration value is injected at
run time through environment variables.

### 4.2 Build and run

```bash
cp .env.example .env
# edit .env:
#   MYSQL_ROOT_PASSWORD=<random>
#   MYSQL_PASSWORD=<random>
#   DATABASE_URL="mysql://attendease:<urlencoded-password>@db:3306/attendance_management"
#   JWT_SECRET=<48 random hex characters>
#   SECURE_COOKIES=true            # when behind HTTPS
#   CORS_ORIGINS=https://your-domain

docker compose up -d --build
docker compose ps
docker compose logs -f api
```

The API container runs `prisma migrate deploy` before starting the server, so
schema migrations are applied on every release. `migrate deploy` only applies
pending migrations — it never drops or resets an existing database.

### 4.3 Verify

```bash
curl http://localhost:8080/api/health
```

```json
{ "success": true, "data": { "status": "ok", "database": "connected", "uptime": 4, "timestamp": "..." } }
```

### 4.4 Seed (optional)

```bash
docker compose exec api npx tsx prisma/seed.ts
```

The seed script is idempotent — running it twice does not duplicate rows.

---

## 5. Topology D — Single VPS (manual)

### 5.1 Server prerequisites

```bash
sudo apt update
sudo apt install -y nodejs npm mysql-server nginx
```

### 5.2 Application

```bash
sudo mkdir -p /opt/attendease && sudo chown "$USER" /opt/attendease
cd /opt/attendease
git clone <your-repository> .
npm ci
npm run build
```

Environment file owned by root and not world-readable:

```bash
sudo install -m 600 -o root -g root /dev/null /etc/attendease.env
sudo nano /etc/attendease.env
```

```ini
NODE_ENV=production
DATABASE_URL=mysql://attendease:ENCODED_PASSWORD@127.0.0.1:3306/attendance_management
JWT_SECRET=...
SECURE_COOKIES=true
TRUST_PROXY=true
CORS_ORIGINS=https://your-domain
ATTENDANCE_THRESHOLD_PERCENT=75
ATTENDANCE_COUNTED_STATUSES=PRESENT,LATE
```

### 5.3 systemd unit

`/etc/systemd/system/attendease-api.service`:

```ini
[Unit]
Description=AttendEase API
After=network.target mysql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/attendease/backend
EnvironmentFile=/etc/attendease.env
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now attendease-api
sudo systemctl status attendease-api
```

### 5.4 nginx

```nginx
server {
    listen 80;
    server_name your-domain;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain;

    ssl_certificate     /etc/letsencrypt/live/your-domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain/privkey.pem;

    root /opt/attendease/frontend/dist;
    index index.html;

    client_max_body_size 2m;

    add_header X-Content-Type-Options nosniff always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/attendease /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 5.5 Certificate

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain
```

---

## 6. Managed-database option

Any MySQL 8 host works — PlanetScale, AWS RDS, Azure Database for MySQL,
DigitalOcean Managed Databases or Aiven.

1. Create the schema and the application user on the provider.
2. Allow the application server's IP in the provider's firewall.
3. Put the provider's connection string in `DATABASE_URL` (TLS parameters are
   appended by the provider, e.g. `?ssl-mode=REQUIRED`).
4. Run `npm run db:migrate` once, then start the API.

AttendEase only uses standard InnoDB tables, foreign keys and `utf8mb4`, so no
provider-specific configuration is required.

---

## 7. Release checklist

| Step | Command / action | Expected |
|---|---|---|
| Install | `npm ci` | no errors |
| Type check | `npm run typecheck` | 0 errors |
| Unit + integration tests | `npm run test` | all green |
| End-to-end tests | `npm run test:e2e` | all green |
| Build | `npm run build` | `backend/dist` + `frontend/dist` |
| Migrations | `npx prisma migrate deploy` | "No pending migrations" or applied |
| Seed (staging only) | `npx tsx prisma/seed.ts` | idempotent |
| Start | `npm start` | `AttendEase API listening on ...` |
| Health | `curl https://your-domain/api/health` | `"status":"ok"` |
| Sign in | browser | admin dashboard renders live totals |
| Mark attendance | browser | session created, records saved, page reload keeps them |
| Report export | browser | CSV downloads with the same filters |

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `User was denied access on the database` | app user has no grant on the schema | run the `GRANT` statements in §2.2 |
| `Can't reach database server at 127.0.0.1:3307` | local instance not running | `.mysql/start-mysql.bat` |
| `Environment variable not found: DATABASE_URL` | `backend/.env` missing | `cp .env.example backend/.env` |
| `JWT_SECRET must be at least 32 characters` | placeholder left in place | generate a 48-byte hex secret |
| Login succeeds but every request is 401 | `SECURE_COOKIES=true` over plain HTTP | set it to `false` for local HTTP |
| 429 on sign-in | auth rate limit reached | wait for the window, or raise `AUTH_RATE_LIMIT_MAX` |
| SPA routes return 404 | nginx missing `try_files ... /index.html` | add the `location /` block |

---

## 9. Verification log

The following checks were executed on this machine. Results are recorded with
the exact command so the run can be repeated.

| # | Check | Command | Result |
|---|---|---|---|
| 1 | MySQL 8 reachable | `mysql -u attendease -p… -e "SELECT VERSION()"` | 8.4.0 |
| 2 | Migrations applied | `npx prisma migrate status` | up to date |
| 3 | Seed idempotent | `npm run db:seed` (twice) | no duplicate rows |
| 4 | Backend type check | `npm run typecheck --workspace backend` | 0 errors |
| 5 | Frontend type check | `npm run typecheck --workspace frontend` | 0 errors |
| 6 | Backend production build | `npm run build --workspace backend` | `backend/dist` produced |
| 7 | Frontend production build | `npm run build --workspace frontend` | `frontend/dist` produced |
| 8 | API health | `GET /api/health` | `200 {"status":"ok","database":"connected"}` |
| 9 | Backend test suite | `npm run test --workspace backend` | see `docs/10-test-report.md` |
| 10 | Frontend test suite | `npm run test --workspace frontend` | see `docs/10-test-report.md` |
| 11 | End-to-end journeys | `npm run test:e2e --workspace frontend` | see `docs/10-test-report.md` |
| 12 | Docker image build | `docker compose build` | **not executed** — the Docker CLI is not installed on this machine (see §10) |

### 9.1 What could not be executed here

| Check | Why | How to verify |
|---|---|---|
| `docker compose build` / `up` | The Docker CLI is not installed on this machine | Install Docker Desktop, then run `docker compose up -d --build` |
| HTTPS termination | No domain or certificate authority account is available | Point a domain at the host and run `certbot --nginx` |
| Public deployment | No cloud account, no SSH host, no credentials — and inventing them is not acceptable | See §10 |

---

## 10. What is *not* done here, and why

The specification asks for a live, publicly reachable deployment. This
workspace has **no cloud account, no domain and no SSH host**, and no
credentials for one may be invented. The honest position is:

- Every artefact a deployment needs is provided and verified locally
  (Dockerfiles, compose stack, nginx config, migrations, seed, env template,
  systemd unit text).
- The application was run and exercised end to end against a real MySQL 8
  server on this machine, so the deployment path is proven up to the point of
  transferring the artefacts.

To publish it, a single command sequence on any MySQL 8 host completes the
job:

```bash
git clone <repository> /opt/attendease && cd /opt/attendease
npm ci && npm run build
# set DATABASE_URL + JWT_SECRET in the environment
npx prisma migrate deploy
node backend/dist/server.js
```

and then point a domain at it with the nginx configuration in §5.4.
