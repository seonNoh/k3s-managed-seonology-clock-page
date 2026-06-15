import { useState, useCallback, useEffect, useMemo } from 'react';
import './SloCalculator.css';

// ── Constants ──
const SECONDS_PER = {
  year:    365.25 * 24 * 3600,
  quarter: 91.3125 * 24 * 3600,
  month:   30.4375 * 24 * 3600,
  week:    7 * 24 * 3600,
  day:     24 * 3600,
};

const TIME_WINDOWS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month (30d)' },
  { key: 'quarter', label: 'Quarter (91d)' },
  { key: 'year', label: 'Year (365d)' },
];

const COMMON_SLOS = [
  { label: '99%', value: 99, nines: '2 nines', tier: 'Low' },
  { label: '99.5%', value: 99.5, nines: '~2.5', tier: 'Standard' },
  { label: '99.9%', value: 99.9, nines: '3 nines', tier: 'Standard' },
  { label: '99.95%', value: 99.95, nines: '~3.5', tier: 'High' },
  { label: '99.99%', value: 99.99, nines: '4 nines', tier: 'High' },
  { label: '99.999%', value: 99.999, nines: '5 nines', tier: 'Critical' },
  { label: '99.9999%', value: 99.9999, nines: '6 nines', tier: 'Extreme' },
];

const SLI_TYPES = [
  { key: 'availability', label: 'Availability', desc: 'Uptime / Total Time', unit: '%', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
  { key: 'latency', label: 'Latency', desc: 'Requests within threshold', unit: 'ms', icon: 'M12 2v10l4.5 4.5' },
  { key: 'error_rate', label: 'Error Rate', desc: 'Successful / Total requests', unit: '%', icon: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z' },
  { key: 'throughput', label: 'Throughput', desc: 'Requests served / second', unit: 'req/s', icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8' },
];

// ── Format duration ──
function formatDuration(totalSeconds) {
  if (totalSeconds < 0) return '0s';
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds.toFixed(seconds < 1 ? 2 : 0)}s`);
  return parts.join(' ');
}

function formatDurationLong(totalSeconds) {
  if (totalSeconds < 0) return '0 seconds';
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} min${minutes !== 1 ? 's' : ''}`);
  if (seconds > 0 && days === 0) parts.push(`${seconds.toFixed(seconds < 1 ? 2 : 0)} sec`);
  return parts.join(', ') || '0 seconds';
}

function getNines(pct) {
  if (pct >= 99.9999) return 6;
  if (pct >= 99.999) return 5;
  if (pct >= 99.99) return 4;
  if (pct >= 99.9) return 3;
  if (pct >= 99) return 2;
  if (pct >= 90) return 1;
  return 0;
}

function getTierColor(pct) {
  if (pct >= 99.99) return '#10b981';
  if (pct >= 99.9) return '#3b82f6';
  if (pct >= 99) return '#f59e0b';
  return '#ef4444';
}

// ── Composite SLO (multi-dependency) ──
function compositeAvailability(deps) {
  return deps.reduce((acc, d) => acc * (d.slo / 100), 1) * 100;
}

function SloCalculator({ isOpen, onClose }) {
  const [sloTarget, setSloTarget] = useState(() => {
    try { return JSON.parse(localStorage.getItem('slo-calc-state'))?.sloTarget ?? 99.99; }
    catch { return 99.99; }
  });
  const [timeWindow, setTimeWindow] = useState(() => {
    try { return JSON.parse(localStorage.getItem('slo-calc-state'))?.timeWindow ?? 'month'; }
    catch { return 'month'; }
  });
  const [activeSli, setActiveSli] = useState('availability');
  const [copiedText, setCopiedText] = useState('');

  // Reverse calculator
  const [downMinutes, setDownMinutes] = useState('');

  // Multi-dependency
  const [dependencies, setDependencies] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('slo-calc-state'))?.dependencies ?? [
        { id: 1, name: 'API Gateway', slo: 99.99 },
        { id: 2, name: 'Database', slo: 99.95 },
        { id: 3, name: 'Cache', slo: 99.9 },
      ];
    } catch {
      return [
        { id: 1, name: 'API Gateway', slo: 99.99 },
        { id: 2, name: 'Database', slo: 99.95 },
        { id: 3, name: 'Cache', slo: 99.9 },
      ];
    }
  });
  const [depCounter, setDepCounter] = useState(() => Math.max(...dependencies.map(d => d.id), 0) + 1);

  // SLI tracker
  const [sliEntries, setSliEntries] = useState(() => {
    try { return JSON.parse(localStorage.getItem('slo-calc-sli')) ?? []; }
    catch { return []; }
  });
  const [sliTotal, setSliTotal] = useState('');
  const [sliGood, setSliGood] = useState('');

  // Save state
  useEffect(() => {
    localStorage.setItem('slo-calc-state', JSON.stringify({ sloTarget, timeWindow, dependencies }));
  }, [sloTarget, timeWindow, dependencies]);

  useEffect(() => {
    localStorage.setItem('slo-calc-sli', JSON.stringify(sliEntries));
  }, [sliEntries]);

  // ── Error Budget Calculations ──
  const budget = useMemo(() => {
    const windowSec = SECONDS_PER[timeWindow];
    const downtimeSec = windowSec * (1 - sloTarget / 100);
    const uptimeSec = windowSec - downtimeSec;
    return {
      windowSec,
      downtimeSec,
      uptimeSec,
      downtimeFormatted: formatDuration(downtimeSec),
      downtimeLong: formatDurationLong(downtimeSec),
      uptimeFormatted: formatDuration(uptimeSec),
      percentDown: (100 - sloTarget),
      nines: getNines(sloTarget),
    };
  }, [sloTarget, timeWindow]);

  // All time windows
  const allBudgets = useMemo(() => {
    return TIME_WINDOWS.map(tw => {
      const sec = SECONDS_PER[tw.key];
      const down = sec * (1 - sloTarget / 100);
      return { ...tw, downtimeSec: down, formatted: formatDuration(down) };
    });
  }, [sloTarget]);

  // Reverse calc: minutes → SLO
  const reverseSlo = useMemo(() => {
    if (!downMinutes || isNaN(Number(downMinutes))) return null;
    const downSec = Number(downMinutes) * 60;
    const windowSec = SECONDS_PER[timeWindow];
    const slo = ((windowSec - downSec) / windowSec) * 100;
    return Math.max(0, Math.min(100, slo));
  }, [downMinutes, timeWindow]);

  // Composite
  const compositeSlo = useMemo(() => {
    if (dependencies.length === 0) return 100;
    return compositeAvailability(dependencies);
  }, [dependencies]);

  const compositeBudget = useMemo(() => {
    const sec = SECONDS_PER[timeWindow] * (1 - compositeSlo / 100);
    return { sec, formatted: formatDuration(sec) };
  }, [compositeSlo, timeWindow]);

  // SLI ratio
  const sliRatio = useMemo(() => {
    const total = Number(sliTotal);
    const good = Number(sliGood);
    if (!total || total === 0 || isNaN(total) || isNaN(good)) return null;
    return (good / total) * 100;
  }, [sliTotal, sliGood]);

  const addSliEntry = () => {
    if (sliRatio === null) return;
    setSliEntries(prev => [...prev, {
      id: Date.now(),
      total: Number(sliTotal),
      good: Number(sliGood),
      ratio: sliRatio,
      timestamp: new Date().toISOString(),
    }].slice(-30));
    setSliTotal('');
    setSliGood('');
  };

  const addDependency = () => {
    setDependencies(prev => [...prev, { id: depCounter, name: `Service-${depCounter}`, slo: 99.9 }]);
    setDepCounter(c => c + 1);
  };

  const removeDependency = (id) => {
    setDependencies(prev => prev.filter(d => d.id !== id));
  };

  const updateDependency = (id, updates) => {
    setDependencies(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      setTimeout(() => setCopiedText(''), 1200);
    } catch { /* */ }
  };

  const tierColor = getTierColor(sloTarget);

  if (!isOpen) return null;

  return (
    <div className="slo-overlay" onClick={onClose}>
      <div className="slo-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="slo-header">
          <div className="slo-header-left">
            <svg className="slo-header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
            </svg>
            <span className="slo-header-title">SLO / SLI Calculator</span>
          </div>
          <button className="slo-close-btn" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="slo-body">
          {/* ── Main Section: Error Budget ── */}
          <div className="slo-main">
            {/* SLO Target Input */}
            <div className="slo-target-section">
              <div className="slo-target-header">
                <span className="slo-section-title">SLO Target</span>
                <div className="slo-nines-badge" style={{ borderColor: tierColor, color: tierColor }}>
                  {budget.nines} nine{budget.nines !== 1 ? 's' : ''}
                </div>
              </div>

              <div className="slo-target-input-row">
                <input
                  type="number"
                  className="slo-target-input"
                  value={sloTarget}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v >= 0 && v <= 100) setSloTarget(v);
                  }}
                  step="0.001"
                  min="0"
                  max="100"
                />
                <span className="slo-target-pct">%</span>
              </div>

              {/* Quick SLO Buttons */}
              <div className="slo-quick-row">
                {COMMON_SLOS.map(s => (
                  <button
                    key={s.value}
                    className={`slo-quick-btn${sloTarget === s.value ? ' active' : ''}`}
                    onClick={() => setSloTarget(s.value)}
                    title={`${s.nines} — ${s.tier}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Time Window */}
              <div className="slo-window-row">
                <span className="slo-label">Time Window</span>
                <div className="slo-window-btns">
                  {TIME_WINDOWS.map(tw => (
                    <button
                      key={tw.key}
                      className={`slo-window-btn${timeWindow === tw.key ? ' active' : ''}`}
                      onClick={() => setTimeWindow(tw.key)}
                    >
                      {tw.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Error Budget Result */}
            <div className="slo-budget-card">
              <div className="slo-budget-header">
                <span className="slo-section-title">Error Budget</span>
                <button
                  className={`slo-copy-btn${copiedText === budget.downtimeLong ? ' copied' : ''}`}
                  onClick={() => handleCopy(budget.downtimeLong)}
                >
                  {copiedText === budget.downtimeLong ? '✓' : 'Copy'}
                </button>
              </div>
              <div className="slo-budget-big">
                <span className="slo-budget-value" style={{ color: tierColor }}>
                  {budget.downtimeFormatted}
                </span>
                <span className="slo-budget-desc">
                  allowed downtime per {timeWindow}
                </span>
              </div>

              {/* Visual budget bar */}
              <div className="slo-budget-bar-wrap">
                <div className="slo-budget-bar">
                  <div className="slo-budget-bar-uptime" style={{ width: `${sloTarget}%` }} />
                  <div
                    className="slo-budget-bar-downtime"
                    style={{ width: `${Math.max(100 - sloTarget, 0.2)}%`, backgroundColor: tierColor }}
                  />
                </div>
                <div className="slo-budget-bar-labels">
                  <span>Uptime: {sloTarget}%</span>
                  <span style={{ color: tierColor }}>Error Budget: {budget.percentDown.toFixed(4)}%</span>
                </div>
              </div>
            </div>

            {/* All Time Windows Table */}
            <div className="slo-all-windows">
              <span className="slo-section-title">Error Budget by Time Window</span>
              <div className="slo-windows-grid">
                {allBudgets.map(b => (
                  <div
                    key={b.key}
                    className={`slo-window-card${timeWindow === b.key ? ' active' : ''}`}
                    onClick={() => setTimeWindow(b.key)}
                  >
                    <span className="slo-window-card-label">{b.label}</span>
                    <span className="slo-window-card-value">{b.formatted}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Reverse Calculator ── */}
            <div className="slo-reverse-section">
              <span className="slo-section-title">Reverse: Downtime → SLO</span>
              <div className="slo-reverse-row">
                <input
                  type="number"
                  className="slo-reverse-input"
                  value={downMinutes}
                  onChange={e => setDownMinutes(e.target.value)}
                  placeholder="Minutes of downtime"
                  min="0"
                />
                <span className="slo-reverse-per">min / {timeWindow}</span>
                {reverseSlo !== null && (
                  <div className="slo-reverse-result">
                    <span className="slo-reverse-arrow">→</span>
                    <span className="slo-reverse-slo" style={{ color: getTierColor(reverseSlo) }}>
                      {reverseSlo.toFixed(6)}%
                    </span>
                    <span className="slo-reverse-nines">({getNines(reverseSlo)} nines)</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right Side ── */}
          <div className="slo-side">
            {/* Multi-dependency Composite SLO */}
            <div className="slo-composite-section">
              <div className="slo-composite-header">
                <span className="slo-section-title">Composite SLO</span>
                <button className="slo-dep-add-btn" onClick={addDependency} title="Add dependency">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
              </div>
              <div className="slo-dep-list">
                {dependencies.map(dep => (
                  <div key={dep.id} className="slo-dep-item">
                    <input
                      className="slo-dep-name"
                      value={dep.name}
                      onChange={e => updateDependency(dep.id, { name: e.target.value })}
                    />
                    <div className="slo-dep-slo-wrap">
                      <input
                        type="number"
                        className="slo-dep-slo-input"
                        value={dep.slo}
                        onChange={e => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) && v >= 0 && v <= 100) updateDependency(dep.id, { slo: v });
                        }}
                        step="0.01"
                        min="0"
                        max="100"
                      />
                      <span className="slo-dep-pct">%</span>
                    </div>
                    <button className="slo-dep-del" onClick={() => removeDependency(dep.id)}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="slo-composite-result">
                <span className="slo-composite-label">Combined SLO</span>
                <span className="slo-composite-value" style={{ color: getTierColor(compositeSlo) }}>
                  {compositeSlo.toFixed(6)}%
                </span>
              </div>
              <div className="slo-composite-budget">
                <span>Error Budget:</span>
                <span style={{ color: getTierColor(compositeSlo) }}>{compositeBudget.formatted} / {timeWindow}</span>
              </div>
              <div className="slo-composite-note">
                Composite SLO = product of all dependency SLOs. Serial dependencies multiply failure risk.
              </div>
            </div>

            {/* SLI Quick Tracker */}
            <div className="slo-sli-section">
              <span className="slo-section-title">SLI Quick Tracker</span>
              <div className="slo-sli-types">
                {SLI_TYPES.map(t => (
                  <button
                    key={t.key}
                    className={`slo-sli-type-btn${activeSli === t.key ? ' active' : ''}`}
                    onClick={() => setActiveSli(t.key)}
                    title={t.desc}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={t.icon} />
                    </svg>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>

              <div className="slo-sli-input-row">
                <div className="slo-sli-field">
                  <span className="slo-sli-field-label">Total requests</span>
                  <input
                    type="number"
                    className="slo-sli-input"
                    value={sliTotal}
                    onChange={e => setSliTotal(e.target.value)}
                    placeholder="1000000"
                    min="0"
                  />
                </div>
                <div className="slo-sli-field">
                  <span className="slo-sli-field-label">Good requests</span>
                  <input
                    type="number"
                    className="slo-sli-input"
                    value={sliGood}
                    onChange={e => setSliGood(e.target.value)}
                    placeholder="999900"
                    min="0"
                  />
                </div>
                <button className="slo-sli-add-btn" onClick={addSliEntry} disabled={sliRatio === null}>
                  Log
                </button>
              </div>

              {sliRatio !== null && (
                <div className="slo-sli-result">
                  <span>SLI:</span>
                  <span className="slo-sli-ratio" style={{ color: getTierColor(sliRatio) }}>
                    {sliRatio.toFixed(4)}%
                  </span>
                  <span className={`slo-sli-status${sliRatio >= sloTarget ? ' ok' : ' burn'}`}>
                    {sliRatio >= sloTarget ? '✓ Within SLO' : '✗ Burning budget'}
                  </span>
                </div>
              )}

              {sliEntries.length > 0 && (
                <div className="slo-sli-history">
                  <div className="slo-sli-history-header">
                    <span className="slo-label">History</span>
                    <button className="slo-sli-clear" onClick={() => setSliEntries([])}>Clear</button>
                  </div>
                  <div className="slo-sli-history-list">
                    {[...sliEntries].reverse().slice(0, 10).map(entry => (
                      <div key={entry.id} className="slo-sli-history-item">
                        <span className="slo-sli-h-time">
                          {new Date(entry.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="slo-sli-h-ratio" style={{ color: getTierColor(entry.ratio) }}>
                          {entry.ratio.toFixed(4)}%
                        </span>
                        <span className={`slo-sli-h-status${entry.ratio >= sloTarget ? ' ok' : ' burn'}`}>
                          {entry.ratio >= sloTarget ? '✓' : '✗'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Reference Table */}
            <details className="slo-ref">
              <summary className="slo-ref-summary">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
                SLO Reference Table
              </summary>
              <div className="slo-ref-body">
                <table className="slo-ref-table">
                  <thead>
                    <tr>
                      <th>SLO</th>
                      <th>Nines</th>
                      <th>Down/Month</th>
                      <th>Down/Year</th>
                      <th>Tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMMON_SLOS.map(s => {
                      const mDown = SECONDS_PER.month * (1 - s.value / 100);
                      const yDown = SECONDS_PER.year * (1 - s.value / 100);
                      return (
                        <tr key={s.value} className={sloTarget === s.value ? 'active' : ''} onClick={() => setSloTarget(s.value)} style={{ cursor: 'pointer' }}>
                          <td style={{ color: getTierColor(s.value) }}>{s.label}</td>
                          <td>{s.nines}</td>
                          <td>{formatDuration(mDown)}</td>
                          <td>{formatDuration(yDown)}</td>
                          <td>{s.tier}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SloCalculator;
