# 보안 경계

## 비밀값과 구성

비밀값은 코드, fixture, 로그, README, 이미지 레이어에 기록하지 않습니다. 운영 환경에서는 Kubernetes Secret 또는 CI secret으로 주입하며, 누락된 credential은 명시적으로 unavailable 상태를 반환해야 합니다. 기본값으로 credential 또는 TLS 검증 비활성화를 제공하지 않습니다.

현재 API가 참조하는 환경변수는 다음 범주로 관리합니다.

| 범주 | 변수 |
| --- | --- |
| 저장소 및 런타임 | `BOOKMARKS_DIR`, `PORT`, `CATALOG_INTERVAL_MS`, `ICONS_BASE` |
| OAuth·cloud | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_REDIRECT_URI`, `GITHUB_TOKEN`, `GITHUB_CATALOG_TOKEN`, `CLOUD_TOKEN_ENCRYPTION_KEY` |
| NAS | `NAS_HOST`, `NAS_PORT`, `NAS_ACCOUNT`, `NAS_PASSWORD`, `NAS_ALLOWED_ROOTS`, `NAS_CA_PATH`, `NAS_TLS_SERVERNAME`, `NAS_MAX_UPLOAD_BYTES`, `NAS_MAX_UPLOAD_FILES` |
| 외부 도구 | `GEMINI_API_KEY`, `CONNPASS_API_KEY`, `DOORKEEPER_TOKEN`, `TAILSCALE_OAUTH_CLIENT_ID`, `TAILSCALE_OAUTH_CLIENT_SECRET`, `GRAFANA_URL`, `GRAFANA_USER`, `GRAFANA_PASS` |

`CLOUD_TOKEN_ENCRYPTION_KEY`는 AES-256-GCM에 맞는 배포 전용 키여야 하며 다른 용도로 재사용하지 않습니다. 기존 `cloud-tokens.json` 평문은 Google/Microsoft token schema를 검증한 뒤에만 마이그레이션합니다. 마이그레이션 전에 같은 디렉터리의 `cloud-tokens.json.plaintext-backup`에 원문을 `0600`으로 원자 보존하며, 암호화 쓰기가 실패하면 평문 원본과 백업을 모두 유지해 재시도 또는 롤백할 수 있게 합니다. 백업 경로가 symlink이거나 기존 백업의 내용이 원본과 다르면 덮어쓰지 않고 fail-closed합니다. NAS TLS는 CA와 hostname을 구성해 기본 검증을 유지합니다.

## 입력 및 출력 경계

- Markdown은 원문 HTML, event attribute, `javascript:` URL을 신뢰하지 않으며 sanitizer를 거친 결과만 렌더링합니다.
- Mermaid는 strict 보안 설정과 SVG sanitizer를 사용하고, export도 화면과 같은 sanitized SVG만 사용합니다.
- OAuth state와 PKCE verifier는 일회성·만료성 transaction으로 검증합니다.
- NAS 경로는 허용 root의 정확한 하위 경로인지 검사하고 traversal, 제어문자, backslash를 거부합니다.
- 업로드는 대상 경로를 stream보다 먼저 검증하고, size·count·abort·upstream 오류를 provider 경계에서 처리합니다.

## 전송 및 브라우저 경계

nginx는 `/health`와 `/api/`를 loopback Express API로만 프록시합니다. `/health`가 API 연결 실패를 그대로 5xx로 반환하므로 readiness가 stale static asset으로 성공하지 않습니다. 일반 요청은 1 MiB로 제한하고, NAS·Google Drive·OneDrive 업로드 route의 전체 client request는 12 GiB로 제한합니다. API는 provider별 단일 파일을 최대 11 GiB까지 스트리밍하며 파일 크기·개수·대상 경로·abort·upstream 오류를 검증합니다. nginx의 추가 1 GiB는 multipart field, part header, boundary를 포함하는 envelope 여유이고, `proxy_request_buffering off`를 유지하므로 전체 요청을 nginx 임시 파일에 먼저 모으지 않습니다. nginx 상한은 API 검증을 대체하지 않고 과도한 전체 요청을 앞단에서 제한합니다.

컨테이너는 UID/GID `10001`로 실행하며 privilege escalation과 Linux capabilities를 허용하지 않고, RuntimeDefault seccomp profile을 사용합니다. root filesystem은 read-only이고 `/data` PVC 및 `/tmp`, `/var/cache/nginx`, `/var/run/nginx` emptyDir만 쓰기 가능하게 mount합니다. Docker smoke도 같은 read-only 조건과 tmpfs mount를 강제해 health endpoint를 검증합니다.

응답에는 CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`를 적용합니다. CSP의 외부 이미지·연결 허용은 현 기능의 HTTPS provider 통신을 위한 것이며, provider를 추가할 때는 필요한 origin만으로 더 좁혀야 합니다.

## 검증과 대응

CI는 root·API·extension의 production dependency audit에서 High 이상을 허용하지 않고, lint·unit/API·browser·web/extension build·container smoke 이후에만 release plan을 실행합니다. semantic-release 계열의 bundled npm 취약점을 제거하고 native planner/publisher만 사용합니다. native publisher는 `GITHUB_TOKEN`과 `GITHUB_REPOSITORY`를 환경변수로만 읽고 GitHub REST 실패 응답 본문이나 token을 출력하지 않습니다. push 전에는 단일 loaded image의 HTTP `app-version.json` marker를 계획 version과 정확히 비교하고 remote SHA를 재검증하므로 다른 artifact나 stale plan이 GHCR `v<version>`·`latest`를 덮어쓰지 못합니다. publish job은 `github-actions[bot]` identity를 명시적으로 설정하고 branch/tag를 atomic push합니다. image 성공 뒤에만 release write 권한을 사용합니다. API-only recovery는 annotated tag object/peeled commit, 단일 parent, 정확히 `VERSION`·`CHANGELOG.md`만 바꾼 diff, VERSION, base changelog suffix를 모두 검증합니다. 이미 publish된 tag의 GitHub Release는 tag/name/body/prerelease/draft 일치 여부를 GET으로 먼저 확인하고 POST 422 경쟁도 GET 재조회로만 성공 처리하며 response body를 출력하지 않습니다. security incident 또는 credential 노출 의심 시에는 즉시 Secret을 교체하고 GitOps SSOT에서 이전 검증 image digest로 롤백한 뒤 접근 로그와 배포 이력을 보존합니다.

## 참고 자료

- [OWASP 입력 검증 치트 시트](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [OWASP HTML sanitization 치트 시트](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [nginx request body 크기 제한](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size)
- [nginx request buffering](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_request_buffering)
- [Busboy multipart limits](https://github.com/mscdex/busboy#exports)
