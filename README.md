# Seonology Clock Page

Seonology Clock Page는 React/Vite 웹 화면, Express API, Chrome extension으로 구성된 개인 운영 도구입니다. 웹과 API는 하나의 컨테이너에서 nginx를 통해 제공됩니다.

## 요구 환경

- Node.js 24 LTS (`.nvmrc` 기준)
- npm lockfile을 지원하는 npm
- E2E 또는 컨테이너 검증 시 Docker

```sh
nvm use
npm ci
npm run dev
```

API를 함께 실행하려면 별도 터미널에서 다음을 실행합니다.

```sh
npm ci --prefix api
npm run dev --prefix api
```

기본 API 포트는 `3001`이며, Vite 개발 서버는 기존 프런트엔드 설정을 따릅니다. 환경변수와 운영 절차는 [운영 문서](docs/runbook.md)를 확인하십시오.

## 검증

통합 후 제공되는 품질 명령은 다음과 같습니다.

```sh
npm run lint
npm run test:unit
npm run test:api
npm run test:e2e
npm run verify
```

extension은 독립적으로 lockfile을 설치하고 빌드합니다.

```sh
npm ci --prefix toolkit-extension
npm run build --prefix toolkit-extension
```

## 컨테이너 상태 확인

`/health`는 nginx 정적 파일이 아니라 API health 응답을 프록시합니다. 따라서 API가 중지되면 Kubernetes readiness도 실패해야 합니다.

```sh
docker build -t seonology-clock-page:local .
docker run --rm -d --name seonology-clock-page-smoke -p 127.0.0.1::80 seonology-clock-page:local
docker port seonology-clock-page-smoke 80
curl --fail --silent --show-error http://127.0.0.1:<published-port>/health
docker exec seonology-clock-page-smoke pkill -f 'node /app/api/server.js'
curl --fail --silent --show-error http://127.0.0.1:<published-port>/health
docker rm -f seonology-clock-page-smoke
```

두 번째 `curl`은 실패해야 정상입니다. Docker의 동적 host 포트를 사용하면 다른 로컬 프로젝트와 포트가 충돌하지 않습니다.

## 문서

- [아키텍처](docs/architecture.md)
- [보안 경계](docs/security.md)
- [운영 및 롤백 절차](docs/runbook.md)

`k8s/`는 참고용 manifest이며 라이브 배포의 SSOT가 아닙니다. 실제 desired state는 `seonology-k3s`의 Argo CD Application 및 Kustomization에서 관리합니다.
