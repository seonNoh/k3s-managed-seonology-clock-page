# Modal Pointer Compositing Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 툴 모달 위에서 마우스를 이동할 때 발생하는 전체 화면 재합성을 중지하면서 기존 화면 효과 설정과 모달 디자인을 보존한다.

**Architecture:** 각 레이아웃이 전체 화면 표면의 활성 상태를 계산하여 세 가지 배경 효과에 `paused`로 전달한다. 각 효과는 DOM과 마지막 프레임을 유지하면서 이벤트와 animation frame만 중지하고, Classic 툴 버튼은 합성 레이어 이동이 없는 hover를 사용한다.

**Tech Stack:** React 19, Vite 7, CSS, Playwright Test, Vitest

**Spec:** `docs/superpowers/specs/2026-08-24-modal-pointer-compositing-stability-design.md`

## Global Constraints

- Split과 Classic 디자인의 현재 색상, 크기, blur는 유지한다.
- 사용자 효과 설정값을 변경하거나 초기화하지 않는다.
- 모달이 닫히면 효과가 원래 설정으로 다시 동작해야 한다.
- `prefers-reduced-motion` 동작을 약화하지 않는다.
- 이번 릴리스는 `fix`이므로 패치 버전으로 배포한다.

---

### Task 1: 브라우저 회귀 테스트

**Files:**
- Modify: `tests/modal-overlay-motion.spec.mjs`

**Interfaces:**
- Consumes: 기존 `openSplitDashboard(page)`, `openClassicDashboard(page)` 테스트 도우미
- Produces: 배경 효과 정지와 Classic hover 안정성을 검증하는 Playwright 회귀 테스트

- [ ] **Step 1: Split Tools 효과 정지 실패 테스트를 작성한다**

  Cursor Snow, Indigo Glow, Snow Field를 활성화하고 Tools를 연 뒤 Snow의 `animation-play-state`, Cursor Glow의 inline background, Canvas의 `toDataURL()`, 모달 bounds를 고밀도 마우스 이동 전후로 비교한다.

- [ ] **Step 2: 현재 구현에서 테스트가 정확한 이유로 실패하는지 확인한다**

  Run: `npx playwright test tests/modal-overlay-motion.spec.mjs --grep "모달이 열린 동안 배경 효과를 정지한다" --project=chromium`

  Expected: Snow animation이 `running`이거나 Cursor Glow/Canvas 프레임이 변경되어 FAIL

- [ ] **Step 3: Classic hover와 glow-none 실패 테스트를 작성한다**

  Classic Tools의 버튼 hover에서 transform과 `will-change`가 비활성화되는지, `glow-none`에서 `.cursor-glow`가 존재하지 않는지 검증한다.

- [ ] **Step 4: 현재 구현에서 추가 테스트도 정확한 이유로 실패하는지 확인한다**

  Run: `npx playwright test tests/modal-overlay-motion.spec.mjs --grep "Classic Tools|glow-none" --project=chromium`

  Expected: hover transform 또는 `.cursor-glow` 존재 때문에 FAIL

### Task 2: 효과 컴포넌트 일시 중지

**Files:**
- Modify: `src/features/effects/CursorGlow.jsx`
- Modify: `src/components/CursorCanvas.jsx`
- Modify: `src/components/SnowField.jsx`
- Modify: `src/layouts/split-console.css`

**Interfaces:**
- Consumes: `paused: boolean`
- Produces: `CursorGlow({ effect, paused })`, `CursorCanvas({ effect, paused })`, `SnowField({ enabled, paused })`

- [ ] **Step 1: CursorGlow의 최소 구현을 추가한다**

  `paused` 또는 `glow-none`이면 pointermove effect를 시작하지 않는다. `glow-none`은 `null`을 반환하고 paused는 마지막 gradient DOM을 유지한다.

- [ ] **Step 2: CursorCanvas의 최소 구현을 추가한다**

  `paused`이면 mousemove와 animation frame을 시작하지 않으며 Canvas DOM은 유지한다.

- [ ] **Step 3: SnowField의 최소 구현을 추가한다**

  paused class와 `animation-play-state: paused`를 추가한다.

- [ ] **Step 4: 대상 테스트를 실행한다**

  Run: `npx playwright test tests/modal-overlay-motion.spec.mjs --grep "모달이 열린 동안 배경 효과를 정지한다|glow-none" --project=chromium`

  Expected: PASS

### Task 3: 레이아웃 연결과 Classic hover 안정화

**Files:**
- Modify: `src/layouts/SplitConsoleDashboard.jsx`
- Modify: `src/layouts/ClassicDashboard.jsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: 각 레이아웃의 모달·도구·로딩 상태
- Produces: `backgroundEffectsPaused: boolean`을 세 효과 컴포넌트에 전달

- [ ] **Step 1: Split의 표면 활성 상태를 연결한다**

  `toolsOpen`, `effectsOpen`, `activeModal`, `activeToolId`, `pendingToolId` 가운데 하나라도 활성화되면 세 효과를 일시 중지한다.

- [ ] **Step 2: Classic의 표면 활성 상태를 연결한다**

  `toolsExpanded`, `settingsOpen`, `activeModal`, `activeToolId`, `pendingToolId` 가운데 하나라도 활성화되면 Cursor Glow와 Canvas를 일시 중지한다.

- [ ] **Step 3: Classic 툴 버튼 hover를 안정화한다**

  transform과 `will-change`를 제거하고 background, border-color, color만 전환한다.

- [ ] **Step 4: 대상 테스트를 실행한다**

  Run: `npx playwright test tests/modal-overlay-motion.spec.mjs --grep "모달이 열린 동안 배경 효과를 정지한다|Classic Tools|glow-none" --project=chromium`

  Expected: PASS

### Task 4: 전체 검증과 패치 릴리스

**Files:**
- Modify: 릴리스 자동화가 생성하는 버전 파일과 GitOps 이미지 태그

**Interfaces:**
- Consumes: 검증된 fix 커밋
- Produces: 패치 태그, 컨테이너 이미지, 운영 배포

- [ ] **Step 1: 전체 검증을 실행한다**

  Run: `npm run verify`

  Expected: lint, unit, API, E2E, build, audit, container smoke 모두 PASS

- [ ] **Step 2: 변경 범위를 검토하고 fix 커밋을 작성한다**

  커밋 제목은 영어 Conventional Commit으로, 본문은 한국어로 작성한다.

- [ ] **Step 3: 패치 버전 릴리스와 배포를 실행한다**

  저장소의 기존 release 및 GitOps 절차를 그대로 따른다.

- [ ] **Step 4: 운영 Chrome에서 같은 조건을 다시 검증한다**

  Split과 Classic Tools에서 고밀도 마우스 이동, Escape 이력, 효과 재개, 표시 버전을 확인한다.

- [ ] **Step 5: Work History를 기록한다**

  실제 명령, 결과, 장애와 해결법, 커밋·릴리스·배포 정보를 Outline Work History 컬렉션에 업로드한다.
