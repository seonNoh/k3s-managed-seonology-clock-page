import { useState } from 'react';
import './DnsLookup.css';

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA'];
const DNS_API = 'https://dns.google/resolve';

function DnsLookup({ isOpen, onClose }) {
  const [domain, setDomain] = useState('');
  const [selectedType, setSelectedType] = useState('A');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [history, setHistory] = useState([]);

  const lookup = async (d, type) => {
    const target = d || domain;
    if (!target.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${DNS_API}?name=${encodeURIComponent(target.trim())}&type=${type || selectedType}`);
      const data = await res.json();
      if (data.Status !== 0) {
        const statusMap = { 1: 'Format error', 2: 'Server failure', 3: 'NXDOMAIN (domain not found)', 5: 'Refused' };
        setError(statusMap[data.Status] || `DNS error (status: ${data.Status})`);
        setResults([]);
      } else {
        const answers = (data.Answer || []).map(a => ({
          name: a.name,
          type: typeNumToStr(a.type),
          ttl: a.TTL,
          data: a.data,
        }));
        setResults(answers);
        if (answers.length === 0) setError('No records found');
        // Add to history
        setHistory(prev => {
          const entry = { domain: target.trim(), type: type || selectedType, count: answers.length, time: new Date().toLocaleTimeString() };
          return [entry, ...prev.filter(h => !(h.domain === entry.domain && h.type === entry.type))].slice(0, 10);
        });
      }
    } catch (e) {
      setError(`Lookup failed: ${e.message}`);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  function typeNumToStr(num) {
    const map = { 1: 'A', 28: 'AAAA', 5: 'CNAME', 15: 'MX', 2: 'NS', 16: 'TXT', 6: 'SOA' };
    return map[num] || String(num);
  }

  const handleCopy = async (text, key) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1200); } catch {}
  };

  const lookupAll = async () => {
    if (!domain.trim()) return;
    setLoading(true);
    setError('');
    const allResults = [];
    for (const type of RECORD_TYPES) {
      try {
        const res = await fetch(`${DNS_API}?name=${encodeURIComponent(domain.trim())}&type=${type}`);
        const data = await res.json();
        if (data.Answer) {
          data.Answer.forEach(a => allResults.push({ name: a.name, type: typeNumToStr(a.type), ttl: a.TTL, data: a.data }));
        }
      } catch {}
    }
    setResults(allResults);
    if (allResults.length === 0) setError('No records found');
    setLoading(false);
  };

  const formatTTL = (sec) => {
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
    return `${Math.floor(sec / 86400)}d`;
  };

  if (!isOpen) return null;

  return (
    <div className="dns-overlay" onClick={onClose}>
      <div className="dns-modal" onClick={e => e.stopPropagation()}>
        <div className="dns-header">
          <div className="dns-header-left">
            <svg className="dns-header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span className="dns-header-title">DNS Lookup</span>
          </div>
          <button className="dns-close-btn" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="dns-toolbar">
          <div className="dns-input-row">
            <input
              className="dns-input"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookup()}
              placeholder="Enter domain (e.g. seonology.com)..."
              spellCheck={false}
            />
            <div className="dns-type-select">
              {RECORD_TYPES.map(t => (
                <button key={t} className={`dns-type-btn${selectedType === t ? ' active' : ''}`} onClick={() => setSelectedType(t)}>{t}</button>
              ))}
            </div>
          </div>
          <div className="dns-action-row">
            <button className="dns-lookup-btn" onClick={() => lookup()} disabled={loading || !domain.trim()}>
              {loading ? 'Looking up...' : 'Lookup'}
            </button>
            <button className="dns-all-btn" onClick={lookupAll} disabled={loading || !domain.trim()}>All Types</button>
          </div>
        </div>

        {error && <div className="dns-error">{error}</div>}

        <div className="dns-body">
          {results.length > 0 && (
            <div className="dns-results">
              <div className="dns-results-header">
                <span className="dns-results-label">RESULTS ({results.length})</span>
              </div>
              <div className="dns-results-table">
                <div className="dns-table-head">
                  <span className="dns-col-type">Type</span>
                  <span className="dns-col-name">Name</span>
                  <span className="dns-col-data">Data</span>
                  <span className="dns-col-ttl">TTL</span>
                </div>
                {results.map((r, i) => (
                  <div key={i} className="dns-table-row" onClick={() => handleCopy(r.data, `r${i}`)}>
                    <span className={`dns-col-type dns-type-badge dns-type-${r.type.toLowerCase()}`}>{r.type}</span>
                    <span className="dns-col-name">{r.name}</span>
                    <span className="dns-col-data">{r.data}</span>
                    <span className="dns-col-ttl">{formatTTL(r.ttl)}</span>
                    {copied === `r${i}` && <span className="dns-copied">Copied</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {history.length > 0 && (
            <div className="dns-history">
              <span className="dns-results-label">HISTORY</span>
              <div className="dns-history-list">
                {history.map((h, i) => (
                  <button key={i} className="dns-history-item" onClick={() => { setDomain(h.domain); setSelectedType(h.type); lookup(h.domain, h.type); }}>
                    <span className="dns-history-domain">{h.domain}</span>
                    <span className="dns-history-type">{h.type}</span>
                    <span className="dns-history-time">{h.time}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="dns-stats">
          <span>Provider: Google DNS (dns.google)</span>
          <span>{results.length} record{results.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}

export default DnsLookup;
