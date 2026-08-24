# Modal Pointer Compositing Stability Design

## 목적

툴 모달을 열어 둔 상태에서 마우스를 이동할 때 전체 화면이 깜빡이는 현상을 제거한다. 대시보드에서 선택한 눈, 커서 광원, 커서 애니메이션 설정은 보존하고 모달을 닫으면 즉시 다시 동작해야 한다.

## 확인된 원인

1. `CursorGlow`는 모든 `pointermove` 입력을 `requestAnimationFrame`으로 처리하면서 React 상태와 전체 화면 radial-gradient를 갱신한다.
2. `CursorCanvas`는 활성 효과가 있으면 전체 화면 Canvas를 매 프레임 지우고 다시 그린다.
3. Split의 `SnowField`는 30개 결정 요소를 무한 애니메이션으로 이동한다.
4. 공통 모달 오버레이는 반투명 배경과 `backdrop-filter: blur(9px) saturate(.85)`를 사용한다.
5. Classic 툴 버튼은 hover 때 `translateY(-3px)`로 별도 합성 레이어를 계속 전환한다.

운영 환경에서 마우스를 반복 이동해도 모달 DOM, 위치, 크기, opacity, transform은 변하지 않았다. 배경 효과를 모두 끄면 모달 바깥 프레임 변화가 0이 되었으므로 모달 재마운트가 아니라 동적 배경과 backdrop 합성의 결합이 근본 원인이다.

## 선택한 구조

### 배경 효과 일시 중지

- Split과 Classic은 전체 화면 표면이 하나라도 열려 있는지를 각각 파생 상태로 계산한다.
- 툴 런처, 일반 모달, 개별 도구, 효과 설정, 도구 사전 로딩 상태를 전체 화면 표면으로 취급한다.
- `CursorGlow`, `CursorCanvas`, `SnowField`는 사용자 설정값과 별도로 `paused` 입력을 받는다.
- 모달을 열 때 효과 DOM을 제거하지 않고 마지막 프레임을 유지한 채 갱신만 중지한다. 이 방식은 모달을 여는 순간 배경이 바뀌는 현상을 방지한다.
- 모달을 닫으면 기존 사용자 설정으로 효과가 자동 재개된다.

### 효과별 동작

- `CursorGlow`: 일시 중지 중에는 포인터 리스너를 해제하고 마지막 gradient를 유지한다. `glow-none`이면 DOM과 포인터 리스너를 모두 만들지 않는다.
- `CursorCanvas`: 일시 중지 중에는 animation frame과 mousemove 리스너를 해제하지만 Canvas DOM과 마지막 픽셀은 유지한다.
- `SnowField`: 일시 중지 중에는 결정 요소의 `animation-play-state`를 `paused`로 전환한다.

### Classic hover

- 툴 버튼에서 `translateY`와 상시 `will-change: transform`을 제거한다.
- hover 피드백은 배경색, 테두리색, 텍스트색만 사용한다.
- 버튼 크기와 모서리 반경은 변경하지 않는다.

### 모달 blur 정책

- 먼저 동적 배경과 hover 레이어를 정지하여 현재 디자인의 blur를 보존한다.
- 수정 후에도 실제 Chrome에서 깜빡임이 남을 때만 별도 변경으로 blur 제거를 검토한다. 이번 변경에서는 디자인을 불필요하게 바꾸지 않는다.

## 테스트 전략

- Playwright에서 Cursor Snow, Indigo Glow, Snow Field를 켠 뒤 Split Tools를 연다.
- 고밀도 `page.mouse.move` 입력 전후에 glow style, Canvas 픽셀, Snow animation 상태, 모달 bounds와 opacity를 비교한다.
- Classic Tools에서도 glow와 Canvas가 멈추는지 확인한다.
- Classic 툴 버튼 hover에서 transform과 상시 `will-change`가 사용되지 않는지 확인한다.
- `glow-none`일 때 cursor glow DOM이 렌더되지 않는지 확인한다.
- 기존 Escape 이력, 큰 모달, 모바일, 로딩 회귀 테스트를 모두 유지한다.

## 완료 조건

- Split과 Classic Tools를 연 상태에서 마우스를 반복 이동해도 동적 배경 프레임이 바뀌지 않는다.
- 모달 패널의 DOM, opacity, transform, bounds가 안정적으로 유지된다.
- Classic 버튼 hover가 레이어 이동을 만들지 않는다.
- 모달을 닫으면 원래 선택한 화면 효과가 다시 동작한다.
- `glow-none`은 불필요한 DOM과 포인터 처리 비용을 만들지 않는다.
- 전체 lint, 단위 테스트, API 테스트, E2E 테스트, production build, dependency audit, container smoke가 통과한다.
- 패치 버전으로 배포하고 운영 Chrome에서 같은 동작을 확인한다.
