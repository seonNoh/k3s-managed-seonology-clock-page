# Large Modal, Typography, and Motion Design

## 목적

Split Console과 Classic에서 도구·정보 대화상자를 작업 공간으로 사용할 수 있을 만큼 크게 표시하고, 대화상자와 화면 전환에 절제된 모션을 적용한다. 데스크톱·태블릿·모바일에서 글자와 조작 요소를 충분히 크게 유지하면서도 콘텐츠가 잘리거나 화면 밖으로 밀리지 않아야 한다.

## 확인된 원인

도구 대화상자를 크게 만드는 전역 재정의가 `src/App.css` 끝부분에만 있다. `src/App.css`는 지연 로딩되는 `ClassicDashboard`에서 가져오므로, 기본값인 Split Console만 사용한 세션에서는 이 규칙이 로드되지 않는다. 따라서 Notes 460px, Chat 520px, Speed Test 560px 등 각 도구의 과거 고정 너비가 그대로 적용된다.

글자 크기도 같은 구조적 문제를 가진다. 앱 셸과 Split Console에는 `0.58rem`부터 `0.68rem`까지의 작은 라벨이 남아 있으며, 개별 도구는 10px부터 16px까지 서로 다른 기준을 사용한다. 화면 전체에서 읽기 쉬운 최소 크기를 보장하는 공통 계층이 없다.

## 선택한 구조

`src/styles/modal-system.css`를 만들고 `App.jsx`에서 항상 가져온다. 이 파일은 Split과 Classic의 공통 대화상자 크기, 타이포그래피, 오버레이, 진입 모션, 모바일 전체 화면 규칙을 한곳에서 관리한다. 각 도구 CSS는 도구 내부의 고유 레이아웃과 색상만 담당한다.

단순 확인창이나 소형 설정창은 공통 전체 화면 규칙에서 제외한다. 시계 테마 선택기, 커서 설정, 효과 설정처럼 한 화면에 짧은 선택지만 있는 UI는 콘텐츠 크기를 유지한다. 도구, 날씨, 환율, 인프라, 저장소, 서비스 목록처럼 탐색하거나 작업하는 대화상자에는 큰 작업 공간 규칙을 적용한다.

화면 전환은 `Document.startViewTransition()`을 지원하는 브라우저에서 점진적으로 적용한다. 지원하지 않거나 사용자가 모션 감소를 요청하면 상태 갱신을 즉시 실행한다. 대화상자 자체의 CSS 진입 모션은 모든 지원 브라우저에서 동작한다.

## 크기 기준

### 데스크톱: 1100px 이상

- 작업형 대화상자 너비: `min(1600px, 92dvw)`
- 작업형 대화상자 높이: `88dvh`
- 화면 가장자리 최소 여백: 가로 4dvw, 세로 6dvh
- 헤더와 본문은 각각 고정 영역과 스크롤 영역으로 나누어 헤더가 사라지지 않게 한다.

### 태블릿: 720px 이상 1099px 이하

- 작업형 대화상자 너비: `94dvw`
- 작업형 대화상자 높이: `90dvh`
- 터치 대상은 최소 44px를 유지한다.

### 모바일: 719px 이하

- 작업형 대화상자 너비와 높이: `100dvw × 100dvh`
- 모서리, 바깥 테두리, 바깥 여백을 제거한다.
- `env(safe-area-inset-*)`를 헤더와 본문 패딩에 반영한다.
- 내부 본문만 스크롤하며 문서 본문은 고정한다.

## 타이포그래피 기준

- 문서 루트: 데스크톱·태블릿 18px, 모바일 17px
- 대화상자 제목: 최소 1.4rem, 600
- 대화상자 본문·입력·버튼: 최소 1rem
- 보조 설명·라벨: 최소 0.88rem
- 상태 코드·시각·짧은 기계값에는 JetBrains Mono를 유지한다.
- 작은 글자를 유지해야만 레이아웃이 성립하는 영역은 글자를 줄이지 않고 줄바꿈, 그리드 열 축소, 스크롤로 해결한다.

## 모션 기준

- 오버레이: 180ms 동안 최종 배경색으로 전환한다. 오버레이 전체를 `opacity: 0`에서 시작하지 않아 첫 프레임의 화면 노출이 생기지 않게 한다.
- 대화상자 패널: 220ms, `cubic-bezier(.2, .7, .2, 1)`, 시작값 `translateY(10px) scale(.992)`와 낮은 불투명도를 사용한다.
- 레이아웃·도구 전환: View Transition API가 있으면 220ms 교차 전환과 6px 이하의 미세 이동을 사용한다.
- bounce, spin, 반복 glow, 큰 확대·축소, 탄성 easing은 사용하지 않는다.
- `prefers-reduced-motion: reduce`에서는 CSS 애니메이션과 View Transition을 모두 비활성화한다.

## 접근성 및 상호작용

- 기존 `role="dialog"`, `aria-modal`, 접근 가능한 이름, Escape 닫기 동작을 유지한다.
- 도구 선택 시 현재 대화상자와 새 대화상자가 동시에 상호작용 가능한 상태로 남지 않게 한다.
- 모션은 상태 변화를 보조할 뿐, 정보 전달의 유일한 수단이 되지 않는다.
- 모바일에서 브라우저 주소창 높이가 변해도 잘리지 않도록 동적 viewport 단위를 사용한다.

## 테스트 전략

1. Split과 Classic에서 대표 도구를 열어 1440px, 1024px, 390px 화면의 실제 경계값을 검사한다.
2. 작업형 대화상자의 제목·본문·입력·버튼 계산 글자 크기가 기준 이상인지 검사한다.
3. 일반 모션 환경에서는 패널 진입 모션이 있고, 모션 감소 환경에서는 애니메이션과 View Transition이 모두 꺼지는지 검사한다.
4. Escape, 닫기 버튼, 오버레이 클릭, 도구 교체, 모바일 스크롤과 수평 오버플로를 회귀 검사한다.
5. 전체 단위·API·E2E·빌드·컨테이너·보안 검증을 통과한 뒤 `v1.54.0`으로 배포한다.

## 공식 참고 자료

- [MDN View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
- [MDN Document.startViewTransition](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition)
- [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion)
- [MDN CSS values and units](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Values_and_units)

## 완료 조건

- 기본 Split 세션에서도 모든 작업형 대화상자가 공통 크기 기준을 따른다.
- 데스크톱과 태블릿에서는 화면 대부분을 사용하고 모바일에서는 전체 화면으로 열린다.
- 대화상자와 앱 셸의 글자가 합의한 최소 크기를 충족한다.
- 화면 전환이 절제된 형태로 동작하며 모션 감소 설정을 존중한다.
- 기존 도구 기능과 두 레이아웃 전환, 다크·라이트 모드가 그대로 동작한다.
