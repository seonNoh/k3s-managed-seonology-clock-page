# 운영 Runbook

## 로컬 실행

Node 24 LTS를 선택한 뒤 web, API, extension을 각각 lockfile 기반으로 설치합니다.

```sh
nvm use
npm ci
npm run dev
npm ci --prefix api
npm run dev --prefix api
npm ci --prefix toolkit-extension
npm run build --prefix toolkit-extension
```

운영 secret은 `.env` 파일을 이미지에 넣지 않습니다. 로컬에서 필요한 값은 현재 shell에만 주입하고, production과 같은 값이나 credential을 테스트 fixture에 복사하지 않습니다.

## 배포 전 검증

```sh
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

각 audit는 High 이상이 0이어야 합니다. API와 extension은 별도 lockfile을 가지므로 root audit만으로는 충분하지 않습니다.

## 컨테이너 smoke

다음은 nginx `/health`가 API와 결합되어 있는지 확인하는 재현 가능한 절차입니다. 동적 host 포트를 사용해 다른 로컬 컨테이너와 충돌하지 않게 합니다.

```sh
docker build -t seonology-clock-page:smoke .
docker run --rm -d --name seonology-clock-page-smoke -p 127.0.0.1::80 seonology-clock-page:smoke
docker port seonology-clock-page-smoke 80
curl --fail --silent --show-error http://127.0.0.1:<published-port>/health
docker exec seonology-clock-page-smoke pkill -f 'node /app/api/server.js'
curl --fail --silent --show-error http://127.0.0.1:<published-port>/health
docker rm -f seonology-clock-page-smoke
```

첫 번째 요청은 성공하고, API를 종료한 뒤 두 번째 요청은 실패해야 합니다. 두 번째 요청이 성공하면 `/health`가 static fallback을 반환하는지 nginx location과 API process를 조사합니다.

## 릴리스

`main` push에서 quality job이 먼저 실행됩니다. semantic-release가 새 `VERSION`을 만들지 않으면 `release:gate`는 `released=false`를 출력하고 GHCR image push는 실행되지 않습니다. 새 release가 있을 때만 `v<version>`과 `latest` tag를 push합니다.

릴리스 직전에는 커밋 타입을 확인합니다. `feat`가 하나라도 포함되면 minor, `fix`·`chore`·`refactor`·`docs`만이면 patch를 올립니다. 새 tag와 image digest, Argo CD Application revision, rollout revision을 작업 이력에 함께 기록합니다.

## 배포 후 확인

1. GitOps SSOT에서 Image Updater write-back commit과 Argo CD Application의 `Synced`, `Healthy` 상태를 확인합니다.
2. 외부 endpoint의 `/health`와 read-only API를 확인합니다.
3. 인증된 브라우저에서 대표 도구, Markdown/Mermaid, Escape, backdrop, scroll lock, console 오류를 확인합니다.
4. NAS·Drive의 삭제·이동·업로드는 자동 smoke에서 실행하지 않습니다.

## 롤백

1. `seonology-k3s`의 깨끗한 worktree에서 Image Updater를 일시 중지합니다.
2. 이전에 검증된 image digest를 참조하는 tag로 Kustomization의 `newTag`를 되돌리는 커밋을 만듭니다.
3. Argo CD가 해당 commit을 적용하고 `Synced`, `Healthy`가 되는지 확인합니다.
4. `/health`와 read-only API를 재검증합니다.

`kubectl rollout undo`는 GitOps 경로가 복구 불가능한 긴급 상황에서만 사용합니다. 사용했다면 GitOps desired state를 즉시 같은 revision으로 정정해 drift를 제거합니다.
