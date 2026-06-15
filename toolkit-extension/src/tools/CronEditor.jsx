import { useState, useCallback, useEffect, useRef } from 'react';
import './CronEditor.css';

// ── Cron field definitions ──
const FIELDS = [
  { key: 'minute', label: 'Minute', min: 0, max: 59, names: null },
  { key: 'hour', label: 'Hour', min: 0, max: 23, names: null },
  { key: 'dom', label: 'Day of Month', min: 1, max: 31, names: null },
  { key: 'month', label: 'Month', min: 1, max: 12, names: ['', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] },
  { key: 'dow', label: 'Day of Week', min: 0, max: 6, names: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] },
];

// Standard 5-field cron: minute hour dom month dow
const PRESETS = [
  { label: 'Every minute', cron: '* * * * *' },
  { label: 'Every 5 minutes', cron: '*/5 * * * *' },
  { label: 'Every 15 minutes', cron: '*/15 * * * *' },
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Every 6 hours', cron: '0 */6 * * *' },
  { label: 'Daily at midnight', cron: '0 0 * * *' },
  { label: 'Daily at 9 AM', cron: '0 9 * * *' },
  { label: 'Weekly (Mon 9 AM)', cron: '0 9 * * 1' },
  { label: 'Monthly (1st midnight)', cron: '0 0 1 * *' },
  { label: 'Yearly (Jan 1 midnight)', cron: '0 0 1 1 *' },
  { label: 'Weekdays 9 AM', cron: '0 9 * * 1-5' },
  { label: 'Weekends noon', cron: '0 12 * * 0,6' },
];

// Extended 6-field (with seconds): second minute hour dom month dow
const EXTENDED_FIELDS = [
  { key: 'second', label: 'Second', min: 0, max: 59, names: null },
  ...FIELDS,
];

// ── Parse a single cron field token ──
function parseField(token, field) {
  if (token === '*') return { type: 'any' };
  
  // */N step
  const stepMatch = token.match(/^\*\/(\d+)$/);
  if (stepMatch) return { type: 'step', step: parseInt(stepMatch[1]) };
  
  // Range: N-M or N-M/S
  const rangeStepMatch = token.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (rangeStepMatch) return { type: 'range-step', from: +rangeStepMatch[1], to: +rangeStepMatch[2], step: +rangeStepMatch[3] };
  
  const rangeMatch = token.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) return { type: 'range', from: parseInt(rangeMatch[1]), to: parseInt(rangeMatch[2]) };
  
  // List of values: 1,3,5
  if (token.includes(',')) {
    return { type: 'list', values: token.split(',').map(v => parseInt(v)).filter(v => !isNaN(v)) };
  }
  
  // Single value
  const num = parseInt(token);
  if (!isNaN(num)) return { type: 'value', value: num };
  
  // Name (JAN, MON, etc)
  if (field.names) {
    const idx = field.names.findIndex(n => n && n.toLowerCase() === token.toLowerCase());
    if (idx >= 0) return { type: 'value', value: idx };
  }
  
  return { type: 'invalid' };
}

// ── Describe a parsed field in human-readable text ──
function describeField(parsed, field) {
  const nameFor = (v) => {
    if (field.names && field.names[v]) return field.names[v];
    if (field.key === 'hour') return `${v}:00`;
    return String(v);
  };
  
  switch (parsed.type) {
    case 'any': return `every ${field.label.toLowerCase()}`;
    case 'step': return `every ${parsed.step} ${field.label.toLowerCase()}${parsed.step > 1 ? 's' : ''}`;
    case 'range': return `${nameFor(parsed.from)} through ${nameFor(parsed.to)}`;
    case 'range-step': return `every ${parsed.step} from ${nameFor(parsed.from)} through ${nameFor(parsed.to)}`;
    case 'list': return parsed.values.map(nameFor).join(', ');
    case 'value': return `at ${nameFor(parsed.value)}`;
    default: return 'invalid';
  }
}

// ── Get next N run times ──
function getNextRuns(cronStr, count = 5) {
  const parts = cronStr.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) return [];
  
  const hasSeconds = parts.length === 6;
  const fields = hasSeconds ? EXTENDED_FIELDS : FIELDS;
  const tokens = parts;
  
  const parsed = tokens.map((t, i) => parseField(t, fields[i]));
  if (parsed.some(p => p.type === 'invalid')) return [];
  
  const matchesField = (value, p, field) => {
    switch (p.type) {
      case 'any': return true;
      case 'step': return value % p.step === 0;
      case 'range': return value >= p.from && value <= p.to;
      case 'range-step': return value >= p.from && value <= p.to && (value - p.from) % p.step === 0;
      case 'list': return p.values.includes(value);
      case 'value': return value === p.value;
      default: return false;
    }
  };
  
  const runs = [];
  const now = new Date();
  const d = new Date(now.getTime() + 60000); // start from next minute
  if (!hasSeconds) { d.setSeconds(0); d.setMilliseconds(0); }
  else { d.setMilliseconds(0); }
  
  let iterations = 0;
  const maxIter = 525600; // 1 year of minutes
  
  while (runs.length < count && iterations < maxIter) {
    iterations++;
    
    const sec = d.getSeconds();
    const min = d.getMinutes();
    const hr = d.getHours();
    const dom = d.getDate();
    const mon = d.getMonth() + 1;
    const dow = d.getDay();
    
    let match;
    if (hasSeconds) {
      match = matchesField(sec, parsed[0], fields[0]) &&
              matchesField(min, parsed[1], fields[1]) &&
              matchesField(hr, parsed[2], fields[2]) &&
              matchesField(dom, parsed[3], fields[3]) &&
              matchesField(mon, parsed[4], fields[4]) &&
              matchesField(dow, parsed[5], fields[5]);
    } else {
      match = matchesField(min, parsed[0], fields[0]) &&
              matchesField(hr, parsed[1], fields[1]) &&
              matchesField(dom, parsed[2], fields[2]) &&
              matchesField(mon, parsed[3], fields[3]) &&
              matchesField(dow, parsed[4], fields[4]);
    }
    
    if (match) {
      runs.push(new Date(d));
    }
    
    if (hasSeconds) {
      d.setSeconds(d.getSeconds() + 1);
    } else {
      d.setMinutes(d.getMinutes() + 1);
    }
  }
  
  return runs;
}

// ── Build human-readable description ──
function describeCron(cronStr) {
  const parts = cronStr.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) return 'Invalid cron expression';
  
  const hasSeconds = parts.length === 6;
  const fields = hasSeconds ? EXTENDED_FIELDS : FIELDS;
  const parsed = parts.map((t, i) => parseField(t, fields[i]));
  
  if (parsed.some(p => p.type === 'invalid')) return 'Invalid cron expression';
  
  const descs = parsed.map((p, i) => describeField(p, fields[i]));
  
  // Build sentence
  const pieces = [];
  if (hasSeconds) {
    if (parsed[0].type !== 'any') pieces.push(`Second: ${descs[0]}`);
  }
  
  const minIdx = hasSeconds ? 1 : 0;
  const hrIdx = hasSeconds ? 2 : 1;
  const domIdx = hasSeconds ? 3 : 2;
  const monIdx = hasSeconds ? 4 : 3;
  const dowIdx = hasSeconds ? 5 : 4;
  
  // Time
  if (parsed[minIdx].type === 'value' && parsed[hrIdx].type === 'value') {
    pieces.push(`At ${String(parsed[hrIdx].value).padStart(2, '0')}:${String(parsed[minIdx].value).padStart(2, '0')}`);
  } else {
    if (parsed[minIdx].type !== 'any') pieces.push(`Minute: ${descs[minIdx]}`);
    if (parsed[hrIdx].type !== 'any') pieces.push(`Hour: ${descs[hrIdx]}`);
  }
  
  if (parsed[domIdx].type !== 'any') pieces.push(`Day: ${descs[domIdx]}`);
  if (parsed[monIdx].type !== 'any') pieces.push(`Month: ${descs[monIdx]}`);
  if (parsed[dowIdx].type !== 'any') pieces.push(`Weekday: ${descs[dowIdx]}`);
  
  if (pieces.length === 0) {
    return hasSeconds ? 'Every second' : 'Every minute';
  }
  
  return pieces.join(', ');
}

// ── Validate cron expression ──
function validateCron(cronStr) {
  const parts = cronStr.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) return { valid: false, error: `Expected 5 or 6 fields, got ${parts.length}` };
  
  const hasSeconds = parts.length === 6;
  const fields = hasSeconds ? EXTENDED_FIELDS : FIELDS;
  
  for (let i = 0; i < parts.length; i++) {
    const token = parts[i];
    const field = fields[i];
    
    // Split by comma for lists
    const subTokens = token.split(',');
    for (const sub of subTokens) {
      if (sub === '*') continue;
      
      const stepMatch = sub.match(/^\*\/(\d+)$/);
      if (stepMatch) {
        const step = +stepMatch[1];
        if (step === 0) return { valid: false, error: `${field.label}: step cannot be 0` };
        continue;
      }
      
      const rangeStepMatch = sub.match(/^(\d+)-(\d+)\/(\d+)$/);
      if (rangeStepMatch) {
        const [, from, to, step] = rangeStepMatch.map(Number);
        if (from < field.min || from > field.max) return { valid: false, error: `${field.label}: ${from} out of range (${field.min}-${field.max})` };
        if (to < field.min || to > field.max) return { valid: false, error: `${field.label}: ${to} out of range (${field.min}-${field.max})` };
        if (step === 0) return { valid: false, error: `${field.label}: step cannot be 0` };
        continue;
      }
      
      const rangeMatch = sub.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        const from = +rangeMatch[1], to = +rangeMatch[2];
        if (from < field.min || from > field.max) return { valid: false, error: `${field.label}: ${from} out of range (${field.min}-${field.max})` };
        if (to < field.min || to > field.max) return { valid: false, error: `${field.label}: ${to} out of range (${field.min}-${field.max})` };
        continue;
      }
      
      const num = parseInt(sub);
      if (!isNaN(num)) {
        if (num < field.min || num > field.max) return { valid: false, error: `${field.label}: ${num} out of range (${field.min}-${field.max})` };
        continue;
      }
      
      // Check names
      if (field.names) {
        const idx = field.names.findIndex(n => n && n.toLowerCase() === sub.toLowerCase());
        if (idx >= 0) continue;
      }
      
      return { valid: false, error: `${field.label}: invalid token "${sub}"` };
    }
  }
  
  return { valid: true };
}

function CronEditor({ isOpen, onClose }) {
  const [expressions, setExpressions] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('cron-editor-exprs') || '[]');
      return saved.length > 0 ? saved : [{ id: 1, cron: '0 9 * * 1-5', name: 'Weekday 9AM' }];
    } catch { return [{ id: 1, cron: '0 9 * * 1-5', name: 'Weekday 9AM' }]; }
  });
  const [activeId, setActiveId] = useState(() => expressions[0]?.id || 1);
  const [editField, setEditField] = useState(null); // which field is being edited visually
  const [copied, setCopied] = useState('');
  const nextId = useRef(Math.max(...expressions.map(e => e.id), 0) + 1);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('cron-editor-exprs', JSON.stringify(expressions));
  }, [expressions]);

  const active = expressions.find(e => e.id === activeId) || expressions[0];

  const updateActive = useCallback((updates) => {
    setExpressions(prev => prev.map(e => e.id === activeId ? { ...e, ...updates } : e));
  }, [activeId]);

  const addExpression = () => {
    const id = nextId.current++;
    const newExpr = { id, cron: '* * * * *', name: `Cron #${id}` };
    setExpressions(prev => [...prev, newExpr]);
    setActiveId(id);
  };

  const removeExpression = (id) => {
    setExpressions(prev => {
      const next = prev.filter(e => e.id !== id);
      if (next.length === 0) {
        const newId = nextId.current++;
        const def = { id: newId, cron: '* * * * *', name: 'Default' };
        setActiveId(newId);
        return [def];
      }
      if (activeId === id) setActiveId(next[0].id);
      return next;
    });
  };

  const duplicateExpression = (expr) => {
    const id = nextId.current++;
    const dup = { id, cron: expr.cron, name: `${expr.name} (copy)` };
    setExpressions(prev => [...prev, dup]);
    setActiveId(id);
  };

  const handleCopy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1200);
    } catch { /* denied */ }
  };

  const handlePreset = (preset) => {
    updateActive({ cron: preset.cron });
  };

  // Parse current active cron
  const parts = (active?.cron || '').trim().split(/\s+/);
  const hasSeconds = parts.length === 6;
  const fields = hasSeconds ? EXTENDED_FIELDS : FIELDS;
  const validation = validateCron(active?.cron || '');
  const description = describeCron(active?.cron || '');
  const nextRuns = validation.valid ? getNextRuns(active?.cron || '') : [];

  // Update a single field
  const setField = (fieldIdx, value) => {
    const newParts = [...parts];
    while (newParts.length < (hasSeconds ? 6 : 5)) newParts.push('*');
    newParts[fieldIdx] = value;
    updateActive({ cron: newParts.join(' ') });
  };

  // Toggle seconds field
  const toggleSeconds = () => {
    if (hasSeconds) {
      updateActive({ cron: parts.slice(1).join(' ') });
    } else {
      updateActive({ cron: '0 ' + (active?.cron || '* * * * *') });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cron-overlay" onClick={onClose}>
      <div className="cron-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="cron-header">
          <div className="cron-header-left">
            <svg className="cron-header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="cron-header-title">Cron Editor</span>
            <span className="cron-header-count">{expressions.length} expr{expressions.length !== 1 ? 's' : ''}</span>
          </div>
          <button className="cron-close-btn" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="cron-body">
          {/* Sidebar: Expression List */}
          <div className="cron-sidebar">
            <div className="cron-sidebar-top">
              <span className="cron-sidebar-title">Expressions</span>
              <button className="cron-add-btn" onClick={addExpression} title="Add new expression">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
            <div className="cron-expr-list">
              {expressions.map(expr => (
                <div
                  key={expr.id}
                  className={`cron-expr-item${expr.id === activeId ? ' active' : ''}`}
                  onClick={() => setActiveId(expr.id)}
                >
                  <div className="cron-expr-item-top">
                    <span className="cron-expr-name">{expr.name}</span>
                    <div className="cron-expr-actions">
                      <button className="cron-expr-act-btn" onClick={e => { e.stopPropagation(); duplicateExpression(expr); }} title="Duplicate">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                      </button>
                      <button className="cron-expr-act-btn del" onClick={e => { e.stopPropagation(); removeExpression(expr.id); }} title="Delete">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                  </div>
                  <span className="cron-expr-cron">{expr.cron}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Main Editor */}
          <div className="cron-main">
            {active && (
              <>
                {/* Name + Cron Input */}
                <div className="cron-input-area">
                  <input
                    className="cron-name-input"
                    value={active.name}
                    onChange={e => updateActive({ name: e.target.value })}
                    placeholder="Expression name..."
                  />
                  <div className="cron-input-row">
                    <div className={`cron-input-box${!validation.valid ? ' error' : ''}`}>
                      <input
                        className="cron-input"
                        value={active.cron}
                        onChange={e => updateActive({ cron: e.target.value })}
                        placeholder="* * * * *"
                        spellCheck={false}
                      />
                    </div>
                    <button
                      className={`cron-copy-btn${copied === 'cron' ? ' copied' : ''}`}
                      onClick={() => handleCopy(active.cron, 'cron')}
                    >
                      {copied === 'cron' ? '✓' : 'Copy'}
                    </button>
                    <label className="cron-sec-toggle" title="Include seconds field">
                      <input type="checkbox" checked={hasSeconds} onChange={toggleSeconds} />
                      <span>Sec</span>
                    </label>
                  </div>
                </div>

                {/* Field Labels */}
                <div className="cron-field-labels">
                  {fields.map((f, i) => (
                    <div key={f.key} className="cron-field-label-col">
                      <span className="cron-field-name">{f.label}</span>
                      <span className={`cron-field-token${parts[i] && parseField(parts[i] || '*', f).type === 'invalid' ? ' invalid' : ''}`}>
                        {parts[i] || '*'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Validation & Description */}
                {!validation.valid && (
                  <div className="cron-error">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                    {validation.error}
                  </div>
                )}

                {validation.valid && (
                  <div className="cron-description">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                    {description}
                  </div>
                )}

                {/* Visual Field Editors */}
                <div className="cron-field-editors">
                  {fields.map((field, idx) => {
                    const token = parts[idx] || '*';
                    const isOpen = editField === field.key;
                    return (
                      <div key={field.key} className="cron-feditor">
                        <button
                          className={`cron-feditor-toggle${isOpen ? ' open' : ''}`}
                          onClick={() => setEditField(isOpen ? null : field.key)}
                        >
                          <span className="cron-feditor-label">{field.label}</span>
                          <span className="cron-feditor-value">{token}</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                        {isOpen && (
                          <div className="cron-feditor-body">
                            {/* Quick options */}
                            <div className="cron-feditor-quick">
                              <button className={`cron-fq-btn${token === '*' ? ' active' : ''}`} onClick={() => setField(idx, '*')}>Every</button>
                              {[2, 3, 5, 10, 15, 30].filter(s => s <= field.max).map(s => (
                                <button key={s} className={`cron-fq-btn${token === `*/${s}` ? ' active' : ''}`} onClick={() => setField(idx, `*/${s}`)}>*/{s}</button>
                              ))}
                            </div>
                            {/* Value grid */}
                            <div className="cron-feditor-grid">
                              {Array.from({ length: field.max - field.min + 1 }, (_, i) => field.min + i).map(v => {
                                const display = field.names ? (field.names[v] || v) : v;
                                const selected = token.split(',').includes(String(v));
                                return (
                                  <button
                                    key={v}
                                    className={`cron-grid-btn${selected ? ' selected' : ''}`}
                                    onClick={() => {
                                      const currentVals = token === '*' ? [] : token.split(',').map(Number).filter(n => !isNaN(n));
                                      let newVals;
                                      if (selected) {
                                        newVals = currentVals.filter(x => x !== v);
                                      } else {
                                        newVals = [...currentVals, v].sort((a, b) => a - b);
                                      }
                                      setField(idx, newVals.length === 0 ? '*' : newVals.join(','));
                                    }}
                                  >
                                    {display}
                                  </button>
                                );
                              })}
                            </div>
                            {/* Range input */}
                            <div className="cron-feditor-range">
                              <span className="cron-range-label">Custom:</span>
                              <input
                                className="cron-range-input"
                                value={token}
                                onChange={e => setField(idx, e.target.value)}
                                placeholder={`${field.min}-${field.max}`}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Presets */}
                <div className="cron-presets">
                  <span className="cron-section-label">Quick Presets</span>
                  <div className="cron-preset-grid">
                    {PRESETS.map((p, i) => (
                      <button key={i} className={`cron-preset-btn${active.cron === p.cron ? ' active' : ''}`} onClick={() => handlePreset(p)} title={p.cron}>
                        <span className="cron-preset-label">{p.label}</span>
                        <span className="cron-preset-cron">{p.cron}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Next Runs */}
                {nextRuns.length > 0 && (
                  <div className="cron-next-runs">
                    <span className="cron-section-label">Next 5 Runs</span>
                    <div className="cron-runs-list">
                      {nextRuns.map((d, i) => (
                        <div key={i} className="cron-run-item">
                          <span className="cron-run-idx">#{i + 1}</span>
                          <span className="cron-run-date">{d.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
                          <span className="cron-run-time">{d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: hasSeconds ? '2-digit' : undefined })}</span>
                          <span className="cron-run-rel">{getRelativeTime(d)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cheat Sheet */}
                <details className="cron-cheat">
                  <summary className="cron-cheat-summary">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
                    Cron Syntax Reference
                  </summary>
                  <div className="cron-cheat-body">
                    <table className="cron-cheat-table">
                      <thead>
                        <tr><th>Symbol</th><th>Meaning</th><th>Example</th></tr>
                      </thead>
                      <tbody>
                        <tr><td>*</td><td>Any value</td><td>* (every minute)</td></tr>
                        <tr><td>,</td><td>Value list</td><td>1,3,5 (at 1, 3, 5)</td></tr>
                        <tr><td>-</td><td>Range</td><td>1-5 (1 through 5)</td></tr>
                        <tr><td>/</td><td>Step</td><td>*/15 (every 15)</td></tr>
                        <tr><td>*/N</td><td>Every N</td><td>*/5 (every 5 min)</td></tr>
                        <tr><td>N-M/S</td><td>Range with step</td><td>1-30/5 (1 to 30, step 5)</td></tr>
                      </tbody>
                    </table>
                    <div className="cron-cheat-format">
                      <code>┌──── minute (0-59)</code>
                      <code>│ ┌──── hour (0-23)</code>
                      <code>│ │ ┌──── day of month (1-31)</code>
                      <code>│ │ │ ┌──── month (1-12)</code>
                      <code>│ │ │ │ ┌──── day of week (0-6, Sun=0)</code>
                      <code>* * * * *</code>
                    </div>
                  </div>
                </details>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getRelativeTime(date) {
  const now = new Date();
  const diff = date - now;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `in ${days}d ${hrs % 24}h`;
}

export default CronEditor;
