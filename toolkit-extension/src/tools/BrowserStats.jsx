import { useState, useEffect } from 'react';
import './BrowserStats.css';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

function BrowserStats() {
  const [stats, setStats] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/browser-stats`);
        const data = await res.json();
        if (data.available) {
          setStats(data);
        } else {
          setStats(null);
        }
      } catch {
        setStats(null);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!expanded) return;
    const handleClick = (e) => {
      if (!e.target.closest('.browser-stats-wrapper')) {
        setExpanded(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [expanded]);

  if (!stats) return null;

  const { tabs, windows } = stats;

  const handleTabClick = (tab, windowId) => {
    // Send message to content script → extension → activate tab
    window.postMessage({
      type: 'seonology-activate-tab',
      tabId: tab.id,
      windowId: windowId,
    }, '*');
  };

  // Extract domain from URL for display
  const getDomain = (url) => {
    try {
      const u = new URL(url);
      return u.hostname.replace('www.', '');
    } catch {
      return '';
    }
  };

  // Get favicon URL or fallback
  const getFavicon = (tab) => {
    if (tab.favIconUrl && !tab.favIconUrl.startsWith('chrome://')) {
      return tab.favIconUrl;
    }
    return null;
  };

  return (
    <div className="browser-stats-wrapper">
      <div className="browser-stats-mini" onClick={() => setExpanded(!expanded)}>
        <span className="stats-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </span>
        <span className="stats-tabs">{tabs.total}</span>
        <span className="stats-label">tabs</span>
        <span className="stats-sep">·</span>
        <span className="stats-windows">{windows}</span>
        <span className="stats-label">win</span>
      </div>

      {expanded && (
        <div className="browser-stats-detail">
          <div className="stats-detail-header">
            <span>Open Tabs</span>
            <span className="stats-detail-count">{tabs.total}</span>
          </div>

          <div className="stats-tab-list">
            {tabs.byWindow && tabs.byWindow.map((win, winIdx) => (
              <div key={win.windowId} className="stats-window-group">
                {tabs.byWindow.length > 1 && (
                  <div className="stats-window-label">
                    <span className="stats-window-icon">◻</span>
                    Window {winIdx + 1}
                    <span className="stats-window-badge">{win.count}</span>
                  </div>
                )}
                {win.tabs && win.tabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={`stats-tab-row ${tab.active ? 'active' : ''}`}
                    onClick={() => handleTabClick(tab, win.windowId)}
                    title={tab.url}
                  >
                    <span className="stats-tab-favicon">
                      {getFavicon(tab) ? (
                        <img
                          src={getFavicon(tab)}
                          alt=""
                          width="14"
                          height="14"
                          onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
                        />
                      ) : null}
                      <span className="stats-tab-favicon-fallback" style={{ display: getFavicon(tab) ? 'none' : 'block' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="2" y1="12" x2="22" y2="12" />
                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        </svg>
                      </span>
                    </span>
                    <span className="stats-tab-title">{tab.title}</span>
                    <span className="stats-tab-domain">{getDomain(tab.url)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default BrowserStats;
