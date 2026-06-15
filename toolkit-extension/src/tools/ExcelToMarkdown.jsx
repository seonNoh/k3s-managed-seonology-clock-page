import { useState, useCallback, useRef } from 'react';
import './ExcelToMarkdown.css';

/* ──────── helpers ──────── */

function parseTSV(text) {
  if (!text.trim()) return [];
  const lines = text.split('\n');
  return lines
    .map(line => line.replace(/\r$/, ''))
    .filter(line => line.length > 0)
    .map(line => line.split('\t'));
}

function parseCSV(text) {
  if (!text.trim()) return [];
  const rows = [];
  let current = '';
  let inQuotes = false;
  const chars = text.replace(/\r\n/g, '\n');

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === '"') {
      if (inQuotes && chars[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      if (!rows.length) rows.push([]);
      rows[rows.length - 1].push(current);
      current = '';
    } else if (ch === '\n' && !inQuotes) {
      if (!rows.length) rows.push([]);
      rows[rows.length - 1].push(current);
      current = '';
      rows.push([]);
    } else {
      current += ch;
    }
  }
  if (current || (rows.length && rows[rows.length - 1])) {
    if (!rows.length) rows.push([]);
    rows[rows.length - 1].push(current);
  }
  return rows.filter(r => r.some(c => c.trim().length > 0));
}

function detectFormat(text) {
  const lines = text.split('\n').slice(0, 5);
  let tabCount = 0;
  let commaCount = 0;
  lines.forEach(l => {
    tabCount += (l.match(/\t/g) || []).length;
    commaCount += (l.match(/,/g) || []).length;
  });
  return tabCount >= commaCount ? 'tsv' : 'csv';
}

function toMarkdownTable(rows, options = {}) {
  if (!rows.length) return '';
  const { align = 'left', firstRowHeader = true, trimCells = true, compactMode = false } = options;

  let data = rows.map(row => row.map(cell => {
    let c = trimCells ? (cell || '').trim() : (cell || '');
    c = c.replace(/\|/g, '\\|');
    return c;
  }));

  // normalize column count
  const maxCols = Math.max(...data.map(r => r.length));
  data = data.map(r => {
    while (r.length < maxCols) r.push('');
    return r;
  });

  if (data.length === 0 || maxCols === 0) return '';

  const header = firstRowHeader ? data[0] : data[0].map((_, i) => `Col ${i + 1}`);
  const body = firstRowHeader ? data.slice(1) : data;

  // column widths
  const colWidths = header.map((h, i) => {
    const cells = [h, ...body.map(r => r[i] || '')];
    return Math.max(3, ...cells.map(c => c.length));
  });

  const pad = (s, w) => compactMode ? s : s + ' '.repeat(Math.max(0, w - s.length));

  const sep = compactMode ? '|' : '| ';
  const end = compactMode ? '|' : ' |';
  const mid = compactMode ? '|' : ' | ';

  // header row
  const headerLine = sep + header.map((h, i) => pad(h, colWidths[i])).join(mid) + end;

  // separator row
  const sepLine = sep + header.map((_, i) => {
    const w = compactMode ? 3 : colWidths[i];
    if (align === 'center') return ':' + '-'.repeat(Math.max(1, w - 2)) + ':';
    if (align === 'right') return '-'.repeat(Math.max(1, w - 1)) + ':';
    return ':' + '-'.repeat(Math.max(1, w - 1));
  }).join(mid) + end;

  // body rows
  const bodyLines = body.map(row =>
    sep + row.map((cell, i) => pad(cell, colWidths[i])).join(mid) + end
  );

  return [headerLine, sepLine, ...bodyLines].join('\n');
}

function toHTMLTable(rows, firstRowHeader = true) {
  if (!rows.length) return '';
  const header = firstRowHeader ? rows[0] : null;
  const body = firstRowHeader ? rows.slice(1) : rows;

  let html = '<table>\n';
  if (header) {
    html += '  <thead>\n    <tr>\n';
    header.forEach(h => { html += `      <th>${escapeHtml(h?.trim() || '')}</th>\n`; });
    html += '    </tr>\n  </thead>\n';
  }
  html += '  <tbody>\n';
  body.forEach(row => {
    html += '    <tr>\n';
    row.forEach(cell => { html += `      <td>${escapeHtml(cell?.trim() || '')}</td>\n`; });
    html += '    </tr>\n';
  });
  html += '  </tbody>\n</table>';
  return html;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ──────── sample data ──────── */
const SAMPLE_TSV = `Name\tRole\tTeam\tStatus
Alice\tBackend\tPlatform\tActive
Bob\tFrontend\tProduct\tActive
Charlie\tDevOps\tInfra\tOn Leave
Diana\tDesign\tProduct\tActive
Eve\tQA\tPlatform\tActive`;

const SAMPLE_CSV = `Service,CPU,Memory,Replicas,Health
api-gateway,250m,512Mi,3,Healthy
auth-service,100m,256Mi,2,Healthy
user-service,200m,384Mi,2,Degraded
payment-service,500m,1Gi,4,Healthy
notification-svc,100m,128Mi,1,Down`;

/* ──────── component ──────── */

export default function ExcelToMarkdown({ isOpen, onClose }) {
  const [input, setInput] = useState('');
  const [format, setFormat] = useState('auto');
  const [outputFormat, setOutputFormat] = useState('markdown');
  const [align, setAlign] = useState('left');
  const [firstRowHeader, setFirstRowHeader] = useState(true);
  const [trimCells, setTrimCells] = useState(true);
  const [compactMode, setCompactMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState([]);
  const textareaRef = useRef(null);

  const getRows = useCallback(() => {
    if (!input.trim()) return [];
    const fmt = format === 'auto' ? detectFormat(input) : format;
    return fmt === 'csv' ? parseCSV(input) : parseTSV(input);
  }, [input, format]);

  const output = (() => {
    const rows = getRows();
    if (!rows.length) return '';
    if (outputFormat === 'markdown') {
      return toMarkdownTable(rows, { align, firstRowHeader, trimCells, compactMode });
    }
    return toHTMLTable(rows, firstRowHeader);
  })();

  const rows = getRows();
  const colCount = rows.length > 0 ? Math.max(...rows.map(r => r.length)) : 0;
  const rowCount = rows.length;

  const handlePaste = useCallback((e) => {
    // The browser automatically converts spreadsheet paste to TSV
    const text = e.clipboardData.getData('text/plain');
    if (text) {
      e.preventDefault();
      setInput(text);
      if (format === 'auto') {
        // auto-detect will handle it
      }
    }
  }, [format]);

  const handleCopy = useCallback(() => {
    if (!output) return;
    const currentRowCount = rowCount;
    const currentColCount = colCount;
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      // add to history
      setHistory(prev => {
        const entry = { output: output.slice(0, 200), rows: currentRowCount, cols: currentColCount, time: Date.now() };
        const next = [entry, ...prev].slice(0, 10);
        return next;
      });
    });
  }, [output, rowCount, colCount]);

  const loadSample = useCallback((type) => {
    if (type === 'tsv') {
      setInput(SAMPLE_TSV);
      setFormat('tsv');
    } else {
      setInput(SAMPLE_CSV);
      setFormat('csv');
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div className="e2m-overlay" onClick={onClose}>
      <div className="e2m-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="e2m-header">
          <div className="e2m-title-row">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
            </svg>
            <h2>Excel → Markdown Table</h2>
          </div>
          <button className="e2m-close" onClick={onClose}>✕</button>
        </div>

        <div className="e2m-body">
          {/* Input section */}
          <div className="e2m-input-section">
            <div className="e2m-toolbar">
              <span className="e2m-toolbar-label">Input</span>
              <div className="e2m-toolbar-actions">
                <button className="e2m-btn-sm" onClick={() => loadSample('tsv')}>Sample TSV</button>
                <button className="e2m-btn-sm" onClick={() => loadSample('csv')}>Sample CSV</button>
                <button className="e2m-btn-sm e2m-btn-danger" onClick={() => { setInput(''); }}>Clear</button>
              </div>
            </div>
            <div className="e2m-paste-zone">
              <textarea
                ref={textareaRef}
                className="e2m-textarea"
                value={input}
                onChange={e => setInput(e.target.value)}
                onPaste={handlePaste}
                placeholder={'Excel / Google Sheets 데이터를 여기에 붙여넣기 (Ctrl+V)\n또는 TSV / CSV 텍스트를 직접 입력하세요.\n\n예시:\nName\\tAge\\tCity\nAlice\\t30\\tSeoul\nBob\\t25\\tBusan'}
                spellCheck={false}
              />
              {!input && (
                <div className="e2m-paste-hint">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                    <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
                    <path d="M12 11v6M9 14h6" />
                  </svg>
                  <span>Paste from Excel / Sheets</span>
                </div>
              )}
            </div>

            {/* Options */}
            <div className="e2m-options">
              <div className="e2m-opt-group">
                <label className="e2m-opt-label">Format</label>
                <div className="e2m-opt-btns">
                  {['auto', 'tsv', 'csv'].map(f => (
                    <button key={f} className={`e2m-opt-btn ${format === f ? 'active' : ''}`} onClick={() => setFormat(f)}>
                      {f === 'auto' ? 'Auto' : f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="e2m-opt-group">
                <label className="e2m-opt-label">Output</label>
                <div className="e2m-opt-btns">
                  {[['markdown', 'Markdown'], ['html', 'HTML']].map(([v, l]) => (
                    <button key={v} className={`e2m-opt-btn ${outputFormat === v ? 'active' : ''}`} onClick={() => setOutputFormat(v)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {outputFormat === 'markdown' && (
                <div className="e2m-opt-group">
                  <label className="e2m-opt-label">Align</label>
                  <div className="e2m-opt-btns">
                    {[['left', '←'], ['center', '↔'], ['right', '→']].map(([v, icon]) => (
                      <button key={v} className={`e2m-opt-btn ${align === v ? 'active' : ''}`} onClick={() => setAlign(v)} title={v}>
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="e2m-opt-toggles">
                <label className="e2m-toggle">
                  <input type="checkbox" checked={firstRowHeader} onChange={e => setFirstRowHeader(e.target.checked)} />
                  <span>First row as header</span>
                </label>
                <label className="e2m-toggle">
                  <input type="checkbox" checked={trimCells} onChange={e => setTrimCells(e.target.checked)} />
                  <span>Trim cells</span>
                </label>
                {outputFormat === 'markdown' && (
                  <label className="e2m-toggle">
                    <input type="checkbox" checked={compactMode} onChange={e => setCompactMode(e.target.checked)} />
                    <span>Compact</span>
                  </label>
                )}
              </div>
            </div>

            {/* Stats */}
            {rows.length > 0 && (
              <div className="e2m-stats">
                <span className="e2m-stat">{rowCount} rows</span>
                <span className="e2m-stat-sep">·</span>
                <span className="e2m-stat">{colCount} cols</span>
                <span className="e2m-stat-sep">·</span>
                <span className="e2m-stat">{format === 'auto' ? detectFormat(input).toUpperCase() : format.toUpperCase()}</span>
              </div>
            )}
          </div>

          {/* Output section */}
          <div className="e2m-output-section">
            <div className="e2m-toolbar">
              <span className="e2m-toolbar-label">
                {outputFormat === 'markdown' ? 'Markdown Output' : 'HTML Output'}
              </span>
              <button
                className={`e2m-btn-copy ${copied ? 'copied' : ''}`}
                onClick={handleCopy}
                disabled={!output}
              >
                {copied ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                    Copy
                  </>
                )}
              </button>
            </div>
            <pre className="e2m-output-code">{output || 'Output will appear here...'}</pre>

            {/* Preview */}
            {rows.length > 0 && (
              <div className="e2m-preview-section">
                <div className="e2m-toolbar">
                  <span className="e2m-toolbar-label">Table Preview</span>
                </div>
                <div className="e2m-preview-scroll">
                  <table className="e2m-preview-table">
                    {firstRowHeader && rows.length > 0 && (
                      <thead>
                        <tr>
                          {rows[0].map((cell, i) => (
                            <th key={i} style={{ textAlign: align }}>{cell?.trim() || ''}</th>
                          ))}
                        </tr>
                      </thead>
                    )}
                    <tbody>
                      {(firstRowHeader ? rows.slice(1) : rows).map((row, ri) => (
                        <tr key={ri}>
                          {row.map((cell, ci) => (
                            <td key={ci} style={{ textAlign: align }}>{cell?.trim() || ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* History */}
            {history.length > 0 && (
              <div className="e2m-history">
                <span className="e2m-history-label">Recent copies</span>
                <div className="e2m-history-list">
                  {history.map((h, i) => (
                    <div key={i} className="e2m-history-item">
                      <span className="e2m-history-meta">{h.rows}×{h.cols}</span>
                      <span className="e2m-history-preview">{h.output.split('\n')[0]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
