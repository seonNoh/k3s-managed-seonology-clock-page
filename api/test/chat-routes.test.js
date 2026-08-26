const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const express = require('express');

const { setupChatRoutes } = require('../chat/chat-routes');

async function listen(dependencies) {
  const app = express();
  app.use(express.json());
  setupChatRoutes(app, dependencies);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.close();
      await once(server, 'close');
    },
  };
}

test('chat models contain Gemini and Agent Platform providers without GitHub Models', async t => {
  const runtime = await listen({
    geminiClient: {
      listModels: async () => [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini', desc: 'Google Gemini API' }],
    },
    agentPlatformClient: {
      listModels: async () => [{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'claude', desc: 'Claude Code · Max' }],
    },
  });
  t.after(() => runtime.close());

  const response = await fetch(`${runtime.origin}/api/chat/models`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini', desc: 'Google Gemini API' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'claude', desc: 'Claude Code · Max' },
    ],
    providers: {
      gemini: { status: 'ok' },
      agents: { status: 'ok' },
    },
  });
});

test('agent provider route keeps the existing chat response contract', async t => {
  const runtime = await listen({
    geminiClient: { listModels: async () => [] },
    agentPlatformClient: {
      listModels: async () => [],
      runChat: async request => ({
        content: `answer:${request.messages.at(-1).content}`,
        model: request.model,
        usage: { total_tokens: 9 },
        runId: 'run-1',
      }),
    },
  });
  t.after(() => runtime.close());

  const response = await fetch(`${runtime.origin}/api/chat/claude`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: '질문' }],
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    content: 'answer:질문',
    model: 'claude-sonnet-4-6',
    usage: { total_tokens: 9 },
    runId: 'run-1',
  });
});

test('removed GitHub provider returns not found', async t => {
  const runtime = await listen({
    geminiClient: { listModels: async () => [] },
    agentPlatformClient: { listModels: async () => [] },
  });
  t.after(() => runtime.close());

  const response = await fetch(`${runtime.origin}/api/chat/github`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: '질문' }] }),
  });
  assert.equal(response.status, 404);
});
