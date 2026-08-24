# Modal Transition History Implementation Plan

**Goal:** 도구 모달의 중간 전체 화면 재마운트와 opacity 진입 효과를 제거하고, `Escape`가 진입 경로의 전 단계로 돌아가도록 한다.

**Architecture:** 도구 모듈을 현재 화면에서 사전 로딩한 뒤 화면을 전환한다. 상태에는 도구의 복귀 대상을 함께 저장한다. 공통 모달 애니메이션은 배경 밝기를 변경하지 않는 위치 보정만 사용한다.

**Tech Stack:** React 19, Vite 7, CSS, Node test, Playwright Test

## Task 1: 상태 이력 회귀 테스트

**Files:**
- Modify: `tests/unit/dialog-state.test.mjs`
- Modify: `tests/modal-overlay-motion.spec.mjs`

- [ ] Tools에서 연 도구의 `Escape`가 Tools를 복원하는 단위 테스트를 먼저 추가한다.
- [ ] 직접 연 도구의 `Escape`가 대시보드로 이동하는 단위 테스트를 추가한다.
- [ ] 데스크톱과 모바일에서 `도구 -> Tools -> 대시보드` 순서를 검증하는 브라우저 테스트를 추가한다.
- [ ] 모듈 로딩을 지연했을 때 기존 런처 셸이 유지되고 전체 화면 로딩 오버레이가 나타나지 않는 테스트를 추가한다.
- [ ] 현재 구현에서 테스트가 의도대로 실패하는지 확인한다.

## Task 2: 도구 사전 로딩과 요청 순서 보호

**Files:**
- Modify: `src/features/tool-launcher/toolRegistry.web.js`
- Modify: `src/features/tool-launcher/ToolsLauncher.jsx`
- Modify: 관련 CSS 파일

- [ ] 도구 id별 import Promise를 재사용하는 `preloadWebTool` API를 추가한다.
- [ ] Tools 런처 안에서 로딩 진행 표시를 제공한다.
- [ ] 사용자가 빠르게 여러 도구를 선택하면 마지막 요청만 적용하도록 한다.
- [ ] 직접 도구 열기에서도 사전 로딩 후 모달을 표시한다.

## Task 3: Escape 이력 상태 구현

**Files:**
- Modify: `src/features/tool-launcher/dialog-state.js`
- Modify: `src/layouts/SplitConsoleDashboard.jsx`
- Modify: `src/layouts/ClassicDashboard.jsx`

- [ ] 상태 전환 함수가 `toolReturnTarget`을 기록하고 초기화하도록 한다.
- [ ] Split 레이아웃이 Tools와 직접 진입을 구분하도록 한다.
- [ ] Classic 레이아웃이 Tools와 직접 진입을 구분하도록 한다.
- [ ] `Escape`는 활성 도구의 복귀 대상에 따라 한 단계만 이동하도록 한다.

## Task 4: 밝기 깜빡임 제거

**Files:**
- Modify: `src/styles/modal-system.css`

- [ ] 공통 모달 진입 애니메이션에서 opacity와 scale 변화를 제거한다.
- [ ] 주변 컨트롤의 모달 전환 opacity 애니메이션을 제거한다.
- [ ] reduced-motion 정책을 유지한다.

## Task 5: 검증과 배포

- [ ] 대상 단위 테스트와 Playwright 테스트를 실행한다.
- [ ] 전체 테스트, lint, production build를 실행한다.
- [ ] 변경 파일과 diff를 검토한다.
- [ ] `fix` 커밋을 작성하고 패치 버전 릴리스를 시작한다.
- [ ] GitHub Actions, 릴리스 태그, 운영 화면 버전과 실제 동작을 확인한다.
- [ ] 실행 명령과 결과를 Outline Work History에 기록한다.
