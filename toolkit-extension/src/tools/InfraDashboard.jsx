import { useState, useEffect, useCallback } from 'react';
import './InfraDashboard.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

function DonutChart({ value, size = 60, stroke = 5, color = '#6366f1' }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(value, 0), 100);
  const offset = circ - (pct / 100) * circ;
  const bg = pct > 80 ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)';
  const fg = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : color;
  return (
    <svg width={size} height={size} className="infra-donut">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={bg} strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={fg} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        className="infra-donut-text" fill={fg}>{Math.round(pct)}%</text>
    </svg>
  );
}

function formatBytes(b) {
  if (!b) return '0';
  if (b < 1024**2) return `${(b/1024).toFixed(0)}KB`;
  if (b < 1024**3) return `${(b/1024**2).toFixed(1)}MB`;
  if (b < 1024**4) return `${(b/1024**3).toFixed(1)}GB`;
  return `${(b/1024**4).toFixed(2)}TB`;
}

function formatUptime(str) {
  if (!str) return '?';
  const parts = str.split(':');
  if (parts.length === 3) {
    const h = parseInt(parts[0]);
    const d = Math.floor(h / 24);
    return d > 0 ? `${d}d ${h % 24}h` : `${h}h`;
  }
  return str;
}

function InfraDashboard({ isOpen, onClose }) {
  const [tab, setTab] = useState('cluster');
  const [cluster, setCluster] = useState(null);
  const [tailscale, setTailscale] = useState(null);
  const [nas, setNas] = useState(null);
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});

  const fetchData = useCallback(async (key, url) => {
    setLoading(prev => ({ ...prev, [key]: true }));
    setErrors(prev => ({ ...prev, [key]: '' }));
    try {
      const res = await fetch(`${API_BASE}${url}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      return data;
    } catch (err) {
      setErrors(prev => ({ ...prev, [key]: err.message }));
      return null;
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  }, []);

  const refresh = useCallback(async () => {
    const [c, t, n] = await Promise.all([
      fetchData('cluster', '/api/infra/cluster'),
      fetchData('tailscale', '/api/infra/tailscale'),
      fetchData('nas', '/api/infra/nas'),
    ]);
    if (c) setCluster(c);
    if (t) setTailscale(t);
    if (n) setNas(n);
  }, [fetchData]);

  useEffect(() => {
    if (isOpen) refresh();
  }, [isOpen, refresh]);

  if (!isOpen) return null;

  return (
    <div className="infra-overlay" onClick={onClose}>
      <div className="infra-modal" onClick={e => e.stopPropagation()}>
        <div className="infra-header">
          <div className="infra-header-left">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="4" rx="1" /><path d="M12 7v4" /><path d="M6 11h12" /><path d="M6 11v4" /><path d="M18 11v4" /><path d="M12 11v4" />
              <rect x="2" y="15" width="6" height="4" rx="1" /><rect x="9" y="15" width="6" height="4" rx="1" /><rect x="16" y="15" width="6" height="4" rx="1" />
            </svg>
            <span className="infra-header-title">Infrastructure</span>
          </div>
          <div className="infra-header-actions">
            <button className="infra-refresh-btn" onClick={refresh} disabled={loading.cluster || loading.tailscale || loading.nas}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
            <button className="infra-close-btn" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="infra-tabs">
          {[['cluster','k3s Cluster'],['tailscale','Tailscale'],['nas','Synology NAS']].map(([k,l]) => (
            <button key={k} className={`infra-tab${tab===k?' active':''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        <div className="infra-body">
          {tab === 'cluster' && (
            <div className="infra-section">
              {loading.cluster && <div className="infra-loading">Loading cluster data...</div>}
              {errors.cluster && <div className="infra-error">{errors.cluster}</div>}
              {cluster && (
                <>
                  <div className="infra-summary">
                    <div className="infra-summary-item"><span className="infra-sum-val">{cluster.nodes?.length || 0}</span><span className="infra-sum-label">Nodes</span></div>
                    <div className="infra-summary-item"><span className="infra-sum-val">{cluster.totalPods || 0}</span><span className="infra-sum-label">Pods</span></div>
                    <div className="infra-summary-item"><span className="infra-sum-val">{Object.keys(cluster.namespaces || {}).length}</span><span className="infra-sum-label">Namespaces</span></div>
                  </div>
                  <div className="infra-node-grid">
                    {(cluster.nodes || []).map((n, i) => {
                      const memPct = n.memTotal ? (n.memUsed / n.memTotal * 100) : 0;
                      const diskPct = n.diskTotal ? (n.diskUsed / n.diskTotal * 100) : 0;
                      return (
                        <div key={i} className={`infra-node-card${n.ready === false ? ' node-notready' : ''}`}>
                          <div className="infra-node-header">
                            <div className="infra-node-name">{n.name}</div>
                            {n.nodeType && <span className={`infra-node-type infra-nt-${n.nodeType}`}>{n.nodeType}</span>}
                            {n.source && <span className="infra-node-source">{n.source === 'prometheus' ? 'prom' : 'k8s'}</span>}
                          </div>
                          <div className="infra-node-charts">
                            <div className="infra-chart-item">
                              <DonutChart value={n.cpu || 0} size={52} stroke={4} color="#6366f1" />
                              <span className="infra-chart-label">CPU</span>
                            </div>
                            <div className="infra-chart-item">
                              <DonutChart value={memPct} size={52} stroke={4} color="#8b5cf6" />
                              <span className="infra-chart-label">MEM</span>
                            </div>
                            <div className="infra-chart-item">
                              <DonutChart value={diskPct} size={52} stroke={4} color="#06b6d4" />
                              <span className="infra-chart-label">DISK</span>
                            </div>
                          </div>
                          <div className="infra-node-detail">
                            <span>{formatBytes(n.memUsed)} / {formatBytes(n.memTotal)}</span>
                            <span>{formatBytes(n.diskUsed)} / {formatBytes(n.diskTotal)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {cluster.namespaces && (
                    <div className="infra-ns-section">
                      <div className="infra-ns-title">PODS BY NAMESPACE</div>
                      <div className="infra-ns-grid">
                        {Object.entries(cluster.namespaces).sort((a,b) => b[1]-a[1]).map(([ns, count]) => (
                          <div key={ns} className="infra-ns-item">
                            <span className="infra-ns-name">{ns}</span>
                            <div className="infra-ns-bar-bg"><div className="infra-ns-bar" style={{ width: `${Math.min(count / Math.max(...Object.values(cluster.namespaces)) * 100, 100)}%` }} /></div>
                            <span className="infra-ns-count">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'tailscale' && (
            <div className="infra-section">
              {loading.tailscale && <div className="infra-loading">Loading Tailscale data...</div>}
              {errors.tailscale && <div className="infra-error">{errors.tailscale}</div>}
              {tailscale && (
                <>
                  <div className="infra-summary">
                    <div className="infra-summary-item"><span className="infra-sum-val">{tailscale.devices?.length || 0}</span><span className="infra-sum-label">Devices</span></div>
                    <div className="infra-summary-item"><span className="infra-sum-val infra-sum-online">{tailscale.devices?.filter(d=>d.online).length || 0}</span><span className="infra-sum-label">Online</span></div>
                    <div className="infra-summary-item"><span className="infra-sum-val infra-sum-offline">{tailscale.devices?.filter(d=>!d.online).length || 0}</span><span className="infra-sum-label">Offline</span></div>
                  </div>
                  <div className="infra-device-list">
                    {(tailscale.devices || []).sort((a,b) => (b.online?1:0)-(a.online?1:0)).map((d, i) => (
                      <div key={i} className={`infra-device-row${d.online ? ' online' : ' offline'}`}>
                        <span className={`infra-device-dot${d.online ? ' on' : ''}`} />
                        <span className="infra-device-name">{d.hostname}</span>
                        <span className="infra-device-ip">{d.ip}</span>
                        <span className="infra-device-os">{d.os}</span>
                        <span className="infra-device-seen">{d.lastSeen ? new Date(d.lastSeen).toLocaleString() : '?'}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'nas' && (
            <div className="infra-section">
              {loading.nas && <div className="infra-loading">Loading NAS data...</div>}
              {errors.nas && <div className="infra-error">{errors.nas}</div>}
              {nas && (
                <>
                  <div className="infra-nas-info">
                    <span className="infra-nas-model">{nas.model}</span>
                    <span className="infra-nas-fw">{nas.firmware}</span>
                    <span className="infra-nas-temp">{nas.temp}C</span>
                    <span className="infra-nas-uptime">Up {formatUptime(nas.uptime)}</span>
                  </div>
                  <div className="infra-nas-charts">
                    <div className="infra-chart-item">
                      <DonutChart value={(nas.cpu?.user || 0) + (nas.cpu?.system || 0)} size={70} stroke={5} color="#6366f1" />
                      <span className="infra-chart-label">CPU</span>
                    </div>
                    <div className="infra-chart-item">
                      <DonutChart value={nas.memory?.total ? (nas.memory.used / nas.memory.total * 100) : 0} size={70} stroke={5} color="#8b5cf6" />
                      <span className="infra-chart-label">RAM {formatBytes(nas.memory?.used * 1024)} / {formatBytes(nas.memory?.total * 1024)}</span>
                    </div>
                  </div>
                  <div className="infra-vol-section">
                    <div className="infra-ns-title">VOLUMES</div>
                    {(nas.volumes || []).map((v, i) => {
                      const pct = v.total ? (v.used / v.total * 100) : 0;
                      return (
                        <div key={i} className="infra-vol-item">
                          <div className="infra-vol-header">
                            <span className="infra-vol-name">{v.id}</span>
                            <span className="infra-vol-size">{formatBytes(v.used)} / {formatBytes(v.total)}</span>
                            <span className={`infra-vol-pct${pct > 85 ? ' warn' : ''}`}>{pct.toFixed(1)}%</span>
                          </div>
                          <div className="infra-vol-bar-bg"><div className={`infra-vol-bar${pct > 85 ? ' warn' : ''}`} style={{ width: `${pct}%` }} /></div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="infra-disk-section">
                    <div className="infra-ns-title">DISKS</div>
                    <div className="infra-disk-grid">
                      {(nas.disks || []).map((d, i) => (
                        <div key={i} className="infra-disk-card">
                          <div className="infra-disk-id">{d.id}</div>
                          <div className="infra-disk-model">{d.model}</div>
                          <div className="infra-disk-meta">
                            <span className={`infra-disk-temp${d.temp > 45 ? ' warn' : ''}`}>{d.temp}C</span>
                            <span className={`infra-disk-status${d.status === 'normal' ? ' ok' : ' warn'}`}>{d.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {(nas.network || []).length > 0 && (
                    <div className="infra-net-section">
                      <div className="infra-ns-title">NETWORK</div>
                      <div className="infra-net-grid">
                        {nas.network.filter(n => n.device !== 'total').map((n, i) => (
                          <div key={i} className="infra-net-item">
                            <span className="infra-net-dev">{n.device}</span>
                            <span className="infra-net-rx">RX {formatBytes(n.rx)}/s</span>
                            <span className="infra-net-tx">TX {formatBytes(n.tx)}/s</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(nas.shares || []).length > 0 && (
                    <div className="infra-shares-section">
                      <div className="infra-ns-title">SHARED FOLDERS ({nas.shares.length})</div>
                      <div className="infra-shares-grid">
                        {nas.shares.map((s, i) => (
                          <div key={i} className="infra-share-item">
                            <span className="infra-share-name">{s.name}</span>
                            <span className="infra-share-path">{s.path}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(nas.connections || []).length > 0 && (
                    <div className="infra-conn-section">
                      <div className="infra-ns-title">CONNECTED USERS ({nas.connections.length})</div>
                      <div className="infra-conn-list">
                        {nas.connections.map((c, i) => (
                          <div key={i} className="infra-conn-item">
                            <span className="infra-conn-user">{c.user}</span>
                            <span className="infra-conn-from">{c.from}</span>
                            <span className="infra-conn-type">{c.type}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default InfraDashboard;
