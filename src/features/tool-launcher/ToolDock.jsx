const DOCK_TOOLS = Object.freeze([
  { id: 'infra', code: 'IF', label: 'Infra' },
  { id: 'repos', code: 'RP', label: 'Repos' },
  { id: 'nas', code: 'NS', label: 'NAS' },
  { id: 'gdrive', code: 'GD', label: 'GDrive' },
  { id: 'onedrive', code: 'OD', label: 'OneDrive' },
]);

function ToolDock({ activeToolId, onOpenTool, onOpenTools, onOpenEffects }) {
  return (
    <aside className="split-ops-zone" aria-label="운영 도구">
      <header><span>OPS / TOOLKIT</span><b>ONLINE</b></header>
      <div className="split-ops-list">
        {DOCK_TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            aria-pressed={activeToolId === tool.id}
            onClick={() => onOpenTool(tool.id)}
          >
            <b>{tool.code}</b><span>{tool.label}</span>
          </button>
        ))}
        <button type="button" aria-label="도구 모음 열기" onClick={onOpenTools}><b>+23</b><span>Tools</span></button>
        <button type="button" aria-label="효과 설정 열기" onClick={onOpenEffects}><b>FX</b><span>Effects</span></button>
      </div>
    </aside>
  );
}

export default ToolDock;
