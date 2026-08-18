export function ToolIcon({ name, size = 22 }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  switch (name) {
    case 'json': return <svg {...props}><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/></svg>;
    case 'base64': return <svg {...props}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20M8 14h2M14 14h2"/></svg>;
    case 'epoch': case 'cron': case 'speedtest': return <svg {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
    case 'regex': return <svg {...props}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
    case 'subnet': case 'infra': return <svg {...props}><rect x="2" y="14" width="8" height="8" rx="2"/><rect x="14" y="14" width="8" height="8" rx="2"/><path d="M6 14V10a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/><rect x="10" y="2" width="4" height="6" rx="1"/></svg>;
    case 'password': return <svg {...props}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
    case 'rbac': return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-5"/></svg>;
    case 'dns': case 'ip': return <svg {...props}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>;
    case 'notes': case 'markdown': case 'textcounter': case 'excel': return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h8M8 17h6"/></svg>;
    case 'chat': return <svg {...props}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
    case 'calendar': return <svg {...props}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>;
    case 'gdrive': case 'onedrive': case 'nas': return <svg {...props}><path d="M4 16.5A4.5 4.5 0 0 1 8.5 12 6 6 0 0 1 20 14a4 4 0 0 1 0 8H6a4 4 0 0 1-2-7.5"/></svg>;
    case 'repos': case 'archicon': return <svg {...props}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
    case 'mermaid': case 'cicd': return <svg {...props}><circle cx="5" cy="5" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="19" r="2"/><path d="M7 5h5a5 5 0 0 1 5 5M7 19h5a5 5 0 0 0 5-5"/></svg>;
    default: return <svg {...props}><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12h8M12 8v8"/></svg>;
  }
}
