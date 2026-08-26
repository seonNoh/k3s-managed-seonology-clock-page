const PROVIDERS = Object.freeze([
  Object.freeze({ id: 'gemini', label: 'Google Gemini', description: 'Gemini API' }),
  Object.freeze({ id: 'claude', label: 'Claude Code', description: 'Claude 정액제' }),
  Object.freeze({ id: 'codex', label: 'Codex CLI', description: 'ChatGPT 정액제' }),
  Object.freeze({ id: 'agy', label: 'Antigravity', description: 'Google AI Pro' }),
]);

const PROVIDERS_BY_ID = new Map(PROVIDERS.map(provider => [provider.id, provider]));

export function providerMetadata(provider) {
  return PROVIDERS_BY_ID.get(provider) || null;
}

export function modelSelectionKey(model) {
  if (!model?.provider || !model?.id) return '';
  return `${model.provider}:${model.id}`;
}

export function groupChatModels(models) {
  const supported = Array.isArray(models)
    ? models.filter(model => PROVIDERS_BY_ID.has(model.provider))
    : [];
  return PROVIDERS.map(provider => ({
    provider: provider.id,
    label: provider.label,
    models: supported.filter(model => model.provider === provider.id),
  })).filter(group => group.models.length > 0);
}

export function resolveSavedModel(savedModel, savedProvider, models, fallbackModel = '') {
  if (!Array.isArray(models)) return fallbackModel;
  const exact = models.find(model => model.id === savedModel && model.provider === savedProvider);
  if (exact) return modelSelectionKey(exact);
  const legacy = models.find(model => model.id === savedModel);
  return legacy ? modelSelectionKey(legacy) : fallbackModel;
}
