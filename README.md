# Seonology Clock Page

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

Seonology Clock Page is a personal operations dashboard with clocks, bookmarks, developer tools, infrastructure views, file browsers, and chat. React and an Express API run in one nginx-based container. The repository also contains the Seonology Toolkit browser extension and a separate browser tab statistics extension.

Gitea `seonology/k3s-managed-seonology-clock-page` is the source repository. Its push mirror copies branches and tags to GitHub `seonNoh/k3s-managed-seonology-clock-page` with `sync_on_commit: true`.

![Runtime architecture](docs/svg/architecture.svg)

## Runtime architecture and repository map

nginx serves the Vite build on `8080` and forwards `/api/` and `/health` to Express at `127.0.0.1:3001`. `tini` starts a shell supervisor for nginx and `api/server.js`; the supervisor stops both processes when either exits. `/health` returns the API response rather than the frontend fallback. The image uses UID/GID `10001`; the central Kubernetes Deployment sets a read-only root filesystem.

| Path | Responsibility |
|---|---|
| `src/` | Split/Classic dashboards, clock themes, web tools and embedded tools |
| `api/` | Express routes, integration clients and persistent JSON/image storage |
| `packages/toolkit-core/` | Tool metadata, supported surfaces and Markdown utilities |
| `toolkit-extension/` | Manifest V3 extension with popup, new tab and context actions |
| `chrome-extension/` | Separate tab statistics and tab activation extension |
| `scripts/` | Container smoke, release planning/publishing and token backup recovery |
| `k8s/` | Reference manifests; Argo CD uses the central GitOps path below |

## Tools and API routes

Split and Classic layouts provide search, weather, bookmarks and visual effects. The clock catalog defines 12 themes. The web launcher and Toolkit extension use the same catalog with surface-specific loaders. Some IDs differ: web `subnet`, `textcounter`, `excel`, `ip` correspond to extension `cidr`, `textcount`, `excel2md`, `iplookup`.

![Tool surface mapping](docs/svg/tool-landscape.svg)

`/?embed=1&tool=<id>` or `/?embed=true&tool=<id>` opens one web tool without the dashboard shell. For example, `/?embed=1&tool=json` opens the JSON formatter. The embedding route uses web tool IDs. The Toolkit extension loads from `toolkit-extension/dist` after `npm run build --prefix toolkit-extension`.

| API | Purpose |
|---|---|
| `GET /health`, `GET /api/services` | Health response and Kubernetes service discovery |
| `GET/PUT /api/bookmarks` | Bookmark collection; category/item routes support add, edit and delete |
| `/api/todos`, `/api/notes`, `/api/chat/history` | Persistent tasks, notes and conversation history |
| `GET /api/chat/models`, `POST /api/chat/gemini` | Model list and Gemini chat |
| `POST /api/chat/{provider}` | Agent Platform chat for supported harness providers |
| `GET /api/infra/{cluster,tailscale,nas}` | Infrastructure status |
| `/api/nas/*`, `/api/gdrive/*`, `/api/onedrive/*` | File listing, folder operations, uploads and downloads |
| `GET /api/auth/{google,microsoft}` | OAuth authorization; callbacks end in `/callback` |
| `GET/POST /api/clipboard/images`, `GET/DELETE /api/clipboard/images/:id` | Clipboard image storage |
| `GET /api/github/repos`, `GET /api/github/repos/stream`, `POST /api/github/repos/refresh` | Repository catalog, SSE and refresh |
| `GET /api/briefing/{latest,mails,events,stream}` | Worklog briefing and SSE notifications |
| `GET /api/jma/*`, `GET /api/sapporo-events/*`, `GET /api/suggest` | Weather warnings, events and search suggestions |
| `GET /api/icons/{index,svg}`, `GET/POST /api/browser-stats` | Icon proxy and browser extension statistics |

The repository catalog refresh interval defaults to five minutes, starting five seconds after startup. Event scraping also starts after five seconds and then runs every 24 hours. Briefing data has a 60-second cache and receives NATS `work.briefing.>` notifications.

## Local development

Node.js `>=24.15 <25` is required; `.nvmrc` selects `24.15.0`. Root, API and Toolkit dependencies have separate lockfiles. Install each set and run frontend and API in separate terminals.

```sh
npm ci
npm ci --prefix api
npm ci --prefix toolkit-extension
npm run dev
# In another terminal
npm run dev --prefix api
```

Open `http://localhost:5173`; the web API client uses `http://localhost:3001` when the hostname is `localhost`. Vite has no API proxy. The API defaults to port `3001`, and `PORT` changes it. Runtime settings are read from the process environment. Keep credentials outside tracked files.

## Quality checks

The repository contract checks README structure, identical command blocks, localized image links, SVG layout rules, governance files, workflow boundaries and GitHub workflow checksums. Gitea CI also runs lint, unit/API/browser checks, builds, production dependency audits and container smoke.

```sh
python3 verify.py --repository .
npm run lint
npm run test:unit
npm run test:api
npm run test:e2e
npm run build
npm audit --omit=dev --audit-level=high
npm audit --prefix api --omit=dev --audit-level=high
npm audit --prefix toolkit-extension --omit=dev --audit-level=high
npm run smoke:container
```

`npm run test:e2e` builds the Toolkit extension through `pretest:e2e`. Browser checks require Playwright Chromium. Container smoke requires Docker and checks HTTP health, read-only mounts, and health failure after stopping the API. CI rejects production dependency audit findings at high severity or above.

## Runtime configuration

| Variable | Default or role |
|---|---|
| `PORT`, `BOOKMARKS_DIR` | `3001`, `/data` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated origins; default: `https://clock.seonology.com`, `http://localhost:5173`, `http://127.0.0.1:5173` |
| `CLOUD_TOKEN_ENCRYPTION_KEY` | Cloud token encryption key |
| `CLIPBOARD_DIR`, `CLIPBOARD_MAX_IMAGE_BYTES`, `CLIPBOARD_MAX_TOTAL_BYTES`, `CLIPBOARD_MAX_ITEMS` | `/data/clipboard`, 25 MiB, 256 MiB, 100; directory follows `BOOKMARKS_DIR` |
| `GEMINI_API_KEY`, `AGENT_PLATFORM_URL`, `AGENT_TOKEN_URL`, `AGENT_CLIENT_ID`, `AGENT_CLIENT_SECRET` | Gemini and Agent Platform credentials/endpoints; Agent API defaults to `http://agent-api.agent-platform.svc.cluster.local:8080` |
| `AGENT_TIMEOUT_MS`, `AGENT_POLL_INTERVAL_MS` | `180000`, `1000`; token endpoint defaults to `https://auth.seonology.com/realms/master/protocol/openid-connect/token` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google Drive OAuth; callback defaults to `https://clock.seonology.com/api/auth/google/callback` |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_REDIRECT_URI` | OneDrive OAuth; callback defaults to `https://clock.seonology.com/api/auth/microsoft/callback` |
| `NAS_HOST`, `NAS_PORT`, `NAS_ACCOUNT`, `NAS_PASSWORD`, `NAS_ALLOWED_ROOTS`, `NAS_CA_PATH`, `NAS_TLS_SERVERNAME` | NAS connection, allowed roots and TLS settings; port defaults to `5001` |
| `NAS_MAX_UPLOAD_BYTES`, `NAS_MAX_UPLOAD_FILES` | 11 GiB, 1 file |
| `GRAFANA_URL`, `GRAFANA_USER`, `GRAFANA_PASS`, `TAILSCALE_OAUTH_CLIENT_ID`, `TAILSCALE_OAUTH_CLIENT_SECRET` | Infrastructure integrations; Grafana URL defaults to `https://grafana.seonology.com` |
| `GITHUB_CATALOG_TOKEN`, `CATALOG_INTERVAL_MS` | Catalog token and interval `300000`; token falls back to `GITHUB_TOKEN` |
| `WORKLOG_API_BASE`, `WORKLOG_CLIENT_CERT_FILE`, `WORKLOG_CLIENT_KEY_FILE`, `NATS_URL`, `NATS_USER`, `NATS_PASSWORD` | Worklog mTLS and NATS briefing subscription |
| `ICONS_BASE`, `DOORKEEPER_TOKEN`, `CONNPASS_API_KEY` | Icon service `http://seonology-svg-studio` and event integrations |

`BOOKMARKS_DIR` holds `bookmarks.json`, `todos.json`, `notes.json`, `chat-history.json`, `cloud-tokens.json`, `clipboard-images.json` and the clipboard image directory. nginx limits normal requests to 1 MiB, clipboard uploads to 32 MiB, and NAS/Drive uploads to 12 GiB; the API applies the individual file limits.

## CI/CD and releases

![Workflow branches](docs/svg/delivery.svg)

| Workflow / job | Trigger | Steps and result |
|---|---|---|
| `.gitea/workflows/ci.yml` / `quality` | `main` push, pull request targeting `main`, `workflow_dispatch` | Checkout → Node 24 check → three dependency installs → repository policy → lint/unit/API → Chromium/browser → web build → production audits → container smoke |
| `.gitea/workflows/image.yml` / `publish` | `main` push, `workflow_dispatch` | Checkout → repository policy → multi-platform builder → registry login → publish → platform check; `linux/amd64` and `linux/arm64`, tags `main` and `sha-<12 hex>` |
| `.gitea/workflows/release.yml` / `release` | `v*` tag push, `workflow_dispatch` with required `tag` | Checkout → tag/VERSION check → repository policy → builder → login → image existence check/publish → platform check → release existence check/create |

CI and Image start independently on a `main` push. There is no cross-workflow success dependency or dispatch chain. The registry image is `git.seonology.com/seonology/seonology-clock-page`. Release accepts `vX.Y.Z` only when `X.Y.Z` equals `VERSION`; it builds the version tag when its image is absent and creates a Gitea release when absent, using the last 50 commit subjects for notes.

The Gitea workflows do not calculate a version bump. `scripts/release-gate.mjs` contains the native planner: `feat` selects minor; `fix`, `chore`, `refactor`, `docs`, `perf` select patch; breaking changes select major from 1.x and minor for 0.x. `VERSION` supplies the build version; `package.json` is private and keeps `0.0.0`.

## Central GitOps deployment

Argo CD Application `seonology-clock-page` reads `https://git.seonology.com/seonology/seonology-k3s.git`, revision `HEAD`, path `workloads/seonology-clock-page`, namespace `seonology-apps`. Automatic synchronization enables `prune` and `selfHeal`. Its Kustomization selects `git.seonology.com/seonology/seonology-clock-page:sha-7192892f4d21`.

The Application's Image Updater annotations separately select `ghcr.io/seonnoh/seonology-clock-page`, the `semver` strategy, git write-back to `main`, and a Kustomization target. The Gitea image workflow publishes the Gitea Registry image and its 12-digit SHA tags.

![Access and storage boundaries](docs/svg/security-boundaries.svg)

Traefik routes `clock.seonology.com` through `kube-system/keycloak-auth` and TLS option `kube-system/seonology-tls-no-mtls`. API/health paths have priority `200`; UI has priority `10` and adds the console embed middleware permitting `https://www.seonology.com` as a frame ancestor. The ClusterIP Service maps port `80` to nginx's named `http` port `8080`.

The Deployment uses one replica with `Recreate`, UID/GID `10001`, dropped capabilities, no privilege escalation, and `RuntimeDefault` seccomp. `clock-bookmarks-cp` is a 64 MiB `local-path` PVC mounted at `/data`; the pod declares `backup.velero.io/backup-volumes: bookmarks-data`. `/tmp`, `/var/cache/nginx`, and `/var/run/nginx` use `emptyDir`. External Secrets reads Vault through `vault-cluster`, refreshing hourly; Worklog certificates mount read-only at `/cred/worklog`. The service account has read-only `get/list` access to Ingresses, IngressRoutes, nodes and node metrics.

The Agent Platform `agent-api-ingress` NetworkPolicy allows TCP `8080` from pods labeled `app: seonology-clock-page` in namespace `seonology-apps` to the Agent API.

## Contributions and license

Use an English Conventional Commit title and a Korean body describing the reason and impact. Keep the README sections, command blocks and three language variants of each diagram aligned. Update diagrams using the existing filenames and pedia records.

The project uses the [MIT License](LICENSE). Contribution details are in [CONTRIBUTING.md](CONTRIBUTING.md); documentation layout is defined in [README_STRUCTURE.md](README_STRUCTURE.md).
