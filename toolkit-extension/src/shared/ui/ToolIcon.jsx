import React from 'react';

export function ToolIcon({ name, size = 22 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
              stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'json':  return (<svg {...p}><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/></svg>);
    case 'b64':   return (<svg {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 9.5h20"/></svg>);
    case 'epoch': return (<svg {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>);
    case 'regex': return (<svg {...p}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>);
    case 'cidr':  return (<svg {...p}><rect x="2" y="14" width="8" height="8" rx="2"/><rect x="14" y="14" width="8" height="8" rx="2"/><path d="M6 14V10a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/><rect x="10" y="2" width="4" height="6" rx="1"/></svg>);
    case 'slo':   return (<svg {...p}><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>);
    case 'cron':  return (<svg {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 15 15"/></svg>);
    case 'pw':    return (<svg {...p}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>);
    case 'unit':  return (<svg {...p}><path d="M17 3v18"/><path d="M3 17h18"/><path d="M7 3v18"/><path d="M3 7h18"/></svg>);
    case 'color': return (<svg {...p}><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>);
    case 'rbac':  return (<svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
    case 'tf':    return (<svg {...p}><path d="M2 12l5 3v-6L2 6z"/><path d="M8 16l5 3v-6L8 10z"/><path d="M14 12l5 3v-6l-5-3z"/></svg>);
    case 'cicd':  return (<svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>);
    case 'gl2gh': return (<svg {...p}><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>);
    case 'xls':   return (<svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>);
    case 'arch':  return (<svg {...p}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>);
    case 'dns':   return (<svg {...p}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>);
    case 'ip':    return (<svg {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>);
    case 'mermaid': return (<svg {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>);
    case 'weather': return (<svg {...p}><path d="M17.5 19H9a7 7 0 1 1 6.71-5h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>);
    case 'fx':    return (<svg {...p}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>);
    case 'history': return (<svg {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 15 15"/></svg>);
    case 'speed': return (<svg {...p}><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>);
    case 'text':  return (<svg {...p}><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>);
    case 'clock': return (<svg {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>);
    default: return (<svg {...p}><rect x="4" y="4" width="16" height="16" rx="3"/></svg>);
  }
}
