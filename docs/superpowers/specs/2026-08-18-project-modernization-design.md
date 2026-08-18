# Clock 프로젝트 현대화 설계

## 목표

현재 사용자 기능과 API 계약을 유지하면서 확인된 보안 취약점과 코드 중복을 제거하고, 사람이 변경 범위를 예측할 수 있는 구조와 배포 전 품질 게이트를 만든다. 변경은 기존 `main`에서 분리된 worktree에서 수행하고, 검증된 단일 패치 릴리스로 배포한다.

## 범위와 제약

- 기존 웹 URL, API URL, JSON 응답 형태, Chrome 확장 프로그램의 주요 진입 경로를 유지한다.
- 현재 서비스의 인증 프록시와 단일 소유자 cloud token 모델은 유지한다. 사용자별 token 모델은 인증 주체 계약이 별도로 확정될 때까지 도입하지 않는다.
- JSON/PVC 구조와 단일 replica `Recreate` 전략은 이번 릴리스에서 유지한다. 대신 파일 갱신을 원자화하고 동시 갱신을 직렬화한다.
- Vite 8, ESLint 10, Kubernetes client 2처럼 major 호환성 검증이 필요한 업그레이드는 이번 보안 패치와 섞지 않는다. 현재 major 안의 안전 패치를 적용한다.
- 앱 저장소의 `k8s/`는 라이브 SSOT가 아니다. 라이브 SSOT는 `seonology-k3s`의 Argo CD Application과 Kustomization이며, 운영 변경은 해당 저장소의 깨끗한 별도 worktree에서만 수행한다.
- credential 값은 코드·문서·로그·커밋에 기록하지 않는다. 저장소에 존재한 fallback 값은 제거하고 운영 secret 존재를 배포 전에 검증한다.

## 보안 설계

### Markdown과 Mermaid

Markdown은 원문 HTML을 허용하지 않는 것을 기본 계약으로 한다. Markdown 문법 변환 후 허용 태그·속성·URL scheme만 남기는 sanitizer를 한 곳에서 수행하며 preview, chat, HTML export, extension이 같은 안전한 출력 함수를 사용한다.

Mermaid는 `securityLevel: strict`로 초기화하고, 렌더된 SVG도 DOM 삽입 전에 sanitize한다. 렌더 요청에 sequence 번호를 부여해 느린 이전 결과가 최신 결과를 덮지 못하게 한다. 화면 표시와 SVG/PNG export는 같은 sanitized SVG를 사용한다.

### OAuth와 token

Google과 Microsoft OAuth 시작 시 암호학적으로 안전한 `state`와 PKCE S256 verifier/challenge를 생성한다. transaction은 provider, verifier, 만료 시각을 포함하고 10분 뒤 만료되며 callback 성공·실패 시 한 번만 소비된다.

Cloud token 저장은 AES-256-GCM으로 암호화한다. 키는 `CLOUD_TOKEN_ENCRYPTION_KEY`에서만 읽고 누락·형식 오류 시 fail-closed한다. 기존 평문 파일은 백업 가능 여부와 JSON schema를 검증한 뒤 한 번만 암호화 형식으로 마이그레이션한다. provider별 갱신이 다른 provider token을 덮지 않도록 파일별 update lock과 atomic rename을 사용한다.

### NAS와 업로드

NAS path는 `NAS_ALLOWED_ROOTS`의 정확한 root 또는 하위 경로만 허용한다. 상대 경로, traversal, sibling-prefix, NUL, CR/LF, backslash와 위험한 filename을 거부한다. `sort`와 `dir`은 enum으로 제한한다.

업로드 대상 경로/ID는 파일 stream보다 먼저 검증할 수 있는 query/header를 우선 사용하고 기존 multipart field는 한 릴리스 동안 호환 입력으로 허용한다. 모든 provider에 파일 수와 크기 제한, limit/abort 처리, upstream non-2xx 매핑을 적용한다. OneDrive는 전체 `Buffer.concat` 대신 upload session의 순차 chunk 전송을 사용한다. NAS 전송은 `write()` backpressure를 존중한다.

TLS 검증은 기본 활성화한다. 운영 NAS CA와 hostname이 준비되지 않은 상태에서 기능을 끊지 않도록 CA secret 주입과 검증 결과를 배포 preflight로 확인한다. 검증 비활성화 fallback은 제공하지 않는다.

## 프런트엔드 구조

직렬화 가능한 도구 metadata는 `packages/toolkit-core`의 catalog가 소유한다. 웹과 extension registry는 catalog에 각 surface의 lazy loader와 context action만 결합한다.

웹 App은 도구마다 boolean을 갖지 않고 `activeToolId` 하나를 사용한다. `openTool(id)`는 launcher를 닫고 활성 도구를 설정하며, Escape는 현재 최상위 dialog 하나만 닫는다. 검색 결과는 DOM `style` 변경이 아니라 registry에서 파생한다.

도구 표시 책임은 `ToolBody`와 surface shell로 분리한다. 웹 dialog, extension popup inline host, extension newtab dialog가 focus, Escape, scroll lock, backdrop을 각각 명시적으로 담당한다. 기존 overlay CSS를 suffix selector와 `!important`로 무력화하는 방식은 새 공통 컴포넌트에 사용하지 않는다.

공통화는 catalog, Markdown, 순수 transform부터 시작하고 도구 UI는 검증된 단위로 이동한다. 이번 릴리스에서 모든 도구가 하나의 registry를 사용하도록 하되, 대형 도구 본문은 호환 wrapper를 통해 단계적으로 공통 package로 옮길 수 있다.

## API 구조

`createApp(dependencies)`와 `server.js`를 분리해 포트를 열지 않는 integration test가 가능하게 한다. 환경변수 파싱은 `config`, 공통 오류 처리는 `middleware`, 외부 HTTP 호출은 `infrastructure/http-client`, 파일 저장은 `infrastructure/storage`가 담당한다.

도메인은 bookmarks, todos, notes, chat-history, cloud, nas로 나눈다. 첫 릴리스에서는 URL과 응답을 유지하며 router를 기존 구현에 연결하고, 저장소·OAuth·NAS처럼 위험도가 높은 경계부터 추출한다. `api/index.js`는 최종적으로 route 조립과 하위 호환 export만 남긴다.

JSON store 계약은 다음과 같다.

- missing file에는 매 호출마다 새 default clone 반환
- malformed JSON은 빈 데이터로 숨기지 않고 corruption 오류
- 같은 디렉터리 temp file에 쓰고 fsync 후 rename
- 파일별 update 직렬화
- schema validator 실패 시 원본 보존
- token 파일 permission `0600`

## 품질과 테스트

- Vitest 기반 순수 함수·React 상태 단위 테스트
- Supertest 기반 API integration test
- 기존 Playwright modal 테스트와 보안·overlay 회귀 테스트
- extension 독립 `npm ci`와 build smoke
- package 경계별 ESLint globals/ignore
- CI에서 lint, unit/API test, Playwright, 두 build, production audit, container smoke를 release보다 먼저 실행

TDD의 각 동작 테스트는 수정 전 실패를 확인하고 최소 구현 후 통과를 확인한다. 설정 파일은 실행 결과와 smoke test로 검증한다.

## 런타임과 릴리스

Node 24 LTS를 `.nvmrc`, package engines, GitHub Actions, Docker build/runtime에 통일한다. nginx와 API의 생존 상태를 구분하고 `/health`가 API까지 확인하도록 한다. 컨테이너 프로세스 종료 신호가 Node와 nginx에 전달되도록 init/supervision 방식을 사용한다.

초기 semantic-release 시도는 bundled npm 취약점으로 root·API·extension production audit 0을 만족할 수 없어 역사적 문제로 폐기했다. 현재 설계는 Node 표준 라이브러리와 git만 쓰는 native planner/publisher다. planner는 새 release가 없는 main push에서 Docker tag를 덮어쓰지 않고, 마지막 stable `vX.Y.Z`/VERSION과 Conventional Commit으로 `released`, version, base SHA, release date를 계산한다. 이 현대화 작업에는 `feat` commit이 포함되므로 다음 stable release는 patch가 아닌 minor를 예상한다. image job은 계산 version을 Docker build arg로 주입해 load 가능한 planned image를 smoke한 뒤에만 `v<version>`/`latest`를 push한다. publisher는 그 성공 뒤에만 atomic commit/tag push와, remote annotated tag·direct parent·VERSION·결정적 changelog를 모두 검증한 idempotent GitHub Release 재개를 수행한다. GitHub Actions는 최소 권한과 immutable SHA pinning을 사용한다.

## 배포와 롤백

배포 전 현재 GitOps revision, image tag, digest, Deployment revision, token/PVC schema를 기록한다. 앱 저장소 release와 GHCR image 생성 후 Argo CD Image Updater의 Git write-back과 Application `Synced/Healthy`를 확인한다.

배포 후 `/health`, read-only API, 인증된 브라우저에서 대표 도구·Escape·scroll lock·backdrop·콘솔 오류를 검사한다. NAS/Drive의 삭제·이동·업로드는 자동 smoke에서 실행하지 않는다.

롤백은 GitOps SSOT에서 image updater를 일시 정지하고 이전 digest가 연결된 tag로 `newTag`를 되돌리는 커밋으로 수행한다. `kubectl rollout undo`는 GitOps 장애 시 긴급 수단으로만 사용한다.

## 성공 기준

- production audit에서 High 취약점 0건
- lint 오류 0건
- 단위·API·Playwright 테스트 전부 통과
- 웹·extension production build 통과
- root 초기 JS bundle이 기존 2.6MB보다 유의미하게 감소
- 소스에 hardcoded credential fallback, Mermaid loose, raw Markdown HTML 경로가 없음
- OAuth state/PKCE replay·expiry 테스트와 JSON 동시 update 테스트 통과
- container smoke와 배포 후 read-only smoke 통과
- 라이브 Application `Synced/Healthy`, 새 image tag와 digest 확인
