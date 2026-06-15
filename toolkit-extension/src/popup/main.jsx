import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/theme.css';
import './popup.css';
import { TOOLS, CATEGORIES, byId } from '../shared/registry';
import { getPins, setPins, getRecent, pushRecent } from '../shared/storage';
import { ToolHost } from '../shared/ui/ToolHost';
import { ToolIcon } from '../shared/ui/ToolIcon';

function PopupApp() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('tools'); // tools, infra, live
  const [pins, setPinsState] = useState([]);
  const [recent, setRecentState] = useState([]);
  const [activeTool, setActiveTool] = useState(null);

  useEffect(() => {
    getPins().then(setPinsState);
    getRecent().then(setRecentState);
  }, []);

  const handlePin = async (e, id) => {
    e.stopPropagation();
    const newPins = pins.includes(id) ? pins.filter(p => p !== id) : [...pins, id];
    setPinsState(newPins);
    await setPins(newPins);
  };

  const handleOpenTool = async (tool) => {
    await pushRecent(tool.id);
    const newRecent = await getRecent();
    setRecentState(newRecent);

    if (tool.weight === 'heavy') {
      // open in new tab
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.create({ url: `chrome-extension://${chrome.runtime.id}/newtab.html?tool=${tool.id}` });
      } else {
        window.open(`/newtab.html?tool=${tool.id}`, '_blank');
      }
    } else {
      setActiveTool(tool);
    }
  };

  const filteredTools = useMemo(() => {
    if (!search) return TOOLS.filter(t => t.category === activeTab && t.surfaces.includes('popup'));
    const lower = search.toLowerCase();
    return TOOLS.filter(t => 
      t.surfaces.includes('popup') && 
      (t.name.toLowerCase().includes(lower) || (t.aliases || []).some(a => a.toLowerCase().includes(lower)))
    );
  }, [search, activeTab]);

  const pinnedTools = useMemo(() => pins.map(byId).filter(Boolean), [pins]);
  const recentTools = useMemo(() => recent.map(byId).filter(Boolean), [recent]);

  if (activeTool) {
    const Component = React.lazy(activeTool.load);
    return (
      <div className="popup-container">
        <div className="popup-embed-container">
          <Suspense fallback={<div style={{padding: '20px'}}>Loading...</div>}>
            <ToolHost title={activeTool.name} onClose={() => setActiveTool(null)} variant="embed">
              <Component isOpen={true} onClose={() => setActiveTool(null)} />
            </ToolHost>
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <div className="popup-header">
        <div className="popup-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          Seonology Toolkit
        </div>
        <div className="popup-header-actions">
          <button className="popup-icon-btn" title="Open Dashboard" onClick={() => {
            if (typeof chrome !== 'undefined' && chrome.tabs) {
              chrome.tabs.create({ url: `chrome-extension://${chrome.runtime.id}/newtab.html` });
            } else {
              window.open('/newtab.html', '_blank');
            }
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </button>
        </div>
      </div>

      <div className="popup-search-bar">
        <input 
          type="text" 
          className="popup-search-input" 
          placeholder="Search tools... (focus with /)" 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {!search && (
        <div className="popup-tabs">
          <button className={`popup-tab ${activeTab === 'tools' ? 'active' : ''}`} onClick={() => setActiveTab('tools')}>Tools</button>
          <button className={`popup-tab ${activeTab === 'infra' ? 'active' : ''}`} onClick={() => setActiveTab('infra')}>Infra</button>
          <button className={`popup-tab ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}>Live</button>
        </div>
      )}

      <div className="popup-content">
        {!search && pinnedTools.length > 0 && (
          <div>
            <div className="popup-section-title">★ PINNED</div>
            <div className="tool-grid">
              {pinnedTools.map(t => (
                <div key={t.id} className="tool-card" onClick={() => handleOpenTool(t)}>
                  <div className="tool-card-icon"><ToolIcon name={t.icon} /></div>
                  <div className="tool-card-name">{t.name}</div>
                  <button className={`tool-card-pin pinned`} onClick={(e) => handlePin(e, t.id)}>★</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!search && recentTools.length > 0 && (
          <div>
            <div className="popup-section-title">◷ RECENT</div>
            <div className="recent-chips">
              {recentTools.map(t => (
                <div key={t.id} className="recent-chip" onClick={() => handleOpenTool(t)}>
                  <ToolIcon name={t.icon} size={14} />
                  {t.name}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="popup-section-title">{search ? 'SEARCH RESULTS' : 'ALL TOOLS'}</div>
          <div className="tool-grid">
            {filteredTools.map(t => (
              <div key={t.id} className="tool-card" onClick={() => handleOpenTool(t)}>
                <div className="tool-card-icon"><ToolIcon name={t.icon} /></div>
                <div className="tool-card-name">{t.name}</div>
                <button className={`tool-card-pin ${pins.includes(t.id) ? 'pinned' : ''}`} onClick={(e) => handlePin(e, t.id)}>
                  {pins.includes(t.id) ? '★' : '☆'}
                </button>
              </div>
            ))}
            {filteredTools.length === 0 && (
              <div style={{gridColumn: '1 / -1', color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', padding: '20px'}}>No tools found.</div>
            )}
          </div>
        </div>
      </div>

      <div className="popup-footer">
        <span>Seonology Toolkit</span>
        <span>Context Menu: <span style={{color: 'var(--accent-primary)'}}>ON</span></span>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>
);
