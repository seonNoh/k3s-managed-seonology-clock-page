import { useState, useEffect, useRef, useCallback } from 'react';
import './RepoCatalog.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

function timeAgo(iso) {
  if (!iso) return '';
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 2592000) return `${Math.floor(sec / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

function RepoCatalog({ isOpen, onClose }) {
  const [snapshot, setSnapshot] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const esRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/github/repos`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setSnapshot(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 패널이 열리면 즉시 스냅샷 로드 + SSE 구독. 닫히면 연결 정리.
  useEffect(() => {
    if (!isOpen) return undefined;
    load();
    const es = new EventSource(`${API_BASE}/api/github/repos/stream`);
    esRef.current = es;
    es.addEventListener('catalog', (ev) => {
      try { setSnapshot(JSON.parse(ev.data)); setLive(true); } catch { /* ignore */ }
    });
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    return () => { es.close(); esRef.current = null; setLive(false); };
  }, [isOpen, load]);

  useEffect(() => {
    if (snapshot?.groups?.length && !activeGroup) setActiveGroup(snapshot.groups[0].key);
  }, [snapshot, activeGroup]);

  const refresh = async () => {
    setLoading(true);
    try { await fetch(`${API_BASE}/api/github/repos/refresh`, { method: 'POST' }); } catch { /* ignore */ }
    setLoading(false);
  };

  if (!isOpen) return null;

  const groups = snapshot?.groups || [];
  const current = groups.find(g => g.key === activeGroup) || groups[0] || null;

  return (
    <div className="repocat-overlay" onClick={onClose}>
      <div className="repocat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="repocat-header">
          <div className="repocat-header-left">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3h7v7H3z" /><path d="M14 3h7v7h-7z" /><path d="M14 14h7v7h-7z" /><path d="M3 14h7v7H3z" />
            </svg>
            <span className="repocat-title">Repositories</span>
            {snapshot && <span className="repocat-count">{snapshot.count}</span>}
            <span className={`repocat-live${live ? ' on' : ''}`} title={live ? 'live (SSE)' : 'offline'} />
            {snapshot?.stale && <span className="repocat-stale">stale</span>}
          </div>
          <div className="repocat-header-actions">
            <button className="repocat-btn" onClick={refresh} disabled={loading} title="Refresh now">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
            <button className="repocat-btn" onClick={onClose} title="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {(snapshot?.error || error) && <div className="repocat-error">{snapshot?.error || error}</div>}
        {loading && !snapshot && <div className="repocat-loading">Loading…</div>}

        <div className="repocat-tabs">
          {groups.map(g => (
            <button
              key={g.key}
              className={`repocat-tab${current && current.key === g.key ? ' active' : ''}`}
              onClick={() => setActiveGroup(g.key)}
            >
              {g.label}<span className="repocat-tab-n">{g.count}</span>
            </button>
          ))}
        </div>

        <div className="repocat-body">
          {current && current.topics.map(t => (
            <div key={t.key} className="repocat-section">
              <div className="repocat-section-head">
                <span className="repocat-section-name">{t.label}</span>
                <span className="repocat-section-n">{t.repos.length}</span>
              </div>
              <div className="repocat-grid">
                {t.repos.map(r => (
                  <a key={r.name} className="repocat-card" href={r.htmlUrl} target="_blank" rel="noreferrer">
                    <div className="repocat-card-top">
                      <span className="repocat-card-name">{r.name}</span>
                      {r.private && <span className="repocat-badge priv">private</span>}
                      {r.fork && <span className="repocat-badge fork">fork</span>}
                    </div>
                    {r.description && <div className="repocat-card-desc">{r.description}</div>}
                    <div className="repocat-card-meta">
                      {r.language && <span className="repocat-lang">{r.language}</span>}
                      <span className="repocat-when">{timeAgo(r.pushedAt)}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
          {!current && !loading && <div className="repocat-empty">표시할 레포가 없습니다.</div>}
        </div>
      </div>
    </div>
  );
}

export default RepoCatalog;
