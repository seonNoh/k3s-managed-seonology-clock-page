import React from 'react';
import './toolhost.css';
import './embed.css';

export function ToolHost({ title, onClose, variant = 'embed', children }) {
  // variant: 'embed'(popup) | 'sheet'(newtab 슬라이드) | 'modal'(newtab 중앙)
  return (
    <div className={`toolhost toolhost-${variant}`}>
      {title && (
        <header className="toolhost-header">
          <button className="toolhost-back" onClick={onClose} aria-label="Back">‹</button>
          <span className="toolhost-title">{title}</span>
        </header>
      )}
      <div className="toolhost-body toolkit-embed">{children}</div>
    </div>
  );
}
