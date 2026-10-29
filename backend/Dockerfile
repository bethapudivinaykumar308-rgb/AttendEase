# syntax=docker/dockerfile:1
#
# AttendEase API - production image.
#
# Build from the repository root:
#   docker build -f backend/Dockerfile -t attendease/api .
#
# The image contains no secrets: every configuration value is injected at run
# time through environment variables (see .env.example).

# ---------------------------------------------------------------- build stage
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# openssl is required by the Prisma query engine.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy the manifests first so the dependency layer is cached.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm ci --workspace backend --include-workspace-root

COPY backend ./backend

WORKDIR /app/backend
RUN npx prisma generate && npm run build

# -------------------------------------------------------------- runtime stage
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/backend/package.json ./backend/package.json

WORKDIR /app/backend

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${API_PORT:-5000}/api/health" || exit 1

# `prisma migrate deploy` applies only the pending migrations. It never drops
# or resets an existing database.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
