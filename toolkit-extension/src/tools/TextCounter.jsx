import { useState, useMemo } from 'react';
import './TextCounter.css';

function TextCounter({ isOpen, onClose }) {
  const [text, setText] = useState('');
  const [copied, setCopied] = useState('');

  const stats = useMemo(() => {
    if (!text) return { chars: 0, charsNoSpace: 0, words: 0, lines: 0, sentences: 0, paragraphs: 0, bytes: 0, readTime: '0s', speakTime: '0s', longest: '', freq: [] };
    const chars = text.length;
    const charsNoSpace = text.replace(/\s/g, '').length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const lines = text.split('\n').length;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim()).length;
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim()).length || (text.trim() ? 1 : 0);
    const bytes = new Blob([text]).size;

    const readTime = words > 0 ? formatTime(Math.ceil(words / 238 * 60)) : '0s';
    const speakTime = words > 0 ? formatTime(Math.ceil(words / 150 * 60)) : '0s';

    const wordList = text.trim() ? text.trim().toLowerCase().split(/\s+/) : [];
    const freqMap = {};
    wordList.forEach(w => { const clean = w.replace(/[^a-z0-9\uAC00-\uD7AF\u3040-\u309F\u30A0-\u30FF]/g, ''); if (clean) freqMap[clean] = (freqMap[clean] || 0) + 1; });
    const freq = Object.entries(freqMap).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const wordsByLen = text.trim() ? text.trim().split(/\s+/) : [];
    const longest = wordsByLen.reduce((a, b) => b.length > a.length ? b : a, '');

    return { chars, charsNoSpace, words, lines, sentences, paragraphs, bytes, readTime, speakTime, longest, freq };
  }, [text]);

  function formatTime(sec) {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }

  function formatBytes(b) {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  }

  const handleCopy = async (val, key) => {
    try { await navigator.clipboard.writeText(String(val)); setCopied(key); setTimeout(() => setCopied(''), 1200); } catch {}
  };

  const handleClear = () => setText('');
  const handlePaste = async () => { try { const t = await navigator.clipboard.readText(); setText(t); } catch {} };

  if (!isOpen) return null;

  return (
    <div className="tc-overlay" onClick={onClose}>
      <div className="tc-modal" onClick={e => e.stopPropagation()}>
        <div className="tc-header">
          <div className="tc-header-left">
            <svg className="tc-header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <span className="tc-header-title">Text Counter</span>
          </div>
          <div className="tc-header-actions">
            <button className="tc-tool-btn" onClick={handlePaste}>Paste</button>
            <button className="tc-tool-btn" onClick={handleClear}>Clear</button>
            <button className="tc-close-btn" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="tc-body">
          <div className="tc-input-pane">
            <textarea
              className="tc-textarea"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Type or paste text here..."
              spellCheck={false}
            />
          </div>

          <div className="tc-stats-pane">
            <div className="tc-stat-grid">
              {[
                ['Characters', stats.chars],
                ['Characters (no spaces)', stats.charsNoSpace],
                ['Words', stats.words],
                ['Lines', stats.lines],
                ['Sentences', stats.sentences],
                ['Paragraphs', stats.paragraphs],
                ['Bytes', formatBytes(stats.bytes)],
                ['Read Time', stats.readTime],
                ['Speak Time', stats.speakTime],
              ].map(([label, val], i) => (
                <div key={i} className="tc-stat-item" onClick={() => handleCopy(val, `s${i}`)}>
                  <span className="tc-stat-value">{val}</span>
                  <span className="tc-stat-label">{label}</span>
                  {copied === `s${i}` && <span className="tc-copied">Copied</span>}
                </div>
              ))}
            </div>

            {stats.freq.length > 0 && (
              <div className="tc-freq-section">
                <span className="tc-freq-title">TOP WORDS</span>
                <div className="tc-freq-list">
                  {stats.freq.map(([word, count], i) => (
                    <div key={i} className="tc-freq-item">
                      <span className="tc-freq-word">{word}</span>
                      <span className="tc-freq-bar" style={{ width: `${(count / stats.freq[0][1]) * 100}%` }} />
                      <span className="tc-freq-count">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats.longest && (
              <div className="tc-longest">
                <span className="tc-freq-title">LONGEST WORD</span>
                <span className="tc-longest-word">{stats.longest} ({stats.longest.length} chars)</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TextCounter;
