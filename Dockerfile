# Build stage
FROM node:24.15-alpine AS builder

WORKDIR /app

ARG APP_VERSION

COPY package*.json ./
RUN npm ci

COPY . .
RUN if [ -n "$APP_VERSION" ]; then printf '%s\n' "$APP_VERSION" > VERSION; fi && npm run build && \
    node -e 'const fs = require("node:fs"); const version = fs.readFileSync("VERSION", "utf8").trim(); if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) process.exit(1); fs.writeFileSync("dist/app-version.json", JSON.stringify({ version }) + "\n")'

# Production stage
FROM node:24.15-alpine

WORKDIR /app

# tini forwards termination signals to the shell supervisor, which then stops
# both Node and nginx instead of leaving an orphaned child process behind.
RUN apk add --no-cache nginx tini && \
    addgroup -S -g 10001 app && \
    adduser -S -D -H -u 10001 -G app app && \
    sed -i '/^user /d; s#error_log /var/log/nginx/error.log warn;#error_log stderr warn;#; s#access_log /var/log/nginx/access.log main;#access_log /dev/stdout main;#' /etc/nginx/nginx.conf && \
    printf '%s\n' \
      'client_body_temp_path /tmp/nginx/client_body;' \
      'proxy_temp_path /tmp/nginx/proxy;' \
      'fastcgi_temp_path /tmp/nginx/fastcgi;' \
      'uwsgi_temp_path /tmp/nginx/uwsgi;' \
      'scgi_temp_path /tmp/nginx/scgi;' \
      > /etc/nginx/http.d/00-temp-paths.conf

# Copy API server
COPY api/package*.json ./api/
RUN cd api && npm ci --omit=dev

COPY api/ ./api/

# Copy built frontend
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/http.d/default.conf

# The image root filesystem is read-only at runtime. Kubernetes supplies only
# /data (PVC) and nginx's temporary directories as writable mounts.
RUN mkdir -p /data /tmp/nginx/client_body /tmp/nginx/proxy /tmp/nginx/fastcgi /tmp/nginx/uwsgi /tmp/nginx/scgi /var/cache/nginx /var/run/nginx && \
    chown -R app:app /app /data /tmp /var/cache/nginx /var/run/nginx /usr/share/nginx/html

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
      'mkdir -p /tmp/nginx/client_body /tmp/nginx/proxy /tmp/nginx/fastcgi /tmp/nginx/uwsgi /tmp/nginx/scgi /tmp/nginx/logs /var/cache/nginx /var/run/nginx' \
      'node /app/api/server.js & api_pid=$!' \
      'nginx -p /tmp/nginx -g "error_log stderr warn; pid /var/run/nginx/nginx.pid; daemon off;" & nginx_pid=$!' \
      'while kill -0 "${api_pid}" 2>/dev/null && kill -0 "${nginx_pid}" 2>/dev/null; do sleep 1; done' \
      'shutdown' \
      'wait "${api_pid}" 2>/dev/null || true' \
      'wait "${nginx_pid}" 2>/dev/null || true' \
      'exit 1' \
      > /usr/local/bin/seonology-clock-page && \
    chmod +x /usr/local/bin/seonology-clock-page

EXPOSE 8080 3001

USER app

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/usr/local/bin/seonology-clock-page"]
