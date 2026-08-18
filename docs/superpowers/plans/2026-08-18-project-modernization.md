# Clock Project Modernization Implementation Plan

> **For agentic workers:** Implement this plan task-by-task, dispatching a fresh subagent per independent task where possible. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 기능과 API 계약을 유지하면서 보안 취약점, 중복 UI 상태, 취약 저장·업로드 경계와 배포 품질 문제를 제거하고 검증된 native minor 릴리스를 배포한다.

**Architecture:** 직렬화 가능한 공통 도구 catalog와 surface별 lazy registry를 사용하고, 웹은 단일 dialog 상태를 갖는다. API는 테스트 가능한 `createApp`, 원자적 저장소, OAuth transaction, NAS path policy를 경계로 분리한다. 릴리스는 quality/container gate 뒤 native planner가 계산한 version으로 image를 만들고, image 성공 뒤 publisher가 commit/tag/Release를 원자적으로 게시한다.

**Tech Stack:** React 19, Vite 7, Express 5, Vitest, Testing Library, Supertest, Playwright, DOMPurify, Node 24 LTS, nginx, Docker, GitHub Actions, Argo CD

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-18-project-modernization-design.md`
- 기존 URL, API 성공 응답, Chrome 확장 프로그램 진입 경로를 유지한다.
- production credential을 코드·fixture·로그에 기록하지 않는다.
- 이번 릴리스에서는 Vite 8, ESLint 10, Kubernetes client 2로 올리지 않는다.
- JSON/PVC와 단일 replica 운영 모델을 유지한다.
- 모든 동작 변경은 실패하는 테스트를 먼저 확인한다.
- 커밋 title은 영어 Conventional Commit, body는 한국어로 작성한다.

---

### Task 1: Frontend Content Security

**Files:**
- Create: `packages/toolkit-core/package.json`
- Create: `packages/toolkit-core/src/markdown.js`
- Create: `tests/unit/markdown-security.test.js`
- Create: `tests/unit/mermaid-security.test.js`
- Modify: `src/utils/markdown.js`
- Modify: `src/components/MarkdownPreview.jsx`
- Modify: `src/components/ChatPanel.jsx`
- Modify: `src/components/MermaidEditor.jsx`
- Modify: `toolkit-extension/src/utils/markdown.js`
- Modify: `toolkit-extension/src/tools/MarkdownPreview.jsx`
- Modify: `toolkit-extension/src/tools/MermaidEditor.jsx`
- Modify: `package.json`, `package-lock.json`
- Modify: `toolkit-extension/package.json`, `toolkit-extension/package-lock.json`

**Interfaces:**
- Produces: `renderSafeMarkdown(source): string`, `sanitizeRenderedHtml(html): string`, `sanitizeMermaidSvg(svg): string`
- Consumers: 웹 preview/chat/export와 extension preview/export

- [ ] 안전하지 않은 HTML, event attribute, `javascript:` URL이 제거되고 기존 Markdown 문법이 보존되는 실패 테스트를 작성한다.
- [ ] `npx vitest run tests/unit/markdown-security.test.js`가 현재 raw HTML 보존 때문에 실패하는지 확인한다.
- [ ] `packages/toolkit-core`에 DOMPurify 기반 sanitizer와 안전한 Markdown entrypoint를 구현하고 두 surface가 같은 함수를 사용하게 한다.
- [ ] Mermaid strict 초기화, sanitized SVG, 최신 request sequence만 반영하는 실패 테스트를 작성하고 실패를 확인한다.
- [ ] 웹과 extension Mermaid를 동적 import하고 sanitized SVG만 표시·export하도록 구현한다.
- [ ] 단위 테스트, 웹 build, extension 독립 install/build를 실행한다.
- [ ] `fix: secure rendered tool content`로 커밋한다.

### Task 2: API Storage and OAuth Security

**Files:**
- Create: `api/app.js`, `api/server.js`
- Create: `api/config/index.js`
- Create: `api/infrastructure/storage/atomic-json-store.js`
- Create: `api/infrastructure/storage/encrypted-token-store.js`
- Create: `api/domains/cloud/oauth-transaction.js`
- Create: `api/test/atomic-json-store.test.js`
- Create: `api/test/oauth-transaction.test.js`
- Create: `api/test/cloud-token-store.test.js`
- Modify: `api/index.js`, `api/cloud-drives.js`, `api/package.json`, `api/package-lock.json`

**Interfaces:**
- Produces: `createAtomicJsonStore({filePath, defaultValue, validate, mode})`
- Produces: `createOAuthTransactionStore({ttlMs, now, randomBytes})`
- Produces: `createEncryptedTokenStore({filePath, key})`
- Produces: `createApp(dependencies)` and `server.js` entrypoint

- [ ] missing/existing/malformed JSON과 concurrent update를 검증하는 실패 테스트를 작성한다.
- [ ] temp write, fsync, same-directory rename, per-file update queue, cloned default를 구현한다.
- [ ] OAuth state mismatch/expiry/replay/provider mismatch와 PKCE S256 실패 테스트를 작성한다.
- [ ] Google/Microsoft start와 callback에 일회성 state와 verifier를 연결한다.
- [ ] AES-256-GCM round-trip, wrong-key fail-closed, plaintext migration 실패 테스트를 작성하고 token store를 구현한다.
- [ ] hardcoded API/Grafana credential fallback을 제거하고 config missing 상태를 명시적 unavailable 응답으로 매핑한다.
- [ ] `createApp`와 `server.js`를 분리하되 기존 `node api/index.js` 호환 entrypoint 또는 Docker command를 함께 갱신한다.
- [ ] API 테스트와 `node --check` 전체를 실행한다.
- [ ] `fix: harden API state and credentials`로 커밋한다.

### Task 3: NAS and Upload Boundaries

**Files:**
- Create: `api/domains/nas/path-policy.js`
- Create: `api/domains/nas/nas-uploader.js`
- Create: `api/domains/cloud/onedrive-uploader.js`
- Create: `api/test/nas-path-policy.test.js`
- Create: `api/test/upload-boundaries.test.js`
- Modify: `api/index.js`, `api/cloud-drives.js`
- Modify: `src/components/CloudBrowser.jsx`, `src/components/NasBrowser.jsx`

**Interfaces:**
- Produces: `createNasPathPolicy({allowedRoots}).assertPath(path)` and `.assertName(name)`
- Produces: `uploadOneDriveChunks({stream, size, session, chunkSize, signal})`
- Consumes: Task 2 config and error mapping

- [ ] traversal, sibling-prefix, relative path, NUL/CRLF/backslash와 invalid sort/dir이 거부되는 실패 테스트를 작성한다.
- [ ] path/name policy를 구현하고 NAS list/mkdir/rename/delete/move/upload 전에 적용한다.
- [ ] upload size/file-count/field-order/client-abort/upstream non-2xx/backpressure 실패 테스트를 작성한다.
- [ ] UI가 대상 path/id를 query 또는 header로 먼저 전송하고 서버는 기존 field 입력도 병행 수용하게 한다.
- [ ] OneDrive 전체 buffering을 upload-session 순차 chunk 전송으로 교체하고 NAS write backpressure를 처리한다.
- [ ] `rejectUnauthorized: false`를 제거하고 CA/hostname config 검증을 추가한다.
- [ ] API·웹 관련 테스트와 build를 실행한다.
- [ ] `fix: validate storage operations and uploads`로 커밋한다.

### Task 4: Shared Tool Catalog and Dialog State

**Files:**
- Create: `packages/toolkit-core/src/catalog.js`
- Create: `src/features/tool-launcher/toolRegistry.web.js`
- Create: `src/features/tool-launcher/dialog-state.js`
- Create: `tests/unit/tool-catalog.test.js`
- Create: `tests/unit/dialog-state.test.js`
- Modify: `src/App.jsx`, `src/App.css`
- Modify: `toolkit-extension/src/shared/registry.js`
- Modify: `toolkit-extension/src/popup/main.jsx`
- Modify: `toolkit-extension/src/newtab/main.jsx`
- Modify: `tests/modal-overlay-motion.spec.mjs`

**Interfaces:**
- Produces: `TOOL_CATALOG`, `WEB_TOOL_REGISTRY`, `openTool(state,id)`, `closeTopDialog(state)`
- Consumes: Task 1 shared package and safe tool components

- [ ] duplicate ID, missing metadata, invalid surface와 loader 누락을 검출하는 실패 테스트를 작성한다.
- [ ] 기존 extension metadata를 공통 catalog로 옮기고 surface별 registry에서 lazy component를 한 번만 생성한다.
- [ ] tool 선택 시 launcher가 닫히고 active dialog가 하나만 남는 상태 테스트를 작성한다.
- [ ] App의 도구 boolean과 Escape else-if 체인을 `activeToolId`와 공통 open/close 함수로 교체한다.
- [ ] 검색을 registry 파생값으로 바꾸고 DOM `style` 조작을 제거한다.
- [ ] Playwright에 overlay 하나, 빠른 연속 클릭, Escape, mobile, reduced-motion 회귀를 추가한다.
- [ ] main JS gzip과 초기 chunk 크기를 기준선과 비교한다.
- [ ] `refactor: centralize tool registry and dialogs`로 커밋한다.

### Task 5: Quality Gates and Safe Dependency Patches

**Files:**
- Modify: `eslint.config.js`
- Create: `vitest.config.js`
- Create: `api/vitest.config.js`
- Modify: `.github/workflows/release.yaml`
- Modify: `package.json`, `package-lock.json`
- Modify: `api/package.json`, `api/package-lock.json`
- Modify: `toolkit-extension/package.json`, `toolkit-extension/package-lock.json`
- Modify: `.dockerignore`

**Interfaces:**
- Produces scripts: `test:unit`, `test:api`, `test:e2e`, `verify`
- Consumes: Tasks 1-4 tests

- [ ] ESLint config를 browser, Node/CommonJS, test, extension 경계로 나누고 generated/worktree 경로를 ignore한다.
- [ ] 기존 1,354 lint 오류를 환경 오류, 실제 correctness 오류, compiler advisory로 분류해 실제 오류를 수정하고 gate를 0 error로 만든다.
- [ ] React 19.2.8, Vite 7.3.6, Mermaid 11.16.1 등 현재 major의 안전 패치를 명시적으로 적용한다.
- [x] root·API·extension의 production audit High 0을 release gate로 통합한다. semantic-release 계열 의존성은 bundled npm 취약점 때문에 제거하고 `npx` 우회 없이 세 lockfile을 함께 검증한다.
- [ ] quality workflow가 install, lint, unit/API, Playwright, web/extension build, audit를 실행하게 한다.
- [x] Node 표준 라이브러리와 git으로 read-only release planner를 추가한다. stable tag는 SemVer 최대값을 사용하고 VERSION과 불일치하면 중단한다. breaking change는 type allowlist와 무관하게 우선 계산하며 no-release에서는 파일·network·git mutation을 수행하지 않는다.
- [x] image 성공 후에만 publisher가 VERSION/결정적 CHANGELOG, release commit, annotated tag, GitHub REST Release를 생성하도록 workflow를 plan/image/publish로 분리한다. image는 push 전에 load한 planned artifact를 `SMOKE_SKIP_BUILD=1`과 계획 version으로 smoke하고, publisher는 atomic push·stale SHA 차단·원격 annotated tag/commit/VERSION/changelog provenance를 검증한 GitHub API-only recovery를 수행한다.
- [ ] Actions를 최소 권한과 immutable SHA로 고정한다.
- [ ] `chore: enforce release quality gates`로 커밋한다.

### Task 6: Runtime, Health, and Documentation

**Files:**
- Modify: `Dockerfile`, `nginx.conf`, `.nvmrc`, `package.json`
- Modify: `k8s/deployment.yaml`, `README.md`
- Create: `docs/architecture.md`, `docs/security.md`, `docs/runbook.md`

**Interfaces:**
- Produces: `/health` composite contract and reproducible container smoke commands
- Consumes: Task 2 `server.js` and health response

- [ ] Node 24 LTS를 local engine, CI, build/runtime image에 통일한다.
- [ ] nginx의 `/health`가 API health를 확인하고 API 종료 시 readiness가 실패하는 container test를 작성한다.
- [ ] Node와 nginx에 종료 신호가 전달되는 init/supervision entrypoint를 적용한다.
- [ ] upload route별 nginx 제한과 현대적 보안 header를 적용한다.
- [ ] 저장소 `k8s/`가 non-authoritative임을 명시하고 라이브 GitOps SSOT를 문서화한다.
- [x] 로컬 실행, 환경변수, 보안 경계, release, smoke, rollback runbook을 작성한다. release 문서는 native planner/publisher, `GITHUB_TOKEN` 비노출 오류 처리, planned image smoke, `release-main` 직렬화와 stale-plan/API-only recovery 검증을 설명한다.
- [ ] Docker build/run smoke를 실행한다.
- [ ] `chore: modernize runtime and operations`로 커밋한다.

### Task 7: Integration Review and Release

**Files:**
- Verify all modified files and generated release artifacts
- External clean worktree: `seonology-k3s` only if live manifest changes are required

**Interfaces:**
- Consumes: Tasks 1-6 commits
- Produces: reviewed branch, native minor release, deployed image digest

- [ ] plan/spec 요구사항을 diff와 테스트 목록에 대조한다.
- [ ] fresh reviewer가 security, compatibility, data-loss, deployment findings를 검토하고 Critical/Important를 수정한다.
- [ ] `npm run verify`, 세 production audit, 두 build, API syntax, Docker smoke를 새로 실행한다.
- [ ] live secret, NAS CA/hostname, PVC JSON/token migration readiness를 read-only preflight한다.
- [ ] 이번 modernisation history에는 `feat: add native release planner and publisher`가 있으므로 다음 release가 minor임을 확인한다. 과거 계획의 patch baseline은 당시의 historical assumption으로만 보존한다.
- [ ] branch를 origin에 push하고 승인된 main 통합 경로로 반영한다.
- [ ] native release workflow의 planned version, GHCR image tag/digest, static artifact version, atomic tag와 GitHub Release를 확인한다.
- [ ] Argo CD Image Updater write-back, Application Synced/Healthy, rollout을 확인한다.
- [ ] 인증된 브라우저에서 대표 도구, Markdown/Mermaid, Escape, backdrop, read-only API smoke를 수행한다.
- [ ] 실패 시 runbook의 GitOps rollback을 수행하고 원인을 기록한다.
- [ ] Outline Work History에 실제 명령, 결과, 커밋, release, image digest를 업로드한다.
