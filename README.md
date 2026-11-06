# Seonology Clock Page

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

Seonology Clock Page is a personal operations dashboard with clocks, bookmarks, developer tools, infrastructure views, file browsers, and chat. React and an Express API run in one nginx-based container. The repository also contains the Seonology Toolkit browser extension and the separate Seonology Bookmark Sync extension, which synchronizes bookmarks from selected Chrome folders and also provides tab statistics and tab activation.

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
| `chrome-extension/` | Seonology Bookmark Sync: selected-folder bookmark synchronization, tab statistics and tab activation |
| `scripts/` | Container smoke, release planning/publishing and token backup recovery |
| `k8s/` | Reference manifests; Argo CD uses the central GitOps path below |

## Tools and API routes

Split and Classic layouts provide search, weather, bookmarks and visual effects. The clock catalog defines 12 themes. The web launcher and Toolkit extension use the same catalog with surface-specific loaders. Some IDs differ: web `subnet`, `textcounter`, `excel`, `ip` correspond to extension `cidr`, `textcount`, `excel2md`, `iplookup`.

![Tool surface mapping](docs/svg/tool-landscape.svg)

`/?embed=1&tool=<id>` or `/?embed=true&tool=<id>` opens one web tool without the dashboard shell. For example, `/?embed=1&tool=json` opens the JSON formatter. The embedding route uses web tool IDs. The Toolkit extension loads from `toolkit-extension/dist` after `npm run build --prefix toolkit-extension`.

Load Bookmark Sync as an unpacked extension from `chrome-extension/`; Toolkit uses the built `toolkit-extension/dist` directory.

These tools use the following surfaces.

| Tool ID | Web | Popup | New tab | Context menu |
|---|---|---|---|---|
| `regex` | Yes | Yes | Yes | No |
| `unit` | Yes | Yes | Yes | No |
| `cron` | Yes | Yes | Yes | No |
| `markdown` | Yes | No | Yes | No |
| `rbac` | Yes | No | Yes | No |
| `textcount` | No | Yes | Yes | Yes |

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
BOOKMARKS_DIR="${TMPDIR:-/tmp}/seonology-clock-page-local" npm run dev --prefix api
```

Open `http://localhost:5173`; the web API client uses `http://localhost:3001` when the hostname is `localhost`. Vite has no API proxy. The API defaults to port `3001`, and `PORT` changes it. Runtime settings are read from the process environment. Keep credentials outside tracked files.

## Quality checks

The repository contract checks README structure, identical command blocks, localized image links, SVG layout rules, governance files, workflow boundaries and GitHub workflow checksums. Gitea CI also runs lint, unit/API/browser checks, builds, production dependency audits and container smoke.

| Focused suite | Scope |
|---|---|
| `api/test/bookmark-url-security.test.js` | External bookmark URLs |
| `api/test/oauth-transaction.test.js` | One-time OAuth transactions |
| `api/test/nas-path-policy.test.js` | Allowed NAS paths |
| `api/test/cloud-token-store.test.js` | Encrypted cloud token storage |
| `api/test/cors-policy.test.js` | Allowed browser origins (CORS) |
| `api/test/upload-boundaries.test.js` | Upload size/count/target boundaries |
| `tests/unit/browser-message-security.test.js` | Browser message origin/source |

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


`CLOUD_TOKEN_ENCRYPTION_KEY` must decode to exactly 32 bytes: 64 hexadecimal digits, 44-character Base64 ending in `=`, or a UTF-8 string of exactly 32 bytes. Google Drive requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, a matching `GOOGLE_REDIRECT_URI` and the encrypted token store. OneDrive requires the corresponding `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_REDIRECT_URI` and the same store. When a provider is not configured, its OAuth start route and file operations such as `/api/gdrive/files` or `/api/onedrive/files` return HTTP `503`. The status routes `/api/gdrive/status` and `/api/onedrive/status` instead return HTTP `200` with `connected: false` and `configured: false`. Read those JSON fields to determine configuration and connection status. Other API features remain available. Register local callback URLs with the OAuth provider and set the matching redirect environment variable.

Keep credentials out of logs, fixtures, issues and CI/workflow output.

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

| Workflow source | Exact step names, in order |
|---|---|
| [ci.yml](.gitea/workflows/ci.yml#L21) | `Check out the exact Gitea revision` → `Verify Node.js 24` → `Install locked dependencies` → `Verify repository policy` → `Lint and run unit tests` → `Install Chromium and run browser tests` → `Build production assets` → `Audit production dependencies` → `Verify the production container` |
| [image.yml](.gitea/workflows/image.yml#L24) | `Check out the exact Gitea revision` → `Verify repository policy` → `Configure a multi-platform builder` → `Log in to Gitea Registry` → `Build and publish the OCI index` → `Verify both published platforms` |
| [release.yml](.gitea/workflows/release.yml#L25) | `Check out the exact Gitea revision` → `Resolve and verify the release tag` → `Verify repository policy` → `Configure a multi-platform builder` → `Log in to Gitea Registry` → `Publish an immutable release image when absent` → `Create the Gitea release when absent` |

Image inspection succeeds: skip the release image build; inspection fails: build it. Both paths then check `amd64` and `arm64`. The Gitea release lookup ends on HTTP `200`, creates on `404`, and fails on other statuses.

| Actions secret | Workflows and purpose |
|---|---|
| `CI_TOKEN` | CI, Image and Release checkout; Image/Release registry login; Release API authentication |
| `PACKAGE_USER` | Image and Release registry login username |


## Central GitOps deployment

Argo CD Application `seonology-clock-page` reads `https://git.seonology.com/seonology/seonology-k3s.git`, revision `HEAD`, path `workloads/seonology-clock-page`, namespace `seonology-apps`. Automatic synchronization enables `prune` and `selfHeal`. Its Kustomization selects `git.seonology.com/seonology/seonology-clock-page:sha-7192892f4d21`.

The Application's Image Updater annotations separately select `ghcr.io/seonnoh/seonology-clock-page`, the `semver` strategy, git write-back to `main`, and a Kustomization target. The Gitea image workflow publishes the Gitea Registry image and its 12-digit SHA tags.

![Access and storage boundaries](docs/svg/security-boundaries.svg)

Traefik routes `clock.seonology.com` through `kube-system/keycloak-auth` and TLS option `kube-system/seonology-tls-no-mtls`. API/health paths have priority `200`; UI has priority `10` and adds the console embed middleware permitting `https://www.seonology.com` as a frame ancestor. The ClusterIP Service maps port `80` to nginx's named `http` port `8080`.

The Deployment uses one replica with `Recreate`, UID/GID `10001`, dropped capabilities, no privilege escalation, and `RuntimeDefault` seccomp. `clock-bookmarks-cp` is a 64 MiB `local-path` PVC mounted at `/data`; the pod declares `backup.velero.io/backup-volumes: bookmarks-data`. `/tmp`, `/var/cache/nginx`, and `/var/run/nginx` use `emptyDir`. External Secrets reads Vault through `vault-cluster`, refreshing hourly; Worklog certificates mount read-only at `/cred/worklog`. The service account has read-only `get/list` access to Ingresses, IngressRoutes, nodes and node metrics.

The Agent Platform `agent-api-ingress` NetworkPolicy allows TCP `8080` from pods labeled `app: seonology-clock-page` in namespace `seonology-apps` to the Agent API.

With cluster read permissions and registry access, inspect the Application, workload, logs, deployed image, local health response and OCI platforms with these commands.

```sh
# Gitea source repository
git clone https://git.seonology.com/seonology/k3s-managed-seonology-clock-page.git
cd k3s-managed-seonology-clock-page
git remote get-url origin

# Read-only workload inspection
kubectl -n argocd get application seonology-clock-page
kubectl -n seonology-apps get deployment,service seonology-clock-page
kubectl -n seonology-apps get pods -l app=seonology-clock-page
kubectl -n seonology-apps rollout status deployment/seonology-clock-page --timeout=60s
kubectl -n seonology-apps logs deployment/seonology-clock-page --tail=100
kubectl -n seonology-apps get deployment seonology-clock-page -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
kubectl -n seonology-apps exec deployment/seonology-clock-page -- node -e 'fetch("http://127.0.0.1:8080/health").then(async r => { console.log(r.status, await r.text()); if (!r.ok) process.exitCode = 1; })'
docker buildx imagetools inspect git.seonology.com/seonology/seonology-clock-page:main
```

## Contributions and license

Use an English Conventional Commit title and a Korean body describing the reason and impact. Keep the README sections, command blocks and three language variants of each diagram aligned. Update diagrams using the existing filenames and pedia records. Do not add automated authorship signatures or co-author trailers.

The project uses the [MIT License](LICENSE). Contribution details are in [CONTRIBUTING.md](CONTRIBUTING.md); documentation layout is defined in [README_STRUCTURE.md](README_STRUCTURE.md).

Related implementation details: [frontend module boundaries](docs/architecture.md#프런트엔드-모듈-경계), [secret configuration](docs/security.md#비밀값과-구성), [input/output boundaries](docs/security.md#입력-및-출력-경계), [token backup recovery](docs/runbook.md#cloud-token-%EB%A7%88%EC%9D%B4%EA%B7%B8%EB%A0%88%EC%9D%B4%EC%85%98-%EB%B3%B5%EA%B5%AC) and [rollback](docs/runbook.md#롤백).
