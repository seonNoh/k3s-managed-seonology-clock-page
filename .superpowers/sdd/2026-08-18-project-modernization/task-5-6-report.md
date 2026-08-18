# 2026-08-18 Task 5·6 품질 게이트·런타임·운영 문서

> 현재 통합 상태(2026-08-18): 아래 초기 기록의 semantic-release 전제, root High 2/API High 5 audit 수치, `api/server.js` 통합 대기는 모두 해소된 과거 기준선입니다. 현재 release는 Node 표준 라이브러리·git·GitHub REST native planner/publisher를 사용하며 root·API·extension production audit High 0을 quality gate로 검사합니다. planned image는 단일 loaded artifact를 HTTP `app-version.json` marker로 smoke하고, remote `main`이 plan base SHA와 일치할 때만 같은 artifact를 GHCR `v<version>`과 `latest`로 push합니다.

## 배경/목적

프로젝트 현대화 계획의 Task 5와 Task 6을 구현했다. 목적은 브라우저, Node/CommonJS, 테스트, extension의 lint 환경을 분리하고, release 전에 재현 가능한 품질·컨테이너 gate를 두는 것이다. 런타임은 API의 실제 생존 상태를 `/health`로 노출하고, Node와 nginx가 종료 신호를 함께 받도록 변경했다.

초기 작업 당시 root, `api`, `toolkit-extension`의 `package.json` 및 lockfile은 별도 담당자 소유이었다. 현재 통합에서는 각 담당자 변경이 반영되어 세 package 경계를 함께 audit한다.

## 개념/배경지식·정보

- ESLint flat config는 파일 glob별 `languageOptions.globals`를 적용할 수 있다. API의 CommonJS 전역값, browser 전역값, Chrome `chrome` 전역값을 한 규칙으로 섞으면 실제 오류와 환경 오류를 구분할 수 없다.
- `/health`를 SPA fallback으로 처리하면 정적 파일만 살아 있어도 Kubernetes readiness가 성공한다. nginx의 exact location으로 loopback API `/health`를 프록시하면 API 연결 실패가 5xx 또는 연결 종료로 드러난다.
- `tini`는 PID 1에서 종료 신호를 자식 supervisor로 전달한다. supervisor는 Node와 foreground nginx를 함께 종료해 컨테이너가 orphan process 없이 끝나게 한다.
- GitHub Actions action tag는 이동할 수 있으므로 확인한 commit SHA로 고정했다. quality job은 read-only 권한, release job만 `contents: write`와 `packages: write`를 가진다.
- [Node.js 릴리스 일정](https://nodejs.org/en/about/previous-releases), [Docker ENTRYPOINT](https://docs.docker.com/reference/dockerfile/#entrypoint), [nginx proxy_pass](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass), [nginx request body limit](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size)를 설계 근거로 사용했다.

## 수행 내역(작업 내역·상태)

1. 성공 — 기준선을 측정했다. 기존 lint는 235 error/3 warning이었고, 대부분 API CommonJS와 Chrome globals를 browser config로 검사해 생긴 환경 오류였다. 실제 source warning과 React Compiler advisory는 경고로 보존했다.
2. 성공 — `eslint.config.js`를 web, Node/CommonJS, test, extension 경계로 나누고 generated/worktree 경로를 ignore했다. 최종 lint는 0 error/105 warning이다.
3. 성공 — `vitest.config.js`, `api/vitest.config.js`, release gate와 container smoke script 및 Node test를 추가했다. 먼저 두 script module이 없는 상태에서 테스트가 실패하는 것을 확인한 뒤 구현했고, 최종 4개 test가 통과했다.
4. 성공 — release workflow에 quality job, Node 24, immutable action SHA, least privilege, release 여부 조건부 GHCR push를 적용했다. 초기 semantic-release 전제는 bundled npm 취약점 때문에 폐기했고, 현재 native release gate가 마지막 stable `vX.Y.Z`과 Conventional Commit을 읽어 `released`, `version`, `base_sha`, `release_date`를 기록한다.
5. 성공 — Node 24 Docker build/runtime, `tini`+supervisor, nginx `/health` API proxy, upload route별 100 MiB ceiling, 보안 header, Kubernetes probe를 적용했다. 참고 deployment의 Grafana password literal도 Secret 참조로 바꿨다.
6. 성공 — README, architecture, security, runbook을 작성했다. `k8s/`가 non-authoritative이며 라이브 SSOT가 `seonology-k3s`의 Argo CD Application/Kustomization임을 명시했다.
7. 성공 — Task 2 worktree의 이미 구현된 `api/server.js`를 임시 Docker overlay로만 주입해 repository를 수정하지 않고 런타임 smoke를 수행했다. `/health`는 `200 application/json`이었고 Node를 종료하면 health 연결이 실패하며 container가 exit 1로 끝났다.

## 문제와 해결법

| 상태 | 문제·원인 | 조치 |
| --- | --- | --- |
| 실패 후 해결 | 초기 `/health`는 nginx SPA fallback 때문에 `text/html` 200이었다. | `location = /health`에서 `127.0.0.1:3001/health`를 exact proxy하도록 변경했다. |
| 실패 후 해결 | `18080`은 다른 로컬 `initial-release-app-1`이 점유하고 있었다. | 임의 고정 포트 대신 `-p 127.0.0.1::80`와 `docker port`를 사용했다. |
| 실패 후 해결 | audit JSON 임시 파일 이름이 `.json`으로 끝나지 않아 `require()`가 JSON으로 해석하지 못했다. | `fs.readFileSync`와 `JSON.parse`로 실제 JSON을 읽었다. |
| 실패 후 해결 | `docker run --entrypoint nginx ... nginx -t`는 nginx에 `nginx`를 중복 인자로 전달했다. | `docker run --entrypoint nginx ... -t`로 수정해 syntax test를 통과시켰다. |
| 해결됨 | 초기 worktree에는 Task 2의 `api/server.js`가 없었다. | 현재 통합 worktree의 실제 API entrypoint로 container smoke를 실행한다. 임시 overlay는 역사적 검증 방법으로만 보존한다. |
| 해결됨 | 초기 lockfile 기준 root High 2, API High 5, extension High 0이었다. | semantic-release 계열 의존성을 제거하고 현재 root·API·extension production audit High 0을 quality workflow와 통합 검증으로 유지한다. |

## 필요한 통합 변경

### 파일 경로와 package script

release gate 구현 파일은 `scripts/release-gate.mjs`, container smoke 구현 파일은 `scripts/container-smoke.mjs`이다. root `package.json`에는 다음 script를 추가해야 workflow가 실행된다.

```json
{
  "test:unit": "vitest run --config vitest.config.js && node --test tests/unit/release-gate.test.js tests/unit/container-smoke.test.js",
  "test:api": "npm test --prefix api",
  "test:e2e": "playwright test",
  "smoke:container": "node scripts/container-smoke.mjs",
  "release:gate": "node scripts/release-gate.mjs",
  "verify": "npm run lint && npm run test:unit && npm run test:api && npm run test:e2e && npm run build && npm run build --prefix toolkit-extension && npm run smoke:container"
}
```

API 담당자가 현재 `api/package.json`의 `test`를 Node built-in test로 유지했으므로 `test:api`는 `npm test --prefix api`를 사용한다. `api/vitest.config.js`는 Vitest-native API test를 도입할 때 사용할 준비 설정이며, Node test를 Vitest로 강제 변환하지 않는다.

### engines·의존성·lockfile

- 세 package의 `engines.node`를 Node 24로 맞춘다. 예: `">=24 <25"`.
- root에는 `vitest`, `jsdom` 등 test dependency만 유지한다. semantic-release와 모든 `@semantic-release/*` dependency는 bundled npm 취약점 때문에 제거했으며 `npx`로 우회하지 않는다.
- React/React DOM `19.2.8`, Vite `7.3.6`, Mermaid `11.16.1`과 각 lockfile의 production audit High 0은 현재 통합된 package/lockfile에서 유지한다.

## 실행 커맨드 전문(그대로 재실행 가능)

```sh
pwd && git status --short && git branch --show-current && git worktree list
npm run lint
npm audit --omit=dev --audit-level=high
cd api && npm audit --omit=dev --audit-level=high
cd ../toolkit-extension && npm audit --omit=dev --audit-level=high
docker build -t seonology-clock-page:task56-baseline .
git ls-remote https://github.com/actions/checkout.git 'refs/tags/v4' 'refs/tags/v4.2.2'
git ls-remote https://github.com/actions/setup-node.git 'refs/tags/v4' 'refs/tags/v4.4.0'
git ls-remote https://github.com/docker/setup-buildx-action.git 'refs/tags/v3' 'refs/tags/v3.11.1'
git ls-remote https://github.com/docker/login-action.git 'refs/tags/v3' 'refs/tags/v3.4.0'
git ls-remote https://github.com/docker/build-push-action.git 'refs/tags/v6' 'refs/tags/v6.18.0'
node --test tests/unit/release-gate.test.js
node --test tests/unit/container-smoke.test.js
node --test tests/unit/release-gate.test.js tests/unit/container-smoke.test.js
npm run lint
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/release.yaml'); YAML.load_file('k8s/deployment.yaml'); puts 'yaml syntax ok'"
docker build -t seonology-clock-page:task56-final .
docker run --rm --entrypoint nginx seonology-clock-page:task56-final -t
kubectl apply --dry-run=client -f k8s/deployment.yaml
npm run build
SMOKE_IMAGE=seonology-clock-page:task56-final-smoke SMOKE_SKIP_BUILD=1 node scripts/container-smoke.mjs
git diff --check
```

container smoke의 `task56-final-smoke`는 Task 2 API worktree를 Docker 임시 overlay로만 주입해 만든 검증용 image이다. source tree·API source·package/lockfile은 이 작업에서 수정하지 않았다.

## 검증 결과

- `npm run lint`: 성공, 0 error/105 warning
- `node --test tests/unit/release-gate.test.js tests/unit/container-smoke.test.js`: 성공, 4/4 pass
- `docker build -t seonology-clock-page:task56-final .`: 성공
- `docker run --rm --entrypoint nginx seonology-clock-page:task56-final -t`: 성공
- Task 2 API overlay `SMOKE_IMAGE=... node scripts/container-smoke.mjs`: 성공. health JSON 확인 후 Node 종료 시 health 실패 확인
- `kubectl apply --dry-run=client -f k8s/deployment.yaml`: 성공
- `npm run build`: 성공. 기존 main JS chunk 500 KiB 초과 warning은 범위 밖으로 유지
- production audit: 현재 root·API·extension High 0. quality workflow가 세 경계를 모두 검사한다.

## 결과

Task 5와 Task 6의 소유 파일 및 보조 gate/test script 구현을 완료했고, package/lockfile 보안 패치, scripts 연결, Task 2 API entrypoint 통합까지 반영됐다. 현재 release는 native planner/publisher, exact release provenance, single-artifact image smoke/push를 사용한다. 초기 `npm run verify` 통합 대기는 과거 상태이며 현재 변경은 별도 release/container 검증으로 확인한다.

## 관련 커밋/PR

- `7773ec2 chore: enforce release quality gates`
- `3418a07 chore: modernize runtime and operations`

## 1차 리뷰 후속 수정: non-root·read-only runtime

### 리뷰 실패와 원인

독립 리뷰에서 Dockerfile이 root 사용자로 실행되고 root filesystem 쓰기를 허용하며, reference deployment에 `runAsNonRoot`, capability drop, seccomp, read-only root filesystem 및 최소 writable volume이 없다는 Important 지적을 받았다. 또한 `GRAFANA_PASS` Secret key가 라이브 GitOps 계약의 `grafana-admin-pass`가 아니라 `grafana-pass`였다.

### 수정 내역

- Docker image에 UID/GID `10001`의 `app` 사용자를 만들고 `USER app`으로 전환했다. nginx는 비특권 포트 `8080`에서 실행한다.
- Alpine nginx의 global temporary path를 `/tmp/nginx`로 지정하고, startup supervisor가 tmpfs/emptyDir에서 필요한 nginx client body·proxy·FastCGI·uWSGI·SCGI·log directory와 `/var/cache/nginx`, `/var/run/nginx`만 생성한다.
- smoke runner는 `--read-only` 및 `/data`, `/tmp`, `/var/cache/nginx`, `/var/run/nginx` tmpfs만 제공하고, container UID가 `10001`인지 확인한다.
- reference Deployment에는 pod `runAsNonRoot`, UID/GID/fsGroup `10001`, RuntimeDefault seccomp를, container에는 `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, capabilities `drop: [ALL]`을 적용했다. 기존 PVC, single replica, Recreate 전략은 유지했다.
- nginx container port를 `8080`으로 바꾸고 Service는 `targetPort: http`를 사용해 외부 `80` 계약을 유지했다.
- `GRAFANA_PASS`의 `clock-page-secrets` key를 `grafana-admin-pass`로 맞췄다.

### TDD·검증

`createReadonlyRuntimeArgs` export가 없는 상태에서 read-only tmpfs test를 먼저 추가해 실패를 확인했다. 다음으로 port `8080` 전환 요구를 test expectation에 반영해 기존 container `80` publish가 실패하는 것도 확인한 뒤 구현했다.

```sh
node --test tests/unit/container-smoke.test.js
docker build -t seonology-clock-page:task56-nonroot .
docker run --rm --entrypoint nginx seonology-clock-page:task56-nonroot -p /tmp/nginx -g 'error_log stderr warn;' -t
docker run --rm --entrypoint sh seonology-clock-page:task56-nonroot -c 'id && test -w /data && test -w /tmp && test -w /var/cache/nginx && test -w /var/run/nginx'
SMOKE_IMAGE=seonology-clock-page:task56-nonroot-smoke SMOKE_SKIP_BUILD=1 node scripts/container-smoke.mjs
kubectl apply --dry-run=client -f k8s/deployment.yaml -f k8s/service.yaml
```

결과는 Node test 5/5 pass, non-root image build 및 nginx syntax pass, UID `10001` 확인, read-only tmpfs runtime health smoke pass, API 종료 뒤 health 실패 및 container exit 1, Kubernetes client dry-run pass다. 중간 검증에서 Alpine default nginx가 `/var/lib/nginx/tmp/proxy`를 쓰려 해 실패했으며, global HTTP temp path를 `/tmp/nginx`로 설정하고 runtime에 emptyDir/tmpfs 하위 디렉터리를 만드는 방식으로 해결했다.

### 후속 커밋

- `2be2d4e fix: enforce non-root runtime security`

## 재리뷰 후속 수정: BusyBox smoke 명령

재리뷰 Minor에서 runbook의 `pkill` 명령이 production Alpine image에 보장되지 않는다는 지적을 받았다. 자동 smoke와 동일하게 BusyBox가 제공하는 `pidof`로 Node PID를 찾고 `kill -TERM`을 보내도록 `docs/runbook.md`를 수정했다.

```sh
rg -n "pkill|pidof|kill -TERM" docs/runbook.md README.md scripts/container-smoke.mjs
docker exec seonology-clock-page-smoke sh -c 'kill -TERM "$(pidof node)"'
```

문서 명령은 `scripts/container-smoke.mjs`의 실제 자동 smoke 구현과 일치한다. 후속 커밋은 `e69deeb docs: correct container smoke command`이다.
