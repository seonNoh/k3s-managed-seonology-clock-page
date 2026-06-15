import { useState, useCallback } from 'react';
import './EpochConverter.css';

function EpochConverter({ isOpen, onClose }) {
  const [epochInput, setEpochInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [epochResult, setEpochResult] = useState(null);
  const [dateResult, setDateResult] = useState(null);
  const [epochError, setEpochError] = useState('');
  const [dateError, setDateError] = useState('');
  const [copied, setCopied] = useState('');
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const refreshNow = () => setNow(Math.floor(Date.now() / 1000));

  const formatDate = (d) => {
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const formatUTC = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
  };

  const getRelative = (ts) => {
    const diff = Math.floor(Date.now() / 1000) - ts;
    const abs = Math.abs(diff);
    const suffix = diff > 0 ? 'ago' : 'from now';
    if (abs < 60) return `${abs}s ${suffix}`;
    if (abs < 3600) return `${Math.floor(abs / 60)}m ${suffix}`;
    if (abs < 86400) return `${Math.floor(abs / 3600)}h ${suffix}`;
    if (abs < 2592000) return `${Math.floor(abs / 86400)}d ${suffix}`;
    if (abs < 31536000) return `${Math.floor(abs / 2592000)}mo ${suffix}`;
    return `${Math.floor(abs / 31536000)}y ${suffix}`;
  };

  const handleEpochConvert = useCallback((val) => {
    setEpochInput(val);
    setEpochError('');
    if (!val.trim()) { setEpochResult(null); return; }
    const num = Number(val.trim());
    if (isNaN(num)) { setEpochError('Invalid number'); setEpochResult(null); return; }
    // Auto-detect seconds vs milliseconds
    const ts = Math.abs(num) > 1e12 ? num : num * 1000;
    const d = new Date(ts);
    if (isNaN(d.getTime())) { setEpochError('Invalid timestamp'); setEpochResult(null); return; }
    const epochSec = Math.floor(ts / 1000);
    setEpochResult({
      local: formatDate(d),
      utc: formatUTC(d),
      iso: d.toISOString(),
      relative: getRelative(epochSec),
      day: d.toLocaleDateString('en-US', { weekday: 'long' }),
      ms: ts,
      sec: epochSec,
    });
  }, []);

  const handleDateConvert = useCallback((val) => {
    setDateInput(val);
    setDateError('');
    if (!val.trim()) { setDateResult(null); return; }
    const d = new Date(val.trim());
    if (isNaN(d.getTime())) { setDateError('Invalid date format'); setDateResult(null); return; }
    const sec = Math.floor(d.getTime() / 1000);
    setDateResult({
      epoch: sec,
      epochMs: d.getTime(),
      local: formatDate(d),
      utc: formatUTC(d),
      iso: d.toISOString(),
      relative: getRelative(sec),
      day: d.toLocaleDateString('en-US', { weekday: 'long' }),
    });
  }, []);

  const handleCopy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(String(text));
      setCopied(key);
      setTimeout(() => setCopied(''), 1200);
    } catch {}
  };

  const useNow = () => {
    const n = Math.floor(Date.now() / 1000);
    setEpochInput(String(n));
    handleEpochConvert(String(n));
    refreshNow();
  };

  if (!isOpen) return null;

  return (
    <div className="ep-overlay" onClick={onClose}>
      <div className="ep-modal" onClick={e => e.stopPropagation()}>
        <div className="ep-header">
          <div className="ep-header-left">
            <svg className="ep-header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="ep-header-title">Epoch / Timestamp Converter</span>
          </div>
          <button className="ep-close-btn" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="ep-now-bar">
          <span className="ep-now-label">Current Epoch:</span>
          <span className="ep-now-value" onClick={() => handleCopy(now, 'now')}>{now}</span>
          {copied === 'now' && <span className="ep-copied">Copied</span>}
          <button className="ep-refresh-btn" onClick={useNow}>Use Now</button>
        </div>

        <div className="ep-body">
          <div className="ep-section">
            <div className="ep-section-header">
              <span className="ep-section-label">EPOCH TO DATE</span>
            </div>
            <div className="ep-input-row">
              <input
                className="ep-input"
                value={epochInput}
                onChange={e => handleEpochConvert(e.target.value)}
                placeholder="Enter epoch timestamp (seconds or milliseconds)..."
                spellCheck={false}
              />
            </div>
            {epochError && <div className="ep-error">{epochError}</div>}
            {epochResult && (
              <div className="ep-result-grid">
                {[
                  ['Local', epochResult.local],
                  ['UTC', epochResult.utc],
                  ['ISO 8601', epochResult.iso],
                  ['Day', epochResult.day],
                  ['Relative', epochResult.relative],
                  ['Seconds', epochResult.sec],
                  ['Milliseconds', epochResult.ms],
                ].map(([label, val], i) => (
                  <div key={i} className="ep-result-row" onClick={() => handleCopy(val, `e${i}`)}>
                    <span className="ep-result-label">{label}</span>
                    <span className="ep-result-value">{val}</span>
                    {copied === `e${i}` && <span className="ep-copied">Copied</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ep-divider" />

          <div className="ep-section">
            <div className="ep-section-header">
              <span className="ep-section-label">DATE TO EPOCH</span>
            </div>
            <div className="ep-input-row">
              <input
                className="ep-input"
                value={dateInput}
                onChange={e => handleDateConvert(e.target.value)}
                placeholder="Enter date (e.g. 2025-01-15 09:30:00, Jan 15 2025)..."
                spellCheck={false}
              />
            </div>
            {dateError && <div className="ep-error">{dateError}</div>}
            {dateResult && (
              <div className="ep-result-grid">
                {[
                  ['Epoch (sec)', dateResult.epoch],
                  ['Epoch (ms)', dateResult.epochMs],
                  ['Local', dateResult.local],
                  ['UTC', dateResult.utc],
                  ['ISO 8601', dateResult.iso],
                  ['Day', dateResult.day],
                  ['Relative', dateResult.relative],
                ].map(([label, val], i) => (
                  <div key={i} className="ep-result-row" onClick={() => handleCopy(val, `d${i}`)}>
                    <span className="ep-result-label">{label}</span>
                    <span className="ep-result-value">{val}</span>
                    {copied === `d${i}` && <span className="ep-copied">Copied</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ep-stats">
          <span>Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
          <span>Offset: UTC{new Date().getTimezoneOffset() > 0 ? '-' : '+'}{String(Math.abs(Math.floor(new Date().getTimezoneOffset() / 60))).padStart(2, '0')}:{String(Math.abs(new Date().getTimezoneOffset() % 60)).padStart(2, '0')}</span>
        </div>
      </div>
    </div>
  );
}

export default EpochConverter;
