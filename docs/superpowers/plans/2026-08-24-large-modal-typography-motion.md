# Large Modal Typography and Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for each implementation task and superpowers:verification-before-completion before reporting completion.

**Goal:** Split과 Classic의 작업형 대화상자를 화면에 맞는 큰 작업 공간으로 통일하고, 전체 글자 크기와 절제된 전환 모션을 개선하여 `v1.54.0`으로 배포한다.

**Architecture:** `App.jsx`가 항상 로드하는 공통 `modal-system.css`에서 모든 작업형 대화상자의 크기·타이포그래피·모션을 제어한다. 기존 개별 CSS는 도구 내부 배치만 유지한다. 상태 전환은 reduced-motion과 미지원 브라우저를 안전하게 처리하는 작은 View Transition 어댑터를 거친다.

**Tech Stack:** React 19, CSS, View Transition API progressive enhancement, Vite 7, Vitest, Playwright, Docker, GitHub Actions, GHCR, Argo CD.

**Spec:** `docs/superpowers/specs/2026-08-24-large-modal-typography-motion-design.md`

---

## Task 1: 공통 대화상자 회귀 테스트를 먼저 추가한다

**Files:**
- Modify: `tests/modal-overlay-motion.spec.mjs`
- Modify: `tests/dashboard-layout.spec.mjs`

1. Split과 Classic의 작업형 대화상자를 1440px, 1024px, 390px에서 열어 화면 대비 너비와 높이를 검사한다.
2. 제목, 본문, 입력, 버튼의 계산 글자 크기가 데스크톱 18px, 모바일 17px 기준을 충족하는지 검사한다.
3. Speed Test처럼 기존 전역 재정의에서 빠졌던 도구도 검사 목록에 포함한다.
4. 현재 코드에서 테스트가 작은 고정 너비와 작은 글자 때문에 실패하는지 확인한다.

## Task 2: 모션 어댑터를 테스트 주도로 구현한다

**Files:**
- Create: `src/ui/startUiTransition.js`
- Create: `tests/unit/ui-transition.test.js`

1. View Transition API 미지원, reduced-motion, 정상 지원 환경의 실패 테스트를 작성한다.
2. 미지원 및 reduced-motion에서는 갱신 함수를 정확히 한 번 즉시 실행하도록 구현한다.
3. 정상 지원 환경에서는 `document.startViewTransition`에 갱신 함수를 전달하도록 구현한다.

## Task 3: 공통 대화상자 시스템을 만든다

**Files:**
- Create: `src/styles/modal-system.css`
- Modify: `src/App.jsx`
- Modify: `src/App.css`
- Modify: `src/layouts/split-console.css`

1. `App.jsx`에서 공통 스타일을 직접 가져와 두 레이아웃에서 항상 로드되게 한다.
2. 작업형 대화상자 셸 목록에 일반 Modal, Tools, Split dialog와 모든 개별 도구 패널을 포함한다.
3. 92dvw×88dvh, 94dvw×90dvh, 모바일 100dvw×100dvh 규칙과 1600px 최대 너비를 구현한다.
4. 기존 `App.css`의 지연 로딩 전역 재정의와 중복 reduced-motion 규칙을 제거한다.
5. 짧은 확인창과 설정창에는 compact 변형을 지정하여 전체 화면 규칙에서 제외한다.

## Task 4: 글자와 내부 레이아웃을 확대한다

**Files:**
- Modify: `src/index.css`
- Modify: `src/app-shell.css`
- Modify: `src/layouts/split-console.css`
- Modify: `src/styles/modal-system.css`
- Modify: affected `src/components/*.css` only when overflow tests identify a tool-specific defect

1. 문서 루트를 데스크톱·태블릿 18px, 모바일 17px로 조정한다.
2. 앱 셸과 Split Console의 0.58–0.68rem 마이크로 타이포그래피를 읽을 수 있는 크기로 올린다.
3. 공통 대화상자 제목 1.4rem, 본문·입력·버튼 1rem, 보조 라벨 0.88rem 최소값을 적용한다.
4. 글자 확대 때문에 발생하는 수평 오버플로는 글자 축소가 아니라 줄바꿈·그리드 재배치·내부 스크롤로 해결한다.

## Task 5: 절제된 진입 및 화면 전환 모션을 연결한다

**Files:**
- Modify: `src/styles/modal-system.css`
- Modify: `src/App.jsx`
- Modify: `src/layouts/SplitConsoleDashboard.jsx`
- Modify: `src/layouts/ClassicDashboard.jsx`

1. 오버레이 180ms, 패널 220ms의 fade·10px 이동·0.992 scale 진입 모션을 적용한다.
2. 레이아웃 전환, 대화상자 열기·닫기, 도구 교체 상태 갱신을 View Transition 어댑터로 감싼다.
3. `prefers-reduced-motion: reduce`에서 CSS animation과 view-transition pseudo-element animation을 모두 비활성화한다.
4. 기존 Escape, 오버레이 클릭, 도구 상호배타 동작을 유지한다.

## Task 6: 반응형과 시각 품질을 검증한다

**Files:**
- Modify: tests only when an actual missing regression assertion is found

1. 대상 Playwright 테스트와 unit 테스트를 통과시킨다.
2. 1440×1000, 1024×768, 390×844에서 Split·Classic과 대표 도구를 실제 브라우저로 확인한다.
3. 화면 경계, 헤더 고정, 내부 스크롤, 모바일 safe area, 수평 오버플로, 글자 크기, 닫기 동작을 확인한다.
4. 일반 모션과 reduced-motion 계산 스타일을 각각 확인한다.

## Task 7: 전체 품질 및 보안 검증을 수행한다

**Files:**
- No planned production changes

1. lint, unit, API, E2E, web·extension build를 실행한다.
2. root·API·extension production dependency audit를 실행한다.
3. Docker 이미지 빌드, read-only 실행, health·version·API readiness를 검사한다.
4. 변경 범위와 기존 사용자 변경이 섞이지 않았는지 diff를 검토한다.

## Task 8: `v1.54.0`을 릴리스하고 GitOps 배포를 확인한다

**Files:**
- App repository commit and push
- GitOps repository image reference updated by its established automation

1. 기능 변경을 `feat:` 커밋으로 기록하며 영어 제목과 한국어 본문을 사용한다.
2. native release planner가 `1.53.0`에서 minor `1.54.0`을 계산하는지 확인한다.
3. `main`에 반영한 뒤 GitHub Actions 품질·이미지·릴리스 작업과 GHCR digest를 확인한다.
4. Image Updater와 Argo CD에서 새 이미지, `Synced`, `Healthy`, rollout revision을 확인한다.
5. 운영 주소에서 버전과 데스크톱·태블릿·모바일 핵심 대화상자를 다시 검사한다.

## Task 9: 작업 이력을 기록한다

**Files:**
- No repository file required

1. 배경, 개념, 결정 근거, 실제 실행 커맨드 전문, 출력, 문제와 해결, 커밋·태그·digest·Argo revision을 정리한다.
2. Outline Work History 컬렉션 `31267b17-09b4-447c-aa2e-67a7d02b9808`에 지정 형식으로 업로드한다.
