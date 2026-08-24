# Feature Parity, Cloud Storage, and Modal Correction Design

## 목적

기본 Split Console에서 Classic과 동일한 사용자 기능을 제공하고, Google Drive·OneDrive 연결 상태를 가리는 토큰 저장소 권한 오류를 해결한다. 모든 작업형 대화상자는 Split Console의 절제된 색상·모서리·타이포그래피를 공통으로 사용하며, 열고 닫을 때 전체 문서가 깜빡이지 않아야 한다.

## 확인된 현상과 원인

### 기능 누락

- Split의 `BOOKMARKS`는 `quickLink` 항목만 필터링하여 보여주며 카테고리와 즐겨찾기 추가·수정·삭제 기능이 없다.
- Split의 `SEONOLOGY` 화면에는 서비스 목록만 있고 Classic의 `Bookmarks` 탭이 없다.
- Split 검색은 Google 검색 실행만 제공하고 Classic의 `/api/suggest` 자동완성과 키보드 선택을 제공하지 않는다.
- Split 효과 설정에는 커서 애니메이션만 있으며 Classic의 배경광 색상 선택이 없다.
- 웹 도구 레지스트리의 29개 도구는 두 레이아웃 모두에서 열 수 있지만, 개별 도구의 셸과 입력 컨트롤은 과거 CSS를 그대로 사용하여 새 화면과 시각적으로 단절되어 있다.

### OAuth 상태 오류

운영 Pod는 UID/GID `10001`로 실행되며 `/data/cloud-tokens.json`은 `root:10001`, 모드 `0664`인 평문 파일이다. 프로세스는 그룹 권한으로 파일을 읽을 수 있지만 소유자가 아니므로 `FileHandle.chmod(0600)`을 실행할 수 없다. 토큰 저장소는 읽기 전에 권한 변경을 강제하여 Google Drive와 OneDrive 상태 요청을 모두 `503`으로 종료한다.

### 팝업 깜빡임

모달 상태 변경마다 `document.startViewTransition()`을 호출하고, `::view-transition-old(root)`와 `::view-transition-new(root)`가 전체 문서의 불투명도를 바꾼다. 패널 진입 애니메이션과 전체 문서 교차 전환이 동시에 실행되어 팝업을 표시할 때 배경 전체가 깜빡이는 것처럼 보인다.

## 검토한 접근

1. Classic 코드를 Split에 복사한다. 가장 빠르지만 즐겨찾기·검색·효과 설정이 다시 두 벌이 되어 이후 수정 누락이 반복된다.
2. 공용 기능 모듈을 추출하고 두 레이아웃이 같은 구현을 사용한다. 초기 변경은 더 크지만 기능 계약이 한곳에 남고 회귀 테스트를 공통으로 적용할 수 있다. 이 방식을 선택한다.
3. 기존 구조를 유지한 채 CSS와 버튼만 덮어쓴다. 시각 문제 일부는 줄지만 기능 누락과 중복 상태를 해결하지 못하므로 단독 접근으로 사용하지 않는다.

## 선택한 구조

### 공용 대시보드 기능

- 즐겨찾기 데이터 접근과 변경 요청을 `src/features/bookmarks`로 분리한다.
- `BookmarksManager`가 카테고리와 즐겨찾기의 추가·수정·삭제, Quick Link 지정을 담당한다.
- `ServiceHub`가 `Services`와 `Bookmarks` 탭을 제공한다. Classic과 Split의 `SEONOLOGY`가 같은 구성 요소를 사용한다.
- Split의 `BOOKMARKS` 카드는 `Bookmarks` 탭을 바로 연다. Quick Link 목록은 같은 화면 안의 빠른 실행 영역으로 유지한다.
- 검색 자동완성은 공용 `GoogleSearch`가 담당하며 두 레이아웃에서 동일한 API, 키보드 탐색, 안전한 외부 검색 실행을 사용한다.
- 커서 배경광과 애니메이션 목록을 공용 카탈로그로 옮기고 두 레이아웃이 같은 저장 키와 허용값을 사용한다.

### 도구 대화상자 디자인

- 개별 도구의 기능별 내부 배치는 유지한다.
- `modal-system.css`에 `--tool-*` 토큰과 작업형 셸·헤더·입력·버튼의 공통 시각 계약을 둔다.
- Split Console의 청회색 면, 코랄 액센트, JetBrains Mono, 7~10px 모서리를 사용한다.
- 색상 선택기와 상태색처럼 기능 의미가 있는 색은 보존하고, 장식용 보라색 그라디언트와 과도한 둥근 셸만 공통 규칙으로 정리한다.
- Light와 Dark는 동일한 구조에서 토큰 값만 바뀐다.

### 모션

- View Transition은 레이아웃과 색상 모드처럼 페이지 수준 전환에만 사용한다.
- 모달·도구·즐겨찾기·설정의 열기와 닫기는 React 상태를 즉시 바꾸고 패널 자체의 220ms CSS 진입 모션만 사용한다.
- 오버레이는 첫 프레임부터 최종 dim 상태이며 불투명도 애니메이션을 사용하지 않는다.
- `prefers-reduced-motion: reduce`에서는 패널 모션도 비활성화한다.

### 토큰 저장소 마이그레이션

- `O_NOFOLLOW`, 일반 파일 검사, 원자적 임시 파일 쓰기와 디렉터리 동기화는 유지한다.
- 읽을 수 있는 기존 평문 파일에 대한 `chmod` 성공을 읽기 전제 조건으로 삼지 않는다.
- 평문 스키마와 암호화 백업을 검증한 뒤 기존 원자적 저장소가 AES-256-GCM 봉투를 `0600`으로 새로 작성하여 경로를 교체한다.
- 마이그레이션 후 토큰 값, 공급자 연결 상태, 파일 모드, 평문 비노출을 검사한다.
- 파일을 읽을 수 없거나 스키마·백업 검증에 실패하면 기존처럼 닫힌 상태로 실패한다.
- 프런트는 `configured:false`, `connected:false`, 서버 저장소 오류를 서로 다른 상태로 표시하여 자격 증명 누락으로 잘못 안내하지 않는다.

## 기능 동등성 기준

Split과 Classic에서 다음 기능을 모두 접근할 수 있어야 한다.

- 12개 시계와 시계별 설정
- Light·Dark와 Split·Classic 선택
- Google 검색과 자동완성
- 서비스 목록과 즐겨찾기 전체 관리
- Quick Link 실행
- 날씨, 환율, Todo, Calendar, Speed Test
- 웹 도구 레지스트리의 모든 도구
- Infra, Repos, NAS, Google Drive, OneDrive
- 눈 효과, 커서 배경광, 커서 애니메이션
- Escape, 오버레이 클릭, 닫기 버튼, 키보드 포커스

모바일 전용 배치는 레이아웃마다 달라도 되지만 같은 기능에 도달할 수 있어야 한다.

## 테스트와 완료 조건

1. API 테스트에서 root 소유·그룹 읽기 가능 `0664` 평문 토큰 파일을 재현하고, 수정 전 실패와 수정 후 암호화·`0600`·연결 상태 성공을 확인한다.
2. Playwright에서 두 레이아웃의 기능 목록과 모든 웹 도구 접근 가능성을 비교한다.
3. 즐겨찾기 CRUD와 Quick Link 지정·실행을 Split에서 실제 API 응답으로 검사한다.
4. Google 자동완성과 커서 배경광 설정이 Split에서 저장되는지 검사한다.
5. 모달 열기에는 View Transition이 호출되지 않고 레이아웃 전환에만 호출되는지 검사한다.
6. 대표 도구와 전체 도구 셸의 크기·색상·모서리·글자·오버플로를 1440px, 1024px, 390px에서 검사한다.
7. 전체 lint, unit, API, E2E, build, dependency audit, read-only container smoke를 통과한다.
8. 운영 배포 후 두 OAuth 상태 API, 즐겨찾기, 대표 도구, 모바일 오버플로, Pod 상태와 버전을 다시 확인한다.

## 참고 자료

- Node.js File system API: https://nodejs.org/api/fs.html
- Kubernetes Security Context: https://kubernetes.io/docs/tasks/configure-pod-container/security-context/
- MDN `Document.startViewTransition()`: https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition
