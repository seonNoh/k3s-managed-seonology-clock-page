import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { X, Check } from 'lucide-react';
import './ArchIconSearch.css';

// svg-studio 아이콘 라이브러리(클라우드/기술 아이콘 ~11,000여 개)를 clock-page API 프록시
// (/api/icons/index, /api/icons/svg?path=) 를 통해 검색·미리보기·복사·다운로드한다.
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
const PAGE_SIZE = 120;

const PROVIDER_META = {
  aws: { label: 'AWS', color: '#FF9900' },
  azure: { label: 'Azure', color: '#0078D4' },
  gcp: { label: 'GCP', color: '#4285F4' },
  ibm: { label: 'IBM', color: '#1F70C1' },
  oracle: { label: 'Oracle', color: '#F80000' },
  kubernetes: { label: 'Kubernetes', color: '#326CE5' },
  cloudflare: { label: 'Cloudflare', color: '#F38020' },
  digitalocean: { label: 'DigitalOcean', color: '#0080FF' },
  databricks: { label: 'Databricks', color: '#FF3621' },
  snowflake: { label: 'Snowflake', color: '#29B5E8' },
  devicon: { label: 'Devicon', color: '#6CC24A' },
  simpleicons: { label: 'Simple Icons', color: '#9CA3AF' },
  tabler: { label: 'Tabler', color: '#206BC4' },
};

const iconUrl = (p) => `${API_BASE}/api/icons/svg?path=${encodeURIComponent(p)}`;
const baseName = (p) => (p.split('/').pop() || 'icon').replace(/\.svg$/, '');

export default function ArchIconSearch({ isOpen, onClose }) {
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [provider, setProvider] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [copied, setCopied] = useState(false);
  const searchRef = useRef(null);

  // 카탈로그 로드 (1회)
  useEffect(() => {
    if (!isOpen || catalog) return;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/icons/index`)
      .then((r) => { if (!r.ok) throw new Error('아이콘 카탈로그를 불러올 수 없습니다'); return r.json(); })
      .then((d) => setCatalog(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isOpen, catalog]);

  const allIcons = useMemo(() => {
    if (!catalog) return [];
    const out = [];
    for (const prov of Object.keys(catalog)) {
      const arr = Array.isArray(catalog[prov]) ? catalog[prov] : [];
      for (const it of arr) out.push({ provider: prov, p: it.p, l: it.l, c: it.c });
    }
    return out;
  }, [catalog]);

  const providers = useMemo(() => {
    if (!catalog) return [];
    return Object.keys(catalog).map((k) => ({
      id: k,
      count: (catalog[k] || []).length,
      label: PROVIDER_META[k]?.label || k,
      color: PROVIDER_META[k]?.color || '#888',
    }));
  }, [catalog]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return allIcons.filter((ic) => {
      if (provider !== 'all' && ic.provider !== provider) return false;
      if (!q) return true;
      return ic.l.toLowerCase().includes(q) || (ic.c || '').toLowerCase().includes(q) || ic.provider.includes(q);
    });
  }, [allIcons, provider, query]);

  useEffect(() => { setPage(1); }, [provider, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  const copySvg = useCallback(async (p) => {
    try {
      const r = await fetch(iconUrl(p));
      const txt = await r.text();
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard 실패 무시 */ }
  }, []);

  const downloadSvg = useCallback(async (ic) => {
    const r = await fetch(iconUrl(ic.p));
    const txt = await r.text();
    const blob = new Blob([txt], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName(ic.p)}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const downloadPng = useCallback((ic, size = 256) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      canvas.toBlob((b) => {
        if (!b) return;
        const u = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = u;
        a.download = `${baseName(ic.p)}.png`;
        a.click();
        URL.revokeObjectURL(u);
      });
    };
    img.src = iconUrl(ic.p);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="archi-overlay" onClick={onClose}>
      <div className="archi-container" onClick={(e) => e.stopPropagation()}>
        <div className="archi-header">
          <div className="archi-title-row">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <h2>Icons</h2>
            <span className="archi-badge">{allIcons.length.toLocaleString()} icons</span>
          </div>
          <button className="archi-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="archi-body">
          {/* Sidebar */}
          <div className="archi-sidebar">
            <div className="archi-search-wrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                ref={searchRef}
                className="archi-search-input"
                placeholder="아이콘 검색..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && <button className="archi-search-clear" onClick={() => setQuery('')}><X size={14} /></button>}
            </div>

            <div className="archi-cat-list">
              <button className={`archi-cat-btn ${provider === 'all' ? 'active' : ''}`} onClick={() => setProvider('all')}>
                <span className="archi-cat-dot" style={{ background: '#94a3b8' }} />
                전체
                <span className="archi-cat-count">{allIcons.length.toLocaleString()}</span>
              </button>
              {providers.map((p) => (
                <button key={p.id} className={`archi-cat-btn ${provider === p.id ? 'active' : ''}`} onClick={() => setProvider(p.id)}>
                  <span className="archi-cat-dot" style={{ background: p.color }} />
                  {p.label}
                  <span className="archi-cat-count">{p.count.toLocaleString()}</span>
                </button>
              ))}
            </div>

            {selected && (
              <div className="archi-detail">
                <div className="archi-detail-preview archi-detail-preview-img">
                  <img src={iconUrl(selected.p)} alt={selected.l} />
                </div>
                <div className="archi-detail-info">
                  <span className="archi-detail-name">{selected.l}</span>
                  <span className="archi-detail-cat">{PROVIDER_META[selected.provider]?.label || selected.provider}{selected.c ? ` · ${selected.c}` : ''}</span>
                </div>
                <div className="archi-detail-actions">
                  <button className="archi-dl-btn svg" onClick={() => downloadSvg(selected)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    SVG
                  </button>
                  <button className="archi-dl-btn png" onClick={() => downloadPng(selected, 256)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    PNG
                  </button>
                  <button className={`archi-dl-btn copy ${copied ? 'copied' : ''}`} onClick={() => copySvg(selected.p)}>
                    {copied ? <Check size={14} /> : 'Copy SVG'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Main */}
          <div className="archi-main">
            <div className="archi-grid-header">
              <span className="archi-result-count">
                {loading ? '불러오는 중...' : `${filtered.length.toLocaleString()}개`}
                {query && <span className="archi-search-tag">"{query}"</span>}
              </span>
              {pageCount > 1 && (
                <div className="archi-pager">
                  <button className="archi-pager-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>이전</button>
                  <span className="archi-pager-info">{page} / {pageCount}</span>
                  <button className="archi-pager-btn" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>다음</button>
                </div>
              )}
            </div>

            {error ? (
              <div className="archi-empty">{error}</div>
            ) : loading ? (
              <div className="archi-empty">아이콘을 불러오는 중...</div>
            ) : pageItems.length === 0 ? (
              <div className="archi-empty">검색 결과가 없습니다</div>
            ) : (
              <div className="archi-grid archi-grid-md">
                {pageItems.map((ic) => (
                  <button
                    key={`${ic.provider}/${ic.p}`}
                    className={`archi-icon-card ${selected && selected.p === ic.p ? 'selected' : ''}`}
                    onClick={() => setSelected(ic)}
                    title={ic.l}
                  >
                    <span className="archi-icon-svg">
                      <img src={iconUrl(ic.p)} alt={ic.l} loading="lazy" />
                    </span>
                    <span className="archi-icon-name">{ic.l}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
