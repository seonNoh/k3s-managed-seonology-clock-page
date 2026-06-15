import React, { useState, Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/theme.css';
import './newtab.css';
import { TOOLS, CATEGORIES, bySurface } from '../shared/registry';
import { ToolHost } from '../shared/ui/ToolHost';
import { ToolIcon } from '../shared/ui/ToolIcon';
import Clock from '../tools/Clock';

function NewTabApp() {
  const [activeTool, setActiveTool] = useState(null);

  // Handle ?tool=id from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const toolId = params.get('tool');
    if (toolId) {
      const tool = TOOLS.find(t => t.id === toolId);
      if (tool) setActiveTool(tool);
    }
  }, []);

  const handleOpenTool = (tool) => {
    setActiveTool(tool);
  };

  const handleSearch = (e) => {
    if (e.key === 'Enter' && e.target.value) {
      window.location.href = `https://www.google.com/search?q=${encodeURIComponent(e.target.value)}`;
    }
  };

  const dockTools = bySurface('newtab').filter(t => t.id !== 'clock');
  const toolsByCategory = {
    tools: dockTools.filter(t => t.category === 'tools'),
    infra: dockTools.filter(t => t.category === 'infra'),
    live: dockTools.filter(t => t.category === 'live'),
  };

  return (
    <div className="newtab-container">
      {/* Header */}
      <div className="newtab-header">
        <div className="newtab-title">SEONOLOGY</div>
        <div className="newtab-widgets">
          {/* Weather and Exchange Placeholders */}
          <div style={{color: 'var(--text-muted)'}}>☀ Weather Widget</div>
          <div style={{color: 'var(--text-muted)'}}>₩ Exchange Widget</div>
        </div>
      </div>

      {/* Center */}
      <div className="newtab-center">
        <div className="newtab-clock-wrapper">
          <Clock />
        </div>
        
        <div className="newtab-search">
          <svg className="newtab-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input 
            type="text" 
            className="newtab-search-input" 
            placeholder="Search Google..." 
            onKeyDown={handleSearch}
          />
        </div>
      </div>

      {/* Dock */}
      <div className="newtab-dock">
        {Object.entries(toolsByCategory).map(([cat, tools]) => (
          <div key={cat} className="dock-category">
            <div className="dock-category-title">{CATEGORIES[cat]}</div>
            <div className="dock-items">
              {tools.map(t => (
                <div 
                  key={t.id} 
                  className="dock-item" 
                  title={t.name}
                  onClick={() => handleOpenTool(t)}
                >
                  <ToolIcon name={t.icon} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Tool Modal Overlay */}
      {activeTool && (
        <div className="newtab-modal-overlay" onClick={() => setActiveTool(null)}>
          <div className="newtab-modal-content" onClick={e => e.stopPropagation()}>
            <Suspense fallback={<div style={{padding: '40px', textAlign: 'center'}}>Loading {activeTool.name}...</div>}>
              <ToolHost 
                title={activeTool.name} 
                onClose={() => setActiveTool(null)} 
                variant="modal"
              >
                {React.createElement(React.lazy(activeTool.load), { isOpen: true, onClose: () => setActiveTool(null) })}
              </ToolHost>
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NewTabApp />
  </React.StrictMode>
);
