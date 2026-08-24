# Feature Parity, Cloud Storage, and Modal Correction Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Every production change requires a failing test first, and completion requires fresh full verification.

**Goal:** Split Console의 누락 기능을 복원하고 클라우드 토큰 마이그레이션, 공통 도구 디자인, 팝업 깜빡임을 수정하여 운영 환경에 배포한다.

**Architecture:** 즐겨찾기·서비스·검색·효과 설정을 공용 기능 모듈로 분리하여 Split과 Classic이 같은 구현을 사용한다. 개별 도구의 기능 DOM은 유지하고 공통 작업형 셸 토큰으로 시각 계약을 통일한다. 클라우드 토큰 저장소는 읽기 가능한 기존 평문 파일을 검증한 후 원자적으로 암호화 파일로 교체한다.

**Tech Stack:** React 19, Vite 7, CSS, Vitest, Node test runner, Playwright, Express, Node.js filesystem APIs, Docker, GitHub Actions, GHCR, Argo CD.

## Global Constraints

- 기본 레이아웃은 Split Console이며 Classic은 선택 가능한 호환 화면으로 유지한다.
- Light와 Dark를 모두 지원한다.
- 폰트는 JetBrains Mono를 유지한다.
- 작업형 셸의 모서리는 10px 이하, 내부 컨트롤은 7~8px를 기준으로 한다.
- 모달 오버레이는 첫 프레임부터 최종 dim 상태여야 한다.
- View Transition은 페이지 수준 전환에만 사용한다.
- 기존 토큰·즐겨찾기·Todo·Notes·Chat 데이터를 삭제하거나 초기화하지 않는다.
- 커밋 제목은 영어, 본문은 한국어로 작성하며 AI 서명을 넣지 않는다.

---

### Task 1: 기능 동등성 계약을 테스트로 고정한다

**Files:**
- Modify: `tests/dashboard-layout.spec.mjs`
- Create: `tests/unit/dashboard-capabilities.test.js`
- Modify: `src/features/dashboard/dashboardLinks.js`

**Interfaces:**
- Consumes: `WEB_TOOL_CATALOG`, `PREFERENCE_KEYS`, `DASHBOARD_LINK_GROUPS`
- Produces: `DASHBOARD_CAPABILITIES`, 두 레이아웃이 충족해야 하는 기능 ID 목록

- [ ] `DASHBOARD_CAPABILITIES`에 `search-suggestions`, `services`, `bookmarks-manage`, `quick-links`, `weather`, `exchange`, `todo`, `calendar`, `speedtest`, `cursor-glow`, `cursor-animation`, `snow`와 모든 웹 도구 ID를 명시하는 실패 테스트를 작성한다.
- [ ] `npm run test:unit -- --run tests/unit/dashboard-capabilities.test.js`를 실행하여 export 부재로 실패하는지 확인한다.
- [ ] 최소 카탈로그를 구현하고 Playwright에서 Split·Classic의 접근 지점에 `data-capability`를 부여한다.
- [ ] 단위 테스트와 대상 Playwright 테스트를 다시 실행한다.

### Task 2: 즐겨찾기를 공용 기능으로 분리한다

**Files:**
- Create: `src/features/bookmarks/bookmarkApi.js`
- Create: `src/features/bookmarks/BookmarksManager.jsx`
- Create: `src/features/bookmarks/bookmarks.css`
- Create: `src/features/dashboard/ServiceHub.jsx`
- Modify: `src/features/dashboard/DashboardWidgets.jsx`
- Modify: `src/layouts/SplitConsoleDashboard.jsx`
- Modify: `src/layouts/ClassicDashboard.jsx`
- Create: `tests/unit/bookmark-client.test.js`
- Modify: `tests/dashboard-layout.spec.mjs`

**Interfaces:**
- Produces: `loadBookmarks({signal})`, `addBookmarkCategory(name)`, `deleteBookmarkCategory(id)`, `addBookmark(categoryId, input)`, `updateBookmark(categoryId, bookmarkId, patch)`, `deleteBookmark(categoryId, bookmarkId)`, `selectQuickLinks(data)`
- Produces: `<BookmarksManager />`, `<ServiceHub initialTab="services|bookmarks" />`

- [ ] URL 정규화, API 오류 보존, Quick Link 선택의 실패 테스트를 작성하고 RED를 확인한다.
- [ ] API 모듈을 최소 구현하여 단위 테스트를 GREEN으로 만든다.
- [ ] Split의 `BOOKMARKS`가 전체 관리 화면을 열고 `SEONOLOGY`가 Services·Bookmarks 탭을 제공해야 하는 Playwright 실패 테스트를 작성한다.
- [ ] Classic의 기존 `BookmarksPanel`, `ServicesModal`, Quick Link 선택 로직을 공용 구성 요소로 교체한다.
- [ ] 카테고리와 즐겨찾기의 추가·수정·삭제, Quick Link 지정, 안전한 외부 링크를 실제 API mock으로 검증한다.

### Task 3: 검색 자동완성과 효과 설정을 공유한다

**Files:**
- Create: `src/features/dashboard/GoogleSearch.jsx`
- Create: `src/features/effects/effectCatalog.js`
- Create: `src/features/effects/CursorGlow.jsx`
- Modify: `src/features/dashboard/DashboardWidgets.jsx`
- Modify: `src/layouts/SplitConsoleDashboard.jsx`
- Modify: `src/layouts/ClassicDashboard.jsx`
- Modify: `src/app/preferences.js`
- Modify: `tests/unit/preferences.test.js`
- Modify: `tests/dashboard-layout.spec.mjs`

**Interfaces:**
- Produces: `<GoogleSearch variant="split|classic" />`
- Produces: `CURSOR_GLOW_EFFECTS`, `CURSOR_ANIMATIONS`, `<CursorGlow effect />`

- [ ] 자동완성 응답, 위·아래 키 선택, Escape 닫기, 검색 실행을 재현하는 Playwright 실패 테스트를 작성한다.
- [ ] Classic의 검색 동작을 공용 구성 요소로 옮기고 두 레이아웃에 연결한다.
- [ ] Split에서 `cursorGlow` 선택과 저장을 검사하는 실패 테스트를 작성한다.
- [ ] 효과 카탈로그와 배경광 구성 요소를 공유하고 두 레이아웃이 같은 환경 설정 키를 사용하도록 만든다.

### Task 4: 팝업 View Transition 깜빡임을 제거한다

**Files:**
- Modify: `src/layouts/SplitConsoleDashboard.jsx`
- Modify: `src/layouts/ClassicDashboard.jsx`
- Modify: `src/styles/modal-system.css`
- Modify: `tests/modal-overlay-motion.spec.mjs`

**Interfaces:**
- Consumes: `startUiTransition`은 `App.jsx`의 레이아웃·색상 모드 전환에만 사용한다.
- Produces: 모달 열기·닫기 때 전체 문서 View Transition 호출 0회

- [ ] `document.startViewTransition`을 계측하여 모달 열기·닫기에는 호출되지 않고 레이아웃 전환에는 호출되는 실패 테스트를 작성한다.
- [ ] 두 레이아웃의 surface 상태 변경에서 `startUiTransition`을 제거한다.
- [ ] `::view-transition-*` 규칙은 페이지 전환에만 남기고 패널 CSS 진입 모션을 유지한다.
- [ ] 일반 모션과 reduced-motion 테스트를 모두 GREEN으로 확인한다.

### Task 5: 클라우드 토큰 마이그레이션 권한 오류를 수정한다

**Files:**
- Modify: `api/infrastructure/storage/encrypted-token-store.js`
- Modify: `api/test/cloud-token-store.test.js`
- Modify: `api/test/app-cloud-isolation.test.js`
- Create: `src/features/tool-launcher/cloudStatus.js`
- Modify: `src/components/CloudBrowser.jsx`
- Create: `tests/unit/cloud-status.test.js`

**Interfaces:**
- Produces: 읽기 가능한 비소유 평문 파일을 검증·백업·암호화한 뒤 `0600`으로 교체하는 `createEncryptedTokenStore.read()`
- Produces: `describeCloudStatus(response)`가 `ready|connect|unconfigured|unavailable`을 구분한다.

- [ ] 테스트 프로세스와 다른 UID를 모사하는 주입형 `chmod` 실패 테스트를 작성하고 기존 구현에서 RED를 확인한다.
- [ ] `chmod`의 `EPERM`·`EACCES`가 읽기 자체를 무효화하지 않게 하되, 평문 검증과 원자적 암호화 교체를 반드시 완료하도록 최소 수정한다.
- [ ] 마이그레이션 후 모드 `0600`, AES-256-GCM, 평문 비노출, 두 공급자 토큰 보존을 검사한다.
- [ ] 상태 API가 저장소 오류를 `configured:false`로 위장하지 않는 프런트 실패 테스트를 작성하고 상태별 안내와 재시도 동작을 구현한다.

### Task 6: 모든 도구 셸을 새 디자인으로 통일한다

**Files:**
- Modify: `src/styles/modal-system.css`
- Modify: `src/layouts/split-console.css`
- Modify: affected `src/components/*.css` only where a functional visualization requires an exception
- Modify: `tests/dashboard-layout.spec.mjs`

**Interfaces:**
- Produces: `--tool-bg`, `--tool-surface`, `--tool-inner`, `--tool-line`, `--tool-text`, `--tool-muted`, `--tool-accent`, `--tool-danger` 공통 토큰
- Produces: 모든 레지스트리 도구의 직접 셸에 동일한 배경·테두리·모서리·타이포그래피 계약

- [ ] 대표 8개 도구와 전체 레지스트리 셸의 계산 스타일을 검사하는 Playwright 실패 테스트를 작성한다.
- [ ] Light·Dark 공통 토큰과 셸·헤더·입력·버튼 규칙을 추가한다.
- [ ] 색상 선택기, 그래프 상태색, 코드 편집기처럼 기능적인 색은 예외로 보존한다.
- [ ] 1440×1000, 1024×768, 390×844에서 수평 오버플로와 가려진 닫기 버튼이 없는지 확인한다.

### Task 7: 전체 기능·보안·반응형 검증을 수행한다

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/security.md`
- Modify: `docs/runbook.md`

- [ ] `npm run lint`를 실행한다.
- [ ] `npm run test:unit`과 `npm run test:api`를 실행한다.
- [ ] `npm run test:e2e`로 두 레이아웃, 두 색상 모드, 기능 동등성, 전체 도구, 세 화면 폭을 검사한다.
- [ ] `npm run build`, extension build, 세 dependency audit를 실행한다.
- [ ] Docker read-only container smoke와 health·version·API readiness를 검사한다.
- [ ] diff를 요구사항별로 재검토하고 기능 목록의 미검증 항목이 없는지 확인한다.

### Task 8: 릴리스와 운영 배포를 수행한다

**Files:**
- Application repository commits and push
- GitOps SSOT image reference only through the existing release automation contract

- [ ] 기능 복원과 공용 모듈 추가가 포함되므로 `feat` 커밋과 minor 버전 `1.55.0`을 선택한다.
- [ ] 커밋 전 전체 검증을 새로 실행하고 결과를 확인한다.
- [ ] 원격 `main`에 반영하고 GitHub Actions의 품질·이미지·릴리스 결과와 GHCR digest를 확인한다.
- [ ] Argo CD Image Updater 반영, `Synced`, `Healthy`, rollout revision을 확인한다.
- [ ] 운영 Pod 내부의 토큰 파일이 암호화 봉투·`0600`으로 마이그레이션됐는지 비밀값을 출력하지 않고 확인한다.
- [ ] 운영에서 Google Drive·OneDrive 상태, 즐겨찾기 관리, 자동완성, 효과 설정, 대표 도구, 모바일 오버플로를 다시 검사한다.

### Task 9: 작업 이력을 기록한다

**Files:**
- No repository file required

- [ ] 배경, 기술 개념, 의사결정 근거, 시간순 수행 상태, 문제와 해결법, 실제 실행 커맨드 전문과 결과, 커밋·태그·digest·Argo revision을 정리한다.
- [ ] Outline Work History 컬렉션 `31267b17-09b4-447c-aa2e-67a7d02b9808`에 지정 제목 형식으로 업로드한다.
