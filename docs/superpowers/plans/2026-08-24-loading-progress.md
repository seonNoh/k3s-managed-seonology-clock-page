# Loading Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 진행량을 알 수 있는 작업과 알 수 없는 작업을 정직하게 구분하는 공통 로딩 진행 표시를 모든 Clock 화면에 적용한다.

**Architecture:** `LoadingProgress`가 접근성, 결정형·비확정형 표시, 축소 모션을 한 곳에서 담당한다. 인프라 대시보드는 세 병렬 요청의 완료 이벤트를 집계하고, 다른 소비 화면은 기존 loading 상태를 공통 컴포넌트에 전달한다.

**Tech Stack:** React 19, CSS, Vitest, jsdom, Playwright

**Spec:** `docs/superpowers/specs/2026-08-24-loading-progress-design.md`

## Global Constraints

- 실제 전체량이 없는 요청에 가짜 퍼센트를 표시하지 않는다.
- 인프라 진행률은 Cluster, Tailscale, NAS 세 요청의 완료 수만 사용한다.
- JetBrains Mono와 현재 다크·라이트 토큰을 유지한다.
- 외곽 모서리는 10px를 넘지 않는다.
- `prefers-reduced-motion`에서 이동 애니메이션을 제거한다.
- 기존 오류 처리와 완료 데이터는 변경하지 않는다.

---

### Task 1: 공통 진행 표시 계약

**Files:**
- Create: `src/components/LoadingProgress.jsx`
- Create: `src/components/LoadingProgress.css`
- Create: `tests/unit/loading-progress.test.jsx`

**Interfaces:**
- Consumes: `{ label, detail, value, max = 100, compact = false, className = '' }`
- Produces: 결정형 또는 비확정형 접근 가능한 진행 레일

- [x] **Step 1: 실패 테스트 작성**

결정형 퍼센트 제한, 비확정형의 숫자 미표시, 레이블·상세 문구, compact 클래스를 jsdom에서 검증한다.

- [x] **Step 2: 실패 확인**

Run: `npx vitest run --config vitest.config.js tests/unit/loading-progress.test.jsx`

Expected: `LoadingProgress.jsx`가 없어 FAIL.

- [x] **Step 3: 최소 구현**

`LoadingProgress.jsx`와 CSS를 만들고 결정형·비확정형 DOM과 애니메이션을 구현한다.

- [x] **Step 4: 통과 확인**

Run: `npx vitest run --config vitest.config.js tests/unit/loading-progress.test.jsx`

Expected: 모든 테스트 PASS.

### Task 2: 인프라의 실제 진행률

**Files:**
- Modify: `src/components/InfraDashboard.jsx`
- Modify: `src/components/InfraDashboard.css`
- Create: `tests/unit/infra-loading-progress.test.jsx`

**Interfaces:**
- Consumes: 세 API 요청의 완료 콜백
- Produces: `completed`, `total=3`, `active`, `label`로 구성한 배치 진행 상태

- [x] **Step 1: 실패 테스트 작성**

세 fetch를 지연시킨 뒤 0%, 하나 완료 후 33%, 둘 완료 후 67%, 전부 완료 후 완료 상태를 검증한다.

- [x] **Step 2: 실패 확인**

Run: `npx vitest run --config vitest.config.js tests/unit/infra-loading-progress.test.jsx`

Expected: 공통 progressbar와 단계 퍼센트가 없어 FAIL.

- [x] **Step 3: 최소 구현**

refresh 단위 식별자를 사용해 오래된 요청 완료가 새 배치 진행률을 변경하지 못하게 하고, 각 요청의 `finally`에서 완료 수를 증가시킨다.

- [x] **Step 4: 통과 확인**

Run: `npx vitest run --config vitest.config.js tests/unit/infra-loading-progress.test.jsx`

Expected: 모든 테스트 PASS.

### Task 3: 기존 로딩 화면 통합

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/layouts/ClassicDashboard.jsx`
- Modify: `src/layouts/SplitConsoleDashboard.jsx`
- Modify: `src/features/dashboard/ServiceHub.jsx`
- Modify: `src/features/bookmarks/BookmarksManager.jsx`
- Modify: `src/components/CloudBrowser.jsx`
- Modify: `src/components/NasBrowser.jsx`
- Modify: `src/components/RepoCatalog.jsx`
- Modify: `src/components/Fortune.jsx`
- Modify: `src/components/Weather.jsx`
- Modify: `src/components/ExchangeRate.jsx`
- Modify: `src/components/TodayInHistory.jsx`
- Modify: `src/components/TodoList.jsx`
- Modify: `src/components/IpLookup.jsx`
- Modify: `src/components/DnsLookup.jsx`
- Modify: `src/components/ArchIconSearch.jsx`
- Modify: `src/components/Calendar.jsx`
- Modify: `src/components/ChatPanel.jsx`
- Test: `tests/loading-progress.spec.mjs`

**Interfaces:**
- Consumes: 각 화면의 기존 boolean loading 상태
- Produces: 화면별 정확한 label과 detail을 가진 `LoadingProgress`

- [x] **Step 1: 실패 계약 테스트 작성**

즐겨찾기·클라우드·인프라의 로딩 화면이 공통 진행 레일을 사용하고, 실제 값이 없는 요청에는 퍼센트를 표시하지 않음을 브라우저에서 검증한다.

- [x] **Step 2: 실패 확인**

Run: `npx playwright test tests/loading-progress.spec.mjs --reporter=line`

Expected: 단순 로딩 문구와 누락 import 때문에 FAIL.

- [x] **Step 3: 최소 통합**

기존 상태와 오류 흐름을 유지한 채 공통 컴포넌트로 표시만 교체한다. 작은 버튼에는 기존 아이콘을 유지하되 화면 본문에 compact 레일을 추가한다.

- [x] **Step 4: 통과 확인**

Run: `npx playwright test tests/loading-progress.spec.mjs --reporter=line`

Expected: 모든 테스트 PASS.

### Task 4: 전체 검증과 배포

**Files:**
- Modify: `CHANGELOG.md`, `VERSION`은 릴리스 자동화가 처리한다.

**Interfaces:**
- Consumes: 검증을 통과한 커밋
- Produces: `v1.56.0` 컨테이너와 운영 Deployment

- [x] **Step 1: 정적·자동화 검증**

Run: `npm run lint -- --quiet && npm run test:unit && npm run test:api && npm run test:e2e && npm run build && npm run audit:dependencies && npm run smoke:container && git diff --check`

- [x] **Step 2: 브라우저 시각 검증**

인프라 0/33/67/100 진행, 비확정형 이동, 모바일 가로 넘침, 다크·라이트, 축소 모션을 확인한다.

- [ ] **Step 3: 커밋과 배포**

`feat:` 커밋으로 main에 반영한다. 기능 추가이므로 릴리스 자동화가 `1.55.0`에서 `1.56.0`으로 마이너 버전을 올리는지 확인한다.

- [ ] **Step 4: 운영 검증**

GitHub Actions, 이미지 digest, Argo CD Synced/Healthy, Pod Ready, 운영 브라우저 진행 표시를 확인한다.
