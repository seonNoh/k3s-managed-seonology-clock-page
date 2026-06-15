# Seonology Toolkit — 크롬 익스텐션 통합 설계서

> **이 문서의 목적**: `seonology-clock-page`의 기존 React 컴포넌트 자산을 재활용하여,
> 후보 5종을 **하나의 크롬 익스텐션(MV3)** 으로 통합한다. 다른 세션의 모델이 이 문서만 보고
> 곧바로 구현을 시작할 수 있도록, 아키텍처 / UX / 디렉토리 / manifest / 빌드 / 이식 패턴 /
> 작업 순서를 모두 명세한다.

---

## 0. 다른 세션 모델을 위한 온보딩 (먼저 읽을 것)

### 0.1 작업 위치
- **원본(읽기 전용으로 취급)**: `/Users/seon/dev/seonology/seonology-clock-page`
  - React 19 + Vite 7 프로젝트. 컴포넌트는 `src/components/*.jsx`.
  - 원본 앱 로직을 직접 수정하지 말 것. **컴포넌트는 "복사 후 임베드화"** 한다 (이유는 8장).
- **신규 익스텐션 코드**: `seonology-clock-page/toolkit-extension/` (이 디렉토리를 새로 만든다)
  - 기존에 있는 `seonology-clock-page/chrome-extension/`(= "Bookmark Sync")와 **별개**다. 이름이 다르므로 충돌 없음.

### 0.2 절대 건드리지 말 것 (사고 방지)
- `chrome-extension/` — 운영 중인 "Seonology Bookmark Sync" 익스텐션. **수정/삭제 금지.**
- `api/` — Express 백엔드. 본 익스텐션은 이 서버에 의존하지 않는다 (C등급 도구 제외 원칙).
- `.git`, `.github`, `.releaserc.json`, `k8s/`, `dist/` — 배포 파이프라인. 손대지 말 것.
- 원본 `src/`, `package.json`, `vite.config.js` — 가급적 수정하지 않는다. 토킷은 자체 `package.json`을 가진다.

### 0.3 한 줄 요약
> 같은 React 컴포넌트를 **Popup(런처) · New Tab(대시보드) · Context Menu(선택 변환)** 3개 surface에서
> 공유하는 단일 MV3 익스텐션. 도구는 **단일 레지스트리**(`shared/registry.js`)로 관리한다.

---

## 1. 목표와 범위

### 1.1 통합 대상 후보 5종 → surface 매핑

| # | 후보 | 무엇 | 주 surface |
|---|------|------|-----------|
| 1 | 개발자 유틸 박스 | Base64/JSON/Epoch/Regex/PW/Unit/Cron/CIDR | **Popup** + New Tab |
| 2 | 선택 텍스트 우클릭 변환 | 페이지 선택 → 우클릭 → 즉시 변환 | **Context Menu** |
| 3 | 인프라/SRE 시각화 | RBAC/Terraform/CICD/SLO/GL→GH/Excel→MD | **Popup(Infra 탭)** + New Tab |
| 4 | 라이브 인포 패널 | Weather/Exchange/DNS/IP/TodayInHistory | **Popup(Live 탭)** + New Tab |
| 5 | 미니 시계 새 탭 | Clock/FlipClock/CursorCanvas/검색 | **New Tab override** |

→ 5종은 서로 **배타적이지 않다.** Popup·New Tab은 같은 도구 레지스트리를 공유하고,
Context Menu는 도구의 "순수 변환 함수"만 호출한다. 즉 한 번 이식하면 여러 surface에서 동시에 쓰인다.

### 1.2 익스텐션 정체성
- 이름: **Seonology Toolkit**
- 한 줄 설명: "개발자 유틸 · 인프라 시각화 · 실시간 정보 · 시계 새 탭을 한 곳에"
- 철학: **키 불필요 · 서버 불필요 · 오프라인 우선.** 외부 호출은 키 없는 공개 API만.

### 1.3 제외 대상 (C등급 — 자체 백엔드 의존)
다음은 `clock.seonology.com` / `localhost:3001` 데이터에 의존하므로 **이번 범위에서 제외**한다:
`TodoList · NotesPanel · Calendar · ChatPanel · BrowserStats · InfraDashboard · NasBrowser · CloudBrowser`
- 대안: Todo/Notes는 추후 `chrome.storage.local` 기반 **로컬 전용 버전**으로 재작성 가능(별도 백로그, 11장).

---

## 2. 소스 자산 인벤토리 (재사용 맵)

> 모든 경로는 `seonology-clock-page/src/components/` 기준. props 시그니처는 실제 코드에서 추출함.

### 2.1 A등급 — 즉시 이식 (네트워크 0, 순수 클라이언트)

| 컴포넌트 | 파일 | props | localStorage | 비고 |
|---|---|---|---|---|
| Base64Tool | `Base64Tool.jsx` | `{isOpen,onClose}` | 없음 | btoa/atob, 파일→b64, clipboard |
| JsonFormatter | `JsonFormatter.jsx` | `{isOpen,onClose}` | 없음 | |
| UnitConverter | `UnitConverter.jsx` | `{isOpen,onClose}` | 없음 | |
| PasswordGenerator | `PasswordGenerator.jsx` | `{isOpen,onClose}` | 사용 | crypto.getRandomValues |
| ColorPicker | `ColorPicker.jsx` | `{isOpen,onClose}` | 사용 | |
| CronEditor | `CronEditor.jsx` | `{isOpen,onClose}` | 사용 | |
| SubnetVisualizer | `SubnetVisualizer.jsx` | `{isOpen,onClose}` | 사용 | CIDR 계산 |
| SloCalculator | `SloCalculator.jsx` | `{isOpen,onClose}` | 사용 | |
| RegexTester | `RegexTester.jsx` | `{isOpen,onClose}` | 없음 | |
| EpochConverter | `EpochConverter.jsx` | `{isOpen,onClose}` | 없음 | |
| TextCounter | `TextCounter.jsx` | `{isOpen,onClose}` | 없음 | |
| TerraformParser | `TerraformParser.jsx` | `{isOpen,onClose}` | 없음 | HCL/state 파싱 |
| GitlabToGithub | `GitlabToGithub.jsx` | `{isOpen,onClose}` | 없음 | YAML 변환 |
| ExcelToMarkdown | `ExcelToMarkdown.jsx` | `{isOpen,onClose}` | 없음 | |
| MarkdownPreview | `MarkdownPreview.jsx` | `{isOpen,onClose}` | 사용 | `utils/markdown.js` 의존 |
| CiCdVisualizer | `CiCdVisualizer.jsx` | `{isOpen,onClose}` | 없음 | |
| RbacVisualizer | `RbacVisualizer.jsx` | `{isOpen,onClose}` | 없음 | |
| ArchIconSearch | `ArchIconSearch.jsx` | `{isOpen,onClose}` | 없음 | |
| Fortune | `Fortune.jsx` | 없음(독립) | 확인필요 | |
| Clock | `Clock.jsx` | 없음(독립) | 사용 | 12종 테마, FlipClock 의존 |
| FlipClock | `FlipClock.jsx` | `{time,embedded}` | 없음 | Clock의 flip 테마 |
| CursorCanvas | `CursorCanvas.jsx` | `{effect}` | 없음 | 커서 애니메이션 |

### 2.2 B등급 — 키 없는 공개 API (host_permissions 필요)

| 컴포넌트 | 파일 | props | 외부 도메인 | 용도 |
|---|---|---|---|---|
| Weather | `Weather.jsx` | 없음(독립) | `api.open-meteo.com`, `nominatim.openstreetmap.org` | 날씨+역지오코딩 |
| ExchangeRate | `ExchangeRate.jsx` | 없음(독립) | `api.exchangerate-api.com` | 환율 |
| DnsLookup | `DnsLookup.jsx` | `{isOpen,onClose}` | `dns.google` | DNS-over-HTTPS |
| IpLookup | `IpLookup.jsx` | `{isOpen,onClose}` | `ipapi.co` | IP 조회 |
| TodayInHistory | `TodayInHistory.jsx` | 없음(독립) | `api.wikimedia.org` | 역사 속 오늘 |
| SpeedTest | `SpeedTest.jsx` | `{isOpen,onClose}` | `speed.cloudflare.com`, `1.1.1.1` | 속도측정 |

> `App.jsx` 상단 `WeatherWidget`/`ExchangeWidget`은 **별도 인라인 위젯**(open-meteo, api.manana.kr 사용)이다.
> New Tab용 위젯은 이 인라인 버전을 참고하되, 정식 `Weather.jsx`/`ExchangeRate.jsx`를 이식하는 것을 권장.

### 2.3 무거운 의존성 경고
- **mermaid** (`MermaidEditor.jsx`) — 번들 수백 KB. 반드시 **동적 import + 코드 스플릿**. Popup 기본 번들에 넣지 말 것.
- **date-holidays** (`Calendar.jsx`) — C등급이라 이번 범위 제외. 의존성도 가져오지 않는다.

### 2.4 디자인 토큰 (원본 `src/index.css :root`)
```css
:root {
  --bg-primary: #0a0a0f;   --bg-card: #151520;
  --text-primary: rgba(255,255,255,0.95);
  --text-secondary: rgba(255,255,255,0.5);
  --text-muted: rgba(255,255,255,0.25);
  --accent-primary: #6366f1;  --accent-secondary: #818cf8;
  --border-color: rgba(255,255,255,0.08);
  --shadow-lg: 0 25px 50px rgba(0,0,0,0.5);
  --radius-sm: 8px;  --radius-md: 12px;  --radius-lg: 20px;
  --transition: 0.2s ease;
}
```
- 폰트: `Inter`, `JetBrains Mono`, `Noto Sans KR`, `Noto Sans JP`. 원본은 Google Fonts CDN 로드.
  **익스텐션은 CSP상 외부 폰트 로드가 제한**되므로 → `toolkit-extension/public/fonts/`에 woff2 로컬 번들 + `@font-face`.
  (간단히 가려면 시스템 폰트 스택으로 대체해도 무방. 6.2 CSP 참고.)

---

## 3. 통합 아키텍처

### 3.1 surface 4종 (3 UI + 1 백그라운드)
```
┌─────────────────────────────────────────────────────────────┐
│                     Seonology Toolkit (MV3)                   │
├───────────────┬───────────────┬───────────────┬──────────────┤
│  ACTION POPUP │  NEW TAB PAGE │ CONTEXT MENU  │  BACKGROUND  │
│  popup.html   │  newtab.html  │ (content용)   │  service     │
│  (런처/탭)    │  (대시보드)   │ 선택→변환     │  worker      │
├───────────────┴───────────────┴───────────────┴──────────────┤
│              shared/  (도구 레지스트리 · 변환 함수 ·          │
│                       테마 · 공용 UI · storage 래퍼)          │
└─────────────────────────────────────────────────────────────┘
```

- **Popup** (`action.default_popup`): 빠른 도구 런처. 검색 + 핀 + 탭(Tools/Infra/Live). 도구 클릭 시 popup 내부에 임베드 렌더 또는 New Tab으로 확장 오픈.
- **New Tab** (`chrome_url_overrides.newtab`): 시계 중심 풀 대시보드. 후보5 + 모든 도구 그리드.
- **Context Menu**: background가 `contextMenus`로 등록. 선택 텍스트를 변환 함수에 통과 → 결과를 클립보드 복사 + 토스트(content script) 또는 작은 결과 페이지.
- **Background service worker**: contextMenus 등록/처리, `commands`(단축키) 라우팅, storage 마이그레이션.

### 3.2 데이터 계층
- `chrome.storage.local` (또는 `.sync`)에 통합 저장. 원본의 `localStorage` 키와 **분리된 네임스페이스** 사용.
  - `toolkit:pins` — 핀 고정한 도구 id 배열
  - `toolkit:recent` — 최근 사용 도구 id (최대 8)
  - `toolkit:settings` — 테마(dark/auto), 기본 surface, context menu on/off
  - `toolkit:tool:<id>` — 도구별 상태(예: Clock 테마). 원본 localStorage 사용 컴포넌트는 8.4의 storage 어댑터로 래핑.

### 3.3 모듈 의존 규칙
- `shared/`는 chrome API에 직접 의존하지 않는다(테스트 용이). chrome 접근은 `shared/storage.js` 래퍼 1곳으로 격리.
- 순수 변환 로직(`shared/transforms/*`)은 React 비의존. Context Menu와 도구 컴포넌트가 공용으로 호출.

---

## 4. UX 설계 (핵심)

### 4.1 디자인 원칙
1. **2초 규칙**: Popup 열고 2초 안에 원하는 도구 실행. → 자동 포커스 검색 + 핀 + 최근.
2. **일관 테마**: 전 surface 동일 토큰(2.4). 다크 기본, `prefers-color-scheme` auto 옵션.
3. **점진적 노출**: Popup은 컴팩트, 깊은 작업은 New Tab으로 "확장(expand)". 같은 컴포넌트 재사용.
4. **무모달 임베드**: 원본의 풀스크린 모달 오버레이를 surface에 맞는 **임베드 패널**로 변환(8장).
5. **키보드 우선**: `/` 검색 포커스, `↑↓` 이동, `Enter` 실행, `Esc` 닫기, 전역 `commands` 단축키.

### 4.2 Popup (도구 런처) — 와이어프레임
- 크기: `width: 380px`, `min-height: 480px`, `max-height: 600px`(스크롤).
```
┌────────────────────────────────────────────┐
│ ◆ Seonology Toolkit            [⚙] [⤢ NewTab]│  ← 헤더: 설정, 새탭 확장
├────────────────────────────────────────────┤
│ 🔍 [ Search tools…              ] (autofocus)│  ← fuzzy 검색 (/ 로 포커스)
├────────────────────────────────────────────┤
│ ╭ Tools ╮ ╭ Infra ╮ ╭ Live ╮                │  ← 세그먼트 탭
├────────────────────────────────────────────┤
│ ★ PINNED                                     │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐         │
│  │ {} │ │ b64│ │ ⏱  │ │ .*  │                │  ← 핀 고정 도구 (드래그 정렬)
│  │JSON│ │Base│ │Epoch│ │Regex│               │
│  └──────┘ └──────┘ └──────┘ └──────┘         │
│                                              │
│ ◷ RECENT                                     │
│  [ CIDR ] [ Password ] [ Unit ]              │  ← 최근 사용 (칩)
│                                              │
│ ▦ ALL (현재 탭 = Tools)                       │
│  ┌──┐┌──┐┌──┐┌──┐  4열 그리드, hover 확대      │
│  │..││..││..││..│                            │
│  └──┘└──┘└──┘└──┘  ...                        │
├────────────────────────────────────────────┤
│ 선택 텍스트 변환 우클릭 메뉴: ON  [토글]       │  ← 풋터 빠른 설정
└────────────────────────────────────────────┘
```
- **도구 클릭 동작(설정 가능)**:
  - 기본: popup 안에서 **인플레이스 임베드**로 열림(헤더에 ← back). 좁아서 불편한 무거운 도구(Mermaid/RBAC/Terraform 등)는
  - "이 도구는 새 탭에서 더 좋아요 → [새 탭으로 열기]" CTA 노출 또는 자동으로 New Tab+딥링크.
- **핀/최근**은 `chrome.storage.local`에 저장. 핀 토글은 각 도구 카드 우상단 ★.

### 4.3 New Tab (대시보드) — 와이어프레임
- 후보5(시계)를 중심으로, 후보1·3·4 도구를 그리드/도크로 통합. 원본 `App.jsx` 레이아웃의 축소·정제판.
```
┌──────────────────────────────────────────────────────────────┐
│ SEONOLOGY ▸ Toolkit          ☀ 21°  ₩100=¥11.0   [tabs:12]    │ ← 상단바: 타이틀 / 라이브 위젯(Weather,Exchange)
│                                                                │
│                                                                │
│                        ┌──────────────┐                        │
│                        │   12 : 34    │   ← Clock(테마 12종)   │
│                        │  Fri, May 30 │      클릭 시 테마 피커  │
│                        └──────────────┘                        │
│                  🔍 [ Search Google…              ]            │ ← 검색바(원본 SearchBar, 단 suggest는 9.3 참고)
│             [Gmail][Claude][Gemini][YouTube][VSCode]           │ ← 퀵 숏컷(정적 링크)
│                                                                │
├──────────────────────────────────────────────────────────────┤
│  DEV TOOLS                          INFRA            LIVE      │ ← 하단 도크: 카테고리별 도구 칩 그리드
│  {}JSON  b64  ⏱Epoch  .*Regex  …    RBAC  TF  …   DNS IP …    │
└──────────────────────────────────────────────────────────────┘
```
- 도구 칩 클릭 → New Tab 위에 **임베드 패널(슬라이드/모달)** 로 열림(원본 모달 UX를 거의 그대로 재사용 가능).
- New Tab은 popup보다 넓으므로 Mermaid/RBAC/Terraform 등 **무거운 도구의 주 무대**.
- 라이브 위젯(Weather/Exchange/TodayInHistory)은 상단/사이드에 상주. DnsLookup/IpLookup/SpeedTest는 LIVE 그룹 칩.

### 4.4 Context Menu (선택 텍스트 변환) — 흐름
- background에서 `contextMenus.create`로 부모 메뉴 "Seonology Toolkit" + 하위 항목 등록:
  - Decode Base64 / Encode Base64
  - Format JSON (selection이 JSON일 때)
  - Epoch → Date (selection이 숫자일 때)
  - URL Decode / URL Encode
  - Count characters/words
  - Test as Regex… (→ New Tab의 Regex 도구에 프리필로 전달)
- 동작 흐름:
```
사용자 텍스트 선택 → 우클릭 → "Seonology Toolkit ▸ Decode Base64"
   → background: shared/transforms/base64.decode(selectionText)
   → 결과 처리(설정에 따라):
       (a) 클립보드 복사 + content script 토스트 "복사됨: …"
       (b) 작은 result popup(별도 확장 페이지)으로 표시
       (c) 변환 결과를 페이지에 인라인 주입(읽기 영역만, 선택사항)
```
- 구현 핵심: **변환 함수는 `shared/transforms/`의 순수 함수**여야 한다(React 비의존). 도구 컴포넌트와 100% 공유.
- 권한: `contextMenus`, `scripting`(토스트 주입용; 또는 `activeTab`), `clipboardWrite`.

### 4.5 공통 시스템 — 도구 레지스트리 · 검색 · 핀 · 단축키
- **레지스트리(9장)**: 모든 surface가 동일 `TOOLS` 배열을 import. 도구의 메타(id, 이름, 카테고리, 아이콘, 컴포넌트 로더, surface 지원, context 변환 함수)를 한 곳에 정의.
- **검색**: 이름 + 별칭(aliases) fuzzy 매칭. 데이터는 레지스트리.
- **핀/최근**: storage. Popup·New Tab 공유.
- **단축키(`commands`)**: 예) `Cmd/Ctrl+Shift+J`=JSON 포맷(클립보드 대상), `Cmd/Ctrl+Shift+K`=Toolkit New Tab 열기. manifest의 `commands`로 선언, background에서 라우팅.

### 4.6 테마 / 폰트
- 테마: 다크 기본. 설정에서 `dark | auto`. auto는 `matchMedia('(prefers-color-scheme: light)')`로 라이트 토큰 세트 토글.
  - 원본은 다크 전용이므로 **라이트 토큰은 신규 정의 필요**(백로그 가능, 초기엔 dark 고정으로 출시해도 됨).
- 폰트: 로컬 woff2 번들 권장. 최소 출시는 시스템 폰트 스택으로 시작 가능:
  `font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;` / mono는 `'JetBrains Mono', ui-monospace, monospace;`

---

## 5. 디렉토리 구조 (생성 대상)

```
seonology-clock-page/
└── toolkit-extension/                 ← 신규. 이 안에서만 작업
    ├── package.json                   ← 자체 의존성(react, vite, @vitejs/plugin-react)
    ├── vite.config.js                 ← 멀티 엔트리 (7장)
    ├── manifest.json                  ← MV3 (public/로 복사됨) (6장)
    ├── index.html                     ← (선택) 개발 인덱스
    ├── popup.html                     ← Popup 엔트리
    ├── newtab.html                    ← New Tab 엔트리
    ├── result.html                    ← (선택) context menu 결과 표시 페이지
    ├── public/
    │   ├── icons/                     ← icon16/48/128.png (기존 chrome-extension/icons 재활용 가능)
    │   └── fonts/                     ← (선택) Inter/JetBrains Mono woff2
    └── src/
        ├── popup/
        │   ├── main.jsx               ← createRoot → <PopupApp/>
        │   ├── PopupApp.jsx           ← 검색/탭/핀/그리드 (4.2)
        │   └── popup.css
        ├── newtab/
        │   ├── main.jsx               ← createRoot → <NewTabApp/>
        │   ├── NewTabApp.jsx          ← 시계 대시보드 (4.3)
        │   └── newtab.css
        ├── background/
        │   └── service-worker.js      ← contextMenus, commands, storage 마이그레이션 (4.4)
        ├── content/
        │   └── toast.js               ← (선택) 변환 결과 토스트 주입
        ├── shared/
        │   ├── registry.js            ← 단일 도구 레지스트리 (9장)
        │   ├── storage.js             ← chrome.storage 래퍼 + localStorage 어댑터 (8.4)
        │   ├── theme.css              ← 디자인 토큰(2.4) + @font-face
        │   ├── ui/
        │   │   ├── ToolHost.jsx       ← 모달→임베드 호스트 래퍼 (8.2)
        │   │   └── Toast.jsx
        │   └── transforms/            ← React 비의존 순수 함수 (context menu 공용)
        │       ├── base64.js
        │       ├── json.js
        │       ├── epoch.js
        │       ├── url.js
        │       └── text.js
        └── tools/                     ← 원본 컴포넌트의 "임베드화" 복사본 (8장)
            ├── Base64Tool.jsx
            ├── JsonFormatter.jsx
            ├── ...(A/B등급 전부)
            ├── Clock.jsx  FlipClock.jsx  CursorCanvas.jsx
            └── *.css                  ← 원본 동명 CSS 동반 복사
```

> **참고**: `tools/`는 원본 `src/components/`에서 복사 후 8장 규칙대로 임베드화한다.
> 단순 심볼릭/직접 import는 모달 래퍼·localStorage 충돌 때문에 권장하지 않는다.

---

## 6. manifest.json (MV3 전체)

```json
{
  "manifest_version": 3,
  "name": "Seonology Toolkit",
  "version": "0.1.0",
  "description": "개발자 유틸 · 인프라 시각화 · 실시간 정보 · 시계 새 탭을 한 곳에",
  "icons": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" },

  "action": {
    "default_popup": "popup.html",
    "default_icon": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" }
  },

  "chrome_url_overrides": { "newtab": "newtab.html" },

  "background": { "service_worker": "service-worker.js", "type": "module" },

  "permissions": [
    "storage",
    "contextMenus",
    "clipboardWrite",
    "scripting"
  ],

  "optional_permissions": ["clipboardRead"],

  "host_permissions": [
    "https://api.open-meteo.com/*",
    "https://nominatim.openstreetmap.org/*",
    "https://api.exchangerate-api.com/*",
    "https://dns.google/*",
    "https://ipapi.co/*",
    "https://api.wikimedia.org/*",
    "https://speed.cloudflare.com/*",
    "https://1.1.1.1/*"
  ],

  "commands": {
    "open-newtab-toolkit": {
      "suggested_key": { "default": "Ctrl+Shift+K", "mac": "Command+Shift+K" },
      "description": "Open Seonology Toolkit dashboard"
    },
    "format-json-clipboard": {
      "suggested_key": { "default": "Ctrl+Shift+J", "mac": "Command+Shift+J" },
      "description": "Format JSON from clipboard"
    }
  },

  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

**주의사항**
- `host_permissions`는 B등급 도구를 쓰지 않을 거면 줄여도 된다(심사·신뢰도↑). 도구별 lazy 활성화 시 `optional_host_permissions`로 분리 가능.
- `scripting`은 토스트 주입(4.4)용. 토스트를 안 쓰고 result.html 팝업만 쓰면 제거 가능 → 권한 최소화.
- `chrome_url_overrides.newtab`은 사용자의 새 탭을 점유한다. **출시 시 명확히 고지**(스토어 설명/온보딩). 사용자가 끌 수 있도록 설정에서 "기본 새 탭 사용" 옵션 고려(단, override 자체는 코드로 토글 불가 → 별도 빌드 또는 빈 페이지+리다이렉트 트릭).
- CSP: 외부 스크립트/폰트 로드 불가. 폰트·mermaid 등 전부 번들에 포함.

---

## 7. 빌드 시스템 (Vite 멀티 엔트리)

> CRXJS(@crxjs/vite-plugin)는 편리하지만 Vite 7 호환이 불안정할 수 있다.
> **견고함 우선 → 수동 멀티 엔트리 + 정적 manifest 복사**를 1순위로 한다.

### 7.1 `toolkit-extension/package.json` (신규)
```jsonc
{
  "name": "seonology-toolkit-extension",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "zip": "cd dist && zip -r ../seonology-toolkit.zip ."
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
    // mermaid는 Mermaid 도구 이식 단계에서 추가 (동적 import)
  },
  "devDependencies": {
    "vite": "^7.2.4",
    "@vitejs/plugin-react": "^5.1.1"
  }
}
```

### 7.2 `toolkit-extension/vite.config.js` (멀티 엔트리)
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, cpSync } from 'fs';

// manifest와 public 자산을 dist로 복사하는 소형 플러그인
function copyStatic() {
  return {
    name: 'copy-static',
    closeBundle() {
      mkdirSync('dist', { recursive: true });
      copyFileSync('manifest.json', 'dist/manifest.json');
      cpSync('public', 'dist', { recursive: true }); // icons, fonts
    },
  };
}

export default defineConfig({
  plugins: [react(), copyStatic()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        newtab: resolve(__dirname, 'newtab.html'),
        // result: resolve(__dirname, 'result.html'),  // 선택
        'service-worker': resolve(__dirname, 'src/background/service-worker.js'),
      },
      output: {
        // service worker는 청크 분할되면 안 됨 → 엔트리 파일명 고정
        entryFileNames: (chunk) =>
          chunk.name === 'service-worker' ? 'service-worker.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
```
- `popup.html`/`newtab.html`은 각각 `<script type="module" src="/src/popup/main.jsx">` 형태.
- **service worker 분할 금지**: 위처럼 `entryFileNames`로 고정. manifest의 `service_worker` 경로(`service-worker.js`)와 일치해야 함.
- mermaid는 `import('mermaid')` **동적 import**로 별도 청크 → popup 초기 번들에 미포함.

### 7.3 로드/검증
```bash
cd seonology-clock-page/toolkit-extension
npm install
npm run build          # → dist/ 생성
# chrome://extensions → 개발자 모드 → "압축 해제된 확장 프로그램 로드" → dist/ 선택
```

---

## 8. 컴포넌트 이식 가이드 (가장 중요)

원본 도구는 **풀스크린 모달**(`{isOpen,onClose}` + 오버레이 + `if(!isOpen) return null`)이다.
surface 임베드를 위해 다음 규칙으로 변환한다.

### 8.1 변환 원칙 — ★검증됨: 13개 도구가 동일 2겹 구조
실제 소스 확인 결과, 모달형 도구 전부가 아래 **동일한 2겹 래퍼**를 가진다(prefix만 다름):
```jsx
if (!isOpen) return null;
return (
  <div className="b64-overlay" onClick={onClose}>            {/* 바깥: 전체화면 오버레이 */}
    <div className="b64-modal" onClick={e => e.stopPropagation()}>  {/* 안쪽: 모달 박스 */}
      {/* ...실제 콘텐츠... */}
    </div>
  </div>
);
```
확인된 prefix 매핑(= `X-overlay`/`X-modal`):
`b64, jf, rx, ep, uc, subnet, slo, cpick, cron, pwgen, tc, ip, dns` … (그 외 container형: `cicd-container, e2m-container, rbac-container, tfp-container, gl2gh-container, archi-container, speed-modal`)

→ **구조가 균일하므로 "방법 A(공용 CSS 임베드)"가 기계적으로 적용 가능하다. 이것을 1순위로 한다.**

원칙:
1. **로직 0 변경.** 변환/계산 로직·상태·JSX는 손대지 않는다(회귀 방지).
2. **CSS 동반 복사.** 각 `*.jsx`의 동명 `*.css`를 `tools/`로 함께 복사. 클래스가 prefix되어 충돌 적음.
3. **래퍼는 CSS로 무력화**(제거하지 않음). overlay→정적, modal→풀폭.

### 8.2 이식 방법 A (권장·기본) — 공용 CSS 임베드 한 장
원본을 **거의 수정하지 않는다.** `isOpen`을 항상 `true`로 주고, `onClose`는 surface의 back/close에 연결.
오버레이/모달을 아래 공용 CSS로 임베드화한다:
```css
/* shared/ui/embed.css — surface 컨테이너에 .toolkit-embed 클래스를 부여 */
.toolkit-embed [class$="-overlay"] {           /* 모든 *-overlay */
  position: static !important; inset: auto !important;
  background: none !important; backdrop-filter: none !important;
  padding: 0 !important; display: block !important;
}
.toolkit-embed [class$="-modal"],
.toolkit-embed [class$="-container"] {          /* 모든 *-modal / *-container */
  width: 100% !important; max-width: none !important;
  height: auto !important; max-height: none !important;
  box-shadow: none !important; border-radius: 0 !important;
}
```
- `[class$="-overlay"]`(접미사 선택자)로 13개 prefix를 일괄 처리 → 도구마다 개별 CSS 불필요.
- 호출부:
```jsx
// surface에서 도구를 임베드로 렌더
import Base64Tool from '../tools/Base64Tool.jsx'; // 원본 거의 그대로 (수정 없음)
<div className="toolkit-embed">
  <ToolHost title="Base64" onClose={back}>
    <Base64Tool isOpen={true} onClose={back} />
  </ToolHost>
</div>
```
> 일부 도구는 자체 close 버튼(`X-close-btn` 등)이 onClose를 호출한다. 임베드에서는 ToolHost의 close와 중복될 수 있으니, ToolHost를 헤더 없이 쓰거나 도구 자체 헤더를 CSS로 숨긴다(`.toolkit-embed .b64-header{display:none}` 식, 선택).

### 8.2b 이식 방법 B (정석·선택) — 본문 분리
CSS 오버라이드가 특정 도구에서 깨지면, 그 도구만 본문을 분리한다:
```jsx
// tools/Base64Tool.jsx (해당 도구만 리팩터링)
function Base64ToolBody() { /* 원본의 상태/핸들러/본문 JSX에서 .b64-overlay/.b64-modal 두 겹만 제거 */ }
export default function Base64Tool({ onClose }) {
  return <ToolHost title="Base64 Encoder / Decoder" onClose={onClose}><Base64ToolBody/></ToolHost>;
}
```
> **권장 전략: 전체는 방법 A로 일괄 처리하고, 깨지는 소수만 방법 B로 개별 대응.**

### 8.2c `ToolHost` (헤더/back 제공)
```jsx
// shared/ui/ToolHost.jsx
export function ToolHost({ title, onClose, variant = 'embed', children }) {
  // variant: 'embed'(popup) | 'sheet'(newtab 슬라이드) | 'modal'(newtab 중앙)
  return (
    <div className={`toolhost toolhost-${variant}`}>
      <header className="toolhost-header">
        <button className="toolhost-back" onClick={onClose} aria-label="Back">‹</button>
        <span className="toolhost-title">{title}</span>
      </header>
      <div className="toolhost-body toolkit-embed">{children}</div>
    </div>
  );
}
```

### 8.3 독립형 컴포넌트(props 없음)
`Clock / Weather / ExchangeRate / Fortune / TodayInHistory`는 모달이 아니라 그대로 렌더 가능.
New Tab/Popup에 직접 배치. `Clock`은 `FlipClock`을 import하므로 둘 다 복사.

### 8.4 storage 어댑터 (localStorage → chrome.storage)
원본 A등급 일부는 `localStorage.getItem/setItem`을 직접 쓴다(Clock, ColorPicker, CronEditor, SubnetVisualizer, SloCalculator, PasswordGenerator, MarkdownPreview 등).
- **MVP(초기)**: 익스텐션 페이지에서도 `localStorage`는 동작한다(확장 origin에 한정). **그대로 둬도 됨.**
- **정석**: `shared/storage.js`에 동기 캐시 + `chrome.storage.local` 비동기 백킹 어댑터를 만들고, 컴포넌트의 `localStorage` 호출을 `toolkitStore.get/set`으로 치환. (cross-surface 동기화·`.sync` 백업 원할 때.)
- 키 충돌 방지: 원본 키(`clock-theme` 등)를 `toolkit:`로 prefix.

### 8.5 외부 fetch(B등급) — CORS/host_permissions
- 코드는 그대로(이미 `fetch('https://…')`). 단 manifest `host_permissions`에 도메인 등록(6장)되어야 확장 페이지에서 CORS 우회 가능.
- 호출이 실패하면: (1) host_permissions 누락, (2) API rate limit(ipapi.co 무료 한도), (3) CSP `connect-src` — MV3 확장 페이지는 host_permissions로 충분하나, 필요 시 CSP에 `connect-src` 명시.

### 8.6 mermaid (선택, New Tab 전용 권장)
- `MermaidEditor.jsx`의 `import mermaid from 'mermaid'`를 **동적 import**로:
  `const mermaid = (await import('mermaid')).default;` → 별도 청크.
- CSP상 mermaid가 외부 리소스를 안 받게 `startOnLoad:false`, `securityLevel:'strict'` 확인.
- Popup에는 넣지 말 것(번들 비대). New Tab의 Infra 그룹에서만 노출.

### 8.7 transforms — ★정정: "추출"이 아니라 "신규 작성"
원본의 변환 로직(`handleEpochConvert`, `analyzeJson` 등)은 `setState`와 강결합되어 있어 그대로 떼어낼 수 없다.
**핵심 로직은 단순하므로 순수 함수로 새로 쓴다.** 아래는 그대로 쓸 수 있는 완성본(원본 로직 반영):
```js
// shared/transforms/base64.js
export const encode = (t) => btoa(unescape(encodeURIComponent(t)));
export const decode = (t) => decodeURIComponent(escape(atob(t.trim())));

// shared/transforms/json.js  (원본 JsonFormatter 동작과 동일: parse→stringify)
export const format = (t, indent = 2) => JSON.stringify(JSON.parse(t), null, indent);
export const minify = (t) => JSON.stringify(JSON.parse(t));

// shared/transforms/epoch.js  (원본 EpochConverter.jsx:45 자동 sec/ms 판별 로직 반영)
export const toDate = (v) => {
  const num = Number(String(v).trim());
  if (Number.isNaN(num)) throw new Error('Invalid number');
  const ts = Math.abs(num) > 1e12 ? num : num * 1000;  // >1e12면 ms로 간주
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid timestamp');
  return d.toISOString();
};

// shared/transforms/url.js
export const encodeUrl = (t) => encodeURIComponent(t);
export const decodeUrl = (t) => decodeURIComponent(t);

// shared/transforms/text.js
export const count = (t) => ({
  chars: t.length,
  words: (t.trim().match(/\S+/g) || []).length,
  lines: t.split(/\r\n|\r|\n/).length,
});
```
- 각 함수는 **실패 시 throw**. context menu/단축키 핸들러(background)에서 try/catch → 실패 토스트.
- 도구 컴포넌트(Base64Tool 등)는 원본 인라인 로직을 유지하고, **context 경로만** 이 transforms를 쓴다(중복 허용; 회귀 위험 최소화). 추후 컴포넌트도 이 함수를 쓰도록 점진 통합 가능.

### 8.8 아이콘 시스템 — ★누락 보강
레지스트리의 `icon: 'b64'` 키는 **`shared/ui/ToolIcon.jsx`의 switch로 SVG를 반환**한다. SVG 출처는
원본 `App.jsx` 1408~1678행 `app-icon-btn` 안의 인라인 `<svg>`들(각 도구 버튼에 이미 존재).
```jsx
// shared/ui/ToolIcon.jsx — App.jsx의 app-icon SVG를 그대로 옮겨 매핑
export function ToolIcon({ name, size = 22 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
              stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'json':  return (<svg {...p}><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/></svg>);
    case 'b64':   return (<svg {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 9.5h20"/></svg>);
    case 'epoch': return (<svg {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>);
    case 'regex': return (<svg {...p}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>);
    // … 나머지는 App.jsx 1408~1678에서 동일하게 복사 (cidr, slo, cron, pw, unit, color, rbac, tf, cicd, gl2gh, xls, arch, dns, ip, mermaid …)
    default: return (<svg {...p}><rect x="4" y="4" width="16" height="16" rx="3"/></svg>);
  }
}
```
> 작업 지시: App.jsx 1408~1678의 각 `app-icon-btn` SVG를 `title`/`label` 기준으로 `ToolIcon`의 case로 1:1 이식.
> 아이콘 키는 9장 레지스트리의 `icon` 값과 일치시킬 것.

### 8.9 의존성 — ★검증됨
도구 컴포넌트 전수 grep 결과 외부 라이브러리 import는 **3개뿐**:
- `mermaid` (MermaidEditor만) → 동적 import, New Tab 전용 (8.6)
- `date-holidays` (Calendar = C등급, 제외) → **가져오지 않음**
- `../utils/markdown` (MarkdownPreview만) → `utils/markdown.js`를 `shared/`로 동반 복사
→ `lucide-react`는 도구가 쓰지 않으므로(App.jsx 위젯만 사용) **toolkit package.json에 react/react-dom만으로 충분**(7.1 확정).

---

## 9. 도구 레지스트리 스펙 (단일 진실 소스)

모든 surface가 이 배열을 import한다. 도구 추가/카테고리/검색/핀이 전부 여기서 파생.

```js
// shared/registry.js
import * as base64 from './transforms/base64';
import * as jsonT from './transforms/json';
import * as epoch from './transforms/epoch';
// ...

export const CATEGORIES = {
  tools: 'Dev Tools',
  infra: 'Infra / SRE',
  live:  'Live Info',
  clock: 'Clock',
};

// component: surface에서 React.lazy(loader)로 임베드. transform: context menu/단축키용 순수 함수.
export const TOOLS = [
  {
    id: 'base64',
    name: 'Base64',
    aliases: ['encode', 'decode', 'b64'],
    category: 'tools',
    icon: 'b64',                         // shared/ui 아이콘 키
    surfaces: ['popup', 'newtab', 'context'],
    weight: 'light',                     // light | heavy(주로 newtab)
    load: () => import('../tools/Base64Tool.jsx'),
    context: [                            // context menu 항목 정의
      { id: 'b64-decode', title: 'Decode Base64', run: base64.decode },
      { id: 'b64-encode', title: 'Encode Base64', run: base64.encode },
    ],
  },
  {
    id: 'json', name: 'JSON Formatter', aliases: ['format','pretty','minify'],
    category: 'tools', icon: 'json', surfaces: ['popup','newtab','context'],
    weight: 'light', load: () => import('../tools/JsonFormatter.jsx'),
    context: [{ id: 'json-format', title: 'Format JSON', run: jsonT.format }],
  },
  { id: 'epoch', name: 'Epoch Converter', aliases: ['unix','timestamp'], category: 'tools',
    icon: 'epoch', surfaces: ['popup','newtab','context'], weight: 'light',
    load: () => import('../tools/EpochConverter.jsx'),
    context: [{ id: 'epoch-to-date', title: 'Epoch → Date', run: epoch.toDate }] },
  { id: 'regex', name: 'Regex Tester', aliases: ['regexp','pattern'], category: 'tools',
    icon: 'regex', surfaces: ['popup','newtab'], weight: 'light',
    load: () => import('../tools/RegexTester.jsx') },
  { id: 'password', name: 'Password Generator', aliases: ['pw','random'], category: 'tools',
    icon: 'pw', surfaces: ['popup','newtab'], weight: 'light',
    load: () => import('../tools/PasswordGenerator.jsx') },
  { id: 'unit', name: 'Unit Converter', aliases: ['convert'], category: 'tools',
    icon: 'unit', surfaces: ['popup','newtab'], weight: 'light',
    load: () => import('../tools/UnitConverter.jsx') },
  { id: 'cron', name: 'Cron Editor', category: 'tools', icon: 'cron',
    surfaces: ['popup','newtab'], weight: 'light', load: () => import('../tools/CronEditor.jsx') },
  { id: 'cidr', name: 'CIDR / Subnet', aliases: ['subnet','ip'], category: 'tools',
    icon: 'cidr', surfaces: ['popup','newtab'], weight: 'light',
    load: () => import('../tools/SubnetVisualizer.jsx') },
  { id: 'color', name: 'Color Picker', category: 'tools', icon: 'color',
    surfaces: ['popup','newtab'], weight: 'light', load: () => import('../tools/ColorPicker.jsx') },
  { id: 'textcount', name: 'Text Counter', category: 'tools', icon: 'text',
    surfaces: ['popup','newtab','context'], weight: 'light',
    load: () => import('../tools/TextCounter.jsx') },
  { id: 'markdown', name: 'Markdown Preview', category: 'tools', icon: 'md',
    surfaces: ['newtab'], weight: 'light', load: () => import('../tools/MarkdownPreview.jsx') },

  // ── Infra / SRE ──
  { id: 'rbac', name: 'RBAC Visualizer', category: 'infra', icon: 'rbac',
    surfaces: ['newtab'], weight: 'heavy', load: () => import('../tools/RbacVisualizer.jsx') },
  { id: 'terraform', name: 'Terraform Parser', category: 'infra', icon: 'tf',
    surfaces: ['newtab'], weight: 'heavy', load: () => import('../tools/TerraformParser.jsx') },
  { id: 'cicd', name: 'CI/CD Visualizer', category: 'infra', icon: 'cicd',
    surfaces: ['newtab'], weight: 'heavy', load: () => import('../tools/CiCdVisualizer.jsx') },
  { id: 'slo', name: 'SLO Calculator', category: 'infra', icon: 'slo',
    surfaces: ['popup','newtab'], weight: 'light', load: () => import('../tools/SloCalculator.jsx') },
  { id: 'gl2gh', name: 'GitLab → GitHub', category: 'infra', icon: 'gl2gh',
    surfaces: ['newtab'], weight: 'light', load: () => import('../tools/GitlabToGithub.jsx') },
  { id: 'excel2md', name: 'Excel → Markdown', category: 'infra', icon: 'xls',
    surfaces: ['popup','newtab'], weight: 'light', load: () => import('../tools/ExcelToMarkdown.jsx') },
  { id: 'archicon', name: 'Arch Icon Search', category: 'infra', icon: 'arch',
    surfaces: ['newtab'], weight: 'light', load: () => import('../tools/ArchIconSearch.jsx') },
  { id: 'mermaid', name: 'Mermaid Editor', category: 'infra', icon: 'mermaid',
    surfaces: ['newtab'], weight: 'heavy', load: () => import('../tools/MermaidEditor.jsx') },

  // ── Live Info (B등급, host_permissions 필요) ──
  { id: 'weather', name: 'Weather', category: 'live', icon: 'weather',
    surfaces: ['popup','newtab'], weight: 'light', net: true, load: () => import('../tools/Weather.jsx') },
  { id: 'exchange', name: 'Exchange Rate', category: 'live', icon: 'fx',
    surfaces: ['popup','newtab'], weight: 'light', net: true, load: () => import('../tools/ExchangeRate.jsx') },
  { id: 'dns', name: 'DNS Lookup', category: 'live', icon: 'dns',
    surfaces: ['popup','newtab'], weight: 'light', net: true, load: () => import('../tools/DnsLookup.jsx') },
  { id: 'iplookup', name: 'IP Lookup', category: 'live', icon: 'ip',
    surfaces: ['popup','newtab'], weight: 'light', net: true, load: () => import('../tools/IpLookup.jsx') },
  { id: 'history', name: 'Today in History', category: 'live', icon: 'history',
    surfaces: ['popup','newtab'], weight: 'light', net: true, load: () => import('../tools/TodayInHistory.jsx') },
  { id: 'speedtest', name: 'Speed Test', category: 'live', icon: 'speed',
    surfaces: ['newtab'], weight: 'light', net: true, load: () => import('../tools/SpeedTest.jsx') },

  // ── Clock (New Tab 핵심) ──
  { id: 'clock', name: 'Clock', category: 'clock', icon: 'clock',
    surfaces: ['newtab'], weight: 'light', load: () => import('../tools/Clock.jsx') },
];

export const byId = (id) => TOOLS.find(t => t.id === id);
export const bySurface = (s) => TOOLS.filter(t => t.surfaces.includes(s));
export const contextItems = () => TOOLS.flatMap(t => (t.context || []).map(c => ({ ...c, toolId: t.id })));
```

- surface 컴포넌트는 `React.lazy(t.load)` + `<Suspense>`로 임베드.
- background는 `contextItems()`로 메뉴를 일괄 등록. 메뉴 클릭 시 `info.menuItemId`로 `run(selectionText)` 호출.

---

## 10. 태스크 진행 순서 (Phase별 체크리스트)

> 각 Phase 끝에 빌드+로드하여 동작 확인. 작은 단위로 자주 검증.

### Phase 0 — 스캐폴딩 (반나절)
- [ ] `toolkit-extension/` 생성, `package.json`/`vite.config.js`(7장) 작성, `npm install`.
- [ ] `manifest.json`(6장) 작성. 아이콘은 `chrome-extension/icons/*` 복사해 `public/icons/`에.
- [ ] `popup.html` + `src/popup/main.jsx`에 "Hello Popup", `newtab.html` + `src/newtab/main.jsx`에 "Hello NewTab".
- [ ] `shared/theme.css`에 디자인 토큰(2.4) 정의, 양쪽에서 import.
- [ ] **검증**: `npm run build` → `dist/` 로드 → 팝업/새 탭에 Hello 표시.

### Phase 1 — 공유 인프라 (반나절)
- [ ] `shared/registry.js`(9장) — 우선 A등급 light 도구만 등록.
- [ ] `shared/storage.js` — `getPins/setPins/getRecent/pushRecent/getSettings/setSettings`.
- [ ] `shared/ui/ToolHost.jsx`(8.2c) + `toolhost.css`(embed/sheet/modal variant).
- [ ] `shared/ui/embed.css`(8.2) — `[class$="-overlay"]`/`[class$="-modal"]` 임베드 오버라이드.
- [ ] `shared/ui/ToolIcon.jsx`(8.8) — App.jsx 1408~1678 SVG를 case로 이식.
- [ ] `shared/transforms/` — base64/json/epoch/url/text **신규 작성(8.7 완성본 사용)**.

### Phase 2 — 도구 이식: A등급 light (1~2일)
- [ ] `src/components/` → `toolkit-extension/src/tools/`로 복사(동명 CSS 동반).
- [ ] **방법 A(공용 embed.css)로 일괄 임베드화**: `Base64Tool, JsonFormatter, EpochConverter, RegexTester, PasswordGenerator, UnitConverter, CronEditor, SubnetVisualizer, ColorPicker, TextCounter, SloCalculator, ExcelToMarkdown`. 레이아웃 깨지는 도구만 방법 B(8.2b).
- [ ] `ToolIcon`에 위 도구 아이콘 case 채우기(8.8).
- [ ] localStorage 키 `toolkit:` prefix화(또는 MVP는 보류).
- [ ] **검증**: 각 도구를 popup 임베드로 렌더 → 입력/변환/복사 동작 + 레이아웃 안 깨짐 확인.

### Phase 3 — Popup 런처 (1일)
- [ ] `PopupApp.jsx`(4.2): 검색 + 세그먼트 탭(Tools/Infra/Live) + 핀 + 최근 + ALL 그리드.
- [ ] 도구 클릭 → `React.lazy` 임베드(`variant="embed"`) + back 버튼. heavy 도구는 "새 탭에서 열기" CTA.
- [ ] 핀 토글/최근 기록 storage 연동.
- [ ] **검증**: 팝업에서 JSON/Base64/Epoch 실제 변환 동작, 핀/최근 유지.

### Phase 4 — New Tab 대시보드 (1~2일)
- [ ] `NewTabApp.jsx`(4.3): 상단바(타이틀+Weather/Exchange 위젯), 중앙 `Clock`(+FlipClock, CursorCanvas), `SearchBar`(9.3 주의), 퀵 숏컷, 하단 도크.
- [ ] 도크 칩 클릭 → New Tab 위 임베드 패널(`variant="sheet"|"modal"`). heavy/infra 도구의 주 무대.
- [ ] **검증**: 새 탭 열림, 시계 테마 전환, 도구 패널 열림.

### Phase 5 — Context Menu + 단축키 (1일)
- [ ] `service-worker.js`: `onInstalled`에서 `contextItems()`로 메뉴 등록. `contexts:['selection']`.
- [ ] `onClicked`: `run(info.selectionText)` → 클립보드 복사 + (선택)`content/toast.js` 주입 토스트.
- [ ] `commands.onCommand`: `open-newtab-toolkit`(탭 생성), `format-json-clipboard`(클립보드 읽기→포맷→쓰기).
- [ ] **검증**: 페이지에서 텍스트 선택→우클릭→Decode Base64→토스트/복사 확인. 단축키 동작.

### Phase 6 — B등급/heavy + 마감 (1~2일)
- [ ] B등급 도구 이식(Weather/Exchange/DNS/IP/History/SpeedTest) + host_permissions 확인.
- [ ] mermaid 도구 동적 import 이식(8.6), New Tab 전용.
- [ ] 폰트 로컬 번들 or 시스템 폰트 확정(4.6). 라이트 테마는 백로그로 둘지 결정.
- [ ] 아이콘/스토어 메타/온보딩(새 탭 점유 고지) 정리. `npm run build && npm run zip`.
- [ ] **검증**: 12장 완료 체크리스트 전체 통과.

---

## 11. 리스크 & 주의사항

1. **새 탭 점유 정책**: `chrome_url_overrides.newtab`은 사용자 새 탭을 대체. 스토어 심사·사용자 신뢰 이슈.
   온보딩에서 명확히 고지하고, 끄기 어려움을 감안(끄려면 확장 비활성/제거). 거부감 크면 New Tab을 **옵션 빌드**로 분리 고려.
2. **mermaid 번들 크기**: 반드시 동적 import + New Tab 한정. Popup 번들에 절대 포함 금지.
3. **외부 API 한도/안정성**: `ipapi.co` 무료 일일 한도, `nominatim` 사용정책(UA 헤더 권장). 실패 시 graceful degrade.
4. **localStorage vs chrome.storage**: MVP는 localStorage 유지 가능하나, popup·newtab 간 상태 공유가 필요하면 chrome.storage 어댑터 필수(8.4).
5. **CSP**: 외부 스크립트/스타일/폰트 로드 불가. 원본의 Google Fonts `<link>`를 그대로 옮기면 동작 안 함 → 로컬 번들 또는 시스템 폰트.
6. **C등급 도구 유혹 금지**: TodoList/Notes/Calendar 등은 서버 의존. 넣으려면 별도 로컬 재구현(백로그). 무심코 이식하면 "서버 없음" 에러.
7. **service worker 청크 분할**: Vite 기본 설정이 SW를 쪼개면 로드 실패. 7.2의 `entryFileNames` 고정 필수.
8. **원본 보호**: `chrome-extension/`(북마크싱크)·`api/`·`.git` 등 0.2 목록 수정 금지.

---

## 12. 완료 정의 (검증 체크리스트)

- [ ] `dist/` 압축 해제 로드 시 오류 0, 팝업·새 탭 정상 렌더.
- [ ] Popup: 검색으로 도구 찾기 → 실행 → 결과 정확. 핀·최근 재시작 후 유지.
- [ ] New Tab: 시계 동작·테마 전환, 도크에서 임의 도구 열기/닫기, Weather/Exchange 위젯 로드.
- [ ] Context Menu: 선택→변환 3종 이상 동작(Base64/JSON/Epoch), 결과 복사/토스트.
- [ ] 단축키 2종 동작.
- [ ] B등급 도구 중 최소 Weather·DNS·IP 정상 호출(host_permissions 검증).
- [ ] mermaid가 popup 번들에 없음(빌드 산출물 청크 확인), New Tab에서만 로드.
- [ ] 권한이 실제 사용 범위와 일치(미사용 권한 제거).
- [ ] 원본 `seonology-clock-page` 본체(0.2 목록)에 변경 없음(`git status`로 확인).

---

## 부록 A. 원본 ↔ 토킷 매핑 빠른 표

| 원본 파일 | 토킷 도구 id | 등급 | surface | 이식 메모 |
|---|---|---|---|---|
| Base64Tool.jsx | base64 | A | popup/newtab/context | 모달→ToolHost, transforms/base64 추출 |
| JsonFormatter.jsx | json | A | popup/newtab/context | transforms/json 추출 |
| EpochConverter.jsx | epoch | A | popup/newtab/context | transforms/epoch 추출 |
| RegexTester.jsx | regex | A | popup/newtab | |
| PasswordGenerator.jsx | password | A | popup/newtab | localStorage→storage |
| UnitConverter.jsx | unit | A | popup/newtab | |
| CronEditor.jsx | cron | A | popup/newtab | localStorage→storage |
| SubnetVisualizer.jsx | cidr | A | popup/newtab | localStorage→storage |
| ColorPicker.jsx | color | A | popup/newtab | localStorage→storage |
| TextCounter.jsx | textcount | A | popup/newtab/context | |
| SloCalculator.jsx | slo | A | popup/newtab | localStorage→storage |
| MarkdownPreview.jsx | markdown | A | newtab | utils/markdown.js 동반 복사 |
| ExcelToMarkdown.jsx | excel2md | A | popup/newtab | |
| RbacVisualizer.jsx | rbac | A | newtab | heavy |
| TerraformParser.jsx | terraform | A | newtab | heavy |
| CiCdVisualizer.jsx | cicd | A | newtab | heavy |
| GitlabToGithub.jsx | gl2gh | A | newtab | |
| ArchIconSearch.jsx | archicon | A | newtab | |
| MermaidEditor.jsx | mermaid | A | newtab | mermaid 동적 import |
| Weather.jsx | weather | B | popup/newtab | open-meteo+nominatim |
| ExchangeRate.jsx | exchange | B | popup/newtab | exchangerate-api |
| DnsLookup.jsx | dns | B | popup/newtab | dns.google |
| IpLookup.jsx | iplookup | B | popup/newtab | ipapi.co |
| TodayInHistory.jsx | history | B | popup/newtab | api.wikimedia.org |
| SpeedTest.jsx | speedtest | B | newtab | cloudflare |
| Clock.jsx (+FlipClock, CursorCanvas) | clock | A | newtab | 독립형, localStorage 테마 |
| Fortune.jsx | fortune | A | newtab(선택) | 독립형 |

## 부록 B. host_permissions ↔ 도구 출처 근거
| 도메인 | 도구 | 원본 위치 |
|---|---|---|
| api.open-meteo.com | weather | Weather.jsx:45 |
| nominatim.openstreetmap.org | weather | Weather.jsx:63 |
| api.exchangerate-api.com | exchange | ExchangeRate.jsx:15 |
| dns.google | dns | DnsLookup.jsx:5 |
| ipapi.co | iplookup | IpLookup.jsx:52 |
| api.wikimedia.org | history | TodayInHistory.jsx:18 |
| speed.cloudflare.com / 1.1.1.1 | speedtest | SpeedTest.jsx:241 |

---

_작성 기준: `seonology-clock-page` 현재 소스(React 19 / Vite 7). 컴포넌트 시그니처·도메인은 실제 코드에서 추출함._
