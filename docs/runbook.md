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
docker run --rm -d --name seonology-clock-page-smoke --read-only --tmpfs /tmp:rw,noexec,nosuid,mode=1777,size=16m --tmpfs /var/cache/nginx:rw,noexec,nosuid,mode=1777,size=16m --tmpfs /var/run/nginx:rw,noexec,nosuid,mode=1777,size=4m --tmpfs /data:rw,noexec,nosuid,mode=1777,size=16m -p 127.0.0.1::8080 seonology-clock-page:smoke
docker port seonology-clock-page-smoke 8080
curl --fail --silent --show-error http://127.0.0.1:<published-port>/health
docker exec seonology-clock-page-smoke sh -c 'for pid in $(pidof node); do if grep -F -q "/app/api/server.js" "/proc/$pid/cmdline" 2>/dev/null; then kill -TERM "$pid"; exit 0; fi; done; exit 1'
curl --fail --silent --show-error http://127.0.0.1:<published-port>/health
docker rm -f seonology-clock-page-smoke
```

첫 번째 요청은 성공하고, API를 종료한 뒤 두 번째 요청은 실패해야 합니다. 두 번째 요청이 성공하면 `/health`가 static fallback을 반환하는지 nginx location과 API process를 조사합니다.

## 릴리스

`main` push에서는 quality 이후 native release planner가 마지막 `vX.Y.Z` tag부터 현재 HEAD까지의 Conventional Commit subject/body를 읽고 `released`, `version`, `base_sha`, `release_date`를 GitHub output에 기록합니다. planner는 worktree의 `VERSION`과 `CHANGELOG.md`를 바꾸지 않습니다. release 대상이 없으면 `released=false`이고 GHCR image push와 publish job은 실행되지 않습니다.

`feat`가 하나라도 있으면 minor, `fix`·`chore`·`refactor`·`docs`·`perf`만 있으면 patch를 올립니다. type allowlist 밖이라도 `!` 또는 `BREAKING CHANGE:`가 있으면 breaking change이며 1.x 이상에서 major, 0.x에서는 minor로 계산합니다. `chore(release): <version> [skip ci]`만 다시 릴리스에서 제외하고, 일반 feature의 `[skip ci]`는 계산에 포함합니다. 마지막 tag는 생성 시간이 아니라 stable `vX.Y.Z` 중 SemVer 최대값을 사용하며 `VERSION`과 다르면 fail-closed 합니다. tag가 없는 bootstrap은 `VERSION`과 전체 history를 base로 사용합니다.

image job은 planner의 version을 Docker `APP_VERSION` build arg로 전달하고 builder가 build context의 `VERSION`을 그 값으로 바꾼 뒤 Vite artifact와 `app-version.json`을 생성합니다. 이 JSON marker는 `{ "version": "<version>" }` 계약을 가지며 smoke가 HTTP로 읽어 계획 version과 정확히 비교합니다. 단일 loaded image에 local verification tag와 GHCR `v<version>`·`latest` tag를 함께 부여해 smoke한 바로 그 artifact만 push합니다. push 직전에는 다시 remote `main` SHA가 `base_sha`와 일치하는지 확인하므로 stale plan은 image tag를 원격에 만들지 못합니다. 그 뒤에만 publish job이 `VERSION`·고정 release date의 결정적 `CHANGELOG.md`를 갱신하고 `chore(release): <version> [skip ci]` commit 및 annotated `v<version>` tag를 atomic push한 뒤 GitHub Release를 만듭니다.

publish 직전에는 origin의 `main` SHA가 planner의 `base_sha`와 같은지 확인합니다. 다르면 stale plan으로 중단하므로, 새 `main` push가 있으면 다음 직렬 실행에서 다시 plan합니다. 단, branch/tag atomic push 뒤 GitHub REST만 실패한 경우에는 remote annotated tag ref와 peeled commit, release commit의 단일 direct parent, 정확히 `VERSION`과 `CHANGELOG.md`만 바꾼 diff, `VERSION`, base changelog suffix를 보존한 고정 release date의 planned changelog section을 모두 확인한 경우에만 GitHub Release 조회·생성 단계로 재개합니다. 기존 Release는 tag/name/body/prerelease/draft가 모두 일치해야 하며 POST 422 경쟁은 GET 재조회로만 성공 처리합니다. workflow `concurrency`는 `release-main`을 한 번에 하나만 실행하고 publish 전에 `github-actions[bot]` git identity를 설정합니다. 현재 package integration은 `release:gate`가 `node scripts/release-gate.mjs`를 실행하도록 유지하며, image preflight는 `node scripts/release-image-gate.mjs`, publish는 workflow에서 `node scripts/release-publish.mjs`를 직접 실행합니다.

새 tag와 image digest, Argo CD Application revision, rollout revision을 작업 이력에 함께 기록합니다.

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

### Cloud token 마이그레이션 복구

평문에서 암호화 저장소로 최초 마이그레이션한 원문은 `/data/cloud-tokens.json.migration-backup.json`에 별도 AAD를 가진 AES-256-GCM envelope로 보존됩니다. 평문을 출력하거나 backup 파일을 직접 편집하지 말고, 현재 배포의 `CLOUD_TOKEN_ENCRYPTION_KEY`가 주입된 제한된 운영 환경에서 다음 CLI를 사용합니다.

```sh
node scripts/recover-cloud-token-backup.mjs \
  --backup /data/cloud-tokens.json.migration-backup.json \
  --target /data/cloud-tokens.recovered.json
```

`--backup`과 `--target`은 모두 필수이며 target은 backup과 다른 명시적 새 경로여야 합니다. CLI는 backup 형식, AAD, AES-GCM 인증 tag, 복호화된 token schema를 검증한 뒤 exact 원문을 `0600`으로 원자 생성합니다. target이 이미 있거나 symlink이면 덮어쓰지 않고 실패하며 token 내용은 stdout/stderr에 출력하지 않습니다. 복원 파일을 primary로 적용하는 작업은 애플리케이션을 중지하고 PVC snapshot을 확보한 유지보수 창에서 별도로 수행합니다. 다음 시작 시 정상 마이그레이션이 완료되어 primary와 migration backup 모두 평문을 포함하지 않는지 확인한 뒤 복원 파일을 안전하게 폐기합니다.
