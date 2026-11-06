# Seonology Clock Page

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

Seonology Clock Page는 시계, 북마크, 개발 도구, 인프라 현황, 파일 탐색기와 채팅을 제공하는 개인 운영 대시보드입니다. nginx 기반 컨테이너 하나에서 React와 Express API를 실행합니다. 저장소에는 Seonology Toolkit 브라우저 확장과 별도의 탭 통계 확장도 있습니다.

기준 저장소는 Gitea `seonology/k3s-managed-seonology-clock-page`입니다. push mirror는 `sync_on_commit: true`로 브랜치와 태그를 GitHub `seonNoh/k3s-managed-seonology-clock-page`에 복사합니다.

![런타임 아키텍처](docs/svg/architecture.ko.svg)

## 런타임 아키텍처와 저장소 구성

nginx는 `8080` 포트에서 Vite 빌드를 제공하고 `/api/`와 `/health`를 `127.0.0.1:3001`의 Express로 전달합니다. `tini`는 nginx와 `api/server.js`를 관리하는 셸을 실행하며, 관리 셸은 둘 중 하나가 종료되면 두 프로세스를 모두 중지합니다. `/health`는 API 응답을 반환합니다. 이미지는 UID/GID `10001`을 사용하며 중앙 Kubernetes Deployment는 루트 파일 시스템을 읽기 전용으로 설정합니다.

| 경로 | 담당 기능 |
|---|---|
| `src/` | Split/Classic 대시보드, 시계 테마, 웹 도구와 임베디드 도구 |
| `api/` | Express 라우트, 연동 클라이언트와 JSON·이미지 영구 저장소 |
| `packages/toolkit-core/` | 도구 메타데이터, 표시 위치와 Markdown 유틸리티 |
| `toolkit-extension/` | 팝업, 새 탭, 문맥 메뉴를 제공하는 Manifest V3 확장 |
| `chrome-extension/` | 별도의 탭 통계 수집·탭 활성화 확장 |
| `scripts/` | 컨테이너 스모크, 릴리스 계획·게시와 토큰 백업 복구 |
| `k8s/` | 참고용 매니페스트이며 Argo CD는 아래 중앙 GitOps 경로를 사용합니다. |

## 도구와 API 경로

Split과 Classic 레이아웃은 검색, 날씨, 북마크와 시각 효과를 제공합니다. 시계 카탈로그에는 테마 12개가 있습니다. 웹 실행기와 Toolkit 확장은 같은 카탈로그에 표시 위치별 로더를 연결합니다. 일부 ID는 다릅니다. 웹의 `subnet`, `textcounter`, `excel`, `ip`는 확장의 `cidr`, `textcount`, `excel2md`, `iplookup`에 대응합니다.

![도구 표시 위치 대응표](docs/svg/tool-landscape.ko.svg)

`/?embed=1&tool=<id>` 또는 `/?embed=true&tool=<id>`로 열면 대시보드 없이 웹 도구 하나를 표시합니다. 예를 들어 `/?embed=1&tool=json`은 JSON 포매터를 엽니다. 임베디드 경로에는 웹 도구 ID를 사용합니다. Toolkit 확장은 `npm run build --prefix toolkit-extension`으로 만든 `toolkit-extension/dist`를 불러옵니다.

| API | 용도 |
|---|---|
| `GET /health`, `GET /api/services` | 상태 응답과 Kubernetes 서비스 검색 |
| `GET/PUT /api/bookmarks` | 북마크 전체 모음이며 분류·항목별 경로에서 추가·수정·삭제를 지원합니다. |
| `/api/todos`, `/api/notes`, `/api/chat/history` | 할 일, 메모와 대화 이력 영구 저장 |
| `GET /api/chat/models`, `POST /api/chat/gemini` | 모델 목록과 Gemini 채팅 |
| `POST /api/chat/{provider}` | 지원하는 하네스 제공자의 Agent Platform 채팅 |
| `GET /api/infra/{cluster,tailscale,nas}` | 인프라 상태 |
| `/api/nas/*`, `/api/gdrive/*`, `/api/onedrive/*` | 파일 목록, 폴더 작업, 업로드와 다운로드 |
| `GET /api/auth/{google,microsoft}` | OAuth 인증이며 콜백 경로 끝은 `/callback`입니다. |
| `GET/POST /api/clipboard/images`, `GET/DELETE /api/clipboard/images/:id` | 클립보드 이미지 저장소 |
| `GET /api/github/repos`, `GET /api/github/repos/stream`, `POST /api/github/repos/refresh` | 저장소 카탈로그, SSE와 새로고침 |
| `GET /api/briefing/{latest,mails,events,stream}` | Worklog 브리핑과 SSE 알림 |
| `GET /api/jma/*`, `GET /api/sapporo-events/*`, `GET /api/suggest` | 기상 경보, 행사와 검색 제안 |
| `GET /api/icons/{index,svg}`, `GET/POST /api/browser-stats` | 아이콘 프록시와 브라우저 확장 통계 |

저장소 카탈로그는 시작 5초 후부터 기본 5분마다 갱신합니다. 행사 수집도 시작 5초 후에 실행하고 이후 24시간마다 반복합니다. 브리핑 데이터는 60초 동안 캐시하며 NATS의 `work.briefing.>` 알림을 수신합니다.

## 로컬 개발

Node.js `>=24.15 <25`가 필요하며 `.nvmrc`는 `24.15.0`을 지정합니다. 루트, API와 Toolkit의 잠금 파일은 별도입니다. 의존성을 각각 설치하고 프런트엔드와 API를 서로 다른 터미널에서 실행합니다.

```sh
npm ci
npm ci --prefix api
npm ci --prefix toolkit-extension
npm run dev
# In another terminal
npm run dev --prefix api
```

`http://localhost:5173`에 접속합니다. 웹 API 클라이언트는 호스트 이름이 `localhost`이면 `http://localhost:3001`을 사용합니다. Vite에는 API 프록시가 없습니다. API 기본 포트는 `3001`이며 `PORT`로 변경합니다. 런타임 설정은 프로세스 환경 변수에서 읽습니다. 자격증명은 추적 대상 파일 밖에서 관리합니다.

## 품질 검사

저장소 계약은 README 구조, 동일한 명령 블록, 언어별 이미지 링크, SVG 배치 규칙, 관리 파일, 워크플로 경계와 GitHub 워크플로 체크섬을 검사합니다. Gitea CI는 린트, 단위·API·브라우저 검사, 빌드, 운영 의존성 감사와 컨테이너 스모크도 실행합니다.

```sh
python3 verify.py --repository .
npm run lint
npm run test:unit
npm run test:api
npm run test:e2e
npm run build
npm audit --omit=dev --audit-level=high
npm audit --prefix api --omit=dev --audit-level=high
npm audit --prefix toolkit-extension --omit=dev --audit-level=high
npm run smoke:container
```

`npm run test:e2e`는 `pretest:e2e`에서 Toolkit 확장을 빌드합니다. 브라우저 검사에는 Playwright Chromium이 필요합니다. 컨테이너 스모크에는 Docker가 필요하며 HTTP 상태, 읽기 전용 마운트와 API 종료 후 상태 요청 실패를 확인합니다. CI는 운영 의존성 감사에서 심각도가 high 이상인 항목을 허용하지 않습니다.

## 런타임 설정

| 변수 | 기본값 또는 용도 |
|---|---|
| `PORT`, `BOOKMARKS_DIR` | `3001`, `/data` |
| `CORS_ALLOWED_ORIGINS` | 쉼표로 구분한 출처이며 기본값은 `https://clock.seonology.com`, `http://localhost:5173`, `http://127.0.0.1:5173`입니다. |
| `CLOUD_TOKEN_ENCRYPTION_KEY` | 클라우드 토큰 암호화 키 |
| `CLIPBOARD_DIR`, `CLIPBOARD_MAX_IMAGE_BYTES`, `CLIPBOARD_MAX_TOTAL_BYTES`, `CLIPBOARD_MAX_ITEMS` | `/data/clipboard`, 25 MiB, 256 MiB, 100이며 디렉터리는 `BOOKMARKS_DIR`을 따릅니다. |
| `GEMINI_API_KEY`, `AGENT_PLATFORM_URL`, `AGENT_TOKEN_URL`, `AGENT_CLIENT_ID`, `AGENT_CLIENT_SECRET` | Gemini·Agent Platform 자격증명과 주소이며 Agent API 기본값은 `http://agent-api.agent-platform.svc.cluster.local:8080`입니다. |
| `AGENT_TIMEOUT_MS`, `AGENT_POLL_INTERVAL_MS` | `180000`, `1000`이며 토큰 발급 주소 기본값은 `https://auth.seonology.com/realms/master/protocol/openid-connect/token`입니다. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google Drive OAuth이며 콜백 기본값은 `https://clock.seonology.com/api/auth/google/callback`입니다. |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_REDIRECT_URI` | OneDrive OAuth이며 콜백 기본값은 `https://clock.seonology.com/api/auth/microsoft/callback`입니다. |
| `NAS_HOST`, `NAS_PORT`, `NAS_ACCOUNT`, `NAS_PASSWORD`, `NAS_ALLOWED_ROOTS`, `NAS_CA_PATH`, `NAS_TLS_SERVERNAME` | NAS 연결, 허용 경로와 TLS 설정이며 포트 기본값은 `5001`입니다. |
| `NAS_MAX_UPLOAD_BYTES`, `NAS_MAX_UPLOAD_FILES` | 11 GiB, 파일 1개 |
| `GRAFANA_URL`, `GRAFANA_USER`, `GRAFANA_PASS`, `TAILSCALE_OAUTH_CLIENT_ID`, `TAILSCALE_OAUTH_CLIENT_SECRET` | 인프라 연동이며 Grafana 주소 기본값은 `https://grafana.seonology.com`입니다. |
| `GITHUB_CATALOG_TOKEN`, `CATALOG_INTERVAL_MS` | 카탈로그 토큰과 주기 `300000`이며 토큰 대체값은 `GITHUB_TOKEN`입니다. |
| `WORKLOG_API_BASE`, `WORKLOG_CLIENT_CERT_FILE`, `WORKLOG_CLIENT_KEY_FILE`, `NATS_URL`, `NATS_USER`, `NATS_PASSWORD` | Worklog의 mTLS 연결과 NATS 브리핑 구독 |
| `ICONS_BASE`, `DOORKEEPER_TOKEN`, `CONNPASS_API_KEY` | 아이콘 서비스 기본값 `http://seonology-svg-studio`와 행사 연동 |

`BOOKMARKS_DIR`에는 `bookmarks.json`, `todos.json`, `notes.json`, `chat-history.json`, `cloud-tokens.json`, `clipboard-images.json`과 클립보드 이미지 디렉터리를 저장합니다. nginx는 일반 요청을 1 MiB, 클립보드 업로드를 32 MiB, NAS·Drive 업로드를 12 GiB로 제한합니다. 개별 파일 한도는 API가 적용합니다.

## CI/CD와 릴리스

![워크플로 실행 분기](docs/svg/delivery.ko.svg)

| 워크플로 / 잡 | 트리거 | 단계와 결과 |
|---|---|---|
| `.gitea/workflows/ci.yml` / `quality` | `main` push, `main` 대상 pull request, `workflow_dispatch` | 체크아웃 → Node 24 확인 → 의존성 3종 설치 → 저장소 정책 → 린트·단위·API → Chromium·브라우저 → 웹 빌드 → 운영 의존성 감사 → 컨테이너 스모크 |
| `.gitea/workflows/image.yml` / `publish` | `main` push, `workflow_dispatch` | 체크아웃 → 저장소 정책 → 멀티 플랫폼 빌더 → 레지스트리 로그인 → 게시 → 플랫폼 확인이며 `linux/amd64`와 `linux/arm64`, 태그 `main`과 `sha-<12 hex>`를 사용합니다. |
| `.gitea/workflows/release.yml` / `release` | `v*` 태그 push, 필수 `tag` 입력을 받는 `workflow_dispatch` | 체크아웃 → 태그·VERSION 확인 → 저장소 정책 → 빌더 → 로그인 → 이미지 존재 확인·게시 → 플랫폼 확인 → 릴리스 존재 확인·생성 |

`main` push에서 CI와 Image는 독립적으로 시작합니다. 워크플로 사이의 성공 의존성과 dispatch 연결은 없습니다. 레지스트리 이미지 이름은 `git.seonology.com/seonology/seonology-clock-page`입니다. Release는 `VERSION`과 `X.Y.Z`가 같은 `vX.Y.Z`만 받습니다. 해당 이미지가 없으면 버전 태그로 빌드하고, Gitea 릴리스가 없으면 마지막 커밋 50개의 제목으로 릴리스 노트를 만들어 게시합니다.

Gitea 워크플로는 버전 증가를 계산하지 않습니다. `scripts/release-gate.mjs`의 계획기는 `feat`에 마이너, `fix`·`chore`·`refactor`·`docs`·`perf`에 패치를 적용합니다. 호환성을 깨는 변경은 1.x부터 메이저, 0.x에서는 마이너를 적용합니다. 빌드 버전은 `VERSION`에서 읽으며 비공개 패키지인 `package.json`은 `0.0.0`을 유지합니다.

## 중앙 GitOps 배포

Argo CD Application `seonology-clock-page`는 `https://git.seonology.com/seonology/seonology-k3s.git`의 리비전 `HEAD`, 경로 `workloads/seonology-clock-page`를 읽고 `seonology-apps` 네임스페이스에 배포합니다. 자동 동기화는 `prune`과 `selfHeal`을 사용합니다. Kustomization은 `git.seonology.com/seonology/seonology-clock-page:sha-7192892f4d21`을 지정합니다.

Application의 Image Updater 주석은 별도로 `ghcr.io/seonnoh/seonology-clock-page`, `semver` 전략, `main`으로의 git write-back과 Kustomization 대상을 지정합니다. Gitea 이미지 워크플로는 Gitea Registry 이미지와 12자리 SHA 태그를 게시합니다.

![접근과 저장소 경계](docs/svg/security-boundaries.ko.svg)

Traefik은 `clock.seonology.com`에 `kube-system/keycloak-auth`와 TLS 옵션 `kube-system/seonology-tls-no-mtls`를 적용합니다. API·상태 경로의 우선순위는 `200`입니다. UI 경로의 우선순위는 `10`이며 콘솔 임베드 미들웨어를 추가하여 `https://www.seonology.com`의 프레임 포함을 허용합니다. ClusterIP Service는 `80` 포트를 nginx의 이름 있는 `http` 포트 `8080`에 연결합니다.

Deployment는 복제본 1개, `Recreate`, UID/GID `10001`, capability 전체 제거, 권한 상승 금지와 `RuntimeDefault` seccomp를 설정합니다. `clock-bookmarks-cp`는 `/data`에 마운트하는 64 MiB `local-path` PVC이며 Pod는 `backup.velero.io/backup-volumes: bookmarks-data`를 선언합니다. `/tmp`, `/var/cache/nginx`, `/var/run/nginx`는 `emptyDir`을 사용합니다. External Secrets는 `vault-cluster`로 Vault를 읽고 매시간 갱신합니다. Worklog 인증서는 `/cred/worklog`에 읽기 전용으로 마운트합니다. 서비스 계정은 Ingress, IngressRoute, 노드와 노드 메트릭에 대한 읽기 전용 `get/list` 권한을 가집니다.

Agent Platform의 `agent-api-ingress` NetworkPolicy는 `seonology-apps` 네임스페이스에서 `app: seonology-clock-page` 레이블을 가진 Pod가 Agent API의 TCP `8080`에 접근하도록 허용합니다.

## 기여와 라이선스

커밋 제목은 영어 Conventional Commit 형식으로 작성하고 본문에는 변경 이유와 영향을 한국어로 적습니다. README 절 순서, 명령 블록과 그림별 세 언어판을 일치시킵니다. 그림은 기존 파일 이름과 pedia 항목으로 갱신합니다.

[MIT License](LICENSE)를 적용합니다. 기여 방법은 [CONTRIBUTING.md](CONTRIBUTING.md)에 있으며 문서 구조는 [README_STRUCTURE.md](README_STRUCTURE.md)에 정의합니다.
