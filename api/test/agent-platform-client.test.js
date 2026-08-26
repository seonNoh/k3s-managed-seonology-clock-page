const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createAgentPlatformClient,
  serializeTranscript,
} = require('../chat/agent-platform-client');

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('transcript serialization preserves every supported role in order', () => {
  assert.equal(serializeTranscript([
    { role: 'system', content: '간결하게 답하세요.' },
    { role: 'user', content: '첫 질문' },
    { role: 'assistant', content: '첫 답변' },
    { role: 'user', content: '후속 질문' },
  ]), [
    '[System]',
    '간결하게 답하세요.',
    '',
    '[User]',
    '첫 질문',
    '',
    '[Assistant]',
    '첫 답변',
    '',
    '[User]',
    '후속 질문',
  ].join('\n'));
});

test('agent model discovery keeps supported harnesses despite stale credential health and tolerates one catalog failure', async () => {
  const calls = [];
  const client = createAgentPlatformClient({
    baseUrl: 'http://agent-api.agent-platform.svc.cluster.local:8080',
    tokenUrl: 'http://keycloak.keycloak.svc.cluster.local:8080/realms/master/protocol/openid-connect/token',
    clientId: 'clock-client',
    clientSecret: 'clock-secret',
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, init });
      if (url.includes('/protocol/openid-connect/token')) {
        return jsonResponse({ access_token: 'access-token', expires_in: 300 });
      }
      if (url.endsWith('/v1/harnesses')) {
        return jsonResponse([
          { id: 'claude', label: 'Claude Code', plan: 'Max', credential: { status: 'ok', checked_at: '2026-08-27T00:00:00Z' } },
          { id: 'codex', label: 'Codex CLI', plan: 'Plus', credential: { status: 'failed', checked_at: '2026-08-27T00:00:00Z' } },
          { id: 'agy', label: 'Antigravity CLI', plan: 'AI Pro', credential: { status: 'ok', checked_at: '2026-08-27T00:00:00Z' } },
          { id: 'litellm', label: 'LiteLLM', plan: 'Free', credential: { status: 'ok', checked_at: '2026-08-27T00:00:00Z' } },
        ]);
      }
      if (url.includes('harness=claude')) {
        return jsonResponse({
          harness: 'claude',
          dynamic: true,
          models: [{ id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' }],
        });
      }
      if (url.includes('harness=codex')) {
        return jsonResponse({
          harness: 'codex',
          dynamic: true,
          models: [{ id: 'gpt-5.6-codex', label: 'GPT-5.6 Codex' }],
        });
      }
      if (url.includes('harness=agy')) return jsonResponse({ error: 'temporary' }, 503);
      throw new Error(`unexpected request: ${url}`);
    },
  });

  assert.deepEqual(await client.listModels(), [
    {
      id: 'claude-sonnet-4-6',
      name: 'Claude Sonnet 4.6',
      provider: 'claude',
      desc: 'Claude Code · Max',
      credential: { status: 'ok', checkedAt: '2026-08-27T00:00:00Z' },
    },
    {
      id: 'gpt-5.6-codex',
      name: 'GPT-5.6 Codex',
      provider: 'codex',
      desc: 'Codex CLI · Plus',
      credential: { status: 'failed', checkedAt: '2026-08-27T00:00:00Z' },
    },
  ]);
  assert.equal(calls.some(call => call.url.includes('harness=codex')), true);
  assert.equal(calls.some(call => call.url.includes('harness=litellm')), false);
});

test('agent chat creates a sensitive run and returns the ordered final log', async () => {
  const requests = [];
  let runReads = 0;
  const client = createAgentPlatformClient({
    baseUrl: 'http://agent-api.agent-platform.svc.cluster.local:8080',
    tokenUrl: 'http://keycloak.keycloak.svc.cluster.local:8080/realms/master/protocol/openid-connect/token',
    clientId: 'clock-client',
    clientSecret: 'clock-secret',
    pollIntervalMs: 0,
    fetchImpl: async (url, init = {}) => {
      requests.push({ url, init });
      if (url.includes('/protocol/openid-connect/token')) {
        return jsonResponse({ access_token: 'access-token', expires_in: 300 });
      }
      if (url.endsWith('/v1/runs') && init.method === 'POST') {
        return jsonResponse({
          run_id: '7c58eb79-3538-4593-a59d-84d64d27b4a1',
          status: 'queued',
          harness: 'claude',
          model: 'claude-sonnet-4-6',
          conversation_id: 'f106e633-e032-46fa-a836-831c12da956b',
        }, 202);
      }
      if (url.endsWith('/v1/runs/7c58eb79-3538-4593-a59d-84d64d27b4a1')) {
        runReads += 1;
        return jsonResponse({
          run_id: '7c58eb79-3538-4593-a59d-84d64d27b4a1',
          status: runReads === 1 ? 'running' : 'succeeded',
          harness: 'claude',
          model: 'claude-sonnet-4-6',
          usage: runReads === 1 ? null : { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
        });
      }
      if (url.includes('/events?')) {
        return jsonResponse({
          items: [
            { ID: 1, RunID: '7c58eb79-3538-4593-a59d-84d64d27b4a1', At: '2026-08-27T00:00:00Z', Kind: 'log', Payload: { line: '첫 줄' } },
            { ID: 2, RunID: '7c58eb79-3538-4593-a59d-84d64d27b4a1', At: '2026-08-27T00:00:01Z', Kind: 'log', Payload: { line: '둘째 줄' } },
            { ID: 3, RunID: '7c58eb79-3538-4593-a59d-84d64d27b4a1', At: '2026-08-27T00:00:02Z', Kind: 'status', Payload: { status: 'succeeded' } },
          ],
          server_time: '2026-08-27T00:00:02Z',
        });
      }
      throw new Error(`unexpected request: ${url}`);
    },
  });

  const result = await client.runChat({
    harness: 'claude',
    model: 'claude-sonnet-4-6',
    messages: [{ role: 'user', content: '질문' }],
  });

  const createRequest = requests.find(request => request.url.endsWith('/v1/runs'));
  const createBody = JSON.parse(createRequest.init.body);
  assert.equal(createBody.harness, 'claude');
  assert.equal(createBody.model, 'claude-sonnet-4-6');
  assert.equal(createBody.sensitive, true);
  assert.match(createBody.idempotency_key, /^[0-9a-f-]{36}$/);
  assert.equal(createBody.prompt, '[User]\n질문');
  assert.deepEqual(result, {
    content: '첫 줄\n둘째 줄',
    model: 'claude-sonnet-4-6',
    usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
    runId: '7c58eb79-3538-4593-a59d-84d64d27b4a1',
  });
});

test('agent client refreshes a rejected access token exactly once', async () => {
  let tokenRequests = 0;
  let harnessRequests = 0;
  const client = createAgentPlatformClient({
    baseUrl: 'http://agent-api.agent-platform.svc.cluster.local:8080',
    tokenUrl: 'http://keycloak.keycloak.svc.cluster.local:8080/realms/master/protocol/openid-connect/token',
    clientId: 'clock-client',
    clientSecret: 'clock-secret',
    fetchImpl: async (url, init = {}) => {
      if (url.includes('/protocol/openid-connect/token')) {
        tokenRequests += 1;
        return jsonResponse({ access_token: `access-token-${tokenRequests}`, expires_in: 300 });
      }
      if (url.endsWith('/v1/harnesses')) {
        harnessRequests += 1;
        if (harnessRequests === 1) return jsonResponse({ error: 'expired' }, 401);
        assert.equal(init.headers.authorization, 'Bearer access-token-2');
        return jsonResponse([]);
      }
      throw new Error(`unexpected request: ${url}`);
    },
  });

  assert.deepEqual(await client.listModels(), []);
  assert.equal(tokenRequests, 2);
  assert.equal(harnessRequests, 2);
});

test('agent chat cancels a run when the overall deadline expires', async () => {
  const requests = [];
  let clock = 0;
  const client = createAgentPlatformClient({
    baseUrl: 'http://agent-api.agent-platform.svc.cluster.local:8080',
    tokenUrl: 'http://keycloak.keycloak.svc.cluster.local:8080/realms/master/protocol/openid-connect/token',
    clientId: 'clock-client',
    clientSecret: 'clock-secret',
    timeoutMs: 5,
    pollIntervalMs: 0,
    now: () => {
      clock += 3;
      return clock;
    },
    fetchImpl: async (url, init = {}) => {
      requests.push({ url, init });
      if (url.includes('/protocol/openid-connect/token')) {
        return jsonResponse({ access_token: 'access-token', expires_in: 300 });
      }
      if (url.endsWith('/v1/runs') && init.method === 'POST') {
        return jsonResponse({ run_id: 'run-timeout', status: 'queued', harness: 'codex' }, 202);
      }
      if (url.endsWith('/v1/runs/run-timeout')) {
        return jsonResponse({ run_id: 'run-timeout', status: 'running', harness: 'codex' });
      }
      if (url.endsWith('/v1/runs/run-timeout/cancel')) return new Response(null, { status: 204 });
      throw new Error(`unexpected request: ${url}`);
    },
  });

  await assert.rejects(
    client.runChat({
      harness: 'codex',
      model: 'gpt-5.6-codex',
      messages: [{ role: 'user', content: '질문' }],
    }),
    error => error.code === 'AGENT_RUN_TIMEOUT' && error.runId === 'run-timeout',
  );
  assert.equal(requests.some(request => request.url.endsWith('/run-timeout/cancel')), true);
});
