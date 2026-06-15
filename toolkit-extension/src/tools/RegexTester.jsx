import { useState, useMemo } from 'react';
import './RegexTester.css';

function RegexTester({ isOpen, onClose }) {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('g');
  const [testStr, setTestStr] = useState('');
  const [replace, setReplace] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [copied, setCopied] = useState('');

  const result = useMemo(() => {
    if (!pattern || !testStr) return { matches: [], highlighted: testStr, replaced: '', error: '' };
    try {
      const re = new RegExp(pattern, flags);
      const matches = [];
      let m;
      if (flags.includes('g')) {
        while ((m = re.exec(testStr)) !== null) {
          matches.push({ value: m[0], index: m.index, groups: m.slice(1) });
          if (!m[0]) re.lastIndex++;
        }
      } else {
        m = re.exec(testStr);
        if (m) matches.push({ value: m[0], index: m.index, groups: m.slice(1) });
      }
      const replaced = showReplace ? testStr.replace(re, replace) : '';
      return { matches, replaced, error: '' };
    } catch (e) {
      return { matches: [], replaced: '', error: e.message };
    }
  }, [pattern, flags, testStr, replace, showReplace]);

  const highlightedParts = useMemo(() => {
    if (!pattern || !testStr || result.error) return [{ text: testStr, match: false }];
    try {
      const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
      const parts = [];
      let last = 0;
      let m;
      while ((m = re.exec(testStr)) !== null) {
        if (m.index > last) parts.push({ text: testStr.slice(last, m.index), match: false });
        if (m[0]) parts.push({ text: m[0], match: true });
        last = m.index + m[0].length;
        if (!m[0]) { re.lastIndex++; last = re.lastIndex; }
      }
      if (last < testStr.length) parts.push({ text: testStr.slice(last), match: false });
      return parts.length ? parts : [{ text: testStr, match: false }];
    } catch {
      return [{ text: testStr, match: false }];
    }
  }, [pattern, flags, testStr, result.error]);

  const handleCopy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1200);
    } catch {}
  };

  const toggleFlag = (f) => {
    setFlags(prev => prev.includes(f) ? prev.replace(f, '') : prev + f);
  };

  if (!isOpen) return null;

  return (
    <div className="rx-overlay" onClick={onClose}>
      <div className="rx-modal" onClick={e => e.stopPropagation()}>
        <div className="rx-header">
          <div className="rx-header-left">
            <svg className="rx-header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
            </svg>
            <span className="rx-header-title">Regex Tester</span>
          </div>
          <button className="rx-close-btn" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="rx-toolbar">
          <div className="rx-pattern-row">
            <span className="rx-slash">/</span>
            <input
              className="rx-pattern-input"
              value={pattern}
              onChange={e => setPattern(e.target.value)}
              placeholder="Enter regex pattern..."
              spellCheck={false}
            />
            <span className="rx-slash">/</span>
            <div className="rx-flags">
              {['g','i','m','s','u'].map(f => (
                <button key={f} className={`rx-flag-btn${flags.includes(f) ? ' active' : ''}`} onClick={() => toggleFlag(f)}>{f}</button>
              ))}
            </div>
          </div>
          <button className={`rx-replace-toggle${showReplace ? ' active' : ''}`} onClick={() => setShowReplace(!showReplace)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
            </svg>
            Replace
          </button>
        </div>

        {result.error && <div className="rx-error">{result.error}</div>}

        {showReplace && (
          <div className="rx-replace-row">
            <span className="rx-replace-label">Replace with</span>
            <input
              className="rx-replace-input"
              value={replace}
              onChange={e => setReplace(e.target.value)}
              placeholder="Replacement string ($1, $2...)"
              spellCheck={false}
            />
          </div>
        )}

        <div className="rx-body">
          <div className="rx-pane">
            <div className="rx-pane-header">
              <span className="rx-pane-label">TEST STRING</span>
              <span className="rx-char-count">{testStr.length} chars</span>
            </div>
            <textarea
              className="rx-textarea"
              value={testStr}
              onChange={e => setTestStr(e.target.value)}
              placeholder="Enter test string..."
              spellCheck={false}
            />
          </div>

          <div className="rx-results">
            <div className="rx-pane-header">
              <span className="rx-pane-label">MATCHES ({result.matches.length})</span>
            </div>
            <div className="rx-highlight-area">
              {highlightedParts.map((p, i) =>
                p.match ? <mark key={i} className="rx-match-hl">{p.text}</mark> : <span key={i}>{p.text}</span>
              )}
              {!testStr && <span className="rx-placeholder">Highlighted matches will appear here...</span>}
            </div>

            {result.matches.length > 0 && (
              <div className="rx-match-list">
                {result.matches.map((m, i) => (
                  <div key={i} className="rx-match-item">
                    <span className="rx-match-idx">#{i + 1}</span>
                    <span className="rx-match-val" onClick={() => handleCopy(m.value, `m${i}`)}>
                      {m.value || '(empty)'}
                      {copied === `m${i}` && <span className="rx-copied-tip">Copied</span>}
                    </span>
                    <span className="rx-match-pos">@{m.index}</span>
                    {m.groups.length > 0 && (
                      <span className="rx-match-groups">
                        {m.groups.map((g, gi) => <span key={gi} className="rx-group">${gi + 1}: {g ?? 'undefined'}</span>)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {showReplace && result.replaced && (
              <div className="rx-replace-result">
                <div className="rx-pane-header">
                  <span className="rx-pane-label">REPLACE RESULT</span>
                  <button className={`rx-copy-btn${copied === 'rep' ? ' copied' : ''}`} onClick={() => handleCopy(result.replaced, 'rep')}>
                    {copied === 'rep' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="rx-replaced-text">{result.replaced}</pre>
              </div>
            )}
          </div>
        </div>

        <div className="rx-stats">
          <span>{result.matches.length} match{result.matches.length !== 1 ? 'es' : ''}</span>
          <span>Flags: {flags || 'none'}</span>
        </div>
      </div>
    </div>
  );
}

export default RegexTester;
