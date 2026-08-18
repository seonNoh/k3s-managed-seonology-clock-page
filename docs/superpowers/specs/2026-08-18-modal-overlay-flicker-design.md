# Modal Overlay Flicker Design

> 역사 기록: 이 문서는 native release 전환 전의 설계입니다. semantic-release 관련 서술은 당시 전제를 보존한 것이며 현재 릴리스에는 적용하지 않습니다.

## 목적

`clock.seonology.com`에서 모달을 열 때 전체 화면 오버레이가 `opacity: 0`에서 시작하여 배경이 순간적으로 노출되는 현상을 제거한다. 모달의 열기·닫기, Tools에서 개별 도구를 선택한 뒤 원래 Tools 화면으로 돌아오는 흐름, 데이터 로딩 방식은 변경하지 않는다.

## 확인된 원인

운영 `v1.51.0`의 모달 오버레이들은 `backdrop-filter`와 반투명 배경을 가진 요소 전체에 fade-in 애니메이션을 적용한다. 애니메이션 시작값이 `opacity: 0`이므로 첫 프레임에는 dim 배경과 blur 결과까지 모두 투명해진다. Tools 안에서 다른 도구를 열면 두 오버레이가 겹치지만, 직접적인 배경 노출 원인은 새로 마운트된 최상위 오버레이의 opacity 시작값이다.

브라우저 콘솔 오류, 페이지 이동, 반복 state 토글, z-index 누락은 확인되지 않았다.

## 선택한 접근

각 모달 CSS에서 전체 화면 오버레이에 지정된 fade-in `animation` 선언을 제거한다. 해당 fade만 사용하던 keyframes도 함께 제거한다. 내부 패널에 이미 적용된 slide, zoom 또는 panel fade 애니메이션은 유지한다.

이 방식은 공통 override를 마지막에 덮어쓰는 방식보다 CSS 원본의 의도를 명확히 하며, 공용 Modal 컴포넌트로 전면 재구성하는 방식보다 변경 범위와 회귀 위험이 작다.

## 모션 정책

- 오버레이의 dim 배경과 `backdrop-filter`는 마운트되는 첫 프레임부터 최종 상태다.
- 내부 패널에 존재하는 진입 애니메이션은 유지한다.
- `prefers-reduced-motion: reduce`에서는 모달 패널 진입 애니메이션을 비활성화한다.
- 모바일 drawer처럼 모달이 아닌 UI의 오버레이 애니메이션은 이번 변경 대상에서 제외한다.

## 코드 범위

- `src/App.css`: 일반 Modal과 Tools 오버레이 fade 제거, reduced-motion 규칙 추가
- `src/components/*.css`: 전체 화면 모달 오버레이의 fade 선언과 전용 keyframes 제거
- `playwright.config.mjs`: 로컬 Vite 서버를 사용하는 브라우저 테스트 구성
- `tests/modal-overlay-motion.spec.mjs`: 실제 브라우저 CSSOM과 계산 스타일로 모달 모션 검사
- `package.json`, `package-lock.json`: Playwright 테스트 실행 스크립트와 개발 의존성 추가

React 상태 구조, JSX 마크업, API 호출, 데이터 저장 형식은 변경하지 않는다.

## 테스트 설계

### 자동 회귀 테스트

Playwright로 로컬 Vite 앱을 실행하고 브라우저가 구성한 CSSOM과 계산 스타일을 검사한다.

1. 런타임 CSSOM에서 고정 위치의 모달 오버레이 규칙에 animation이 없어야 한다.
2. 모바일 drawer 오버레이는 검사 대상에서 제외한다.
3. `prefers-reduced-motion: reduce` 환경에서 Tools와 일반 Modal 패널의 계산된 `animation-name`이 `none`이어야 한다.

테스트를 먼저 추가하고 현재 CSS에서 의도한 실패가 발생하는 것을 확인한 뒤 구현한다.

### 정적 검증

- `npm test`
- `npm run lint`
- `npm run build`

### 브라우저 검증

로컬 빌드에서 Tools, Infra, Calendar를 각각 열어 다음을 확인한다.

- 오버레이 계산 스타일의 `animation-name`이 `none`이다.
- dim 배경과 `backdrop-filter`가 첫 표시 상태부터 적용된다.
- 내부 패널 진입 애니메이션은 일반 모션 환경에서 유지된다.
- `prefers-reduced-motion` 환경에서는 패널 애니메이션이 비활성화된다.
- 모달 닫기와 Tools 복귀 흐름이 기존과 동일하다.

운영 배포 후 동일 세 항목을 다시 확인한다.

## 릴리스와 배포

변경 성격은 버그 수정이므로 커밋 타입은 `fix`다. semantic-release가 `1.51.0`에서 패치 버전을 생성하도록 하며, `main` 푸시로 GitHub Actions의 이미지 빌드·푸시를 시작한다. 이후 실제 배포 시스템이 새 이미지를 반영했는지 운영 페이지의 표시 버전과 계산 스타일로 확인한다.

## 완료 조건

- 자동 회귀 테스트, lint, production build가 모두 성공한다.
- 로컬 및 운영 환경에서 모달 오버레이 opacity fade가 없다.
- 기존 패널 진입 애니메이션과 모달 닫기 동작이 유지된다.
- 운영 페이지가 패치 버전을 표시한다.
