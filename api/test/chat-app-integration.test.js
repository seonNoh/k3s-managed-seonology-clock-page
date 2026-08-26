const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtempSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createApp } = require('../app');
const { loadConfig } = require('../config');

test('the application mounts the new chat providers and no GitHub chat route', async t => {
  const dataDirectory = mkdtempSync(path.join(os.tmpdir(), 'clock-chat-app-'));
  const config = loadConfig({ BOOKMARKS_DIR: dataDirectory });
  const app = createApp({
    config,
    geminiClient: {
      listModels: async () => [{ id: 'gemini-test', name: 'Gemini Test', provider: 'gemini', desc: 'Google Gemini API' }],
      generate: async () => ({ content: 'gemini', model: 'gemini-test', usage: null }),
    },
    agentPlatformClient: {
      listModels: async () => [{ id: 'claude-test', name: 'Claude Test', provider: 'claude', desc: 'Claude Code · Max' }],
      runChat: async () => ({ content: 'agent', model: 'claude-test', usage: null, runId: 'run-test' }),
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.close();
    await once(server, 'close');
  });
  const origin = `http://127.0.0.1:${server.address().port}`;

  const modelsResponse = await fetch(`${origin}/api/chat/models`);
  assert.equal(modelsResponse.status, 200);
  assert.deepEqual((await modelsResponse.json()).models.map(model => model.provider), ['gemini', 'claude']);

  const githubResponse = await fetch(`${origin}/api/chat/github`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: '질문' }] }),
  });
  assert.equal(githubResponse.status, 404);
});
