import { useState, useCallback, useEffect, useMemo } from 'react';
import './SubnetVisualizer.css';

// ── IP Math Utilities ──

function ipToLong(ip) {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function longToIp(long) {
  return [
    (long >>> 24) & 0xff,
    (long >>> 16) & 0xff,
    (long >>> 8) & 0xff,
    long & 0xff,
  ].join('.');
}

function parseCIDR(cidr) {
  const match = cidr.trim().match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
  if (!match) return null;

  const ip = match[1];
  const prefix = parseInt(match[2]);
  if (prefix < 0 || prefix > 32) return null;

  const parts = ip.split('.').map(Number);
  if (parts.some(p => p < 0 || p > 255)) return null;

  const ipLong = ipToLong(ip);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ipLong & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const totalHosts = Math.pow(2, 32 - prefix);
  const usableHosts = prefix <= 30 ? totalHosts - 2 : (prefix === 31 ? 2 : 1);
  // AWS reserves 5 IPs in each subnet
  const awsUsable = Math.max(0, totalHosts - 5);

  return {
    cidr: `${longToIp(network)}/${prefix}`,
    ip: longToIp(network),
    prefix,
    mask: longToIp(mask),
    wildcard: longToIp((~mask) >>> 0),
    network,
    broadcast,
    networkIp: longToIp(network),
    broadcastIp: longToIp(broadcast),
    firstUsable: prefix < 31 ? longToIp(network + 1) : longToIp(network),
    lastUsable: prefix < 31 ? longToIp(broadcast - 1) : longToIp(broadcast),
    totalHosts,
    usableHosts,
    awsUsable,
    // AWS reserved
    awsReserved: prefix < 31 ? [
      { ip: longToIp(network), desc: 'Network address' },
      { ip: longToIp(network + 1), desc: 'VPC router' },
      { ip: longToIp(network + 2), desc: 'DNS server' },
      { ip: longToIp(network + 3), desc: 'Future use' },
      { ip: longToIp(broadcast), desc: 'Broadcast' },
    ] : [],
  };
}

function rangesOverlap(a, b) {
  return a.network <= b.broadcast && b.network <= a.broadcast;
}

// Check if subnet B is fully contained in subnet A
function isContainedIn(child, parent) {
  return child.network >= parent.network && child.broadcast <= parent.broadcast;
}

// Calculate what fraction of the parent range a child occupies
function fractionOf(child, parent) {
  const parentSize = parent.broadcast - parent.network + 1;
  if (parentSize === 0) return 0;
  const childSize = child.broadcast - child.network + 1;
  return childSize / parentSize;
}

function offsetOf(child, parent) {
  const parentSize = parent.broadcast - parent.network + 1;
  if (parentSize === 0) return 0;
  return (child.network - parent.network) / parentSize;
}

const SUBNET_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#e11d48', '#0ea5e9', '#a3e635', '#d946ef',
  '#fb923c',
];

const SPLIT_OPTIONS = [2, 4, 8, 16, 32, 64];

function SubnetVisualizer({ isOpen, onClose }) {
  const [vpcCidr, setVpcCidr] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('subnet-viz-state'));
      return saved?.vpcCidr || '10.0.0.0/16';
    } catch { return '10.0.0.0/16'; }
  });

  const [subnets, setSubnets] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('subnet-viz-state'));
      return saved?.subnets || [
        { id: 1, name: 'Public-A', cidr: '10.0.1.0/24' },
        { id: 2, name: 'Public-B', cidr: '10.0.2.0/24' },
        { id: 3, name: 'Private-A', cidr: '10.0.10.0/24' },
        { id: 4, name: 'Private-B', cidr: '10.0.11.0/24' },
      ];
    } catch {
      return [
        { id: 1, name: 'Public-A', cidr: '10.0.1.0/24' },
        { id: 2, name: 'Public-B', cidr: '10.0.2.0/24' },
        { id: 3, name: 'Private-A', cidr: '10.0.10.0/24' },
        { id: 4, name: 'Private-B', cidr: '10.0.11.0/24' },
      ];
    }
  });

  const [selectedSubnet, setSelectedSubnet] = useState(null);
  const [newName, setNewName] = useState('');
  const [newCidr, setNewCidr] = useState('');
  const [splitCount, setSplitCount] = useState(4);
  const [hoveredSubnet, setHoveredSubnet] = useState(null);
  const [copiedText, setCopiedText] = useState('');
  const nextId = useState(() => Math.max(...subnets.map(s => s.id), 0) + 1)[0];
  const [idCounter, setIdCounter] = useState(nextId);

  // Save state
  useEffect(() => {
    localStorage.setItem('subnet-viz-state', JSON.stringify({ vpcCidr, subnets }));
  }, [vpcCidr, subnets]);

  const vpc = useMemo(() => parseCIDR(vpcCidr), [vpcCidr]);

  const parsedSubnets = useMemo(() => {
    return subnets.map((s, i) => {
      const parsed = parseCIDR(s.cidr);
      return {
        ...s,
        parsed,
        color: SUBNET_COLORS[i % SUBNET_COLORS.length],
        inVpc: parsed && vpc ? isContainedIn(parsed, vpc) : false,
      };
    });
  }, [subnets, vpc]);

  // Detect overlaps
  const overlaps = useMemo(() => {
    const result = [];
    for (let i = 0; i < parsedSubnets.length; i++) {
      for (let j = i + 1; j < parsedSubnets.length; j++) {
        const a = parsedSubnets[i], b = parsedSubnets[j];
        if (a.parsed && b.parsed && rangesOverlap(a.parsed, b.parsed)) {
          result.push([a, b]);
        }
      }
    }
    return result;
  }, [parsedSubnets]);

  // Free space calculation
  const freeSpace = useMemo(() => {
    if (!vpc) return [];
    const validSubs = parsedSubnets.filter(s => s.parsed && s.inVpc);
    if (validSubs.length === 0) return [{ start: vpc.network, end: vpc.broadcast, size: vpc.totalHosts }];

    // Sort by network address
    const sorted = [...validSubs].sort((a, b) => a.parsed.network - b.parsed.network);
    const gaps = [];
    let cursor = vpc.network;

    for (const sub of sorted) {
      if (sub.parsed.network > cursor) {
        gaps.push({ start: cursor, end: sub.parsed.network - 1, size: sub.parsed.network - cursor });
      }
      cursor = Math.max(cursor, sub.parsed.broadcast + 1);
    }
    if (cursor <= vpc.broadcast) {
      gaps.push({ start: cursor, end: vpc.broadcast, size: vpc.broadcast - cursor + 1 });
    }
    return gaps;
  }, [vpc, parsedSubnets]);

  const totalUsed = useMemo(() => {
    return parsedSubnets.filter(s => s.parsed && s.inVpc).reduce((sum, s) => sum + s.parsed.totalHosts, 0);
  }, [parsedSubnets]);

  const addSubnet = useCallback(() => {
    if (!newCidr.trim()) return;
    const id = idCounter;
    setIdCounter(c => c + 1);
    setSubnets(prev => [...prev, { id, name: newName || `Subnet-${id}`, cidr: newCidr.trim() }]);
    setNewName('');
    setNewCidr('');
  }, [newName, newCidr, idCounter]);

  const removeSubnet = (id) => {
    setSubnets(prev => prev.filter(s => s.id !== id));
    if (selectedSubnet === id) setSelectedSubnet(null);
  };

  const updateSubnet = (id, updates) => {
    setSubnets(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const autoSplit = useCallback(() => {
    if (!vpc) return;
    const newPrefix = vpc.prefix + Math.log2(splitCount);
    if (newPrefix > 28) return; // Too small
    const subs = [];
    const subSize = Math.pow(2, 32 - newPrefix);
    for (let i = 0; i < splitCount; i++) {
      const netAddr = vpc.network + i * subSize;
      const id = idCounter + i;
      subs.push({ id, name: `Subnet-${i + 1}`, cidr: `${longToIp(netAddr)}/${newPrefix}` });
    }
    setIdCounter(c => c + splitCount);
    setSubnets(subs);
  }, [vpc, splitCount, idCounter]);

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      setTimeout(() => setCopiedText(''), 1200);
    } catch { /* */ }
  };

  const clearAll = () => {
    setSubnets([]);
    setSelectedSubnet(null);
  };

  // Presets
  const loadPreset = (preset) => {
    setVpcCidr(preset.vpc);
    setSubnets(preset.subnets);
    setSelectedSubnet(null);
  };

  const PRESETS = [
    {
      label: 'AWS Basic (2 AZ)',
      vpc: '10.0.0.0/16',
      subnets: [
        { id: 1, name: 'Public-A', cidr: '10.0.1.0/24' },
        { id: 2, name: 'Public-B', cidr: '10.0.2.0/24' },
        { id: 3, name: 'Private-A', cidr: '10.0.10.0/24' },
        { id: 4, name: 'Private-B', cidr: '10.0.11.0/24' },
      ],
    },
    {
      label: 'AWS 3-Tier (3 AZ)',
      vpc: '10.0.0.0/16',
      subnets: [
        { id: 1, name: 'Public-A', cidr: '10.0.0.0/24' },
        { id: 2, name: 'Public-B', cidr: '10.0.1.0/24' },
        { id: 3, name: 'Public-C', cidr: '10.0.2.0/24' },
        { id: 4, name: 'App-A', cidr: '10.0.10.0/24' },
        { id: 5, name: 'App-B', cidr: '10.0.11.0/24' },
        { id: 6, name: 'App-C', cidr: '10.0.12.0/24' },
        { id: 7, name: 'DB-A', cidr: '10.0.20.0/24' },
        { id: 8, name: 'DB-B', cidr: '10.0.21.0/24' },
        { id: 9, name: 'DB-C', cidr: '10.0.22.0/24' },
      ],
    },
    {
      label: 'Small Office',
      vpc: '192.168.0.0/16',
      subnets: [
        { id: 1, name: 'Management', cidr: '192.168.1.0/24' },
        { id: 2, name: 'Staff', cidr: '192.168.10.0/23' },
        { id: 3, name: 'Guest', cidr: '192.168.100.0/24' },
        { id: 4, name: 'Servers', cidr: '192.168.200.0/25' },
      ],
    },
    {
      label: 'K8s Cluster',
      vpc: '10.0.0.0/8',
      subnets: [
        { id: 1, name: 'Pod CIDR', cidr: '10.244.0.0/16' },
        { id: 2, name: 'Service CIDR', cidr: '10.96.0.0/12' },
        { id: 3, name: 'Node Network', cidr: '10.0.0.0/24' },
      ],
    },
  ];

  const selected = parsedSubnets.find(s => s.id === selectedSubnet);

  if (!isOpen) return null;

  return (
    <div className="subnet-overlay" onClick={onClose}>
      <div className="subnet-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="subnet-header">
          <div className="subnet-header-left">
            <svg className="subnet-header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="4" rx="1" />
              <path d="M12 7v4" />
              <path d="M6 11h12" />
              <path d="M6 11v4" />
              <path d="M18 11v4" />
              <path d="M12 11v4" />
              <rect x="2" y="15" width="6" height="4" rx="1" />
              <rect x="9" y="15" width="6" height="4" rx="1" />
              <rect x="16" y="15" width="6" height="4" rx="1" />
            </svg>
            <span className="subnet-header-title">CIDR / Subnet Visualizer</span>
            <span className="subnet-header-count">{subnets.length} subnet{subnets.length !== 1 ? 's' : ''}</span>
          </div>
          <button className="subnet-close-btn" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="subnet-body">
          {/* Left Panel: Controls */}
          <div className="subnet-left">
            {/* VPC Input */}
            <div className="subnet-section">
              <div className="subnet-section-header">
                <span className="subnet-section-title">VPC / Supernet CIDR</span>
              </div>
              <input
                className={`subnet-vpc-input${vpc ? '' : ' error'}`}
                value={vpcCidr}
                onChange={e => setVpcCidr(e.target.value)}
                placeholder="10.0.0.0/16"
                spellCheck={false}
              />
              {vpc && (
                <div className="subnet-vpc-info">
                  <span>Range: {vpc.networkIp} — {vpc.broadcastIp}</span>
                  <span>Hosts: {vpc.totalHosts.toLocaleString()}</span>
                  <span>Mask: {vpc.mask}</span>
                </div>
              )}
            </div>

            {/* Presets */}
            <div className="subnet-section">
              <div className="subnet-section-header">
                <span className="subnet-section-title">Presets</span>
              </div>
              <div className="subnet-preset-row">
                {PRESETS.map((p, i) => (
                  <button key={i} className="subnet-preset-btn" onClick={() => loadPreset(p)} title={p.vpc}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Add Subnet */}
            <div className="subnet-section">
              <div className="subnet-section-header">
                <span className="subnet-section-title">Add Subnet</span>
              </div>
              <div className="subnet-add-row">
                <input
                  className="subnet-add-input name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Name"
                  onKeyDown={e => e.key === 'Enter' && addSubnet()}
                />
                <input
                  className="subnet-add-input cidr"
                  value={newCidr}
                  onChange={e => setNewCidr(e.target.value)}
                  placeholder="10.0.1.0/24"
                  spellCheck={false}
                  onKeyDown={e => e.key === 'Enter' && addSubnet()}
                />
                <button className="subnet-add-btn" onClick={addSubnet}>+</button>
              </div>
            </div>

            {/* Auto Split */}
            <div className="subnet-section">
              <div className="subnet-section-header">
                <span className="subnet-section-title">Auto Split</span>
              </div>
              <div className="subnet-split-row">
                <select
                  className="subnet-split-select"
                  value={splitCount}
                  onChange={e => setSplitCount(Number(e.target.value))}
                >
                  {SPLIT_OPTIONS.map(n => {
                    const newPfx = vpc ? vpc.prefix + Math.log2(n) : 0;
                    return (
                      <option key={n} value={n} disabled={!vpc || newPfx > 28}>
                        {n} subnets{vpc ? ` (/${newPfx})` : ''}
                      </option>
                    );
                  })}
                </select>
                <button className="subnet-split-btn" onClick={autoSplit} disabled={!vpc}>
                  Split VPC
                </button>
                <button className="subnet-clear-btn" onClick={clearAll}>Clear</button>
              </div>
            </div>

            {/* Subnet List */}
            <div className="subnet-section flex-grow">
              <div className="subnet-section-header">
                <span className="subnet-section-title">Subnets</span>
              </div>
              <div className="subnet-list">
                {parsedSubnets.map(sub => (
                  <div
                    key={sub.id}
                    className={`subnet-list-item${selectedSubnet === sub.id ? ' selected' : ''}${!sub.parsed ? ' invalid' : ''}${sub.parsed && !sub.inVpc ? ' outside' : ''}`}
                    onClick={() => setSelectedSubnet(selectedSubnet === sub.id ? null : sub.id)}
                    onMouseEnter={() => setHoveredSubnet(sub.id)}
                    onMouseLeave={() => setHoveredSubnet(null)}
                  >
                    <div className="subnet-list-color" style={{ background: sub.color }} />
                    <div className="subnet-list-info">
                      <input
                        className="subnet-list-name"
                        value={sub.name}
                        onChange={e => { e.stopPropagation(); updateSubnet(sub.id, { name: e.target.value }); }}
                        onClick={e => e.stopPropagation()}
                      />
                      <input
                        className="subnet-list-cidr"
                        value={sub.cidr}
                        onChange={e => { e.stopPropagation(); updateSubnet(sub.id, { cidr: e.target.value }); }}
                        onClick={e => e.stopPropagation()}
                        spellCheck={false}
                      />
                    </div>
                    <div className="subnet-list-meta">
                      {sub.parsed && <span className="subnet-list-hosts">{sub.parsed.totalHosts.toLocaleString()} IPs</span>}
                      {!sub.parsed && <span className="subnet-list-err">Invalid</span>}
                      {sub.parsed && !sub.inVpc && <span className="subnet-list-err">Outside</span>}
                    </div>
                    <button className="subnet-list-del" onClick={e => { e.stopPropagation(); removeSubnet(sub.id); }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                ))}
                {subnets.length === 0 && (
                  <div className="subnet-list-empty">No subnets added yet</div>
                )}
              </div>
            </div>

            {/* Warnings */}
            {overlaps.length > 0 && (
              <div className="subnet-warnings">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                <div>
                  {overlaps.map(([a, b], i) => (
                    <div key={i} className="subnet-warning-text">
                      <strong>{a.name}</strong> overlaps with <strong>{b.name}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel: Visualization + Details */}
          <div className="subnet-right">
            {/* Visual Map */}
            {vpc && (
              <div className="subnet-viz-section">
                <div className="subnet-section-header">
                  <span className="subnet-section-title">Address Space Map</span>
                  <span className="subnet-viz-range">{vpc.networkIp} — {vpc.broadcastIp}</span>
                </div>
                <div className="subnet-viz-container">
                  {/* VPC bar background */}
                  <div className="subnet-viz-bar">
                    {/* Free space indicators */}
                    {freeSpace.map((gap, i) => {
                      const left = ((gap.start - vpc.network) / vpc.totalHosts) * 100;
                      const width = (gap.size / vpc.totalHosts) * 100;
                      return width > 0.3 ? (
                        <div
                          key={`free-${i}`}
                          className="subnet-viz-free"
                          style={{ left: `${left}%`, width: `${width}%` }}
                          title={`Free: ${longToIp(gap.start)} — ${longToIp(gap.end)} (${gap.size.toLocaleString()} IPs)`}
                        />
                      ) : null;
                    })}

                    {/* Subnet blocks */}
                    {parsedSubnets.filter(s => s.parsed && s.inVpc).map(sub => {
                      const left = offsetOf(sub.parsed, vpc) * 100;
                      const width = fractionOf(sub.parsed, vpc) * 100;
                      const isHovered = hoveredSubnet === sub.id;
                      const isSelected = selectedSubnet === sub.id;
                      return (
                        <div
                          key={sub.id}
                          className={`subnet-viz-block${isHovered ? ' hovered' : ''}${isSelected ? ' selected' : ''}`}
                          style={{
                            left: `${left}%`,
                            width: `${Math.max(width, 0.5)}%`,
                            backgroundColor: sub.color,
                          }}
                          onClick={() => setSelectedSubnet(selectedSubnet === sub.id ? null : sub.id)}
                          onMouseEnter={() => setHoveredSubnet(sub.id)}
                          onMouseLeave={() => setHoveredSubnet(null)}
                          title={`${sub.name}: ${sub.cidr} (${sub.parsed.totalHosts.toLocaleString()} IPs)`}
                        >
                          {width > 5 && <span className="subnet-viz-block-label">{sub.name}</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Scale markers */}
                  <div className="subnet-viz-scale">
                    {[0, 25, 50, 75, 100].map(pct => (
                      <span key={pct} className="subnet-viz-tick" style={{ left: `${pct}%` }}>
                        {longToIp(vpc.network + Math.floor((vpc.totalHosts * pct) / 100))}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Utilization bar */}
                <div className="subnet-util">
                  <div className="subnet-util-bar">
                    <div
                      className="subnet-util-fill"
                      style={{ width: `${Math.min((totalUsed / vpc.totalHosts) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="subnet-util-info">
                    <span>Used: {totalUsed.toLocaleString()} / {vpc.totalHosts.toLocaleString()} IPs</span>
                    <span>{((totalUsed / vpc.totalHosts) * 100).toFixed(1)}%</span>
                  </div>
                </div>

                {/* Stacked block view */}
                <div className="subnet-blocks-section">
                  <span className="subnet-section-title">Subnet Blocks</span>
                  <div className="subnet-blocks-grid">
                    {parsedSubnets.filter(s => s.parsed).map(sub => {
                      const frac = sub.parsed && vpc ? fractionOf(sub.parsed, vpc) : 0;
                      return (
                        <div
                          key={sub.id}
                          className={`subnet-block-card${selectedSubnet === sub.id ? ' selected' : ''}${!sub.inVpc ? ' outside' : ''}`}
                          style={{ borderColor: sub.color }}
                          onClick={() => setSelectedSubnet(selectedSubnet === sub.id ? null : sub.id)}
                          onMouseEnter={() => setHoveredSubnet(sub.id)}
                          onMouseLeave={() => setHoveredSubnet(null)}
                        >
                          <div className="subnet-block-color" style={{ background: sub.color }} />
                          <div className="subnet-block-info">
                            <span className="subnet-block-name">{sub.name}</span>
                            <span className="subnet-block-cidr">{sub.parsed.cidr}</span>
                          </div>
                          <div className="subnet-block-stats">
                            <span>{sub.parsed.totalHosts.toLocaleString()} IPs</span>
                            {sub.inVpc && <span className="subnet-block-pct">{(frac * 100).toFixed(1)}%</span>}
                            {!sub.inVpc && <span className="subnet-block-out">Outside VPC</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Detail Panel */}
            {selected && selected.parsed && (
              <div className="subnet-detail">
                <div className="subnet-detail-header">
                  <div className="subnet-detail-color" style={{ background: selected.color }} />
                  <span className="subnet-detail-name">{selected.name}</span>
                  <span className="subnet-detail-cidr">{selected.parsed.cidr}</span>
                </div>
                <div className="subnet-detail-grid">
                  {[
                    ['Network', selected.parsed.networkIp],
                    ['Broadcast', selected.parsed.broadcastIp],
                    ['Subnet Mask', selected.parsed.mask],
                    ['Wildcard', selected.parsed.wildcard],
                    ['First Usable', selected.parsed.firstUsable],
                    ['Last Usable', selected.parsed.lastUsable],
                    ['Total IPs', selected.parsed.totalHosts.toLocaleString()],
                    ['Usable Hosts', selected.parsed.usableHosts.toLocaleString()],
                    ['AWS Usable', selected.parsed.awsUsable.toLocaleString()],
                    ['Prefix', `/${selected.parsed.prefix}`],
                  ].map(([label, val]) => (
                    <div key={label} className="subnet-detail-row" onClick={() => handleCopy(val)}>
                      <span className="subnet-detail-label">{label}</span>
                      <span className={`subnet-detail-value${copiedText === val ? ' copied' : ''}`}>
                        {copiedText === val ? '✓ Copied' : val}
                      </span>
                    </div>
                  ))}
                </div>
                {selected.parsed.awsReserved.length > 0 && (
                  <div className="subnet-aws-reserved">
                    <span className="subnet-section-title">AWS Reserved IPs</span>
                    <div className="subnet-aws-list">
                      {selected.parsed.awsReserved.map((r, i) => (
                        <div key={i} className="subnet-aws-item">
                          <span className="subnet-aws-ip">{r.ip}</span>
                          <span className="subnet-aws-desc">{r.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Free Space Details */}
            {vpc && freeSpace.length > 0 && (
              <div className="subnet-free-section">
                <span className="subnet-section-title">Available Ranges</span>
                <div className="subnet-free-list">
                  {freeSpace.slice(0, 10).map((gap, i) => (
                    <div key={i} className="subnet-free-item" onClick={() => handleCopy(`${longToIp(gap.start)}`)}>
                      <span className="subnet-free-range">{longToIp(gap.start)} — {longToIp(gap.end)}</span>
                      <span className="subnet-free-size">{gap.size.toLocaleString()} IPs</span>
                    </div>
                  ))}
                  {freeSpace.length > 10 && (
                    <div className="subnet-free-more">+{freeSpace.length - 10} more ranges</div>
                  )}
                </div>
              </div>
            )}

            {!vpc && (
              <div className="subnet-no-vpc">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="4" rx="1" />
                  <path d="M12 7v4M6 11h12M6 11v4M18 11v4M12 11v4" />
                  <rect x="2" y="15" width="6" height="4" rx="1" />
                  <rect x="9" y="15" width="6" height="4" rx="1" />
                  <rect x="16" y="15" width="6" height="4" rx="1" />
                </svg>
                <span>Enter a valid VPC CIDR to start</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SubnetVisualizer;
