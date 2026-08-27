const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const FREE_TIER_CHAT_MODEL_IDS = new Set([
  'gemini-2.5-flash',
]);

class GeminiClientError extends Error {
  constructor(message, { code = 'GEMINI_ERROR', status = 502 } = {}) {
    super(message);
    this.name = 'GeminiClientError';
    this.code = code;
    this.status = status;
  }
}

function createGeminiClient({ apiKey, fetchImpl = global.fetch, timeoutMs = 30000 } = {}) {
  const key = String(apiKey || '').trim();

  function ensureConfigured() {
    if (!key) {
      throw new GeminiClientError('Gemini API가 구성되지 않았습니다.', {
        code: 'GEMINI_NOT_CONFIGURED',
        status: 503,
      });
    }
    if (typeof fetchImpl !== 'function') {
      throw new GeminiClientError('Gemini HTTP 클라이언트를 사용할 수 없습니다.');
    }
  }

  async function request(url, init = {}) {
    ensureConfigured();
    let response;
    try {
      response = await fetchImpl(url, {
        ...init,
        headers: {
          accept: 'application/json',
          'x-goog-api-key': key,
          ...(init.headers || {}),
        },
        signal: init.signal || AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      throw new GeminiClientError(
        timeout ? 'Gemini 응답 시간이 초과되었습니다.' : 'Gemini API에 연결하지 못했습니다.',
        { code: timeout ? 'GEMINI_TIMEOUT' : 'GEMINI_UNREACHABLE', status: timeout ? 504 : 502 },
      );
    }
    if (!response.ok) {
      const status = response.status === 401 || response.status === 403
        ? 503
        : response.status === 429 ? 429 : 502;
      throw new GeminiClientError('Gemini API 요청이 실패했습니다.', {
        code: `GEMINI_UPSTREAM_${response.status}`,
        status,
      });
    }
    try {
      return await response.json();
    } catch {
      throw new GeminiClientError('Gemini API 응답을 해석하지 못했습니다.');
    }
  }

  return {
    async listModels() {
      const data = await request(`${GEMINI_API_BASE}/models?pageSize=1000`);
      return (Array.isArray(data.models) ? data.models : [])
        .filter(model => Array.isArray(model.supportedGenerationMethods)
          && model.supportedGenerationMethods.includes('generateContent'))
        .filter(model => FREE_TIER_CHAT_MODEL_IDS.has(
          String(model.name || '').replace(/^models\//, ''),
        ))
        .map(model => ({
          id: String(model.name || '').replace(/^models\//, ''),
          name: model.displayName || String(model.name || '').replace(/^models\//, ''),
          provider: 'gemini',
          desc: 'Google Gemini API',
        }))
        .filter(model => MODEL_ID_PATTERN.test(model.id));
    },

    async generate({ model, messages, signal } = {}) {
      const modelId = String(model || '');
      if (!MODEL_ID_PATTERN.test(modelId)) {
        throw new GeminiClientError('지원하지 않는 Gemini 모델 ID입니다.', {
          code: 'GEMINI_INVALID_MODEL',
          status: 422,
        });
      }
      if (!FREE_TIER_CHAT_MODEL_IDS.has(modelId)) {
        throw new GeminiClientError('무료 등급으로 허용된 Gemini 모델이 아닙니다.', {
          code: 'GEMINI_MODEL_NOT_ALLOWED',
          status: 422,
        });
      }
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new GeminiClientError('메시지가 비어 있습니다.', {
          code: 'CHAT_MESSAGES_REQUIRED',
          status: 422,
        });
      }
      const systemInstruction = messages.find(message => message.role === 'system');
      const contents = messages
        .filter(message => message.role !== 'system')
        .map(message => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(message.content || '') }],
        }));
      const body = { contents };
      if (systemInstruction) {
        body.systemInstruction = { parts: [{ text: String(systemInstruction.content || '') }] };
      }
      const data = await request(`${GEMINI_API_BASE}/models/${modelId}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
      const content = (data.candidates?.[0]?.content?.parts || [])
        .map(part => part?.text || '')
        .join('');
      if (!content) {
        throw new GeminiClientError('Gemini가 텍스트 응답을 반환하지 않았습니다.');
      }
      return { content, model: modelId, usage: data.usageMetadata || null };
    },
  };
}

module.exports = { createGeminiClient, GeminiClientError };
