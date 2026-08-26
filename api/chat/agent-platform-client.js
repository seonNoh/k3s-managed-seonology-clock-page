const { randomUUID } = require('node:crypto');

const SUPPORTED_HARNESSES = new Set(['claude', 'codex', 'agy']);
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);
const ROLE_LABELS = {
  system: 'System',
  user: 'User',
  assistant: 'Assistant',
};

class AgentPlatformError extends Error {
  constructor(message, { code = 'AGENT_PLATFORM_ERROR', status = 502, runId = '' } = {}) {
    super(message);
    this.name = 'AgentPlatformError';
    this.code = code;
    this.status = status;
    this.runId = runId;
  }
}

function serializeTranscript(messages, { maxMessages = 80, maxCharacters = 100000 } = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new AgentPlatformError('메시지가 비어 있습니다.', {
      code: 'CHAT_MESSAGES_REQUIRED',
      status: 422,
    });
  }
  if (messages.length > maxMessages) {
    throw new AgentPlatformError('대화 메시지 수가 제한을 초과했습니다.', {
      code: 'CHAT_TOO_MANY_MESSAGES',
      status: 413,
    });
  }
  const parts = messages.map(message => {
    const label = ROLE_LABELS[message?.role];
    if (!label) {
      throw new AgentPlatformError('지원하지 않는 메시지 역할입니다.', {
        code: 'CHAT_INVALID_ROLE',
        status: 422,
      });
    }
    return `[${label}]\n${String(message.content || '')}`;
  });
  const transcript = parts.join('\n\n');
  if (transcript.length > maxCharacters) {
    throw new AgentPlatformError('대화 내용이 크기 제한을 초과했습니다.', {
      code: 'CHAT_TOO_LARGE',
      status: 413,
    });
  }
  return transcript;
}

function createAgentPlatformClient({
  baseUrl,
  tokenUrl,
  clientId,
  clientSecret,
  fetchImpl = global.fetch,
  timeoutMs = 180000,
  pollIntervalMs = 1000,
  now = () => Date.now(),
  sleep = delay => new Promise(resolve => setTimeout(resolve, delay)),
} = {}) {
  const apiBase = String(baseUrl || '').replace(/\/$/, '');
  const oauthTokenUrl = String(tokenUrl || '').trim();
  const oauthClientId = String(clientId || '').trim();
  const oauthClientSecret = String(clientSecret || '').trim();
  let cachedToken = null;
  let tokenExpiresAt = 0;

  function ensureConfigured() {
    if (!apiBase || !oauthTokenUrl || !oauthClientId || !oauthClientSecret) {
      throw new AgentPlatformError('Agent Platform 인증이 구성되지 않았습니다.', {
        code: 'AGENT_PLATFORM_NOT_CONFIGURED',
        status: 503,
      });
    }
    if (typeof fetchImpl !== 'function') {
      throw new AgentPlatformError('Agent Platform HTTP 클라이언트를 사용할 수 없습니다.');
    }
  }

  async function getToken(force = false) {
    ensureConfigured();
    if (!force && cachedToken && tokenExpiresAt > now() + 30000) return cachedToken;
    let response;
    try {
      response = await fetchImpl(oauthTokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: oauthClientId,
          client_secret: oauthClientSecret,
        }).toString(),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new AgentPlatformError('Agent Platform 인증 서버에 연결하지 못했습니다.', {
        code: 'AGENT_AUTH_UNREACHABLE',
        status: 502,
      });
    }
    if (!response.ok) {
      throw new AgentPlatformError('Agent Platform 인증에 실패했습니다.', {
        code: 'AGENT_AUTH_FAILED',
        status: 503,
      });
    }
    const data = await response.json();
    if (!data.access_token) {
      throw new AgentPlatformError('Agent Platform 인증 응답에 토큰이 없습니다.', {
        code: 'AGENT_AUTH_INVALID_RESPONSE',
        status: 502,
      });
    }
    cachedToken = data.access_token;
    tokenExpiresAt = now() + Math.max(0, Number(data.expires_in || 60)) * 1000;
    return cachedToken;
  }

  async function apiRequest(path, init = {}, retried = false) {
    const token = await getToken(retried);
    let response;
    try {
      response = await fetchImpl(`${apiBase}${path}`, {
        ...init,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
          ...(init.headers || {}),
        },
        signal: init.signal || AbortSignal.timeout(30000),
      });
    } catch (error) {
      const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      throw new AgentPlatformError(
        timeout ? 'Agent Platform 응답 시간이 초과되었습니다.' : 'Agent Platform에 연결하지 못했습니다.',
        { code: timeout ? 'AGENT_REQUEST_TIMEOUT' : 'AGENT_UNREACHABLE', status: timeout ? 504 : 502 },
      );
    }
    if (response.status === 401 && !retried) {
      cachedToken = null;
      tokenExpiresAt = 0;
      return apiRequest(path, init, true);
    }
    if (!response.ok) {
      throw new AgentPlatformError(`Agent Platform 요청이 실패했습니다. (${response.status})`, {
        code: `AGENT_UPSTREAM_${response.status}`,
        status: response.status === 422 ? 422 : response.status === 429 ? 429 : 502,
      });
    }
    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      throw new AgentPlatformError('Agent Platform 응답을 해석하지 못했습니다.');
    }
  }

  return {
    async listModels() {
      const harnesses = await apiRequest('/v1/harnesses');
      const candidates = (Array.isArray(harnesses) ? harnesses : [])
        .filter(harness => SUPPORTED_HARNESSES.has(harness.id));
      const catalogs = await Promise.allSettled(candidates.map(async harness => ({
        harness,
        catalog: await apiRequest(`/v1/models?harness=${encodeURIComponent(harness.id)}`),
      })));
      return catalogs.flatMap(result => {
        if (result.status !== 'fulfilled') return [];
        const { harness, catalog } = result.value;
        return (Array.isArray(catalog.models) ? catalog.models : []).map(model => ({
          id: model.id,
          name: model.label || model.id,
          provider: harness.id,
          desc: `${harness.label} · ${harness.plan}`,
          credential: {
            status: harness.credential?.status || 'unknown',
            checkedAt: harness.credential?.checked_at || null,
          },
        }));
      });
    },

    async runChat({ harness, model, messages } = {}) {
      if (!SUPPORTED_HARNESSES.has(harness)) {
        throw new AgentPlatformError('지원하지 않는 Agent 하네스입니다.', {
          code: 'AGENT_UNSUPPORTED_HARNESS',
          status: 422,
        });
      }
      const prompt = serializeTranscript(messages);
      const created = await apiRequest('/v1/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: randomUUID(),
          harness,
          model: String(model || ''),
          preset: 'default',
          prompt,
          sensitive: true,
        }),
      });
      const runId = created.run_id;
      if (!runId) {
        throw new AgentPlatformError('Agent Platform이 실행 ID를 반환하지 않았습니다.');
      }

      const deadline = now() + timeoutMs;
      let run = created;
      while (!TERMINAL_STATUSES.has(run.status) && now() < deadline) {
        if (pollIntervalMs > 0) await sleep(pollIntervalMs);
        run = await apiRequest(`/v1/runs/${encodeURIComponent(runId)}`);
      }
      if (!TERMINAL_STATUSES.has(run.status)) {
        try {
          await apiRequest(`/v1/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' });
        } catch {
          // 원래 timeout 결과를 유지한다.
        }
        throw new AgentPlatformError('Agent 응답 시간이 초과되었습니다.', {
          code: 'AGENT_RUN_TIMEOUT',
          status: 504,
          runId,
        });
      }
      if (run.status !== 'succeeded') {
        throw new AgentPlatformError('Agent 실행이 완료되지 못했습니다.', {
          code: `AGENT_RUN_${String(run.status || 'failed').toUpperCase()}`,
          status: 502,
          runId,
        });
      }

      const events = await apiRequest(`/v1/runs/${encodeURIComponent(runId)}/events?after=0&limit=500`);
      const lines = (Array.isArray(events.items) ? events.items : [])
        .filter(event => (event.Kind || event.kind) === 'log')
        .map(event => event.Payload || event.payload)
        .map(payload => typeof payload === 'string' ? JSON.parse(payload) : payload)
        .map(payload => payload?.line)
        .filter(line => typeof line === 'string' && line.length > 0);
      if (lines.length === 0) {
        throw new AgentPlatformError('Agent가 텍스트 응답을 반환하지 않았습니다.', {
          code: 'AGENT_EMPTY_RESPONSE',
          status: 502,
          runId,
        });
      }
      return {
        content: lines.join('\n'),
        model: run.model || model,
        usage: run.usage || null,
        runId,
      };
    },
  };
}

module.exports = {
  AgentPlatformError,
  createAgentPlatformClient,
  serializeTranscript,
};
