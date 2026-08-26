// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';

import ChatPanel from '../../src/components/ChatPanel.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = React;

describe('ChatPanel history restoration', () => {
  let root;
  let container;

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (root) await act(async () => root.unmount());
    root = undefined;
    container = undefined;
  });

  test('loads the saved conversation list and restores a selected conversation', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async url => {
      const pathname = new URL(url, 'https://clock.seonology.com').pathname;
      if (pathname === '/api/chat/models') {
        return new Response(JSON.stringify({
          models: [
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini' },
            { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'claude' },
          ],
          providers: { gemini: { status: 'ok' }, agents: { status: 'ok' } },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (pathname === '/api/chat/history') {
        return new Response(JSON.stringify({
          conversations: [{
            id: 'chat-1',
            title: '저장한 질문',
            model: 'claude-sonnet-4-6',
            provider: 'claude',
            updatedAt: '2026-08-27T00:00:00Z',
            messageCount: 2,
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (pathname === '/api/chat/history/chat-1') {
        return new Response(JSON.stringify({
          id: 'chat-1',
          title: '저장한 질문',
          model: 'claude-sonnet-4-6',
          provider: 'claude',
          messages: [
            { role: 'user', content: '저장된 사용자 메시지' },
            { role: 'assistant', content: '저장된 답변' },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`unexpected request: ${pathname}`);
    }));

    container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root.render(<ChatPanel isOpen onClose={() => {}} />);
    });
    await act(async () => {});

    const historyButton = container.querySelector('[aria-label="대화 기록"]');
    expect(historyButton).not.toBeNull();
    await act(async () => {
      historyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const conversationButton = container.querySelector('[data-conversation-id="chat-1"]');
    expect(conversationButton).not.toBeNull();
    await act(async () => {
      conversationButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {});

    expect(container.textContent).toContain('저장된 사용자 메시지');
    expect(container.textContent).toContain('저장된 답변');
    expect(container.querySelector('.chat-model-select').value).toBe('claude:claude-sonnet-4-6');
  });
});
