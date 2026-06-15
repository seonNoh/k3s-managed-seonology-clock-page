import { useState, useCallback, useEffect, useRef } from 'react';
import './ColorPicker.css';

// ── Color conversion utilities ──

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function rgbToHsl({ r, g, b }) {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
  else if (max === gg) h = ((bb - rr) / d + 2) / 6;
  else h = ((rr - gg) / d + 4) / 6;
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb({ h, s, l }) {
  const hh = h / 360, ss = s / 100, ll = l / 100;
  if (ss === 0) { const v = Math.round(ll * 255); return { r: v, g: v, b: v }; }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  return {
    r: Math.round(hue2rgb(p, q, hh + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hh) * 255),
    b: Math.round(hue2rgb(p, q, hh - 1 / 3) * 255),
  };
}

function rgbToHsv({ r, g, b }) {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
    else if (max === gg) h = ((bb - rr) / d + 2) / 6;
    else h = ((rr - gg) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), v: Math.round(v * 100) };
}

function hsvToRgb({ h, s, v }) {
  const hh = h / 360, ss = s / 100, vv = v / 100;
  const i = Math.floor(hh * 6);
  const f = hh * 6 - i;
  const p = vv * (1 - ss), q = vv * (1 - f * ss), t = vv * (1 - (1 - f) * ss);
  let r, g, b;
  switch (i % 6) {
    case 0: r = vv; g = t; b = p; break;
    case 1: r = q; g = vv; b = p; break;
    case 2: r = p; g = vv; b = t; break;
    case 3: r = p; g = q; b = vv; break;
    case 4: r = t; g = p; b = vv; break;
    case 5: r = vv; g = p; b = q; break;
    default: r = 0; g = 0; b = 0;
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function rgbToCmyk({ r, g, b }) {
  if (r === 0 && g === 0 && b === 0) return { c: 0, m: 0, y: 0, k: 100 };
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const k = 1 - Math.max(rr, gg, bb);
  return {
    c: Math.round(((1 - rr - k) / (1 - k)) * 100),
    m: Math.round(((1 - gg - k) / (1 - k)) * 100),
    y: Math.round(((1 - bb - k) / (1 - k)) * 100),
    k: Math.round(k * 100),
  };
}

function getLuminance({ r, g, b }) {
  const [rr, gg, bb] = [r, g, b].map(v => {
    v = v / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
}

function getContrastRatio(rgb1, rgb2) {
  const l1 = getLuminance(rgb1);
  const l2 = getLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── Harmony generators ──
function getHarmony(h, type) {
  const wrap = (v) => ((v % 360) + 360) % 360;
  switch (type) {
    case 'complementary': return [h, wrap(h + 180)];
    case 'analogous': return [wrap(h - 30), h, wrap(h + 30)];
    case 'triadic': return [h, wrap(h + 120), wrap(h + 240)];
    case 'split': return [h, wrap(h + 150), wrap(h + 210)];
    case 'tetradic': return [h, wrap(h + 90), wrap(h + 180), wrap(h + 270)];
    default: return [h];
  }
}

const HARMONIES = [
  { key: 'complementary', label: 'Complementary' },
  { key: 'analogous', label: 'Analogous' },
  { key: 'triadic', label: 'Triadic' },
  { key: 'split', label: 'Split-Comp' },
  { key: 'tetradic', label: 'Tetradic' },
];

const CSS_COLORS = {
  red: '#ff0000', blue: '#0000ff', green: '#008000', yellow: '#ffff00',
  orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', white: '#ffffff',
  black: '#000000', gray: '#808080', cyan: '#00ffff', magenta: '#ff00ff',
  coral: '#ff7f50', salmon: '#fa8072', gold: '#ffd700', lime: '#00ff00',
  teal: '#008080', navy: '#000080', indigo: '#4b0082', violet: '#ee82ee',
  tomato: '#ff6347', chocolate: '#d2691e', crimson: '#dc143c', turquoise: '#40e0d0',
};

function ColorPicker({ isOpen, onClose }) {
  const [hex, setHex] = useState('#3b82f6');
  const [rgb, setRgb] = useState({ r: 59, g: 130, b: 246 });
  const [hsl, setHsl] = useState({ h: 217, s: 91, l: 60 });
  const [hsv, setHsv] = useState({ h: 217, s: 76, v: 96 });
  const [alpha, setAlpha] = useState(100);
  const [harmony, setHarmony] = useState('complementary');
  const [copied, setCopied] = useState('');
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('color-picker-history') || '[]'); } catch { return []; }
  });
  const [eyedropperSupported] = useState(() => typeof window !== 'undefined' && 'EyeDropper' in window);
  const [inputHex, setInputHex] = useState('#3b82f6');
  const [savedPalette, setSavedPalette] = useState(() => {
    try { return JSON.parse(localStorage.getItem('color-picker-palette') || '[]'); } catch { return []; }
  });
  const [cssInput, setCssInput] = useState('');

  const canvasRef = useRef(null);
  const hueBarRef = useRef(null);
  const isDragging = useRef(false);
  const isDraggingHue = useRef(false);

  const addToHistory = useCallback((hexVal) => {
    setHistory(prev => {
      const next = [hexVal, ...prev.filter(h => h !== hexVal)].slice(0, 24);
      localStorage.setItem('color-picker-history', JSON.stringify(next));
      return next;
    });
  }, []);

  // Sync all formats from RGB
  const syncFromRgb = useCallback((r, g, b, addHist = true) => {
    const newRgb = { r, g, b };
    const newHex = rgbToHex(newRgb);
    const newHsl = rgbToHsl(newRgb);
    const newHsv = rgbToHsv(newRgb);
    setRgb(newRgb);
    setHex(newHex);
    setInputHex(newHex);
    setHsl(newHsl);
    setHsv(newHsv);
    if (addHist) addToHistory(newHex);
  }, [addToHistory]);

  const syncFromHex = useCallback((h) => {
    const clean = h.replace('#', '');
    if (clean.length === 3 || clean.length === 6) {
      const { r, g, b } = hexToRgb(h);
      syncFromRgb(r, g, b);
    }
  }, [syncFromRgb]);

  const syncFromHsl = useCallback((h, s, l) => {
    const { r, g, b } = hslToRgb({ h, s, l });
    syncFromRgb(r, g, b);
  }, [syncFromRgb]);

  const syncFromHsv = useCallback((h, s, v) => {
    const { r, g, b } = hsvToRgb({ h, s, v });
    syncFromRgb(r, g, b);
  }, [syncFromRgb]);

  // ── Canvas: SV picker ──
  const drawSVCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;

    // Hue base color
    const hueColor = hsvToRgb({ h: hsv.h, s: 100, v: 100 });

    // Horizontal: saturation (white → hue)
    const gradH = ctx.createLinearGradient(0, 0, w, 0);
    gradH.addColorStop(0, '#fff');
    gradH.addColorStop(1, rgbToHex(hueColor));
    ctx.fillStyle = gradH;
    ctx.fillRect(0, 0, w, h);

    // Vertical: value (transparent → black)
    const gradV = ctx.createLinearGradient(0, 0, 0, h);
    gradV.addColorStop(0, 'rgba(0,0,0,0)');
    gradV.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gradV;
    ctx.fillRect(0, 0, w, h);
  }, [hsv.h]);

  useEffect(() => { drawSVCanvas(); }, [drawSVCanvas]);

  const handleCanvasInteraction = useCallback((e, rect) => {
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    const s = Math.round((x / rect.width) * 100);
    const v = Math.round(100 - (y / rect.height) * 100);
    syncFromHsv(hsv.h, s, v);
  }, [hsv.h, syncFromHsv]);

  const handleCanvasDown = (e) => {
    isDragging.current = true;
    handleCanvasInteraction(e, canvasRef.current.getBoundingClientRect());
  };

  const handleHueDown = (e) => {
    isDraggingHue.current = true;
    const rect = hueBarRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const h = Math.round((x / rect.width) * 360);
    syncFromHsv(h, hsv.s, hsv.v);
  };

  useEffect(() => {
    const handleMove = (e) => {
      if (isDragging.current && canvasRef.current) {
        handleCanvasInteraction(e, canvasRef.current.getBoundingClientRect());
      }
      if (isDraggingHue.current && hueBarRef.current) {
        const rect = hueBarRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const h = Math.round((x / rect.width) * 360);
        syncFromHsv(h, hsv.s, hsv.v);
      }
    };
    const handleUp = () => {
      isDragging.current = false;
      isDraggingHue.current = false;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [handleCanvasInteraction, hsv.s, hsv.v, syncFromHsv]);

  // EyeDropper
  const handleEyeDropper = async () => {
    if (!eyedropperSupported) return;
    try {
      const dropper = new window.EyeDropper();
      const result = await dropper.open();
      syncFromHex(result.sRGBHex);
    } catch { /* cancelled */ }
  };

  // Copy
  const handleCopy = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1200);
    } catch { /* denied */ }
  };

  // Save to palette
  const saveToPalette = () => {
    setSavedPalette(prev => {
      if (prev.includes(hex)) return prev;
      const next = [...prev, hex].slice(-32);
      localStorage.setItem('color-picker-palette', JSON.stringify(next));
      return next;
    });
  };

  const removeFromPalette = (h) => {
    setSavedPalette(prev => {
      const next = prev.filter(c => c !== h);
      localStorage.setItem('color-picker-palette', JSON.stringify(next));
      return next;
    });
  };

  // Parse CSS color input
  const handleCssInput = () => {
    const val = cssInput.trim().toLowerCase();
    if (!val) return;

    // Named color
    if (CSS_COLORS[val]) { syncFromHex(CSS_COLORS[val]); setCssInput(''); return; }

    // hex
    const hexMatch = val.match(/^#?([0-9a-f]{3,6})$/);
    if (hexMatch) { syncFromHex('#' + hexMatch[1]); setCssInput(''); return; }

    // rgb(r, g, b) or rgba
    const rgbMatch = val.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgbMatch) {
      syncFromRgb(+rgbMatch[1], +rgbMatch[2], +rgbMatch[3]);
      setCssInput('');
      return;
    }

    // hsl(h, s%, l%)
    const hslMatch = val.match(/hsla?\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?/);
    if (hslMatch) {
      syncFromHsl(+hslMatch[1], +hslMatch[2], +hslMatch[3]);
      setCssInput('');
      return;
    }
  };

  // Contrast
  const contrastWhite = getContrastRatio(rgb, { r: 255, g: 255, b: 255 });
  const contrastBlack = getContrastRatio(rgb, { r: 0, g: 0, b: 0 });
  const cmyk = rgbToCmyk(rgb);
  const luminance = getLuminance(rgb);
  const textColor = luminance > 0.5 ? '#000' : '#fff';

  // Formatted strings
  const fmtHex = alpha < 100 ? hex + Math.round(alpha * 2.55).toString(16).padStart(2, '0') : hex;
  const fmtRgb = alpha < 100 ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(alpha / 100).toFixed(2)})` : `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  const fmtHsl = alpha < 100 ? `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${(alpha / 100).toFixed(2)})` : `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
  const fmtHsv = `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`;
  const fmtCmyk = `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`;

  // Harmony colors
  const harmonyHues = getHarmony(hsl.h, harmony);
  const harmonyColors = harmonyHues.map(h => {
    const hRgb = hslToRgb({ h, s: hsl.s, l: hsl.l });
    return { hex: rgbToHex(hRgb), h };
  });

  if (!isOpen) return null;

  return (
    <div className="cpick-overlay" onClick={onClose}>
      <div className="cpick-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="cpick-header">
          <div className="cpick-header-left">
            <svg className="cpick-header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="13.5" cy="6.5" r="2.5" />
              <path d="M17.545 11.009A8 8 0 1 1 12.68 3.027" />
              <circle cx="7" cy="13" r="1.5" fill="currentColor" />
              <circle cx="11" cy="17" r="1.5" fill="currentColor" />
              <circle cx="16" cy="14.5" r="1.5" fill="currentColor" />
            </svg>
            <span className="cpick-header-title">Color Picker</span>
          </div>
          <button className="cpick-close-btn" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="cpick-body">
          {/* Left: Picker */}
          <div className="cpick-picker-col">
            {/* SV Canvas */}
            <div className="cpick-canvas-wrap">
              <canvas
                ref={canvasRef}
                className="cpick-canvas"
                width={280}
                height={180}
                onMouseDown={handleCanvasDown}
              />
              <div
                className="cpick-sv-cursor"
                style={{
                  left: `${hsv.s}%`,
                  top: `${100 - hsv.v}%`,
                  borderColor: luminance > 0.5 ? '#333' : '#fff',
                }}
              />
            </div>

            {/* Hue Bar */}
            <div className="cpick-hue-wrap">
              <div
                ref={hueBarRef}
                className="cpick-hue-bar"
                onMouseDown={handleHueDown}
              >
                <div
                  className="cpick-hue-cursor"
                  style={{ left: `${(hsv.h / 360) * 100}%` }}
                />
              </div>
            </div>

            {/* Alpha Bar */}
            <div className="cpick-alpha-wrap">
              <div className="cpick-alpha-label">Alpha</div>
              <input
                type="range"
                min="0"
                max="100"
                value={alpha}
                onChange={e => setAlpha(Number(e.target.value))}
                className="cpick-alpha-slider"
                style={{ background: `linear-gradient(to right, transparent, ${hex})` }}
              />
              <span className="cpick-alpha-val">{alpha}%</span>
            </div>

            {/* Tools Row */}
            <div className="cpick-tools-row">
              {eyedropperSupported && (
                <button className="cpick-tool-btn eyedropper" onClick={handleEyeDropper} title="Screen Eyedropper (works outside browser)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m2 22 1-1h3l9-9" /><path d="M3 21v-3l9-9" />
                    <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3L15 6" />
                  </svg>
                  Eyedropper
                </button>
              )}
              <button className="cpick-tool-btn save" onClick={saveToPalette} title="Save to palette">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Save
              </button>
              <button className="cpick-tool-btn random" onClick={() => syncFromRgb(Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256))} title="Random color">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" />
                  <circle cx="8" cy="8" r="1.5" fill="currentColor" /><circle cx="16" cy="16" r="1.5" fill="currentColor" />
                </svg>
                Random
              </button>
            </div>

            {/* CSS Input */}
            <div className="cpick-css-input-row">
              <input
                className="cpick-css-input"
                value={cssInput}
                onChange={e => setCssInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCssInput()}
                placeholder="Enter CSS color (hex, rgb, hsl, name...)"
              />
              <button className="cpick-css-go" onClick={handleCssInput}>Parse</button>
            </div>
          </div>

          {/* Right: Values */}
          <div className="cpick-values-col">
            {/* Preview */}
            <div className="cpick-preview" style={{ background: fmtRgb }}>
              <span className="cpick-preview-text" style={{ color: textColor }}>{fmtHex.toUpperCase()}</span>
            </div>

            {/* Format Rows */}
            <div className="cpick-formats">
              {[
                { key: 'hex', label: 'HEX', value: fmtHex.toUpperCase() },
                { key: 'rgb', label: 'RGB', value: fmtRgb },
                { key: 'hsl', label: 'HSL', value: fmtHsl },
                { key: 'hsv', label: 'HSV', value: fmtHsv },
                { key: 'cmyk', label: 'CMYK', value: fmtCmyk },
              ].map(f => (
                <div key={f.key} className="cpick-fmt-row" onClick={() => handleCopy(f.key, f.value)}>
                  <span className="cpick-fmt-label">{f.label}</span>
                  <span className="cpick-fmt-value">{f.value}</span>
                  {copied === f.key && <span className="cpick-fmt-copied">Copied!</span>}
                </div>
              ))}
            </div>

            {/* RGB Inputs */}
            <div className="cpick-rgb-inputs">
              <div className="cpick-input-group">
                <label>HEX</label>
                <input
                  value={inputHex}
                  onChange={e => {
                    setInputHex(e.target.value);
                    const v = e.target.value.replace('#', '');
                    if (v.length === 3 || v.length === 6) syncFromHex('#' + v);
                  }}
                  className="cpick-hex-input"
                  maxLength={7}
                />
              </div>
              {[
                { k: 'r', label: 'R', max: 255 },
                { k: 'g', label: 'G', max: 255 },
                { k: 'b', label: 'B', max: 255 },
              ].map(({ k, label, max }) => (
                <div key={k} className="cpick-input-group">
                  <label>{label}</label>
                  <input
                    type="number"
                    min={0}
                    max={max}
                    value={rgb[k]}
                    onChange={e => syncFromRgb(
                      k === 'r' ? +e.target.value : rgb.r,
                      k === 'g' ? +e.target.value : rgb.g,
                      k === 'b' ? +e.target.value : rgb.b,
                    )}
                    className="cpick-num-input"
                  />
                </div>
              ))}
            </div>

            {/* Contrast */}
            <div className="cpick-contrast">
              <span className="cpick-contrast-label">Contrast</span>
              <div className="cpick-contrast-chips">
                <span className="cpick-contrast-chip" style={{ background: hex, color: '#fff' }}>
                  White {contrastWhite.toFixed(1)}:1
                  {contrastWhite >= 4.5 ? ' ✓ AA' : ''}
                  {contrastWhite >= 7 ? ' AAA' : ''}
                </span>
                <span className="cpick-contrast-chip" style={{ background: hex, color: '#000' }}>
                  Black {contrastBlack.toFixed(1)}:1
                  {contrastBlack >= 4.5 ? ' ✓ AA' : ''}
                  {contrastBlack >= 7 ? ' AAA' : ''}
                </span>
              </div>
            </div>

            {/* Harmony */}
            <div className="cpick-harmony">
              <div className="cpick-harmony-header">
                <span className="cpick-harmony-label">Color Harmony</span>
                <select
                  value={harmony}
                  onChange={e => setHarmony(e.target.value)}
                  className="cpick-harmony-select"
                >
                  {HARMONIES.map(h => (
                    <option key={h.key} value={h.key}>{h.label}</option>
                  ))}
                </select>
              </div>
              <div className="cpick-harmony-swatches">
                {harmonyColors.map((c, i) => (
                  <div
                    key={i}
                    className="cpick-harmony-swatch"
                    style={{ background: c.hex }}
                    onClick={() => syncFromHex(c.hex)}
                    title={c.hex}
                  >
                    <span style={{ color: getLuminance(hexToRgb(c.hex)) > 0.5 ? '#333' : '#fff', fontSize: 9 }}>
                      {c.hex}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Saved Palette */}
            {savedPalette.length > 0 && (
              <div className="cpick-palette-section">
                <span className="cpick-palette-label">Saved Palette</span>
                <div className="cpick-palette-grid">
                  {savedPalette.map((c, i) => (
                    <div
                      key={i}
                      className="cpick-palette-swatch"
                      style={{ background: c }}
                      onClick={() => syncFromHex(c)}
                      onContextMenu={e => { e.preventDefault(); removeFromPalette(c); }}
                      title={`${c} · Right-click to remove`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* History */}
            {history.length > 0 && (
              <div className="cpick-history-section">
                <span className="cpick-history-label">Recent</span>
                <div className="cpick-history-grid">
                  {history.slice(0, 12).map((c, i) => (
                    <div
                      key={i}
                      className="cpick-history-swatch"
                      style={{ background: c }}
                      onClick={() => syncFromHex(c)}
                      title={c}
                    />
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

export default ColorPicker;
