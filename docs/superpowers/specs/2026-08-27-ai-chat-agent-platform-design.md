# AI Chat Agent Platform 연동 설계

## 목적

Clock의 기존 메시지 배열 기반 AI Chat을 유지하면서 GitHub Models 채팅 연동을 제거하고, Gemini API의 실제 가용성을 동적으로 확인하며, Claude Code·Codex·Antigravity 모델을 `agents.seonology.com`의 실행 하네스를 통해 추가한다.

## 확정 범위

- `ChatPanel`의 현재 대화 방식과 응답 표시 구조를 유지한다.
- 매 요청에는 시스템 프롬프트와 현재 대화의 전체 메시지를 전달한다.
- GitHub Models 모델 목록, 사용량 조회, 채팅 라우트와 Chat 전용 `GITHUB_TOKEN` 설정을 제거한다.
- GitHub 저장소 카탈로그 기능과 전용 `GITHUB_CATALOG_TOKEN`은 유지한다.
- Gemini는 고정 목록만 노출하지 않고 Google Models API에서 실제 사용 가능한 모델을 확인한다.
- Agent Platform에서 Claude Code, Codex, Antigravity 하네스와 모델 목록을 동적으로 조회한다.
- Agent 실행 결과는 기존 `{ content, model, usage }` 응답으로 정규화한다.
- 자격 증명은 브라우저와 Clock 데이터 파일에 저장하지 않는다.
- 저장된 채팅 기록을 선택해 다시 여는 UI를 연결한다.

## 검토한 접근 방식

### 1. 각 정액제 CLI를 Clock 컨테이너에 직접 설치

Clock 하나로 실행할 수 있지만 고가치 로그인 파일, CLI 버전, 갱신 작업과 실행 권한이 웹 애플리케이션 컨테이너에 집중된다. 기존 Agent Platform의 실행 격리와 자격 증명 관리를 중복하므로 채택하지 않는다.

### 2. Clock이 Agent Platform의 기존 비인증 내부 API 호출

구현은 단순하지만 다른 클러스터 워크로드도 실행을 생성할 수 있는 경계가 생긴다. 운영 NetworkPolicy와 `/v1` 인증 원칙에 맞지 않으므로 채택하지 않는다.

### 3. Clock BFF가 인증된 Agent Platform `/v1` API 호출

Clock은 UI와 메시지 기록을 담당하고 Agent Platform은 정액제 CLI 실행을 담당한다. Keycloak의 Clock 전용 confidential client로 client-credentials 토큰을 발급받고, Agent API가 요구하는 `seonology-agents-api` audience를 검증한다. 현재 구성 요소의 책임을 유지하면서 자격 증명을 분리할 수 있으므로 이 방식을 채택한다.

## 구성 요소

### Clock 프런트엔드

- `/api/chat/models`에서 Gemini와 Agent Platform 모델을 함께 받는다.
- Provider 표시를 Gemini, Claude Code, Codex, Antigravity로 구분한다.
- 기존 `messages` 배열을 그대로 `/api/chat/:provider`에 보낸다.
- 서버에 저장된 대화 목록을 조회하고 선택한 `conversationId`의 메시지를 복원한다.
- GitHub Models 사용량 표시는 제거하고, 제공되는 경우 하네스 사용량과 상태를 표시한다.

### Clock API

- Gemini 어댑터는 Google Models API와 `generateContent`를 호출한다.
- Agent Platform 어댑터는 Keycloak 토큰을 메모리에 캐시하고 만료 전에 갱신한다.
- 모델 목록은 Agent Platform `/v1/harnesses`와 `/v1/models`에서 동적으로 조합한다.
- 채팅 요청은 `/v1/runs`로 실행을 생성하고 완료 또는 실패까지 제한된 시간 동안 상태와 이벤트를 조회한다.
- 최종 assistant 텍스트만 기존 ChatPanel 응답 계약으로 변환한다.
- 업스트림 오류 본문, 토큰, CLI 자격 증명은 브라우저에 노출하지 않는다.

### Keycloak과 Kubernetes

- `seonology-clock-ai-chat` confidential client를 생성하고 service account를 활성화한다.
- access token에 `seonology-agents-api` audience가 포함되도록 전용 mapper를 설정한다.
- client id와 secret은 Vault의 Clock 전용 경로에 저장하고 ExternalSecret으로 주입한다.
- Agent API NetworkPolicy에는 `seonology-apps`의 `seonology-clock-page` Pod에서 오는 8080/TCP만 추가한다.
- Clock에서 Agent API로 가는 주소는 ClusterIP DNS를 사용하고 외부 인터넷을 경유하지 않는다.

## 데이터 흐름

1. AI Chat을 열면 Clock API가 Gemini와 Agent Platform의 실제 모델 목록을 조회한다.
2. 사용자가 모델과 프리셋을 선택해 메시지를 전송한다.
3. Gemini는 현재와 같이 전체 대화를 Google API에 전달한다.
4. Claude Code·Codex·Antigravity는 전체 대화를 하나의 명확한 transcript 프롬프트로 직렬화해 새 Agent run으로 실행한다.
5. Clock API가 run의 완료를 기다린 뒤 최종 답변을 정규화해 반환한다.
6. 프런트엔드는 기존 `conversationId`로 메시지 기록을 갱신한다.

Provider의 실제 CLI 세션은 이어 쓰지 않는다. Clock이 보유한 전체 메시지가 문맥의 기준이며, 모델을 바꾸어도 동일한 transcript를 전달한다.

## 오류 처리

- Gemini 키가 없거나 Models API 검증이 실패하면 Gemini 모델을 노출하지 않고 진단 가능한 상태 코드만 반환한다.
- Agent Platform 인증 실패는 한 번만 토큰을 갱신해 재시도한다.
- 모델 카탈로그 일부가 실패해도 정상 Provider 모델은 계속 반환한다.
- Agent run이 시간 제한을 넘기면 취소 요청을 보내고 504를 반환한다.
- 실행 실패 메시지는 민감한 업스트림 원문 대신 하네스, 실행 ID, 재시도 가능 여부가 포함된 안전한 오류로 변환한다.

## 보안 경계

- 브라우저는 Agent API, Keycloak client secret, Gemini API key에 직접 접근하지 않는다.
- 사용자 입력으로 Agent API URL, Keycloak URL 또는 하네스 명령을 바꿀 수 없다.
- 허용된 하네스는 `claude`, `codex`, `agy`로 제한한다.
- 모델 ID는 동적으로 받은 카탈로그에 존재하는 값만 허용한다.
- Chat용 실행에는 저장소, MCP, 파일 쓰기 목적의 옵션을 전달하지 않는다.
- 요청 본문 크기, 메시지 수와 실행 시간을 제한한다.

## 테스트와 운영 검증

- GitHub Models가 모델 목록과 채팅 라우트에서 제거되는 API 회귀 테스트를 추가한다.
- Gemini 모델 탐색 성공·실패와 실제 `generateContent` 변환을 테스트한다.
- Agent Platform 모델 조합, 토큰 캐시, run 완료·실패·시간 초과를 테스트한다.
- ChatPanel의 Provider 표시, 모델 선택, 기록 목록과 대화 복원을 테스트한다.
- 전체 lint, 단위 테스트, API 테스트, 브라우저 테스트, 빌드, dependency audit, 컨테이너 smoke를 실행한다.
- 배포 후 운영 Pod에서 Gemini 실질 응답과 세 하네스별 최소 한 번의 응답을 확인한다.
- 운영 로그에서 자격 증명 또는 원문 토큰이 출력되지 않는지 확인한다.

## 배포 순서

1. Keycloak client와 Vault 자격 증명을 준비한다.
2. Agent API NetworkPolicy와 Clock ExternalSecret·Deployment 설정을 Gitea GitOps 저장소에 반영한다.
3. Clock 코드를 Gitea 애플리케이션 저장소에 반영해 이미지 빌드를 완료한다.
4. 생성된 이미지 digest를 GitOps에 고정한다.
5. Argo CD 동기화와 Pod rollout을 확인한다.
6. Gemini, Claude Code, Codex, Antigravity를 운영 화면에서 확인한다.

## 성공 기준

- AI Chat에 GitHub Models가 표시되거나 호출되지 않는다.
- Gemini가 고정된 존재 여부가 아니라 실제 API 호출 결과로 정상 상태를 판정한다.
- Claude Code·Codex·Antigravity의 현재 사용 가능 모델이 표시되고 답변을 반환한다.
- 기존 대화의 메시지 기반 문맥 유지와 모델 전환 동작이 유지된다.
- 모달을 닫았다가 다시 열어 저장된 대화를 선택하고 이어갈 수 있다.
- 정액제 자격 증명과 API 키가 브라우저, 응답, 로그에 노출되지 않는다.
