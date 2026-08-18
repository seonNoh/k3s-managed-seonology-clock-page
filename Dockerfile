# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:24-alpine

WORKDIR /app

# tini forwards termination signals to the shell supervisor, which then stops
# both Node and nginx instead of leaving an orphaned child process behind.
RUN apk add --no-cache nginx tini

# Copy API server
COPY api/package*.json ./api/
RUN cd api && npm ci --omit=dev

COPY api/ ./api/

# Copy built frontend
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/http.d/default.conf

# Keep both daemons under one signal-aware supervisor. api/server.js is the
# Task 2 runtime entrypoint; it owns graceful HTTP-server shutdown.
RUN printf '%s\n' \
      '#!/bin/sh' \
      'set -u' \
      'api_pid=' \
      'nginx_pid=' \
      'shutdown() {' \
      '  [ -n "${api_pid}" ] && kill -TERM "${api_pid}" 2>/dev/null || true' \
      '  [ -n "${nginx_pid}" ] && kill -TERM "${nginx_pid}" 2>/dev/null || true' \
      '}' \
      'trap "shutdown; exit 0" INT TERM' \
      'node /app/api/server.js & api_pid=$!' \
      'nginx -g "daemon off;" & nginx_pid=$!' \
      'while kill -0 "${api_pid}" 2>/dev/null && kill -0 "${nginx_pid}" 2>/dev/null; do sleep 1; done' \
      'shutdown' \
      'wait "${api_pid}" 2>/dev/null || true' \
      'wait "${nginx_pid}" 2>/dev/null || true' \
      'exit 1' \
      > /usr/local/bin/seonology-clock-page && \
    chmod +x /usr/local/bin/seonology-clock-page

EXPOSE 80 3001

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/usr/local/bin/seonology-clock-page"]
