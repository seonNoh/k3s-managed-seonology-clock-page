# Modal Overlay Flicker Fix Implementation Plan

> 역사 기록: 이 문서는 native release 전환 전의 계획입니다. 아래 semantic-release 표기는 당시 실패한 전제를 보존한 것이며 현재 릴리스 설계나 실행 지침이 아닙니다.

> **For agentic workers:** Implement this plan task-by-task, dispatching a fresh subagent per independent task where possible. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모달을 여는 첫 프레임부터 dim 배경과 blur를 유지하여 뒤 화면 노출을 제거한다.

**Architecture:** React 상태와 모달 마크업은 유지하고 CSS 진입 모션의 책임만 분리한다. 전체 화면 오버레이는 정적으로 표시하며, 기존 내부 패널 애니메이션만 유지한다. Playwright가 로컬 앱의 실제 CSSOM과 계산 스타일을 검사해 오버레이 fade 재도입을 차단한다.

**Tech Stack:** React 19, Vite 7, CSS, Playwright Test, ESLint, GitHub Actions semantic-release, Argo CD Image Updater

## Global Constraints

- 운영 기준 버전은 `1.51.0`이다.
- 변경 타입은 `fix`이며 semantic-release가 패치 버전을 결정한다.
- React 상태, JSX 마크업, API, 데이터 저장 형식은 변경하지 않는다.
- 모바일 drawer처럼 모달이 아닌 오버레이는 변경하지 않는다.
- 오버레이는 첫 프레임부터 최종 dim/blur 상태여야 한다.
- `prefers-reduced-motion: reduce`에서는 내부 패널 진입 애니메이션을 비활성화한다.
- 커밋 제목은 영어, 본문은 한국어로 작성하고 AI 서명을 넣지 않는다.

---

### Task 1: CSS 모션 회귀 테스트 추가

**Files:**
- Create: `playwright.config.mjs`
- Create: `tests/modal-overlay-motion.spec.mjs`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `package-lock.json`
- Include in commit: `docs/superpowers/plans/2026-08-18-modal-overlay-flicker.md`

**Interfaces:**
- Consumes: 로컬 Vite 앱의 런타임 CSSOM과 계산 스타일
- Produces: `npm test`, 모달 오버레이 animation과 reduced-motion 계산 스타일을 검증하는 브라우저 테스트 2개

- [ ] **Step 1: 테스트 실행 스크립트와 실패 테스트 작성**

Playwright를 개발 의존성으로 설치하고 Chromium 런타임을 준비한다.

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

`.gitignore`에 `test-results/`와 `playwright-report/`를 추가한다.

`package.json`의 `scripts`에 다음 항목을 추가한다.

```json
"test": "playwright test"
```

`playwright.config.mjs`를 다음 내용으로 생성한다.

```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
```

`tests/modal-overlay-motion.spec.mjs`를 다음 내용으로 생성한다.

```js
import { test, expect } from '@playwright/test';

test('full-screen modal overlay rules do not animate the backdrop layer', async ({ page }) => {
  await page.goto('/');

  const animatedOverlays = await page.evaluate(() => {
    const failures = [];
    const excluded = new Set(['.mobile-drawer-overlay']);

    const visit = (rules) => {
      for (const rule of Array.from(rules ?? [])) {
        if (rule instanceof CSSStyleRule) {
          const overlayClasses = rule.selectorText.match(/\.[\w-]*overlay\b/g) ?? [];
          const modalOverlays = overlayClasses.filter((name) => !excluded.has(name));
          const animationName = rule.style.animationName;

          if (modalOverlays.length > 0 && rule.style.position === 'fixed' && animationName && animationName !== 'none') {
            failures.push({ selector: rule.selectorText, animationName });
          }
        }
        if ('cssRules' in rule) visit(rule.cssRules);
      }
    };

    for (const sheet of Array.from(document.styleSheets)) visit(sheet.cssRules);
    return failures;
  });

  expect(animatedOverlays).toEqual([]);
});

test('modal panels disable entry animation for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(page.locator('.tools-modal')).toBeVisible();
  await expect(page.locator('.tools-modal')).toHaveCSS('animation-name', 'none');

  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.locator('.modal-content')).toBeVisible();
  await expect(page.locator('.modal-content')).toHaveCSS('animation-name', 'none');
});
```

- [ ] **Step 2: RED 상태 확인**

Run: `npm test`

Expected: 두 테스트 모두 실패한다. 첫 테스트는 현재 fade animation이 남아 있는 모달 오버레이 CSSOM 규칙들을 출력하고, 두 번째 테스트는 Tools 패널의 `animation-name`이 `toolsZoomIn`이어서 실패해야 한다.

- [ ] **Step 3: 테스트와 계획 문서 커밋**

```bash
git add package.json package-lock.json playwright.config.mjs tests/modal-overlay-motion.spec.mjs docs/superpowers/plans/2026-08-18-modal-overlay-flicker.md docs/superpowers/specs/2026-08-18-modal-overlay-flicker-design.md
git commit -m "test: cover modal overlay motion" -m "모달 오버레이 전체에 적용된 fade 애니메이션을 회귀 조건으로 고정함." -m "reduced-motion 환경에서 패널 애니메이션이 비활성화되는지도 함께 검증함."
```

---

### Task 2: 오버레이 fade 제거

**Files:**
- Modify: `src/App.css`
- Modify: `src/components/ArchIconSearch.css`
- Modify: `src/components/Base64Tool.css`
- Modify: `src/components/ChatPanel.css`
- Modify: `src/components/CiCdVisualizer.css`
- Modify: `src/components/Clock.css`
- Modify: `src/components/ColorPicker.css`
- Modify: `src/components/CronEditor.css`
- Modify: `src/components/DnsLookup.css`
- Modify: `src/components/EpochConverter.css`
- Modify: `src/components/ExcelToMarkdown.css`
- Modify: `src/components/GitlabToGithub.css`
- Modify: `src/components/InfraDashboard.css`
- Modify: `src/components/IpLookup.css`
- Modify: `src/components/JsonFormatter.css`
- Modify: `src/components/MarkdownPreview.css`
- Modify: `src/components/MermaidEditor.css`
- Modify: `src/components/NasBrowser.css`
- Modify: `src/components/NotesPanel.css`
- Modify: `src/components/PasswordGenerator.css`
- Modify: `src/components/RbacVisualizer.css`
- Modify: `src/components/RegexTester.css`
- Modify: `src/components/SloCalculator.css`
- Modify: `src/components/SpeedTest.css`
- Modify: `src/components/SubnetVisualizer.css`
- Modify: `src/components/TerraformParser.css`
- Modify: `src/components/TextCounter.css`
- Modify: `src/components/UnitConverter.css`

**Interfaces:**
- Consumes: Task 1의 `full-screen modal overlays do not animate the backdrop layer` 테스트
- Produces: 첫 프레임부터 정적으로 표시되는 모든 모달 backdrop

- [ ] **Step 1: 오버레이 animation 선언 제거**

각 파일의 고정 위치 모달 오버레이 규칙에서 다음 형태의 선언만 제거한다.

```css
animation: <overlay-fade-keyframes> <duration> <easing>;
```

`src/App.css`에서는 `.modal-overlay`의 `fadeIn`과 `.tools-modal-overlay`의 `toolsFadeIn`만 제거한다. `.mobile-drawer-overlay`의 `fadeIn`은 유지한다. `ChatPanel.css`와 `NotesPanel.css`의 fade keyframes는 내부 요소도 사용하므로 유지한다.

- [ ] **Step 2: 더 이상 참조되지 않는 전용 keyframes 제거**

오버레이 animation 제거 후 `rg`로 참조 횟수를 확인하고, 참조가 0이 된 fade keyframes만 삭제한다. `fadeIn`, `chat-fade-in`, `notes-fade-in`처럼 다른 요소가 계속 사용하는 keyframes는 유지한다.

Run: `rg -n 'FadeIn|fade-in|fade' src/App.css src/components/*.css`

Expected: 모달 오버레이 규칙에는 animation 선언이 없고, 검색 결과는 내부 패널·내부 콘텐츠·모바일 drawer 등 유지 대상만 포함한다.

- [ ] **Step 3: 첫 번째 테스트 GREEN 확인**

Run: `npx playwright test --grep='full-screen modal overlay rules'`

Expected: PASS 1, FAIL 0.

---

### Task 3: reduced-motion 패널 정책 추가

**Files:**
- Modify: `src/App.css`

**Interfaces:**
- Consumes: Task 1의 `modal panels disable entry animation for reduced motion` 테스트
- Produces: 모달 오버레이의 직접 자식 패널에 적용되는 접근성 모션 정책

- [ ] **Step 1: App.css 끝에 reduced-motion 규칙 추가**

```css
@media (prefers-reduced-motion: reduce) {
  [class$="-overlay"] > *,
  .modal-overlay > .modal-content,
  .tools-modal-overlay > .tools-modal {
    animation: none !important;
  }
}
```

- [ ] **Step 2: 전체 테스트 GREEN 확인**

Run: `npm test`

Expected: PASS 2, FAIL 0.

- [ ] **Step 3: 정적 검증**

Run: `npm run lint`

Expected: exit 0, ESLint error 0.

Run: `npm run build`

Expected: exit 0, `dist/` production bundle 생성.

---

### Task 4: 로컬 브라우저 동작 검증

**Files:**
- No source changes expected

**Interfaces:**
- Consumes: Task 3의 production-ready CSS
- Produces: Tools, Infra, Calendar 모달의 계산 스타일과 기존 UX 유지 증거

- [ ] **Step 1: 로컬 서버 시작**

Run: `npm run dev -- --host 127.0.0.1`

Expected: Vite가 사용 가능한 localhost 포트를 출력한다.

- [ ] **Step 2: 일반 모션 검증**

브라우저에서 Tools, Infra, Calendar를 각각 연다.

Expected:

- `.tools-modal-overlay`, `.infra-overlay`, `.modal-overlay`의 `animation-name`은 `none`이다.
- 각 오버레이의 `backdrop-filter`와 반투명 background는 표시 즉시 최종값이다.
- `.tools-modal`, `.infra-modal` 등 내부 패널 애니메이션은 유지된다.
- Calendar를 닫으면 Tools 모달로 돌아가는 기존 흐름이 유지된다.

- [ ] **Step 3: reduced-motion 검증**

브라우저의 `prefers-reduced-motion: reduce` 에뮬레이션에서 같은 모달을 연다.

Expected: 오버레이와 직접 자식 패널의 `animation-name`이 모두 `none`이다.

---

### Task 5: 수정 커밋과 원격 배포

**Files:**
- Commit all CSS changes from Tasks 2-3

**Interfaces:**
- Consumes: 자동 테스트, lint, build, 로컬 브라우저 검증 성공 결과
- Produces: `main`의 `fix` 커밋, semantic-release 패치 릴리스, GHCR 이미지, Argo CD 운영 반영

- [ ] **Step 1: diff와 커밋 타입 확인**

Run: `git diff --check && git status --short && git diff --stat && git log v1.51.0..HEAD --format='%h %s'`

Expected: CSS와 테스트 관련 변경만 존재하고, 릴리스 대상 커밋 중 기능 변경 `feat`는 없다. 이번 변경 타입은 `fix`이므로 패치 릴리스다.

- [ ] **Step 2: 수정 커밋**

```bash
git add src/App.css src/components/*.css
git commit -m "fix: keep modal backdrops stable on open" -m "전체 화면 오버레이의 opacity fade를 제거하여 모달이 열리는 첫 프레임부터 dim과 blur가 유지되도록 함." -m "내부 패널 애니메이션은 유지하고 reduced-motion 환경에서는 진입 모션을 비활성화함."
```

- [ ] **Step 3: 푸시 직전 전체 검증**

Run: `npm test && npm run lint && npm run build && git status --short`

Expected: 모든 명령 exit 0, uncommitted change 없음.

- [ ] **Step 4: main 푸시**

Run: `git push origin main`

Expected: 원격 `main`에 설계, 테스트, 수정 커밋 반영.

- [ ] **Step 5: 릴리스 파이프라인 확인**

GitHub Actions `Release` workflow가 semantic-release로 `1.51.1` 태그와 release commit을 만들고 `ghcr.io/seonnoh/seonology-clock-page:v1.51.1` 이미지를 푸시하는지 확인한다.

- [ ] **Step 6: GitOps 반영 확인**

`seonology-k3s/workloads-apps/seonology-clock-page.yaml`의 Argo CD Image Updater가 semver 이미지 `1.51.1`을 선택하고, Argo CD가 `seonology-apps/seonology-clock-page` Deployment를 동기화하는지 라이브 클러스터에서 확인한다. 로컬 `seonology-k3s` worktree는 기존 충돌과 사용자 변경이 있으므로 수정하지 않는다.

---

### Task 6: 운영 재현 검증과 기록

**Files:**
- No repository changes expected

**Interfaces:**
- Consumes: 운영 `v1.51.1`
- Produces: 실제 운영 CSS 계산 스타일, 기존 모달 UX, Work History 문서

- [ ] **Step 1: 운영 버전과 CSS 확인**

`https://clock.seonology.com/`에서 footer가 `v1.51.1`인지 확인하고 Tools, Infra, Calendar를 연다.

Expected:

- 세 오버레이 모두 `animation-name: none`.
- dim 배경과 blur가 즉시 적용됨.
- 콘솔 warning/error 없음.
- Calendar 닫기 후 Tools 복귀 유지.

- [ ] **Step 2: Work History 업로드**

수행 커맨드 전문, 오류와 해결, 커밋·태그·배포 결과를 Outline Work History 컬렉션 `31267b17-09b4-447c-aa2e-67a7d02b9808`에 업로드한다.
