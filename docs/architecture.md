# 아키텍처

## 구성

```text
Browser / Chrome extension
          |
          v
React + Vite static assets --- nginx :8080 --- /api/*, /health ---> Express :3001
                                                              |
                                                              +--> PVC JSON stores
                                                              +--> Google / Microsoft / NAS / Kubernetes APIs
```

웹 앱은 Vite로 정적 파일을 만들고 nginx가 이를 제공합니다. `/api/`는 Express API로 프록시하며, `/health`도 API health contract로 전달합니다. 이 분리는 정적 파일만 정상인 상태를 ready로 보고하지 않기 위한 것입니다.

## 프런트엔드 모듈 경계

`src/App.jsx`는 화면 환경 설정과 레이아웃 선택만 담당합니다. 최초 사용자는 Split Console과 light mode를 사용하며, 선택한 레이아웃·색상 모드·시계·효과 값은 허용값 검증을 거쳐 저장됩니다.

```text
src/App.jsx
  +-- app/preferences.js                 설정 schema와 기본값
  +-- hooks/usePersistentPreference.js  안전한 localStorage adapter
  +-- layouts/SplitConsoleDashboard.jsx 새 기본 화면
  |     +-- features/dashboard/          검색·상태·링크 데이터
  |     +-- features/tool-launcher/      도구 catalog와 실행 표면
  |     +-- components/SnowField.jsx     독립적인 눈 효과
  +-- layouts/ClassicDashboard.jsx      기존 화면 호환 경계
  +-- components/Clock.jsx
        +-- features/clock/clockCatalog.js  12개 시계와 레이아웃 메타데이터
        +-- features/clock/timeFormat.js    시간 계산 순수 함수
        +-- features/clock/MatrixRain.jsx   결정적인 Matrix 렌더링
```

Split Console은 `portrait`, `square`, `panorama` 시계 메타데이터에 따라 PC grid 자체를 바꾸며, 태블릿과 모바일에서는 각각 2영역과 세로 흐름으로 전환합니다. 시계 크기는 viewport 고정값이 아니라 clock container 폭을 사용합니다. Classic은 기존 DOM과 기능을 보존하는 호환 레이어이며 별도 lazy chunk로 로드됩니다. Calendar, 날씨, 환율, Todo와 개별 도구도 사용 시점에만 로드되므로 새 기본 화면의 초기 JavaScript에 기존 전체 화면과 무거운 도구가 포함되지 않습니다.

API는 `api/server.js`가 HTTP 서버 수명주기를 소유하고, `api/app.js`의 `createApp`은 포트를 열지 않는 테스트 가능한 애플리케이션 조립점입니다. 저장, OAuth transaction, cloud token, NAS path 정책은 각각 독립 경계로 분리합니다. URL과 기존 성공 응답은 호환성 계약으로 유지합니다.

웹과 extension은 공통 tool catalog를 소비하지만 surface별 lazy registry를 유지합니다. Markdown과 Mermaid 출력은 공통 sanitizer 경계를 지나야 하며, 다이얼로그 상태는 웹에서 단일 활성 도구 ID로 관리합니다.

## 런타임 수명주기

컨테이너는 Node 24 Alpine build/runtime image를 사용합니다. UID/GID `10001`의 전용 사용자로 실행하며 root filesystem은 read-only입니다. 쓰기가 필요한 곳은 `/data` PVC, `/tmp`, `/var/cache/nginx`, `/var/run/nginx` volume으로 한정합니다. `tini`가 PID 1로 종료 신호를 shell supervisor에 전달하고, supervisor는 Node와 foreground nginx에 `TERM`을 전파합니다. 어느 프로세스든 비정상 종료하면 다른 프로세스를 종료한 뒤 컨테이너가 실패 코드로 끝납니다.

nginx는 비특권 포트 `8080`에서 일반 요청을 1 MiB로 제한하고, NAS·Google Drive·OneDrive 업로드 route만 전체 client request 12 GiB와 `proxy_request_buffering off`를 사용합니다. API는 단일 파일을 최대 11 GiB까지 스트리밍하면서 provider별 파일 수, 파일 크기, 대상 경로, abort와 upstream 오류를 검증합니다. 두 상한의 1 GiB 차이는 multipart field·part header·boundary envelope를 수용하므로 유효한 11 GiB 파일이 프록시에서 먼저 거부되지 않게 하며, nginx 12 GiB 상한은 API의 streaming validation과 backpressure 처리를 우회하지 않습니다. Kubernetes Service는 port name `http`로 이 내부 포트를 참조하므로 외부 Service port `80` 계약은 유지합니다.

## 배포 권한

이 저장소의 `k8s/`는 배포 이해와 smoke 검증을 위한 참고 manifest입니다. 라이브 desired state의 SSOT는 `seonology-k3s` 저장소의 Argo CD Application과 Kustomization입니다. 이미지 태그, replica, secret, ingress 또는 rollout을 변경할 때는 앱 저장소 manifest가 아니라 해당 GitOps 저장소의 깨끗한 worktree에서 변경하고 동기화 상태를 확인해야 합니다.

릴리스 파이프라인은 quality, read-only plan, GHCR image, publish의 순서로 분리됩니다. plan은 Node 표준 라이브러리와 git만 사용하고 base SHA, 계산한 version, 고정 release date를 출력합니다. image는 이 version을 Docker `APP_VERSION` build arg로 주입해 Vite static artifact, runtime footer, `v<version>` image tag가 일치하도록 합니다. 단일 loaded artifact에 local verification tag와 GHCR `v<version>`/`latest` tag를 모두 부여하고, HTTP `app-version.json` marker의 JSON `version`을 정확히 smoke한 뒤 remote `main` SHA가 plan base SHA와 같은지 재확인해 그 artifact만 push합니다. image가 성공하기 전에는 release commit, tag, GitHub Release를 만들지 않습니다. publish는 원격 `main`의 SHA를 다시 비교해 stale plan을 거부하고, commit/tag는 atomic push 하나로 전송합니다. 이미 remote에 release commit/tag가 있지만 GitHub REST만 실패한 상태는 annotated tag object/peeled commit, 단일 direct parent, 정확히 `VERSION`·`CHANGELOG.md` 두 파일만 바꾼 diff, VERSION, base changelog suffix가 보존된 결정적 changelog section을 검증한 뒤 API 단계만 재개합니다.

## 관련 자료

- [Node.js 릴리스 일정](https://nodejs.org/en/about/previous-releases)
- [Dockerfile ENTRYPOINT 참고](https://docs.docker.com/reference/dockerfile/#entrypoint)
- [nginx proxy_pass 지시어](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)
- [nginx request body 크기 제한](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size)
- [nginx request buffering](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_request_buffering)
