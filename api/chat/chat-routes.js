const AGENT_PROVIDERS = new Set(['claude', 'codex', 'agy']);

function publicError(error) {
  return {
    status: Number.isInteger(error?.status) ? error.status : 502,
    body: {
      error: error?.message || 'AI 요청을 처리하지 못했습니다.',
      code: error?.code || 'CHAT_UPSTREAM_ERROR',
      ...(error?.runId ? { runId: error.runId } : {}),
    },
  };
}

function setupChatRoutes(app, { geminiClient, agentPlatformClient }) {
  app.get('/api/chat/models', async (_req, res) => {
    const [geminiResult, agentsResult] = await Promise.allSettled([
      geminiClient.listModels(),
      agentPlatformClient.listModels(),
    ]);
    const geminiModels = geminiResult.status === 'fulfilled' ? geminiResult.value : [];
    const agentModels = agentsResult.status === 'fulfilled' ? agentsResult.value : [];
    res.json({
      models: [...geminiModels, ...agentModels],
      providers: {
        gemini: { status: geminiResult.status === 'fulfilled' ? 'ok' : 'unavailable' },
        agents: { status: agentsResult.status === 'fulfilled' ? 'ok' : 'unavailable' },
      },
    });
  });

  app.post('/api/chat/gemini', async (req, res) => {
    try {
      const result = await geminiClient.generate(req.body || {});
      res.json(result);
    } catch (error) {
      const response = publicError(error);
      res.status(response.status).json(response.body);
    }
  });

  for (const provider of AGENT_PROVIDERS) {
    app.post(`/api/chat/${provider}`, async (req, res) => {
      try {
        const result = await agentPlatformClient.runChat({
          harness: provider,
          model: req.body?.model,
          messages: req.body?.messages,
        });
        res.json(result);
      } catch (error) {
        const response = publicError(error);
        res.status(response.status).json(response.body);
      }
    });
  }
}

module.exports = { setupChatRoutes };
