# AI Chat Agent Platform Integration Implementation Plan

> **For agentic workers:** Implement this plan task-by-task, dispatching a fresh subagent per independent task where possible. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub Models 채팅을 제거하고 Gemini 실가용성 확인과 Claude Code·Codex·Antigravity 실행을 현재 Clock AI Chat에 추가한다.

**Architecture:** 브라우저는 기존 `/api/chat/*` 계약만 사용한다. Clock API는 Gemini를 직접 호출하고, 정액제 하네스는 Keycloak client-credentials 토큰으로 cluster-local Agent API `/v1`를 호출한 뒤 완료 이벤트를 기존 응답 형식으로 정규화한다.

**Tech Stack:** React 19, Express 5, Node.js 24, Node test runner, Vitest, Kubernetes, External Secrets, Keycloak, Argo CD, Gitea Actions

## Global Constraints

- GitHub Models 채팅만 제거하고 GitHub 저장소 카탈로그와 `GITHUB_CATALOG_TOKEN`은 유지한다.
- Clock의 메시지 배열 기반 문맥 유지 방식을 바꾸지 않는다.
- 브라우저와 로그에 Gemini 키, Keycloak secret, access token을 노출하지 않는다.
- Agent Platform 하네스는 `claude`, `codex`, `agy`만 허용한다.
- 실제 Gitea 원격만 사용하고 GitHub 원격과 GitHub API는 사용하지 않는다.
- 기능 커밋이 `feat`이므로 릴리스 버전은 `1.56.5`에서 `1.57.0`으로 올린다.

---

### Task 1: Chat provider 경계와 Gemini 상태 확인

**Files:**
- Create: `api/chat/gemini-client.js`
- Create: `api/chat/chat-routes.js`
- Create: `api/test/chat-routes.test.js`
- Modify: `api/config/index.js`
- Modify: `api/index.js`

**Interfaces:**
- Consumes: `loadConfig(env)`, Express app, 주입 가능한 `fetch`.
- Produces: `createGeminiClient({ apiKey, fetchImpl, timeoutMs })`, `setupChatRoutes(app, dependencies)`.

- [ ] **Step 1: GitHub Models가 노출되지 않고 실제 Gemini 모델만 반환되는 실패 테스트 작성**

```js
test('chat models exclude GitHub and include only Gemini generateContent models', async () => {
  const response = await fetch(`${origin}/api/chat/models`);
  assert.deepEqual(await response.json(), {
    models: [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini' }],
    providers: { gemini: { status: 'ok' }, agents: { status: 'unavailable' } },
  });
});
```

- [ ] **Step 2: API 테스트를 실행해 기존 고정 GitHub 목록 때문에 실패하는지 확인**

Run: `npm test --prefix api -- --test-name-pattern='chat models'`

Expected: GitHub 모델이 포함되거나 새 응답 계약이 없어 FAIL.

- [ ] **Step 3: Gemini Models API 필터와 Chat route 모듈을 최소 구현**

```js
function supportsGenerateContent(model) {
  return Array.isArray(model.supportedGenerationMethods)
    && model.supportedGenerationMethods.includes('generateContent');
}
```

- [ ] **Step 4: Gemini 생성 요청의 role 변환과 안전한 오류 응답 테스트 및 구현**

Run: `npm test --prefix api -- --test-name-pattern='Gemini'`

Expected: 성공, 401/429/5xx, timeout 계약이 모두 PASS.

- [ ] **Step 5: Chat 전용 GitHub route와 사용량 호출을 제거하고 전체 API 테스트 실행**

Run: `npm test --prefix api`

Expected: 모든 API 테스트 PASS.

### Task 2: Agent Platform 인증·모델·실행 어댑터

**Files:**
- Create: `api/chat/agent-platform-client.js`
- Create: `api/chat/transcript.js`
- Create: `api/test/agent-platform-client.test.js`
- Modify: `api/chat/chat-routes.js`
- Modify: `api/config/index.js`

**Interfaces:**
- Consumes: Keycloak token endpoint, Agent API base URL, client id/secret, `messages`, `model`.
- Produces: `createAgentPlatformClient(config)`, `listModels()`, `runChat({ harness, model, messages, signal })`, `serializeTranscript(messages)`.

- [ ] **Step 1: transcript가 system/user/assistant 역할과 순서를 보존하는 실패 테스트 작성**

```js
assert.equal(serializeTranscript([
  { role: 'system', content: '간결하게 답하세요.' },
  { role: 'user', content: '첫 질문' },
  { role: 'assistant', content: '첫 답변' },
  { role: 'user', content: '후속 질문' },
]), '[System]\n간결하게 답하세요.\n\n[User]\n첫 질문\n\n[Assistant]\n첫 답변\n\n[User]\n후속 질문');
```

- [ ] **Step 2: 테스트를 실행해 모듈 부재로 실패하는지 확인**

Run: `node --test api/test/agent-platform-client.test.js`

Expected: `MODULE_NOT_FOUND` 또는 export 부재로 FAIL.

- [ ] **Step 3: transcript 직렬화와 입력 크기·역할 검증 구현**

허용 role은 `system`, `user`, `assistant`이고 최대 메시지 수와 총 문자 수를 config에서 강제한다.

- [ ] **Step 4: client-credentials 토큰 캐시와 만료 전 갱신 실패 테스트 및 구현**

토큰 요청은 `application/x-www-form-urlencoded`로 보내고 `expires_in`보다 30초 앞서 캐시를 만료한다. 401 응답은 캐시를 비우고 한 번만 재시도한다.

- [ ] **Step 5: 하네스·모델 목록 병합 실패 테스트 및 구현**

`GET /v1/harnesses`에서 credential status가 `ok`인 `claude`, `codex`, `agy`만 대상으로 `GET /v1/models?harness=`를 호출한다. 일부 하네스 실패는 다른 하네스를 막지 않는다.

- [ ] **Step 6: run 생성·완료·실패·취소 실패 테스트 및 구현**

`POST /v1/runs`에는 UUID `idempotency_key`, `sensitive: true`, transcript prompt를 보낸다. `GET /v1/runs/{id}`와 `/events`를 제한 시간 동안 조회하고 log payload의 `line`을 순서대로 합친다. 시간 제한 시 `/cancel`을 호출한다.

- [ ] **Step 7: 전체 Agent client 테스트 실행**

Run: `node --test api/test/agent-platform-client.test.js`

Expected: 모든 테스트 PASS.

### Task 3: ChatPanel 모델 표시와 대화 기록 복원

**Files:**
- Create: `src/features/chat/model-groups.js`
- Create: `tests/unit/chat-model-groups.test.js`
- Modify: `src/components/ChatPanel.jsx`
- Modify: `src/components/ChatPanel.css`

**Interfaces:**
- Consumes: `/api/chat/models`, `/api/chat/history`, `/api/chat/history/:id`.
- Produces: Provider별 모델 그룹, 저장 대화 목록, 선택 대화 복원 동작.

- [ ] **Step 1: Gemini·Claude Code·Codex·Antigravity 라벨과 disabled 상태 실패 테스트 작성**

Run: `npm run test:unit -- --run tests/unit/chat-model-groups.test.js`

Expected: 새 모듈 부재로 FAIL.

- [ ] **Step 2: 모델 그룹 순서와 Provider 메타데이터 구현 후 테스트 통과**

정렬 순서는 Gemini, Claude Code, Codex, Antigravity이며 GitHub Models 라벨은 만들지 않는다.

- [ ] **Step 3: 기록 목록 조회·선택 복원 UI 구현**

대화를 선택하면 메시지, `conversationId`, 저장된 모델을 복원한다. 모델이 현재 카탈로그에 없으면 현재 기본 모델을 유지한다.

- [ ] **Step 4: ChatPanel 단위 테스트와 접근성 검사 실행**

Run: `npm run test:unit`

Expected: 모든 Vitest와 Node 단위 테스트 PASS.

### Task 4: Keycloak·Vault·NetworkPolicy GitOps 구성

**Files:**
- Modify: `workloads/seonology-clock-page/deployment.yaml`
- Modify: `workloads/seonology-clock-page/external-secret.yaml`
- Modify: `workloads/agent-platform/runtime/network-policy.yaml`
- Modify: `workloads/agent-platform/tests/test-mobile-api-policy.py`

**Interfaces:**
- Consumes: Vault `apps/clock-page`의 `agent-client-id`, `agent-client-secret`.
- Produces: Clock Pod의 Agent API 환경변수와 Agent API의 제한된 ingress 허용 규칙.

- [ ] **Step 1: NetworkPolicy에 Clock만 허용하는 실패 테스트 수정 및 실행**

Run: `python3 -m unittest workloads.agent-platform.tests.test-mobile-api-policy`

Expected: 현재 ingress 규칙에 Clock이 없어 FAIL.

- [ ] **Step 2: `seonology-clock-ai-chat` Keycloak confidential client 생성**

client credentials를 활성화하고 hardcoded audience mapper로 `seonology-agents-api`를 access token에 추가한다. 이미 존재하면 설정을 비교하고 동일하게 유지한다.

- [ ] **Step 3: client id와 secret을 Vault에 저장하고 ExternalSecret 매핑 추가**

실제 secret은 명령 출력, Git diff, 문서에 기록하지 않는다.

- [ ] **Step 4: Clock Deployment 환경변수와 Agent API ingress 규칙 구현**

`AGENT_PLATFORM_URL`, `AGENT_TOKEN_URL`, `AGENT_CLIENT_ID`, `AGENT_CLIENT_SECRET`을 주입하고 `GITHUB_TOKEN` 주입은 제거한다.

- [ ] **Step 5: GitOps 정책 테스트와 Kustomize 렌더 검증**

Run: `python3 workloads/agent-platform/tests/test-mobile-api-policy.py && kubectl kustomize workloads/agent-platform >/dev/null && kubectl kustomize workloads/seonology-clock-page >/dev/null`

Expected: 모든 명령 exit 0.

### Task 5: 전체 검증, 릴리스와 운영 배포

**Files:**
- Modify: `VERSION`
- Modify: `CHANGELOG.md`
- Modify: GitOps 이미지 태그

**Interfaces:**
- Consumes: Gitea Actions가 게시한 `sha-<commit>` 이미지.
- Produces: Argo CD가 동기화한 Clock v1.57.0 운영 배포.

- [ ] **Step 1: 전체 저장소 검증 실행**

Run: `npm ci && npm ci --prefix api && npm ci --prefix toolkit-extension && npm run verify`

Expected: lint, unit/API/E2E, build, audit, container smoke 모두 PASS.

- [ ] **Step 2: 기능 커밋과 Gitea push**

```bash
git commit -m "feat: connect AI chat to agent platform" -m "GitHub Models 채팅을 제거하고 Gemini 실가용성 확인과 Claude Code, Codex, Antigravity 하네스 연동을 추가함. 기존 메시지 기반 문맥과 저장 대화 복원을 유지함."
git push origin main
```

- [ ] **Step 3: Gitea Actions 이미지 게시 확인**

`sha-<commit>` 다중 아키텍처 이미지가 생성되고 CI가 성공했는지 Gitea API로 확인한다.

- [ ] **Step 4: GitOps 이미지 태그를 새 SHA로 갱신하고 push**

GitOps 커밋은 `chore: deploy clock page v1.57.0` 제목과 한국어 본문을 사용한다.

- [ ] **Step 5: Argo CD 동기화와 rollout 확인**

Run: `kubectl -n seonology-apps rollout status deployment/seonology-clock-page --timeout=180s`

Expected: deployment successfully rolled out.

- [ ] **Step 6: 운영 Gemini와 세 Agent 하네스 smoke 실행**

운영 API를 인증 경계 안에서 호출해 모델 목록에 GitHub가 없고, Gemini·Claude Code·Codex·Antigravity가 각각 응답하는지 확인한다.

- [ ] **Step 7: Outline Work History 기록**

실행 커맨드 전문, 문제와 해결법, 커밋 및 배포 결과를 Work History 컬렉션에 업로드한다. 자격 증명 값만 마스킹한다.
