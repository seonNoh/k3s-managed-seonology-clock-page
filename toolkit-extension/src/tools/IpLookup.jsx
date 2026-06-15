import { useState, useCallback, useEffect } from 'react';
import './IpLookup.css';

const FIELD_LABELS = {
  query: 'IP Address',
  country: 'Country',
  countryCode: 'Country Code',
  region: 'Region',
  regionName: 'Region Name',
  city: 'City',
  zip: 'ZIP Code',
  lat: 'Latitude',
  lon: 'Longitude',
  timezone: 'Timezone',
  isp: 'ISP',
  org: 'Organization',
  as: 'AS Number',
  mobile: 'Mobile',
  proxy: 'Proxy/VPN',
  hosting: 'Hosting/DC',
};

const FIELD_ORDER = ['query', 'country', 'countryCode', 'regionName', 'city', 'zip', 'lat', 'lon', 'timezone', 'isp', 'org', 'as', 'mobile', 'proxy', 'hosting'];

function IpLookup({ isOpen, onClose }) {
  const [searchIp, setSearchIp] = useState('');
  const [result, setResult] = useState(null);
  const [myIp, setMyIp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ip-lookup-history') || '[]'); } catch { return []; }
  });

  // Fetch own IP on first open
  useEffect(() => {
    if (isOpen && !myIp) {
      fetchIp('');
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchIp = useCallback(async (ip) => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const target = ip.trim() || '';
      // ip-api.com — free, no key, returns geolocation
      // Note: HTTPS requires pro. Using HTTP for free tier; fallback to ipapi.co
      const url = target
        ? `https://ipapi.co/${target}/json/`
        : `https://ipapi.co/json/`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.error) {
        throw new Error(data.reason || data.message || 'Lookup failed');
      }

      // Normalize response to common format
      const normalized = {
        query: data.ip,
        country: data.country_name,
        countryCode: data.country_code,
        region: data.region_code,
        regionName: data.region,
        city: data.city,
        zip: data.postal,
        lat: data.latitude,
        lon: data.longitude,
        timezone: data.timezone,
        isp: data.org,
        org: data.org,
        as: data.asn,
        mobile: false,
        proxy: false,
        hosting: false,
      };

      setResult(normalized);

      if (!target) {
        setMyIp(normalized.query);
      }

      // Add to history
      if (normalized.query) {
        setHistory(prev => {
          const filtered = prev.filter(h => h.ip !== normalized.query);
          const next = [{ ip: normalized.query, country: normalized.country, city: normalized.city, time: Date.now() }, ...filtered].slice(0, 10);
          localStorage.setItem('ip-lookup-history', JSON.stringify(next));
          return next;
        });
      }
    } catch (e) {
      setError(e.message || 'Lookup failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchIp.trim()) fetchIp(searchIp.trim());
  };

  const handleMyIp = () => {
    setSearchIp('');
    fetchIp('');
  };

  const handleHistoryClick = (ip) => {
    setSearchIp(ip);
    fetchIp(ip);
  };

  const handleCopy = async (key, val) => {
    try {
      await navigator.clipboard.writeText(String(val));
      setCopied(key);
      setTimeout(() => setCopied(''), 1200);
    } catch { /* denied */ }
  };

  const handleCopyAll = async () => {
    if (!result) return;
    const text = FIELD_ORDER.map(k => `${FIELD_LABELS[k]}: ${result[k] ?? '—'}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied('__all__');
      setTimeout(() => setCopied(''), 1200);
    } catch { /* denied */ }
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('ip-lookup-history');
  };

  if (!isOpen) return null;

  return (
    <div className="ip-overlay" onClick={onClose}>
      <div className="ip-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ip-header">
          <div className="ip-header-left">
            <svg className="ip-header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span className="ip-header-title">IP Address Lookup</span>
            {myIp && <span className="ip-header-badge">My IP: {myIp}</span>}
          </div>
          <button className="ip-close-btn" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Search Bar */}
        <form className="ip-search" onSubmit={handleSearch}>
          <div className="ip-search-box">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="ip-search-input"
              value={searchIp}
              onChange={e => setSearchIp(e.target.value)}
              placeholder="Enter IP address (e.g. 8.8.8.8) or domain..."
              autoFocus
            />
            {searchIp && (
              <button type="button" className="ip-search-clear" onClick={() => setSearchIp('')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <button type="submit" className="ip-search-btn" disabled={loading}>
            {loading ? (
              <span className="ip-spinner" />
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            )}
            Lookup
          </button>
          <button type="button" className="ip-my-btn" onClick={handleMyIp} disabled={loading}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            My IP
          </button>
        </form>

        {/* Body */}
        <div className="ip-body">
          {/* Result */}
          <div className="ip-result-area">
            {error && (
              <div className="ip-error">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                {error}
              </div>
            )}

            {loading && !result && (
              <div className="ip-loading">
                <span className="ip-spinner large" />
                <span>Looking up IP information...</span>
              </div>
            )}

            {result && (
              <>
                {/* Map Link */}
                {result.lat && result.lon && (
                  <a className="ip-map-link" href={`https://www.google.com/maps/@${result.lat},${result.lon},12z`} target="_blank" rel="noopener noreferrer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                    Open in Google Maps ({result.lat}, {result.lon})
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                )}

                {/* Data Table */}
                <div className="ip-table">
                  <div className="ip-table-header">
                    <span>IP Information</span>
                    <button className={`ip-copy-all${copied === '__all__' ? ' copied' : ''}`} onClick={handleCopyAll}>
                      {copied === '__all__' ? (
                        <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg> Copied</>
                      ) : (
                        <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg> Copy All</>
                      )}
                    </button>
                  </div>
                  {FIELD_ORDER.map(key => {
                    const val = result[key];
                    if (val === undefined || val === null) return null;
                    const display = typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val);
                    return (
                      <div key={key} className="ip-row" onClick={() => handleCopy(key, display)}>
                        <span className="ip-row-label">{FIELD_LABELS[key]}</span>
                        <span className="ip-row-value">
                          {display}
                          {copied === key && <span className="ip-row-copied">Copied!</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {!result && !loading && !error && (
              <div className="ip-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.2">
                  <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <span>Search an IP address to see its information</span>
              </div>
            )}
          </div>

          {/* Sidebar: History */}
          <div className="ip-sidebar">
            <div className="ip-sidebar-header">
              <span className="ip-sidebar-title">History</span>
              {history.length > 0 && (
                <button className="ip-sidebar-clear" onClick={clearHistory}>Clear</button>
              )}
            </div>
            <div className="ip-history-list">
              {history.length === 0 ? (
                <div className="ip-history-empty">No lookups yet</div>
              ) : (
                history.map((h, i) => (
                  <button key={i} className="ip-history-item" onClick={() => handleHistoryClick(h.ip)}>
                    <span className="ip-history-ip">{h.ip}</span>
                    <span className="ip-history-meta">{h.city && h.country ? `${h.city}, ${h.country}` : h.country || '—'}</span>
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

export default IpLookup;
