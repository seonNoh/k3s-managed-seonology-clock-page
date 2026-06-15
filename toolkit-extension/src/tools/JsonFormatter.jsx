import { useState, useCallback, useRef, useEffect } from 'react';
import './JsonFormatter.css';

// ===== JSON PATH HELPER =====
function getJsonPaths(obj, prefix = '') {
  const paths = [];
  if (obj && typeof obj === 'object') {
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => {
        const p = `${prefix}[${i}]`;
        paths.push(p);
        paths.push(...getJsonPaths(item, p));
      });
    } else {
      Object.keys(obj).forEach(key => {
        const p = prefix ? `${prefix}.${key}` : key;
        paths.push(p);
        paths.push(...getJsonPaths(obj[key], p));
      });
    }
  }
  return paths;
}

// ===== SYNTAX HIGHLIGHTER =====
function highlightJson(json) {
  if (!json) return '';
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")\s*:/g, '<span class="jf-key">$1</span>:')
    .replace(/("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")/g, '<span class="jf-string">$1</span>')
    .replace(/\b(-?\d+(\.\d+)?([eE][+-]?\d+)?)\b/g, '<span class="jf-number">$1</span>')
    .replace(/\b(true|false)\b/g, '<span class="jf-boolean">$1</span>')
    .replace(/\bnull\b/g, '<span class="jf-null">null</span>');
}

// ===== COMPONENT =====
function JsonFormatter({ isOpen, onClose }) {
  const [input, setInput] = useState('');
  const [formatted, setFormatted] = useState('');
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [indent, setIndent] = useState(2);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [activeSearchIdx, setActiveSearchIdx] = useState(-1);
  const inputRef = useRef(null);
  const outputRef = useRef(null);

  // Focus on open
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const analyzeJson = useCallback((parsed) => {
    const count = (obj) => {
      if (obj === null || typeof obj !== 'object') return { keys: 0, values: 1, depth: 0 };
      if (Array.isArray(obj)) {
        let maxDepth = 0;
        let totalKeys = 0;
        let totalValues = 0;
        obj.forEach(item => {
          const r = count(item);
          totalKeys += r.keys;
          totalValues += r.values;
          if (r.depth > maxDepth) maxDepth = r.depth;
        });
        return { keys: totalKeys, values: totalValues + obj.length, depth: maxDepth + 1 };
      }
      const entries = Object.entries(obj);
      let maxDepth = 0;
      let totalKeys = entries.length;
      let totalValues = 0;
      entries.forEach(([, v]) => {
        const r = count(v);
        totalKeys += r.keys;
        totalValues += r.values;
        if (r.depth > maxDepth) maxDepth = r.depth;
      });
      return { keys: totalKeys, values: totalValues, depth: maxDepth + 1 };
    };
    const result = count(parsed);
    const type = Array.isArray(parsed) ? 'Array' : typeof parsed === 'object' && parsed !== null ? 'Object' : typeof parsed;
    return { ...result, type, rootLength: Array.isArray(parsed) ? parsed.length : typeof parsed === 'object' && parsed !== null ? Object.keys(parsed).length : 0 };
  }, []);

  const handleFormat = useCallback((text, spaces) => {
    setError(null);
    setStats(null);
    setSearchQuery('');
    setSearchResults([]);
    if (!text.trim()) {
      setFormatted('');
      return;
    }
    try {
      const parsed = JSON.parse(text);
      const pretty = JSON.stringify(parsed, null, spaces);
      setFormatted(pretty);
      setStats(analyzeJson(parsed));
    } catch (e) {
      // Try to find error position
      const match = e.message.match(/position (\d+)/);
      const pos = match ? parseInt(match[1]) : null;
      let line = null;
      let col = null;
      if (pos !== null) {
        const before = text.substring(0, pos);
        line = (before.match(/\n/g) || []).length + 1;
        col = pos - before.lastIndexOf('\n');
      }
      setError({
        message: e.message,
        position: pos,
        line,
        col,
      });
      setFormatted('');
    }
  }, [analyzeJson]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);
    handleFormat(val, indent);
  };

  const handleIndentChange = (n) => {
    setIndent(n);
    if (input.trim()) handleFormat(input, n);
  };

  const handleMinify = () => {
    if (!input.trim()) return;
    try {
      const parsed = JSON.parse(input);
      const minified = JSON.stringify(parsed);
      setFormatted(minified);
      setInput(minified);
      setStats(analyzeJson(parsed));
      setError(null);
    } catch (e) {
      setError({ message: e.message });
    }
  };

  const handleSortKeys = () => {
    if (!input.trim()) return;
    try {
      const parsed = JSON.parse(input);
      const sortObj = (obj) => {
        if (Array.isArray(obj)) return obj.map(sortObj);
        if (obj && typeof obj === 'object') {
          const sorted = {};
          Object.keys(obj).sort().forEach(k => { sorted[k] = sortObj(obj[k]); });
          return sorted;
        }
        return obj;
      };
      const sorted = sortObj(parsed);
      const pretty = JSON.stringify(sorted, null, indent);
      setInput(pretty);
      setFormatted(pretty);
      setStats(analyzeJson(sorted));
      setError(null);
    } catch (e) {
      setError({ message: e.message });
    }
  };

  const handleCopy = async () => {
    if (!formatted) return;
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard denied */ }
  };

  const handleClear = () => {
    setInput('');
    setFormatted('');
    setError(null);
    setStats(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInput(text);
      handleFormat(text, indent);
    } catch { /* clipboard denied */ }
  };

  const handleSample = () => {
    const sample = JSON.stringify({
      name: "SEONOLOGY",
      version: "2.0.0",
      features: ["clock", "weather", "todo", "notes", "chat"],
      settings: {
        theme: "dark",
        language: "ko",
        autoSave: true,
        refreshInterval: 300
      },
      services: [
        { name: "Vault", port: 8200, status: "running" },
        { name: "ArgoCD", port: 8080, status: "running" },
        { name: "Keycloak", port: 8443, status: "running" }
      ]
    }, null, 2);
    setInput(sample);
    handleFormat(sample, indent);
  };

  // Search in JSON paths
  const handleSearch = (q) => {
    setSearchQuery(q);
    if (!q.trim() || !formatted) {
      setSearchResults([]);
      setActiveSearchIdx(-1);
      return;
    }
    try {
      const parsed = JSON.parse(input);
      const paths = getJsonPaths(parsed);
      const matches = paths.filter(p => p.toLowerCase().includes(q.toLowerCase()));
      setSearchResults(matches);
      setActiveSearchIdx(matches.length > 0 ? 0 : -1);
    } catch {
      setSearchResults([]);
    }
  };

  // Tab key in textarea
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = inputRef.current;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const spaces = ' '.repeat(indent);
      const newVal = ta.value.substring(0, start) + spaces + ta.value.substring(end);
      setInput(newVal);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + indent;
      });
    }
  };

  if (!isOpen) return null;

  const highlightedOutput = formatted ? highlightJson(formatted) : '';
  const lineCount = formatted ? formatted.split('\n').length : 0;

  return (
    <div className="jf-overlay" onClick={onClose}>
      <div className="jf-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="jf-header">
          <div className="jf-header-left">
            <svg className="jf-header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h12" /><circle cx="20" cy="18" r="2" />
            </svg>
            <span className="jf-header-title">JSON Formatter</span>
            {stats && (
              <span className="jf-header-badge">{stats.type}{stats.rootLength > 0 ? ` (${stats.rootLength})` : ''}</span>
            )}
          </div>
          <button className="jf-close-btn" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Toolbar */}
        <div className="jf-toolbar">
          <div className="jf-toolbar-group">
            {/* Indent selector */}
            <div className="jf-indent-group">
              <span className="jf-indent-label">Indent</span>
              {[2, 4].map(n => (
                <button key={n} className={`jf-indent-btn${indent === n ? ' active' : ''}`} onClick={() => handleIndentChange(n)}>
                  {n}
                </button>
              ))}
              <button className={`jf-indent-btn${indent === 0 ? ' active' : ''}`} onClick={() => handleIndentChange(0)}>Tab</button>
            </div>

            <div className="jf-toolbar-sep" />

            <button className="jf-tool-btn" onClick={handleMinify} title="Minify JSON">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
              Minify
            </button>

            <button className="jf-tool-btn" onClick={handleSortKeys} title="Sort keys alphabetically">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5h10" /><path d="M11 9h7" /><path d="M11 13h4" /><path d="M3 17l3 3 3-3" /><path d="M6 18V4" />
              </svg>
              Sort Keys
            </button>

            <button className="jf-tool-btn" onClick={handleSample} title="Load sample JSON">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              Sample
            </button>
          </div>

          <div className="jf-toolbar-group">
            <button className="jf-tool-btn" onClick={handlePaste}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              </svg>
              Paste
            </button>
            <button className="jf-tool-btn" onClick={handleClear}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
              </svg>
              Clear
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="jf-error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <div className="jf-error-text">
              <strong>Invalid JSON</strong>
              <span>{error.message}</span>
              {error.line && <span className="jf-error-pos">Line {error.line}, Col {error.col}</span>}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="jf-body">
          {/* Input Pane */}
          <div className="jf-pane">
            <div className="jf-pane-header">
              <span className="jf-pane-label">INPUT</span>
              <span className="jf-char-count">{input.length.toLocaleString()} chars</span>
            </div>
            <textarea
              ref={inputRef}
              className="jf-textarea"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder='Paste or type JSON here...&#10;&#10;{ "key": "value" }'
              spellCheck={false}
            />
          </div>

          {/* Divider */}
          <div className="jf-divider" />

          {/* Output Pane */}
          <div className="jf-pane jf-output-pane">
            <div className="jf-pane-header">
              <span className="jf-pane-label">
                FORMATTED
                {lineCount > 0 && <span className="jf-line-count"> · {lineCount} lines</span>}
              </span>
              <div className="jf-output-actions">
                {/* Search */}
                <div className="jf-search-box">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    className="jf-search-input"
                    value={searchQuery}
                    onChange={e => handleSearch(e.target.value)}
                    placeholder="Search path..."
                  />
                  {searchResults.length > 0 && (
                    <span className="jf-search-count">{searchResults.length}</span>
                  )}
                </div>
                <button className={`jf-copy-btn${copied ? ' copied' : ''}`} onClick={handleCopy} disabled={!formatted}>
                  {copied ? (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> Copied</>
                  ) : (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg> Copy</>
                  )}
                </button>
              </div>
            </div>
            <div className="jf-output-wrap" ref={outputRef}>
              {formatted ? (
                <div className="jf-output-lines">
                  <div className="jf-line-nums">
                    {formatted.split('\n').map((_, i) => (
                      <span key={i}>{i + 1}</span>
                    ))}
                  </div>
                  <pre className="jf-output-code" dangerouslySetInnerHTML={{ __html: highlightedOutput }} />
                </div>
              ) : (
                <div className="jf-output-placeholder">
                  {error ? 'Fix the JSON errors to see output' : 'Formatted JSON will appear here'}
                </div>
              )}
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="jf-search-results">
                {searchResults.slice(0, 20).map((path, i) => (
                  <div key={i} className={`jf-search-item${i === activeSearchIdx ? ' active' : ''}`} onClick={() => setActiveSearchIdx(i)}>
                    <span className="jf-search-path">{path}</span>
                  </div>
                ))}
                {searchResults.length > 20 && (
                  <div className="jf-search-more">+{searchResults.length - 20} more</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Stats Footer */}
        {stats && (
          <div className="jf-stats">
            <span>Type: {stats.type}</span>
            <span>Keys: {stats.keys.toLocaleString()}</span>
            <span>Values: {stats.values.toLocaleString()}</span>
            <span>Depth: {stats.depth}</span>
            <span>Size: {new Blob([formatted]).size.toLocaleString()} B</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default JsonFormatter;
