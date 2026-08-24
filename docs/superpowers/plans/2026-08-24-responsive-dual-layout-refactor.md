# Responsive Dual-Layout Refactor Implementation Plan

> 실행 기준: 승인된 Split Console을 기본 화면으로 제공하고 기존 Classic 화면을 선택 가능한 호환 레이아웃으로 보존한다. 공유 기능은 하나의 상태·데이터·보안 경계만 사용한다.

**Goal:** 모바일·태블릿·PC에서 잘림 없이 동작하는 두 개의 레이아웃과 독립적으로 변경 가능한 기능 모듈을 구축하고, 보안·접근성·성능 검증 후 GitOps 경로로 배포한다.

**Architecture:** `App`은 환경 설정과 공용 대화상자 상태만 조립한다. 화면은 `ClassicDashboard`와 `SplitConsoleDashboard`가 같은 `DashboardController` 계약을 소비한다. 시계 템플릿은 레이아웃 메타데이터와 렌더러를 분리하고, 설정은 허용값 검증을 거치는 저장소 어댑터에만 기록한다. 외부 URL은 API 저장 시점과 브라우저 사용 시점에서 모두 허용 스킴을 검증한다.

**Tech Stack:** React 19, Vite 7, Vitest, Node test runner, Playwright, Express, nginx, Docker, GitHub Actions, GHCR, Argo CD.

---

## Task 1: 회귀 기준선과 실행 명령을 자기완결적으로 만든다

**Files:**
- Modify: `package.json`
- Modify: `tests/unit/container-smoke.test.js`
- Test: `tests/extension-popup-runtime.spec.mjs`

1. `test:e2e`가 `toolkit-extension/dist`를 전제로 한다는 실패를 기존 Playwright 테스트로 재현한다.
2. `pretest:e2e`에 extension build를 연결하고, `verify`에서 중복 빌드가 생기지 않도록 명령 순서를 정리한다.
3. package script 계약 테스트를 추가하고 단위 테스트 및 전체 E2E를 재실행한다.

## Task 2: 사용자 환경 설정 경계를 만든다

**Files:**
- Create: `src/app/preferences.js`
- Create: `src/hooks/usePersistentPreference.js`
- Test: `tests/unit/preferences.test.js`

1. 레이아웃 `split|classic`, 색상 모드 `light|dark`, 효과, 시계 템플릿과 세부 옵션의 허용값 테스트를 먼저 작성한다.
2. 저장소 접근 실패, 손상 값, 알 수 없는 값에서 안전한 기본값을 반환하는 순수 함수를 구현한다.
3. Split Console과 light 모드를 최초 기본값으로 지정하고 이후 선택을 `localStorage`에 유지한다.

## Task 3: 시계 도메인과 렌더링을 분리한다

**Files:**
- Create: `src/features/clock/clockCatalog.js`
- Create: `src/features/clock/timeFormat.js`
- Create: `src/features/clock/MatrixRain.jsx`
- Create: `src/features/clock/ClockPicker.jsx`
- Modify: `src/components/Clock.jsx`
- Modify: `src/components/Clock.css`
- Test: `tests/unit/clock-catalog.test.js`

1. 12개 템플릿의 ID, 표시명, `portrait|square|panorama` 레이아웃 메타데이터와 단위별 색상 계약을 테스트한다.
2. 설정과 시간 포맷을 순수 모듈로 옮기고 `Clock`은 제어·비제어 사용을 모두 지원하게 한다.
3. Matrix 비 효과를 렌더 중 난수 생성 없이 결정적으로 만들고 Orbit 상태 갱신을 시간 경계 기반으로 정리한다.
4. 모든 템플릿이 컨테이너 크기에 맞춰 축소되되 잘리거나 인위적으로 작은 고정 폭이 되지 않도록 CSS를 보완한다.

## Task 4: 공용 데이터와 대시보드 구성 요소를 분리한다

**Files:**
- Create: `src/api/client.js`
- Create: `src/features/dashboard/dashboardLinks.js`
- Create: `src/features/dashboard/useDashboardData.js`
- Create: `src/features/dashboard/SearchBar.jsx`
- Create: `src/features/dashboard/StatusWidgets.jsx`
- Create: `src/features/dashboard/QuickLinksPanel.jsx`
- Create: `src/features/dashboard/ServicesModal.jsx`
- Create: `src/features/tool-launcher/ToolDock.jsx`
- Create: `src/features/tool-launcher/ToolsLauncher.jsx`
- Create: `src/features/tool-launcher/toolIcons.jsx`
- Modify: `src/App.jsx`

1. 현재 `App.jsx`에 섞인 fetch, 외부 링크, 검색, 상태 위젯, 도구 아이콘을 각 책임별 파일로 이동한다.
2. 요청 성공 여부와 응답 형태를 확인하는 공용 API 클라이언트를 사용하고 unmount 이후 상태 갱신을 중단한다.
3. 도구 열기, 모달 열기, Escape, 오버레이 상호배타 계약을 유지한다.

## Task 5: Classic 화면을 호환 레이아웃으로 고립한다

**Files:**
- Create: `src/layouts/ClassicDashboard.jsx`
- Create: `src/layouts/classic-dashboard.css`
- Modify: `src/App.jsx`
- Test: `tests/modal-overlay-motion.spec.mjs`

1. 기존 DOM 구조와 주요 class를 Classic 전용 구성 요소로 이동한다.
2. 기존 도구, 검색, 퀵링크, 환율, 날씨, Todo, Speed Test, 브라우저 통계 동작을 유지한다.
3. 기존 오버레이 회귀 테스트를 통과시켜 호환성을 확인한다.

## Task 6: Split Console 레이아웃을 구현한다

**Files:**
- Create: `src/layouts/SplitConsoleDashboard.jsx`
- Create: `src/layouts/split-console.css`
- Create: `src/components/SnowField.jsx`
- Modify: `src/App.jsx`
- Test: `tests/dashboard-layout.spec.mjs`

1. 승인된 v4 색상 배치, JetBrains Mono, 10px 수준의 절제된 모서리, 시계·작업·운영 도구의 세 영역을 구현한다.
2. 시계 템플릿 메타데이터에 따라 PC에서 `portrait`, `square`, `panorama` 구조가 바뀌도록 한다.
3. Google 검색은 실제 입력 폼으로, 모든 바로가기·운영 도구·환율·날씨·Todo·Speed Test는 실제 기존 기능으로 연결한다.
4. 눈 결정은 CSS 도형으로 복원하고 효과 설정과 `prefers-reduced-motion`을 존중한다.

## Task 7: 반응형과 접근성을 경계값별로 검증한다

**Files:**
- Modify: `src/index.css`
- Modify: `src/layouts/classic-dashboard.css`
- Modify: `src/layouts/split-console.css`
- Modify: `src/components/Clock.css`
- Modify: `tests/dashboard-layout.spec.mjs`

1. 320px 모바일, 390px 모바일, 768px 태블릿 경계, 1024px 태블릿, 1280px·1440px PC 테스트를 작성한다.
2. 수평 오버플로, 화면 밖 고정 요소, 44px 미만 핵심 터치 대상, 가려진 검색·퀵메뉴·도구를 실패 조건으로 둔다.
3. 모바일은 세로 흐름과 하단 도구 트레이, 태블릿은 2영역, PC는 시계 메타데이터별 3영역으로 명확히 구분한다.
4. 키보드 포커스, `aria-pressed`, 대화상자 이름, Escape, reduced motion, 명암을 검증한다.

## Task 8: 보안 경계를 강화한다

**Files:**
- Create: `api/security/validate-url.js`
- Modify: `api/index.js`
- Modify: `src/api/client.js`
- Modify: `src/features/dashboard/QuickLinksPanel.jsx`
- Modify: `nginx.conf`
- Create: `api/test/bookmark-security.test.js`
- Modify: `tests/unit/container-smoke.test.js`

1. `http:`·`https:`만 허용하고 `javascript:`·`data:`·credential 포함 URL과 비정상 bookmark 구조를 거부하는 API 테스트를 먼저 작성한다.
2. POST, PATCH, 전체 PUT, 저장 데이터 read 경계에 같은 검증을 적용하며 기존 정상 데이터 계약은 유지한다.
3. UI에서도 외부 URL을 재검증해 손상된 과거 데이터가 실행 링크가 되지 않게 한다.
4. Vite 출력에 불필요한 CSP `script-src 'unsafe-inline'`을 제거하고 보안 헤더 계약 테스트를 추가한다.
5. root·API·extension production dependency audit를 다시 실행한다.

## Task 9: 성능과 코드 품질을 검증한다

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/features/**`
- Modify: `src/layouts/**`
- Modify: `vite.config.js` if measured chunking requires it

1. 현재 범위의 React compiler 경고를 제거하고 신규 lint 경고가 생기지 않았는지 기준선과 비교한다.
2. 정적 링크·아이콘·시계 카탈로그를 렌더 함수 밖으로 이동하고 필요 모달은 lazy loading을 유지한다.
3. production build의 초기 JS 크기와 chunk 구성을 전후 비교하고, 측정으로 이득이 확인되는 경우에만 manual chunk를 적용한다.

## Task 10: 전체 검증과 로컬 운영 smoke를 수행한다

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/security.md`
- Modify: `docs/runbook.md`

1. `lint`, unit, API, E2E, web build, extension build, dependency audit를 모두 새 환경에서 실행한다.
2. Docker read-only container smoke와 `/health`, `app-version.json`, API 종료 후 readiness 실패 계약을 확인한다.
3. 로컬 브라우저에서 두 레이아웃과 두 색상 모드, 12개 시계, snow on/off를 대표 화면 크기별로 직접 확인한다.
4. 구조·보안·운영 문서를 실제 변경과 일치하게 갱신한다.

## Task 11: 릴리스와 GitOps 배포를 수행한다

**Files:**
- App repository commit and push
- GitOps SSOT repository: `seonology-k3s` image reference only when required by its existing automation contract

1. 변경을 기능 단위 Conventional Commit으로 기록하며 제목은 영어, 본문은 한국어로 작성한다.
2. `feat`가 포함되므로 native release planner가 `1.52.0`에서 `1.53.0` minor release를 계산하는지 확인한다.
3. 검증된 브랜치를 `main`에 반영해 GitHub Actions quality·image·publish 결과와 GHCR digest를 확인한다.
4. Image Updater/Argo CD가 GitOps SSOT를 갱신한 commit, `Synced`, `Healthy`, rollout revision을 확인한다.
5. 외부 `/health`, 버전 marker, PC·태블릿·모바일 핵심 경로를 확인하고 이상 시 이전 검증 digest로 롤백한다.

## Task 12: 작업 이력을 남긴다

**Files:**
- No repository file required

1. 실제 실행 커맨드 전문, 출력, 문제와 원인, 결정 근거, 커밋·태그·image digest·Argo revision을 정리한다.
2. Outline Work History 컬렉션 `31267b17-09b4-447c-aa2e-67a7d02b9808`에 지정 형식으로 업로드한다.
