import { useState, useCallback, useEffect, useRef } from 'react';
import './PasswordGenerator.css';

const CHARSETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};

const PRESETS = [
  { label: 'PIN (4-digit)', length: 4, options: { uppercase: false, lowercase: false, numbers: true, symbols: false } },
  { label: 'Simple (8)', length: 8, options: { uppercase: true, lowercase: true, numbers: true, symbols: false } },
  { label: 'Strong (16)', length: 16, options: { uppercase: true, lowercase: true, numbers: true, symbols: true } },
  { label: 'Ultra (32)', length: 32, options: { uppercase: true, lowercase: true, numbers: true, symbols: true } },
  { label: 'Passphrase', length: 4, options: { uppercase: false, lowercase: false, numbers: false, symbols: false }, passphrase: true },
];

// Common words for passphrase generation
const WORDS = [
  'apple','brave','cloud','dance','eagle','flame','grape','honor','ivory','jewel',
  'karma','lemon','magic','noble','ocean','piano','queen','river','solar','tiger',
  'ultra','vivid','water','xenon','youth','zebra','amber','blaze','coral','delta',
  'ember','frost','ghost','haven','inlet','joker','kneel','lunar','mango','nexus',
  'olive','prism','quilt','robin','stone','torch','umbra','vault','wheat','xeric',
  'yacht','zonal','atlas','birch','cedar','drift','epoch','forge','gleam','haste',
  'icing','jaunt','kiosk','latch','moose','nerve','oxide','plume','quest','ridge',
  'scout','trail','unity','vigor','whelp','axiom','yield','zephyr','acorn','blade',
  'crest','dusk','elite','fable','glyph','heron','ivory','jolly','knack','lazer',
  'marsh','night','oasis','plank','quota','realm','spark','thorn','usher','verse',
];

function getStrengthInfo(password, options) {
  if (!password) return { score: 0, label: 'None', color: 'rgba(255,255,255,0.1)' };

  let pool = 0;
  if (options.lowercase) pool += 26;
  if (options.uppercase) pool += 26;
  if (options.numbers) pool += 10;
  if (options.symbols) pool += 26;
  if (pool === 0) pool = 26;

  // Entropy = length * log2(pool)
  const entropy = password.length * Math.log2(pool);

  if (entropy < 28) return { score: 1, label: 'Very Weak', color: '#ff4444', entropy };
  if (entropy < 36) return { score: 2, label: 'Weak', color: '#ff8844', entropy };
  if (entropy < 60) return { score: 3, label: 'Fair', color: '#ffcc00', entropy };
  if (entropy < 80) return { score: 4, label: 'Strong', color: '#88cc44', entropy };
  return { score: 5, label: 'Very Strong', color: '#44dd88', entropy };
}

function PasswordGenerator({ isOpen, onClose }) {
  const [length, setLength] = useState(16);
  const [options, setOptions] = useState({
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  });
  const [passphrase, setPassphrase] = useState(false);
  const [separator, setSeparator] = useState('-');
  const [wordCount, setWordCount] = useState(4);
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pwgen-history') || '[]'); } catch { return []; }
  });
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);
  const [customSymbols, setCustomSymbols] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const passwordRef = useRef(null);

  const addToHistory = useCallback((pw) => {
    setHistory(prev => {
      const next = [{ password: pw, time: Date.now() }, ...prev.filter(h => h.password !== pw)].slice(0, 20);
      localStorage.setItem('pwgen-history', JSON.stringify(next));
      return next;
    });
  }, []);

  const generatePassword = useCallback(() => {
    if (passphrase) {
      // Passphrase mode
      const selected = [];
      for (let i = 0; i < wordCount; i++) {
        selected.push(WORDS[Math.floor(Math.random() * WORDS.length)]);
      }
      const pw = selected.join(separator);
      setPassword(pw);
      addToHistory(pw);
      return;
    }

    let chars = '';
    if (options.uppercase) chars += CHARSETS.uppercase;
    if (options.lowercase) chars += CHARSETS.lowercase;
    if (options.numbers) chars += CHARSETS.numbers;
    if (options.symbols) chars += (customSymbols || CHARSETS.symbols);

    if (excludeAmbiguous) {
      chars = chars.replace(/[0OoIl1|]/g, '');
    }

    if (!chars) {
      setPassword('');
      return;
    }

    // Crypto-secure random
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    let pw = '';
    for (let i = 0; i < length; i++) {
      pw += chars[array[i] % chars.length];
    }

    // Ensure at least one of each selected category
    const ensureChars = [];
    if (options.uppercase) ensureChars.push(CHARSETS.uppercase);
    if (options.lowercase) ensureChars.push(CHARSETS.lowercase);
    if (options.numbers) ensureChars.push(CHARSETS.numbers);
    if (options.symbols) ensureChars.push(customSymbols || CHARSETS.symbols);

    if (ensureChars.length > 1 && length >= ensureChars.length) {
      const pwArr = pw.split('');
      const positions = new Set();
      const posArray = new Uint32Array(ensureChars.length);
      crypto.getRandomValues(posArray);
      
      ensureChars.forEach((charset, idx) => {
        let pos;
        do { pos = posArray[idx] % length; } while (positions.has(pos));
        positions.add(pos);
        const charArray = new Uint32Array(1);
        crypto.getRandomValues(charArray);
        let cs = charset;
        if (excludeAmbiguous) cs = cs.replace(/[0OoIl1|]/g, '');
        if (cs.length > 0) pwArr[pos] = cs[charArray[0] % cs.length];
      });
      pw = pwArr.join('');
    }

    setPassword(pw);
    addToHistory(pw);
  }, [length, options, passphrase, separator, wordCount, excludeAmbiguous, customSymbols, addToHistory]);

  // Generate on first open and when settings change
  useEffect(() => {
    if (isOpen) generatePassword();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text || password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* denied */ }
  };

  const handlePreset = (preset) => {
    if (preset.passphrase) {
      setPassphrase(true);
      setWordCount(preset.length);
    } else {
      setPassphrase(false);
      setLength(preset.length);
      setOptions(preset.options);
    }
  };

  // Regenerate when settings change (not on first render)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (isOpen) generatePassword();
  }, [length, options, passphrase, separator, wordCount, excludeAmbiguous, customSymbols]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('pwgen-history');
  };

  const strength = getStrengthInfo(password, options);

  if (!isOpen) return null;

  return (
    <div className="pwgen-overlay" onClick={onClose}>
      <div className="pwgen-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="pwgen-header">
          <div className="pwgen-header-left">
            <svg className="pwgen-header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="pwgen-header-title">Password Generator</span>
          </div>
          <button className="pwgen-close-btn" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="pwgen-body">
          {/* Main Area */}
          <div className="pwgen-main">
            {/* Password Display */}
            <div className="pwgen-display" ref={passwordRef}>
              <div className="pwgen-password-box">
                <span className="pwgen-password-text">{password || '—'}</span>
              </div>
              <div className="pwgen-display-actions">
                <button className={`pwgen-action-btn copy${copied ? ' copied' : ''}`} onClick={() => handleCopy()} title="Copy">
                  {copied ? (
                    <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg> Copied</>
                  ) : (
                    <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg> Copy</>
                  )}
                </button>
                <button className="pwgen-action-btn generate" onClick={generatePassword} title="Regenerate">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                    <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                  </svg>
                  Generate
                </button>
              </div>
            </div>

            {/* Strength Meter */}
            <div className="pwgen-strength">
              <div className="pwgen-strength-bar">
                {[1, 2, 3, 4, 5].map(i => (
                  <div
                    key={i}
                    className={`pwgen-strength-seg${i <= strength.score ? ' active' : ''}`}
                    style={{ background: i <= strength.score ? strength.color : undefined }}
                  />
                ))}
              </div>
              <div className="pwgen-strength-info">
                <span style={{ color: strength.color }}>{strength.label}</span>
                {strength.entropy && <span className="pwgen-entropy">{Math.round(strength.entropy)} bits</span>}
              </div>
            </div>

            {/* Presets */}
            <div className="pwgen-presets">
              <span className="pwgen-section-label">Quick Presets</span>
              <div className="pwgen-preset-list">
                {PRESETS.map((p, i) => (
                  <button key={i} className="pwgen-preset-btn" onClick={() => handlePreset(p)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Mode Toggle */}
            <div className="pwgen-mode-toggle">
              <button
                className={`pwgen-mode-btn${!passphrase ? ' active' : ''}`}
                onClick={() => setPassphrase(false)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Random
              </button>
              <button
                className={`pwgen-mode-btn${passphrase ? ' active' : ''}`}
                onClick={() => setPassphrase(true)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                </svg>
                Passphrase
              </button>
            </div>

            {/* Settings */}
            <div className="pwgen-settings">
              {!passphrase ? (
                <>
                  {/* Length Slider */}
                  <div className="pwgen-setting-row">
                    <span className="pwgen-setting-label">Length</span>
                    <div className="pwgen-slider-group">
                      <input
                        type="range"
                        min="4"
                        max="128"
                        value={length}
                        onChange={e => setLength(Number(e.target.value))}
                        className="pwgen-slider"
                      />
                      <input
                        type="number"
                        min="4"
                        max="128"
                        value={length}
                        onChange={e => setLength(Math.max(4, Math.min(128, Number(e.target.value) || 4)))}
                        className="pwgen-length-input"
                      />
                    </div>
                  </div>

                  {/* Character Options */}
                  <div className="pwgen-checkboxes">
                    {Object.entries({ uppercase: 'A-Z', lowercase: 'a-z', numbers: '0-9', symbols: '!@#$' }).map(([key, label]) => (
                      <label key={key} className="pwgen-checkbox-label">
                        <input
                          type="checkbox"
                          checked={options[key]}
                          onChange={() => setOptions(prev => ({ ...prev, [key]: !prev[key] }))}
                          className="pwgen-checkbox"
                        />
                        <span className="pwgen-checkbox-text">{label}</span>
                      </label>
                    ))}
                  </div>

                  {/* Advanced */}
                  <button className="pwgen-advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: showAdvanced ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    Advanced
                  </button>

                  {showAdvanced && (
                    <div className="pwgen-advanced">
                      <label className="pwgen-checkbox-label">
                        <input
                          type="checkbox"
                          checked={excludeAmbiguous}
                          onChange={() => setExcludeAmbiguous(!excludeAmbiguous)}
                          className="pwgen-checkbox"
                        />
                        <span className="pwgen-checkbox-text">Exclude ambiguous (0OoIl1|)</span>
                      </label>
                      <div className="pwgen-custom-symbols">
                        <span className="pwgen-setting-label">Custom symbols</span>
                        <input
                          type="text"
                          value={customSymbols}
                          onChange={e => setCustomSymbols(e.target.value)}
                          placeholder={CHARSETS.symbols}
                          className="pwgen-custom-input"
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Passphrase Settings */}
                  <div className="pwgen-setting-row">
                    <span className="pwgen-setting-label">Words</span>
                    <div className="pwgen-slider-group">
                      <input
                        type="range"
                        min="2"
                        max="10"
                        value={wordCount}
                        onChange={e => setWordCount(Number(e.target.value))}
                        className="pwgen-slider"
                      />
                      <input
                        type="number"
                        min="2"
                        max="10"
                        value={wordCount}
                        onChange={e => setWordCount(Math.max(2, Math.min(10, Number(e.target.value) || 2)))}
                        className="pwgen-length-input"
                      />
                    </div>
                  </div>
                  <div className="pwgen-setting-row">
                    <span className="pwgen-setting-label">Separator</span>
                    <div className="pwgen-separator-options">
                      {['-', '.', '_', ' ', ''].map(s => (
                        <button
                          key={s}
                          className={`pwgen-sep-btn${separator === s ? ' active' : ''}`}
                          onClick={() => setSeparator(s)}
                        >
                          {s === '' ? 'none' : s === ' ' ? '⎵' : s}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Sidebar: History */}
          <div className="pwgen-sidebar">
            <div className="pwgen-sidebar-header">
              <span className="pwgen-sidebar-title">History</span>
              {history.length > 0 && (
                <button className="pwgen-sidebar-clear" onClick={clearHistory}>Clear</button>
              )}
            </div>
            <div className="pwgen-history-list">
              {history.length === 0 ? (
                <div className="pwgen-history-empty">No passwords yet</div>
              ) : (
                history.map((h, i) => (
                  <button key={i} className="pwgen-history-item" onClick={() => handleCopy(h.password)} title="Click to copy">
                    <span className="pwgen-history-pw">{h.password.length > 28 ? h.password.slice(0, 28) + '…' : h.password}</span>
                    <span className="pwgen-history-meta">{h.password.length} chars · {new Date(h.time).toLocaleTimeString()}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PasswordGenerator;
