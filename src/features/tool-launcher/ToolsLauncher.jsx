import { useMemo } from 'react';

import { filterToolCatalog } from './dialog-state.js';
import { WEB_TOOL_CATALOG } from './toolRegistry.web.js';

function toolCode(name) {
  return name.split(/\s+/).map((word) => word[0]).join('').slice(0, 3).toUpperCase();
}

function ToolsLauncher({ open, query, onQueryChange, onClose, onOpenTool, onOpenCalendar }) {
  const tools = useMemo(() => filterToolCatalog(WEB_TOOL_CATALOG, query), [query]);
  if (!open) return null;

  const calendarVisible = 'calendar'.includes(query.trim().toLowerCase());

  return (
    <div className="split-overlay" onMouseDown={onClose}>
      <section className="split-dialog split-tools-dialog" role="dialog" aria-modal="true" aria-labelledby="split-tools-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span>TOOLKIT</span><h2 id="split-tools-title">Tools</h2></div>
          <button type="button" className="split-dialog-close" onClick={onClose} aria-label="도구 모음 닫기">Close</button>
        </header>
        <label className="split-tool-search">
          <span className="sr-only">도구 검색</span>
          <input autoFocus type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="도구 검색" />
          <small>{tools.length + (calendarVisible ? 1 : 0)} results</small>
        </label>
        <div className="split-tool-grid">
          {calendarVisible && <button type="button" onClick={onOpenCalendar}><b>CA</b><span>Calendar</span></button>}
          {tools.map((tool) => (
            <button key={tool.id} type="button" onClick={() => onOpenTool(tool.id)}>
              <b>{toolCode(tool.name)}</b><span>{tool.name}</span>
            </button>
          ))}
        </div>
        {!calendarVisible && tools.length === 0 && <p className="split-empty">검색 결과가 없습니다.</p>}
      </section>
    </div>
  );
}

export default ToolsLauncher;
