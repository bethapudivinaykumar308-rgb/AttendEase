# syntax=docker/dockerfile:1
#
# AttendEase web client - production image (static build served by nginx).
#
# Build from the repository root:
#   docker build -f frontend/Dockerfile -t attendease/web .
#
# The nginx layer reverse proxies /api to the API container so the browser
# only ever talks to one origin. That keeps the session and CSRF cookies
# first-party and avoids CORS entirely in production.

# ---------------------------------------------------------------- build stage
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm ci --workspace frontend --include-workspace-root

COPY frontend ./frontend

WORKDIR /app/frontend

# Leave VITE_API_URL empty so the client calls the same origin (/api/...).
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# -------------------------------------------------------------- runtime stage
FROM nginx:1.27-alpine AS runtime

COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
