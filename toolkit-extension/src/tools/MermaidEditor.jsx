import { useState, useEffect, useRef, useCallback } from 'react';
import './MermaidEditor.css';

const TEMPLATES = {
  flowchart: `flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Process]
    B -->|No| D[End]
    C --> D`,
  sequence: `sequenceDiagram
    participant A as Client
    participant B as Server
    participant C as Database
    A->>B: Request
    B->>C: Query
    C-->>B: Result
    B-->>A: Response`,
  classDiagram: `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +fetch()
    }
    class Cat {
        +purr()
    }
    Animal <|-- Dog
    Animal <|-- Cat`,
  gantt: `gantt
    title Project Timeline
    dateFormat YYYY-MM-DD
    section Phase 1
    Design    :a1, 2025-01-01, 14d
    Develop   :a2, after a1, 21d
    section Phase 2
    Testing   :a3, after a2, 7d
    Deploy    :a4, after a3, 3d`,
  er: `erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "ordered in"
    USER {
        int id PK
        string name
        string email
    }
    ORDER {
        int id PK
        date created
    }`,
  pie: `pie title Browser Share
    "Chrome" : 65
    "Safari" : 19
    "Firefox" : 4
    "Edge" : 4
    "Other" : 8`,
};

let mermaidModule = null;
let mermaidInitialized = false;

function MermaidEditor({ isOpen, onClose }) {
  const [code, setCode] = useState(TEMPLATES.flowchart);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const previewRef = useRef(null);
  const renderCounter = useRef(0);

  const initMermaid = useCallback(async () => {
    if (!mermaidModule) {
      mermaidModule = (await import('mermaid')).default;
    }
    if (!mermaidInitialized) {
      mermaidModule.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
          darkMode: true,
          background: '#0f0f19',
          primaryColor: '#6366f1',
          primaryTextColor: '#e2e8f0',
          primaryBorderColor: '#4f46e5',
          lineColor: '#64748b',
          secondaryColor: '#1e1b4b',
          tertiaryColor: '#1e293b',
        },
        flowchart: { curve: 'basis' },
        securityLevel: 'loose',
      });
      mermaidInitialized = true;
    }
  }, []);

  const renderDiagram = useCallback(async (src) => {
    if (!previewRef.current || !src.trim()) return;
    await initMermaid();
    setError('');
    try {
      renderCounter.current += 1;
      const id = `mermaid-preview-${renderCounter.current}`;
      const { svg } = await mermaidModule.render(id, src.trim());
      if (previewRef.current) {
        previewRef.current.innerHTML = svg;
      }
    } catch (e) {
      setError(e.message || 'Render error');
      if (previewRef.current) previewRef.current.innerHTML = '';
    }
  }, [initMermaid]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => renderDiagram(code), 400);
    return () => clearTimeout(timer);
  }, [code, isOpen, renderDiagram]);

  const handleCopy = async (text, key) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1200); } catch {}
  };

  const handleExportSvg = () => {
    if (!previewRef.current) return;
    const svg = previewRef.current.innerHTML;
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPng = async () => {
    if (!previewRef.current) return;
    const svgEl = previewRef.current.querySelector('svg');
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'diagram.png';
        a.click();
        URL.revokeObjectURL(url);
      });
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  if (!isOpen) return null;

  return (
    <div className="mm-overlay" onClick={onClose}>
      <div className="mm-modal" onClick={e => e.stopPropagation()}>
        <div className="mm-header">
          <div className="mm-header-left">
            <svg className="mm-header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            <span className="mm-header-title">Mermaid Editor</span>
          </div>
          <div className="mm-header-actions">
            <button className={`mm-tool-btn${copied === 'code' ? ' copied' : ''}`} onClick={() => handleCopy(code, 'code')}>
              {copied === 'code' ? 'Copied' : 'Copy Code'}
            </button>
            <button className="mm-tool-btn" onClick={handleExportSvg}>SVG</button>
            <button className="mm-tool-btn" onClick={handleExportPng}>PNG</button>
            <button className="mm-close-btn" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mm-templates">
          {Object.keys(TEMPLATES).map(key => (
            <button key={key} className="mm-template-btn" onClick={() => setCode(TEMPLATES[key])}>
              {key}
            </button>
          ))}
        </div>

        {error && <div className="mm-error">{error}</div>}

        <div className="mm-body">
          <div className="mm-editor-pane">
            <div className="mm-pane-header">
              <span className="mm-pane-label">CODE</span>
              <span className="mm-char-count">{code.length} chars</span>
            </div>
            <textarea
              className="mm-textarea"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Enter Mermaid diagram code..."
              spellCheck={false}
            />
          </div>
          <div className="mm-preview-pane">
            <div className="mm-pane-header">
              <span className="mm-pane-label">PREVIEW</span>
            </div>
            <div className="mm-preview" ref={previewRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default MermaidEditor;
