import { useState, useRef, useEffect, useCallback } from 'react';
import { renderMarkdown } from '../utils/markdown';
import './MarkdownPreview.css';

const TOOLBAR_ITEMS = [
  { id: 'h1', label: 'H1', prefix: '# ', suffix: '', block: true },
  { id: 'h2', label: 'H2', prefix: '## ', suffix: '', block: true },
  { id: 'h3', label: 'H3', prefix: '### ', suffix: '', block: true },
  { id: 'bold', label: 'B', prefix: '**', suffix: '**' },
  { id: 'italic', label: 'I', prefix: '_', suffix: '_', style: 'italic' },
  { id: 'strike', label: 'S', prefix: '~~', suffix: '~~', style: 'strikethrough' },
  { id: 'code', label: '<>', prefix: '`', suffix: '`' },
  { id: 'link', label: 'Link', insert: '[text](url)' },
  { id: 'image', label: 'Img', insert: '![alt](url)' },
  { id: 'ul', label: 'UL', prefix: '- ', suffix: '', block: true },
  { id: 'ol', label: 'OL', prefix: '1. ', suffix: '', block: true },
  { id: 'quote', label: '>', prefix: '> ', suffix: '', block: true },
  { id: 'table', label: 'Table', insert: '| Header | Header |\n| ------ | ------ |\n| Cell   | Cell   |\n' },
  { id: 'hr', label: 'HR', insert: '\n---\n' },
  { id: 'codeblock', label: '```', insert: '```\n\n```' },
];

function MarkdownPreview({ isOpen, onClose }) {
  const [markdown, setMarkdown] = useState(() => localStorage.getItem('md-preview-content') || '# Hello World\n\nStart typing markdown here...');
  const [wordWrap, setWordWrap] = useState(true);
  const [viewMode, setViewMode] = useState('split');
  const textareaRef = useRef(null);
  const previewRef = useRef(null);
  const fileRef = useRef(null);
  const saveTimerRef = useRef(null);

  const handleChange = useCallback((e) => {
    const val = e.target.value;
    setMarkdown(val);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      localStorage.setItem('md-preview-content', val);
    }, 500);
  }, []);

  const handleEditorScroll = useCallback(() => {
    if (!textareaRef.current || !previewRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = textareaRef.current;
    const ratio = scrollTop / (scrollHeight - clientHeight || 1);
    const previewMax = previewRef.current.scrollHeight - previewRef.current.clientHeight;
    previewRef.current.scrollTop = ratio * previewMax;
  }, []);

  useEffect(() => {
    if (isOpen && textareaRef.current) textareaRef.current.focus();
  }, [isOpen]);

  const insertText = useCallback((item) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = markdown.substring(start, end);
    let newText, cursorPos;

    if (item.insert) {
      newText = markdown.substring(0, start) + item.insert + markdown.substring(end);
      cursorPos = start + item.insert.length;
    } else if (item.block) {
      const lineStart = markdown.lastIndexOf('\n', start - 1) + 1;
      newText = markdown.substring(0, lineStart) + item.prefix + markdown.substring(lineStart);
      cursorPos = start + item.prefix.length;
    } else {
      const wrapped = item.prefix + (selected || 'text') + item.suffix;
      newText = markdown.substring(0, start) + wrapped + markdown.substring(end);
      cursorPos = selected ? start + wrapped.length : start + item.prefix.length + 4;
    }

    setMarkdown(newText);
    localStorage.setItem('md-preview-content', newText);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = cursorPos;
    });
  }, [markdown]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = textareaRef.current;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      const newVal = val.substring(0, start) + '  ' + val.substring(end);
      setMarkdown(newVal);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
    }
    // Ctrl/Cmd + B = Bold
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      insertText(TOOLBAR_ITEMS.find(i => i.id === 'bold'));
    }
    // Ctrl/Cmd + I = Italic
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      insertText(TOOLBAR_ITEMS.find(i => i.id === 'italic'));
    }
  }, [insertText]);

  const handleClear = () => {
    setMarkdown('');
    localStorage.removeItem('md-preview-content');
    if (textareaRef.current) textareaRef.current.focus();
  };

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(markdown); } catch {}
  };

  const handleOpenFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result;
      setMarkdown(content);
      localStorage.setItem('md-preview-content', content);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDownloadMd = () => {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'document.md'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadHtml = () => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Markdown Export</title><style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;color:#1a1a1a;line-height:1.7}code{background:#f0f0f0;padding:2px 6px;border-radius:3px;font-size:0.9em}pre{background:#f5f5f5;padding:1rem;border-radius:6px;overflow-x:auto}pre code{background:none;padding:0}blockquote{border-left:3px solid #6366f1;padding:0.5em 1em;margin:1em 0;color:#555;background:#f8f8ff}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px 12px;text-align:left}th{background:#f5f5f5}</style></head><body>${renderMarkdown(markdown)}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'document.html'; a.click();
    URL.revokeObjectURL(url);
  };

  const stats = {
    chars: markdown.length,
    words: markdown.trim() ? markdown.trim().split(/\s+/).length : 0,
    lines: markdown.split('\n').length,
  };

  if (!isOpen) return null;

  return (
    <div className="md-overlay" onClick={onClose}>
      <div className="md-modal" onClick={(e) => e.stopPropagation()}>
        <div className="md-header">
          <div className="md-header-left">
            <svg className="md-header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            <span className="md-header-title">Markdown Editor</span>
          </div>
          <div className="md-header-actions">
            <div className="md-view-toggle">
              <button className={`md-view-toggle-btn ${viewMode === 'split' ? 'active' : ''}`} onClick={() => setViewMode('split')} title="Split view">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="12" y1="3" x2="12" y2="21" />
                </svg>
              </button>
              <button className={`md-view-toggle-btn ${viewMode === 'editor' ? 'active' : ''}`} onClick={() => setViewMode('editor')} title="Editor only">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button className={`md-view-toggle-btn ${viewMode === 'preview' ? 'active' : ''}`} onClick={() => setViewMode('preview')} title="Preview only">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" />
                </svg>
              </button>
            </div>
            <div className="md-action-separator" />
            <button className="md-action-btn" onClick={() => fileRef.current?.click()} title="Open .md file">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </button>
            <input ref={fileRef} type="file" accept=".md,.markdown,.txt" hidden onChange={handleOpenFile} />
            <button className="md-action-btn" onClick={handleDownloadMd} title="Download .md">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button className="md-action-btn" onClick={handleDownloadHtml} title="Export HTML">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
              </svg>
            </button>
            <button className="md-action-btn" onClick={() => setWordWrap(!wordWrap)} title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
              style={{ display: viewMode !== 'preview' ? 'flex' : 'none' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ opacity: wordWrap ? 1 : 0.4 }}>
                <line x1="3" y1="6" x2="21" y2="6" /><path d="M3 12h15a3 3 0 1 1 0 6h-4" /><polyline points="16 16 14 18 16 20" /><line x1="3" y1="18" x2="10" y2="18" />
              </svg>
            </button>
            <button className="md-action-btn" onClick={handleCopy} title="Copy markdown">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            <button className="md-action-btn" onClick={handleClear} title="Clear">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
              </svg>
            </button>
            <button className="md-close-btn" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {viewMode !== 'preview' && (
          <div className="md-toolbar">
            {TOOLBAR_ITEMS.map(item => (
              <button
                key={item.id}
                className={`md-toolbar-btn${item.style === 'italic' ? ' md-tb-italic' : ''}${item.style === 'strikethrough' ? ' md-tb-strike' : ''}`}
                onClick={() => insertText(item)}
                title={item.label}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        <div className={`md-body${viewMode === 'preview' ? ' md-body--preview' : ''}${viewMode === 'editor' ? ' md-body--editor' : ''}`}>
          {viewMode !== 'preview' && (
            <>
              <div className="md-editor-pane">
                <div className="md-pane-label">EDITOR</div>
                <textarea
                  ref={textareaRef}
                  className="md-textarea"
                  value={markdown}
                  onChange={handleChange}
                  onScroll={handleEditorScroll}
                  onKeyDown={handleKeyDown}
                  placeholder="Type markdown here..."
                  spellCheck={false}
                  style={{ whiteSpace: wordWrap ? 'pre-wrap' : 'pre' }}
                />
              </div>
              {viewMode === 'split' && <div className="md-divider" />}
            </>
          )}
          {viewMode !== 'editor' && (
            <div className={`md-preview-pane${viewMode === 'preview' ? ' md-preview-pane--full' : ''}`}>
              {viewMode === 'split' && <div className="md-pane-label">PREVIEW</div>}
              <div
                ref={previewRef}
                className="md-preview-content md-rendered"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
              />
            </div>
          )}
        </div>

        <div className="md-statusbar">
          <span>{stats.chars} chars</span>
          <span>{stats.words} words</span>
          <span>{stats.lines} lines</span>
          <span>{new Blob([markdown]).size} bytes</span>
        </div>
      </div>
    </div>
  );
}

export default MarkdownPreview;
