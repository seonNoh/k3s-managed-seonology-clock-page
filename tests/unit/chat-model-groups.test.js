import { describe, expect, it } from 'vitest';

import {
  groupChatModels,
  modelSelectionKey,
  providerMetadata,
  resolveSavedModel,
} from '../../src/features/chat/model-groups.js';

describe('chat model groups', () => {
  it('orders supported providers without creating a GitHub Models group', () => {
    const groups = groupChatModels([
      { id: 'gpt-5.6-sol', provider: 'codex', name: 'GPT-5.6 Sol' },
      { id: 'gemini-2.5-flash', provider: 'gemini', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-3.1-pro-high', provider: 'agy', name: 'Gemini 3.1 Pro High' },
      { id: 'claude-sonnet-4-6', provider: 'claude', name: 'Claude Sonnet 4.6' },
      { id: 'gpt-4o', provider: 'github', name: 'GPT-4o' },
    ]);

    expect(groups.map(group => group.provider)).toEqual(['gemini', 'claude', 'codex', 'agy']);
    expect(groups.map(group => group.label)).toEqual([
      'Google Gemini',
      'Claude Code',
      'Codex CLI',
      'Antigravity',
    ]);
    expect(groups.flatMap(group => group.models).some(model => model.provider === 'github')).toBe(false);
  });

  it('uses the saved model only while that model remains available', () => {
    const models = [
      { id: 'gemini-2.5-flash', provider: 'gemini' },
      { id: 'claude-sonnet-4-6', provider: 'claude' },
    ];

    expect(resolveSavedModel('claude-sonnet-4-6', 'claude', models, 'gemini:gemini-2.5-flash')).toBe('claude:claude-sonnet-4-6');
    expect(resolveSavedModel('removed-model', 'claude', models, 'gemini:gemini-2.5-flash')).toBe('gemini:gemini-2.5-flash');
  });

  it('keeps duplicate model IDs distinct by provider', () => {
    const models = [
      { id: 'gemini-2.5-pro', provider: 'gemini' },
      { id: 'gemini-2.5-pro', provider: 'agy' },
    ];

    expect(modelSelectionKey(models[0])).toBe('gemini:gemini-2.5-pro');
    expect(modelSelectionKey(models[1])).toBe('agy:gemini-2.5-pro');
    expect(resolveSavedModel('gemini-2.5-pro', 'agy', models, '')).toBe('agy:gemini-2.5-pro');
  });

  it('provides explicit metadata for every supported provider', () => {
    expect(providerMetadata('gemini')).toMatchObject({ label: 'Google Gemini' });
    expect(providerMetadata('claude')).toMatchObject({ label: 'Claude Code' });
    expect(providerMetadata('codex')).toMatchObject({ label: 'Codex CLI' });
    expect(providerMetadata('agy')).toMatchObject({ label: 'Antigravity' });
    expect(providerMetadata('github')).toBeNull();
  });
});
