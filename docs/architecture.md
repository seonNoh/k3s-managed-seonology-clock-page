# 아키텍처

## 구성

```text
Browser / Chrome extension
          |
          v
React + Vite static assets --- nginx :80 --- /api/*, /health ---> Express :3001
                                                              |
                                                              +--> PVC JSON stores
                                                              +--> Google / Microsoft / NAS / Kubernetes APIs
```

웹 앱은 Vite로 정적 파일을 만들고 nginx가 이를 제공합니다. `/api/`는 Express API로 프록시하며, `/health`도 API health contract로 전달합니다. 이 분리는 정적 파일만 정상인 상태를 ready로 보고하지 않기 위한 것입니다.

API는 `api/server.js`가 HTTP 서버 수명주기를 소유하고, `api/app.js`의 `createApp`은 포트를 열지 않는 테스트 가능한 애플리케이션 조립점입니다. 저장, OAuth transaction, cloud token, NAS path 정책은 각각 독립 경계로 분리합니다. URL과 기존 성공 응답은 호환성 계약으로 유지합니다.

웹과 extension은 공통 tool catalog를 소비하지만 surface별 lazy registry를 유지합니다. Markdown과 Mermaid 출력은 공통 sanitizer 경계를 지나야 하며, 다이얼로그 상태는 웹에서 단일 활성 도구 ID로 관리합니다.

## 런타임 수명주기

컨테이너는 Node 24 Alpine build/runtime image를 사용합니다. `tini`가 PID 1로 종료 신호를 shell supervisor에 전달하고, supervisor는 Node와 foreground nginx에 `TERM`을 전파합니다. 어느 프로세스든 비정상 종료하면 다른 프로세스를 종료한 뒤 컨테이너가 실패 코드로 끝납니다.

nginx는 일반 API 요청을 작은 기본 요청 크기로 제한하고, NAS·Google Drive·OneDrive 업로드 route에만 100 MiB 상한과 streaming proxy 설정을 둡니다. API는 이 상한과 별개로 provider별 파일 수, 파일 크기, 경로 및 stream lifecycle을 다시 검증합니다.

## 배포 권한

이 저장소의 `k8s/`는 배포 이해와 smoke 검증을 위한 참고 manifest입니다. 라이브 desired state의 SSOT는 `seonology-k3s` 저장소의 Argo CD Application과 Kustomization입니다. 이미지 태그, replica, secret, ingress 또는 rollout을 변경할 때는 앱 저장소 manifest가 아니라 해당 GitOps 저장소의 깨끗한 worktree에서 변경하고 동기화 상태를 확인해야 합니다.

## 관련 자료

- [Node.js 릴리스 일정](https://nodejs.org/en/about/previous-releases)
- [Dockerfile ENTRYPOINT 참고](https://docs.docker.com/reference/dockerfile/#entrypoint)
- [nginx proxy_pass 지시어](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)
