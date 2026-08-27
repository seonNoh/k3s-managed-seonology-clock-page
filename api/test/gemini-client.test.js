const assert = require('node:assert/strict');
const test = require('node:test');

const { createGeminiClient } = require('../chat/gemini-client');

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('Gemini model discovery exposes only the approved free-tier chat models', async () => {
  const client = createGeminiClient({
    apiKey: 'test-key',
    fetchImpl: async () => jsonResponse({
      models: [
        {
          name: 'models/gemini-2.5-flash',
          displayName: 'Gemini 2.5 Flash',
          supportedGenerationMethods: ['generateContent', 'countTokens'],
        },
        {
          name: 'models/gemini-2.5-pro',
          displayName: 'Gemini 2.5 Pro',
          supportedGenerationMethods: ['generateContent', 'countTokens'],
        },
        {
          name: 'models/gemini-2.5-flash-preview-tts',
          displayName: 'Gemini 2.5 Flash Preview TTS',
          supportedGenerationMethods: ['generateContent'],
        },
        {
          name: 'models/gemini-2.5-flash-image',
          displayName: 'Gemini 2.5 Flash Image',
          supportedGenerationMethods: ['generateContent'],
        },
        {
          name: 'models/gemini-3.1-pro-preview',
          displayName: 'Gemini 3.1 Pro Preview',
          supportedGenerationMethods: ['generateContent'],
        },
        {
          name: 'models/text-embedding-004',
          displayName: 'Text Embedding 004',
          supportedGenerationMethods: ['embedContent'],
        },
      ],
    }),
  });

  assert.deepEqual(await client.listModels(), [
    {
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      provider: 'gemini',
      desc: 'Google Gemini API',
    },
  ]);
});

test('Gemini chat rejects models outside the approved free-tier list before calling Google', async () => {
  let requestCount = 0;
  const client = createGeminiClient({
    apiKey: 'test-key',
    fetchImpl: async () => {
      requestCount += 1;
      return jsonResponse({});
    },
  });

  await assert.rejects(
    client.generate({
      model: 'gemini-2.5-flash-preview-tts',
      messages: [{ role: 'user', content: '테스트' }],
    }),
    error => error.code === 'GEMINI_MODEL_NOT_ALLOWED' && error.status === 422,
  );
  assert.equal(requestCount, 0);
});

test('Gemini chat rejects a free-tier model that Google no longer serves to this project', async () => {
  let requestCount = 0;
  const client = createGeminiClient({
    apiKey: 'test-key',
    fetchImpl: async () => {
      requestCount += 1;
      return jsonResponse({});
    },
  });

  await assert.rejects(
    client.generate({
      model: 'gemini-2.5-pro',
      messages: [{ role: 'user', content: '테스트' }],
    }),
    error => error.code === 'GEMINI_MODEL_NOT_ALLOWED' && error.status === 422,
  );
  assert.equal(requestCount, 0);
});

test('Gemini chat preserves system, user and assistant roles in generateContent payload', async () => {
  let request;
  const client = createGeminiClient({
    apiKey: 'test-key',
    fetchImpl: async (url, init) => {
      request = { url, init };
      return jsonResponse({
        candidates: [{ content: { parts: [{ text: '후속 답변' }] } }],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4, totalTokenCount: 16 },
      });
    },
  });

  const result = await client.generate({
    model: 'gemini-2.5-flash',
    messages: [
      { role: 'system', content: '간결하게 답하세요.' },
      { role: 'user', content: '첫 질문' },
      { role: 'assistant', content: '첫 답변' },
      { role: 'user', content: '후속 질문' },
    ],
  });

  assert.match(request.url, /models\/gemini-2\.5-flash:generateContent/);
  assert.equal(request.init.headers['x-goog-api-key'], 'test-key');
  assert.deepEqual(JSON.parse(request.init.body), {
    systemInstruction: { parts: [{ text: '간결하게 답하세요.' }] },
    contents: [
      { role: 'user', parts: [{ text: '첫 질문' }] },
      { role: 'model', parts: [{ text: '첫 답변' }] },
      { role: 'user', parts: [{ text: '후속 질문' }] },
    ],
  });
  assert.deepEqual(result, {
    content: '후속 답변',
    model: 'gemini-2.5-flash',
    usage: { promptTokenCount: 12, candidatesTokenCount: 4, totalTokenCount: 16 },
  });
});

test('Gemini client fails closed when the API key is absent', async () => {
  const client = createGeminiClient({ apiKey: '' });
  await assert.rejects(client.listModels(), error => error.code === 'GEMINI_NOT_CONFIGURED');
});
