import { useState, useEffect, useRef, useCallback } from 'react';
import { renderMarkdown } from '../utils/markdown';
import './ChatPanel.css';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

const PRESETS = [
  { id: 'general', label: 'Chat', prompt: 'You are a helpful assistant. Respond concisely.' },
  {
    id: 'translate-ko',
    label: '→ 한국어',
    prompt: 'You are a translator. Translate the following text to Korean. Preserve all markdown formatting, tables, code blocks, and special characters exactly as they are. Only translate the text content. Do not add any explanation.',
  },
  {
    id: 'translate-en',
    label: '→ English',
    prompt: 'You are a translator. Translate the following text to English. Preserve all markdown formatting, tables, code blocks, and special characters exactly as they are. Only translate the text content. Do not add any explanation.',
  },
  {
    id: 'translate-ja',
    label: '→ 日本語',
    prompt: 'You are a translator. Translate the following text to Japanese. Preserve all markdown formatting, tables, code blocks, and special characters exactly as they are. Only translate the text content. Do not add any explanation.',
  },
  {
    id: 'explain',
    label: 'Explain',
    prompt: 'Explain the following clearly and concisely. Use the same language as the input.',
  },
];

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
  return String(n);
}

function ChatPanel({ isOpen, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [availableModels, setAvailableModels] = useState([]);
  const [activePreset, setActivePreset] = useState('general');
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [rateLimit, setRateLimit] = useState(null);
  const [showModelInfo, setShowModelInfo] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const panelRef = useRef(null);

  // Fetch available models
  useEffect(() => {
    if (!isOpen) return;
    const fetchModels = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/chat/models`);
        const data = await res.json();
        setAvailableModels(data.models || []);
        if (data.models?.length > 0 && !selectedModel) {
          setSelectedModel(data.models[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch models:', err);
      }
    };
    fetchModels();
  }, [isOpen]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 200);
    }
  }, [isOpen]);

  // Auto-resize textarea
  const adjustTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 150) + 'px';
  }, []);

  useEffect(() => {
    adjustTextarea();
  }, [input, adjustTextarea]);

  const getSystemPrompt = () => {
    const preset = PRESETS.find(p => p.id === activePreset);
    return preset?.prompt || PRESETS[0].prompt;
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const model = availableModels.find(m => m.id === selectedModel);
    if (!model) return;

    const userMessage = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    const apiMessages = [
      { role: 'system', content: getSystemPrompt() },
      ...newMessages,
    ];

    try {
      const res = await fetch(`${API_BASE}/api/chat/${model.provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, model: selectedModel }),
      });
      const data = await res.json();
      if (data.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));

      const assistantMessage = { role: 'assistant', content: data.content };
      const updatedMessages = [...newMessages, assistantMessage];
      setMessages(updatedMessages);

      // Update rate limit info from GitHub responses
      if (data.rateLimit) {
        setRateLimit(data.rateLimit);
      }

      // Save to history
      saveHistory(updatedMessages);
    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const saveHistory = async (msgs) => {
    try {
      const firstUserMsg = msgs.find(m => m.role === 'user');
      const title = firstUserMsg?.content?.slice(0, 40) || 'New Chat';
      const id = conversationId || `chat-${Date.now()}`;
      if (!conversationId) setConversationId(id);

      await fetch(`${API_BASE}/api/chat/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title, model: selectedModel, messages: msgs }),
      });
    } catch {
      // Silent fail for history save
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyMessage = async (content, idx) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      // Fallback: noop
    }
  };

  const newChat = () => {
    setMessages([]);
    setConversationId(null);
    setRateLimit(null);
    setInput('');
    if (textareaRef.current) textareaRef.current.focus();
  };

  if (!isOpen) return null;

  const modelsByProvider = {};
  availableModels.forEach(m => {
    if (!modelsByProvider[m.provider]) modelsByProvider[m.provider] = [];
    modelsByProvider[m.provider].push(m);
  });

  const currentModel = availableModels.find(m => m.id === selectedModel);

  return (
    <div className="chat-overlay" onClick={onClose}>
      <div className="chat-panel" ref={panelRef} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="chat-header">
          <span className="chat-title">AI Chat</span>
          <div className="chat-header-actions">
            <div className="chat-model-wrapper">
              <select
                className="chat-model-select"
                value={selectedModel}
                onChange={(e) => { setSelectedModel(e.target.value); setRateLimit(null); }}
              >
                {Object.entries(modelsByProvider).map(([provider, models]) => (
                  <optgroup key={provider} label={provider === 'github' ? 'GitHub Models' : 'Google Gemini'}>
                    {models.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                className={`chat-info-btn${showModelInfo ? ' active' : ''}`}
                onClick={() => setShowModelInfo(!showModelInfo)}
                title="Model info"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </button>
            </div>
            <button className="chat-action-btn" onClick={newChat} title="New Chat">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Model Info Dropdown */}
        {showModelInfo && currentModel && (
          <div className="chat-model-info">
            <div className="chat-model-info-row">
              <span className="chat-model-info-label">Model</span>
              <span className="chat-model-info-value">{currentModel.name}</span>
            </div>
            <div className="chat-model-info-row">
              <span className="chat-model-info-label">Provider</span>
              <span className="chat-model-info-value">{currentModel.provider === 'github' ? 'GitHub Models' : 'Google Gemini'}</span>
            </div>
            {currentModel.desc && (
              <div className="chat-model-info-row">
                <span className="chat-model-info-label">Description</span>
                <span className="chat-model-info-value">{currentModel.desc}</span>
              </div>
            )}
            <div className="chat-model-info-row">
              <span className="chat-model-info-label">ID</span>
              <span className="chat-model-info-value chat-model-info-mono">{currentModel.id}</span>
            </div>
            {rateLimit && currentModel.provider === 'github' && (
              <>
                <div className="chat-model-info-divider" />
                <div className="chat-model-info-row">
                  <span className="chat-model-info-label">Requests</span>
                  <span className="chat-model-info-value">
                    {formatNumber(rateLimit.remainingRequests)} / {formatNumber(rateLimit.limitRequests)}
                  </span>
                </div>
                <div className="chat-usage-bar">
                  <div
                    className="chat-usage-fill"
                    style={{ width: `${(rateLimit.remainingRequests / rateLimit.limitRequests) * 100}%` }}
                  />
                </div>
                <div className="chat-model-info-row">
                  <span className="chat-model-info-label">Tokens</span>
                  <span className="chat-model-info-value">
                    {formatNumber(rateLimit.remainingTokens)} / {formatNumber(rateLimit.limitTokens)}
                  </span>
                </div>
                <div className="chat-usage-bar">
                  <div
                    className="chat-usage-fill"
                    style={{ width: `${(rateLimit.remainingTokens / rateLimit.limitTokens) * 100}%` }}
                  />
                </div>
              </>
            )}
            {currentModel.provider === 'gemini' && (
              <>
                <div className="chat-model-info-divider" />
                <div className="chat-model-info-row">
                  <span className="chat-model-info-label">Quota</span>
                  <span className="chat-model-info-value">15 RPM / 1,500 req/day (Flash)</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Presets + External Links */}
        <div className="chat-presets">
          {PRESETS.map(p => (
            <button
              key={p.id}
              className={`chat-preset-chip${activePreset === p.id ? ' active' : ''}`}
              onClick={() => setActivePreset(p.id)}
            >
              {p.label}
            </button>
          ))}
          <span className="chat-preset-divider" />
          <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" className="chat-ext-link claude">Claude</a>
          <a href="https://gemini.google.com" target="_blank" rel="noopener noreferrer" className="chat-ext-link gemini">Gemini</a>
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {messages.length === 0 && !loading && (
            <div className="chat-empty">
              <div className="chat-empty-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <span>Start a conversation</span>
              <span className="chat-empty-hint">
                {activePreset.startsWith('translate') ? 'Paste text to translate' : 'Ask anything'}
              </span>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={`chat-msg ${msg.role}`}>
              {msg.role === 'assistant' ? (
                <>
                  <div
                    className="chat-msg-content markdown-body"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                  <button
                    className={`chat-copy-btn${copiedIdx === idx ? ' copied' : ''}`}
                    onClick={() => copyMessage(msg.content, idx)}
                    title="Copy"
                  >
                    {copiedIdx === idx ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                </>
              ) : (
                <div className="chat-msg-content">{msg.content}</div>
              )}
            </div>
          ))}
          {loading && (
            <div className="chat-msg assistant">
              <div className="chat-typing">
                <span /><span /><span />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activePreset.startsWith('translate') ? 'Paste text to translate...' : 'Type a message...'}
            rows={1}
            disabled={loading || availableModels.length === 0}
          />
          <button
            className={`chat-send-btn${loading ? ' loading' : ''}`}
            onClick={sendMessage}
            disabled={!input.trim() || loading || availableModels.length === 0}
            title="Send"
          >
            {loading ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="chat-send-spinner">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>

        {availableModels.length === 0 && (
          <div className="chat-no-models">
            No AI models available. Configure API keys in server environment.
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatPanel;
