import { useState, useEffect, useRef, memo } from 'react';
import FlipClock from './FlipClock';
import './Clock.css';

/* Theme SVG icons */
const ThemeIcon = ({ id }) => {
  const s = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (id) {
    case 'digital': return (<svg {...s}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10v4M10 10h2v2h-2v2M15 10v4M15 10h2M15 12h1.5" /></svg>);
    case 'analog': return (<svg {...s}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="6" opacity=".4" /><circle cx="12" cy="12" r="3" opacity=".4" /><circle cx="12" cy="3.5" r="1.5" fill="currentColor" stroke="none" /><circle cx="17.5" cy="9" r="1.2" fill="currentColor" stroke="none" opacity=".7" /><circle cx="14" cy="15.5" r="1" fill="currentColor" stroke="none" opacity=".5" /></svg>);
    case 'flip': return (<svg {...s}><rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="16" rx="1.5" /><line x1="3" y1="12" x2="10" y2="12" opacity=".5" /><line x1="14" y1="12" x2="21" y2="12" opacity=".5" /></svg>);
    case 'neon': return (<svg {...s}><path d="M7 10v4M7 10h3v2H7M14 10v4M17 10v4M14 14h3M14 10h3" style={{filter:'drop-shadow(0 0 3px currentColor)'}} /></svg>);
    case 'binary': return (<svg {...s}><circle cx="8" cy="7" r="2" fill="currentColor" stroke="none" /><circle cx="16" cy="7" r="2" opacity=".2" /><circle cx="8" cy="12" r="2" opacity=".2" /><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="8" cy="17" r="2" fill="currentColor" stroke="none" /><circle cx="16" cy="17" r="2" fill="currentColor" stroke="none" /></svg>);
    case 'word': return (<svg {...s}><line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="12" x2="16" y2="12" opacity=".6" /><line x1="4" y1="16" x2="12" y2="16" opacity=".3" /></svg>);
    case 'progress': return (<svg {...s}><rect x="4" y="7" width="16" height="2" rx="1" opacity=".15" /><rect x="4" y="7" width="12" height="2" rx="1" fill="currentColor" stroke="none" /><rect x="4" y="11" width="16" height="2" rx="1" opacity=".15" /><rect x="4" y="11" width="8" height="2" rx="1" fill="currentColor" stroke="none" /><rect x="4" y="15" width="16" height="2" rx="1" opacity=".15" /><rect x="4" y="15" width="14" height="2" rx="1" fill="currentColor" stroke="none" /></svg>);
    case 'swiss': return (<svg {...s}><circle cx="12" cy="12" r="10" /><line x1="12" y1="12" x2="12" y2="6" strokeWidth="2.5" /><line x1="12" y1="12" x2="17" y2="12" strokeWidth="2" /><line x1="12" y1="12" x2="12" y2="4" stroke="#e11d48" strokeWidth="1" /><circle cx="12" cy="4" r="1.5" fill="#e11d48" stroke="none" /></svg>);
    case 'matrix': return (<svg {...s}><path d="M6 3v8M10 5v10M14 3v12M18 7v6" stroke="#00ff41" strokeWidth="1.5" opacity=".7" /><path d="M6 13v4M18 15v4" stroke="#00ff41" strokeWidth="1.5" opacity=".3" /></svg>);
    case 'dotmatrix': return (<svg {...s}>{[0,1,2,3,4].map(r=>[0,1,2].map(c=><circle key={`${r}${c}`} cx={7+c*5} cy={6+r*3} r="1.2" fill="currentColor" opacity={(r+c)%2===0?1:0.2} />))}</svg>);
    case 'ring': return (<svg {...s}><circle cx="12" cy="12" r="10" opacity=".15" /><path d="M12 2a10 10 0 0 1 8.66 5" strokeWidth="2" /><circle cx="12" cy="12" r="7" opacity=".15" /><path d="M12 5a7 7 0 0 1 6.06 3.5" strokeWidth="2" opacity=".7" /><circle cx="12" cy="12" r="4" opacity=".15" /><path d="M12 8a4 4 0 0 1 3.46 2" strokeWidth="2" opacity=".5" /></svg>);
    case 'typography': return (<svg {...s}><text x="4" y="18" fontSize="18" fontFamily="Georgia,serif" fontWeight="100" fill="currentColor" stroke="none">Aa</text></svg>);
    default: return null;
  }
};

const THEMES = [
  { id: 'digital', name: 'Digital' },
  { id: 'analog', name: 'Orbit' },
  { id: 'flip', name: 'Flip' },
  { id: 'neon', name: 'Neon' },
  { id: 'binary', name: 'Binary' },
  { id: 'word', name: 'Word' },
  { id: 'progress', name: 'Progress' },
  { id: 'swiss', name: 'Swiss' },
  { id: 'matrix', name: 'Matrix' },
  { id: 'dotmatrix', name: 'LED' },
  { id: 'ring', name: 'Ring' },
  { id: 'typography', name: 'Typo' },
];

/* 5×7 dot-matrix digit patterns */
const DIGIT_PATTERNS = {
  '0': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,1,1],[1,0,1,0,1],[1,1,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '1': [[0,0,1,0,0],[0,1,1,0,0],[1,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[1,1,1,1,1]],
  '2': [[0,1,1,1,0],[1,0,0,0,1],[0,0,0,0,1],[0,0,1,1,0],[0,1,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],
  '3': [[0,1,1,1,0],[1,0,0,0,1],[0,0,0,0,1],[0,0,1,1,0],[0,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '4': [[0,0,0,1,0],[0,0,1,1,0],[0,1,0,1,0],[1,0,0,1,0],[1,1,1,1,1],[0,0,0,1,0],[0,0,0,1,0]],
  '5': [[1,1,1,1,1],[1,0,0,0,0],[1,1,1,1,0],[0,0,0,0,1],[0,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '6': [[0,1,1,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '7': [[1,1,1,1,1],[0,0,0,0,1],[0,0,0,1,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
  '8': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '9': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,1],[0,0,0,0,1],[0,0,0,0,1],[0,1,1,1,0]],
  ':': [[0,0,0],[0,1,0],[0,0,0],[0,0,0],[0,0,0],[0,1,0],[0,0,0]],
};

/* Matrix rain – memoised so it never re-renders */
const MatrixRain = memo(function MatrixRain() {
  const cols = useRef(null);
  if (!cols.current) {
    const ch = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF';
    cols.current = Array.from({ length: 35 }, (_, i) => ({
      id: i,
      left: `${(i / 35) * 100}%`,
      delay: `${Math.random() * 8}s`,
      duration: `${4 + Math.random() * 8}s`,
      fontSize: `${0.7 + Math.random() * 0.5}rem`,
      opacity: 0.15 + Math.random() * 0.35,
      chars: Array.from({ length: 30 }, () => ch[Math.floor(Math.random() * ch.length)]),
    }));
  }
  return (
    <div className="matrix-rain">
      {cols.current.map(c => (
        <div key={c.id} className="matrix-column"
          style={{ left: c.left, animationDelay: c.delay, animationDuration: c.duration, fontSize: c.fontSize, opacity: c.opacity }}>
          {c.chars.map((ch, j) => <span key={j}>{ch}</span>)}
        </div>
      ))}
    </div>
  );
});

function Clock() {
  const [time, setTime] = useState(new Date());
  const [theme, setTheme] = useState(() => localStorage.getItem('clock-theme') || 'digital');
  const [showPicker, setShowPicker] = useState(false);
  const [wordLang, setWordLang] = useState(() => localStorage.getItem('clock-word-lang') || 'en');
  const [ledStyle, setLedStyle] = useState(() => localStorage.getItem('clock-led-style') || 'amber');
  const [ledShape, setLedShape] = useState(() => localStorage.getItem('clock-led-shape') || 'round');

  useEffect(() => { localStorage.setItem('clock-word-lang', wordLang); }, [wordLang]);
  useEffect(() => { localStorage.setItem('clock-led-style', ledStyle); }, [ledStyle]);
  useEffect(() => { localStorage.setItem('clock-led-shape', ledShape); }, [ledShape]);

  useEffect(() => {
    const smoothThemes = ['analog']; // Orbit needs smooth updates
    const interval = smoothThemes.includes(theme) ? 50 : 1000;
    const timer = setInterval(() => setTime(new Date()), interval);
    return () => clearInterval(timer);
  }, [theme]);

  useEffect(() => { localStorage.setItem('clock-theme', theme); }, [theme]);

  useEffect(() => {
    if (!showPicker) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowPicker(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showPicker]);

  /* ---- helpers ---- */
  const pad = (n) => String(n).padStart(2, '0');
  const hours = pad(time.getHours());
  const minutes = pad(time.getMinutes());
  const seconds = pad(time.getSeconds());

  const formatDate = (d) => {
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
  };

  const getAngles = () => {
    const h = time.getHours() % 12, m = time.getMinutes(), s = time.getSeconds();
    return { hour: h * 30 + m * 0.5, minute: m * 6 + s * 0.1, second: s * 6 };
  };

  const getTimeInWords = () => {
    const h = time.getHours() % 12, m = time.getMinutes();

    if (wordLang === 'ko') {
      const hourKo = ['열두','한','두','세','네','다섯','여섯','일곱','여덟','아홉','열','열한'];
      if (m === 0) return ['지금', hourKo[h] + '시', '정각'];
      const minKo = ['','일','이','삼','사','오','육','칠','팔','구','십',
        '십일','십이','십삼','십사','십오','십육','십칠','십팔','십구','이십',
        '이십일','이십이','이십삼','이십사','이십오','이십육','이십칠','이십팔','이십구',
        '삼십','삼십일','삼십이','삼십삼','삼십사','삼십오','삼십육','삼십칠','삼십팔','삼십구',
        '사십','사십일','사십이','사십삼','사십사','사십오','사십육','사십칠','사십팔','사십구',
        '오십','오십일','오십이','오십삼','오십사','오십오','오십육','오십칠','오십팔','오십구'][m];
      return ['지금', hourKo[h] + '시', minKo + '분'];
    }

    if (wordLang === 'ja') {
      const hourJa = ['十二','一','二','三','四','五','六','七','八','九','十','十一'];
      if (m === 0) return ['今', hourJa[h] + '時', 'ちょうど'];
      const ones = ['','一','二','三','四','五','六','七','八','九'];
      const tens = ['','十','二十','三十','四十','五十'];
      const minJa = tens[Math.floor(m / 10)] + ones[m % 10];
      return ['今', hourJa[h] + '時', minJa + '分'];
    }

    // English (default)
    const hourWords = ['TWELVE','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','ELEVEN'];
    if (m === 0) return ['IT IS', hourWords[h], "O'CLOCK"];
    const onesEn = ['','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE',
      'TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'];
    const tensEn = ['','','TWENTY','THIRTY','FORTY','FIFTY'];
    const minEn = m < 20 ? onesEn[m] : (tensEn[Math.floor(m / 10)] + (m % 10 ? ' ' + onesEn[m % 10] : ''));
    if (m <= 30) return ['IT IS', minEn, m === 30 ? 'HALF PAST' : 'PAST', hourWords[h]];
    const remaining = 60 - m;
    const remEn = remaining < 20 ? onesEn[remaining] : (tensEn[Math.floor(remaining / 10)] + (remaining % 10 ? ' ' + onesEn[remaining % 10] : ''));
    return ['IT IS', remEn, 'TO', hourWords[(h + 1) % 12]];
  };

  /* ===== 1. DIGITAL ===== */
  const renderDigital = () => (
    <>
      <div className="clock-time">
        <span className="clock-digits">{hours}</span>
        <span className="clock-separator">:</span>
        <span className="clock-digits">{minutes}</span>
      </div>
      <div className="clock-date">{formatDate(time)}</div>
    </>
  );

  /* ===== 2. ORBIT ===== */
  const [orbitHourPulse, setOrbitHourPulse] = useState(false);
  const lastHourRef = useRef(time.getHours());
  const pulseTimerRef = useRef(null);

  useEffect(() => {
    const currentHour = time.getHours();
    const currentMin = time.getMinutes();
    const currentSec = time.getSeconds();

    // Always track hour changes
    if (currentHour !== lastHourRef.current) {
      // Trigger pulse only at the top of the hour (min=0, sec=0)
      // With 50ms interval, sec=0 window is reliable
      if (currentMin === 0 && currentSec <= 1) {
        if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
        setOrbitHourPulse(true);
        pulseTimerRef.current = setTimeout(() => {
          setOrbitHourPulse(false);
          pulseTimerRef.current = null;
        }, 2000);
      }
      lastHourRef.current = currentHour;
    }
  }, [time]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, []);

  /* ── Orbit time-of-day color system ── */
  const TIME_PHASES = [
    { start: 0,  label: 'DEEP NIGHT', h: [129,140,248], m: [99,102,241],  s: [165,180,252] },  // 00-03 indigo
    { start: 4,  label: 'DAWN',       h: [192,132,252], m: [168,85,247],  s: [216,180,254] },  // 04-06 purple→pink
    { start: 7,  label: 'MORNING',    h: [56,189,248],  m: [14,165,233],  s: [125,211,252] },  // 07-09 sky blue
    { start: 10, label: 'MIDDAY',     h: [45,212,191],  m: [20,184,166],  s: [94,234,212] },   // 10-12 teal
    { start: 13, label: 'AFTERNOON',  h: [251,191,36],  m: [245,158,11],  s: [252,211,77] },   // 13-15 warm yellow
    { start: 16, label: 'GOLDEN',     h: [251,146,60],  m: [249,115,22],  s: [253,186,116] },  // 16-18 amber/orange
    { start: 19, label: 'SUNSET',     h: [251,113,133], m: [244,63,94],   s: [253,164,175] },  // 19-21 coral/rose
    { start: 22, label: 'NIGHT',      h: [148,163,184], m: [100,116,139], s: [203,213,225] },  // 22-23 slate blue
  ];

  const lerpColor = (a, b, t) => {
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return `rgb(${r},${g},${bl})`;
  };

  const getOrbitColors = (hour24, minute) => {
    let curIdx = 0;
    for (let i = TIME_PHASES.length - 1; i >= 0; i--) {
      if (hour24 >= TIME_PHASES[i].start) { curIdx = i; break; }
    }
    const nextIdx = (curIdx + 1) % TIME_PHASES.length;
    const cur = TIME_PHASES[curIdx];
    const next = TIME_PHASES[nextIdx];
    const curStart = cur.start;
    const nextStart = next.start > curStart ? next.start : next.start + 24;
    const nowHour = hour24 >= curStart ? hour24 : hour24 + 24;
    const span = nextStart - curStart;
    const t = Math.min(1, Math.max(0, ((nowHour - curStart) + minute / 60) / span));
    return {
      h: lerpColor(cur.h, next.h, t),
      m: lerpColor(cur.m, next.m, t),
      s: lerpColor(cur.s, next.s, t),
      main: lerpColor(cur.h, next.h, t),
      label: cur.label,
    };
  };

  const renderAnalog = () => {
    const h = time.getHours() % 12, m = time.getMinutes(), s = time.getSeconds(), ms = time.getMilliseconds();
    const hour24 = time.getHours();
    const size = 350, cx = 175;
    const colors = getOrbitColors(hour24, m);
    const orbits = [
      { label: 'H', value: h + m / 60, max: 12, r: 140, color: colors.h, dotSize: 14, trailOpacity: 0.15 },
      { label: 'M', value: m + s / 60, max: 60, r: 110, color: colors.m, dotSize: 11, trailOpacity: 0.12 },
      { label: 'S', value: s + ms / 1000, max: 60, r: 80, color: colors.s, dotSize: 8, trailOpacity: 0.10 },
    ];
    return (
      <>
        <div className={`orbit-clock${orbitHourPulse ? ' orbit-hour-pulse' : ''}`}>
          <svg viewBox={`0 0 ${size} ${size}`} className="orbit-svg">
            {orbits.map((o, i) => {
              const ang = ((o.value / o.max) * 360 - 90) * (Math.PI / 180);
              const dx = cx + o.r * Math.cos(ang);
              const dy = cx + o.r * Math.sin(ang);
              const trailAng = ((o.value / o.max) * 360);
              return (
                <g key={i}>
                  {/* Orbit track */}
                  <circle cx={cx} cy={cx} r={o.r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                  {/* Trail arc */}
                  <circle cx={cx} cy={cx} r={o.r} fill="none" stroke={o.color} strokeWidth="2"
                    strokeDasharray={`${(trailAng / 360) * 2 * Math.PI * o.r} ${2 * Math.PI * o.r}`}
                    strokeLinecap="round" opacity={o.trailOpacity}
                    transform={`rotate(-90 ${cx} ${cx})`} />
                  {/* Glow */}
                  <circle cx={dx} cy={dy} r={o.dotSize * 2} fill={o.color} opacity="0.08" />
                  <circle cx={dx} cy={dy} r={o.dotSize * 1.2} fill={o.color} opacity="0.15" />
                  {/* Dot */}
                  <circle cx={dx} cy={dy} r={o.dotSize / 2} fill={o.color}
                    filter="url(#orbitGlow)" />
                </g>
              );
            })}
            <defs>
              <filter id="orbitGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
          </svg>
          <div className="orbit-center">
            <div className="orbit-time" style={{ color: colors.main }}>{hours}:{minutes}</div>
            <div className="orbit-seconds">{seconds}</div>
            <div className="orbit-ampm" style={{ color: colors.main }}>{colors.label}</div>
          </div>
          {orbitHourPulse && <div className="orbit-pulse-ring" style={{ borderColor: colors.main }} />}
        </div>
        <div className="clock-date orbit-date">{formatDate(time)}</div>
      </>
    );
  };

  /* ===== 3. FLIP ===== */
  const renderFlip = () => <FlipClock time={time} embedded />;

  /* ===== 4. NEON ===== */
  const renderNeon = () => (
    <div className="neon-clock">
      <div className="neon-time">
        <span className="neon-digits">{hours}</span>
        <span className="neon-sep">:</span>
        <span className="neon-digits">{minutes}</span>
        <span className="neon-sep">:</span>
        <span className="neon-digits neon-seconds">{seconds}</span>
      </div>
      <div className="neon-date">{formatDate(time)}</div>
    </div>
  );

  /* ===== 5. BINARY ===== */
  const renderBinary = () => {
    const h = time.getHours(), m = time.getMinutes(), s = time.getSeconds();
    const columns = [
      { val: Math.floor(h / 10), bits: 2 }, { val: h % 10, bits: 4 }, null,
      { val: Math.floor(m / 10), bits: 3 }, { val: m % 10, bits: 4 }, null,
      { val: Math.floor(s / 10), bits: 3 }, { val: s % 10, bits: 4 },
    ];
    return (
      <div className="binary-clock">
        <div className="binary-grid">
          {columns.map((col, i) =>
            col === null ? <div key={i} className="binary-spacer" /> : (
              <div key={i} className="binary-col">
                {[8,4,2,1].map((bit, bi) => (
                  <div key={bi} className={`binary-dot${col.val & bit ? ' active' : ''}${bi < (4 - col.bits) ? ' invisible' : ''}`} />
                ))}
              </div>
            )
          )}
        </div>
        <div className="binary-time">{hours} : {minutes} : {seconds}</div>
      </div>
    );
  };

  /* ===== 6. WORD CLOCK ===== */
  const renderWord = () => {
    const words = getTimeInWords();
    const langs = ['en', 'ko', 'ja'];
    const langLabels = { en: 'EN', ko: '한', ja: '日' };
    const cycleWordLang = () => {
      const idx = langs.indexOf(wordLang);
      setWordLang(langs[(idx + 1) % langs.length]);
    };
    return (
      <div className={`word-clock word-clock-${wordLang}`}>
        <button className="word-lang-toggle" onClick={cycleWordLang} title="Change language">
          {langLabels[wordLang]}
        </button>
        {words.map((w, i) => (
          <div key={i} className={`word-line ${i === 0 ? 'word-prefix' : i === words.length - 1 ? 'word-hour' : 'word-middle'}`}>{w}</div>
        ))}
      </div>
    );
  };

  /* ===== 7. PROGRESS BAR ===== */
  const renderProgress = () => {
    const h = time.getHours(), m = time.getMinutes(), s = time.getSeconds();
    const bars = [
      { label: 'HOURS', value: h, max: 24, display: hours, color: '#818cf8' },
      { label: 'MINUTES', value: m, max: 60, display: minutes, color: '#6366f1' },
      { label: 'SECONDS', value: s, max: 60, display: seconds, color: '#a78bfa' },
    ];
    return (
      <div className="progress-clock">
        {bars.map((b, i) => (
          <div key={i} className="progress-row">
            <span className="progress-label">{b.label}</span>
            <div className="progress-track">
              <div className="progress-fill"
                style={{ width: `${(b.value / b.max) * 100}%`, background: b.color,
                  transition: b.value === 0 ? 'none' : 'width 0.5s ease' }} />
            </div>
            <span className="progress-value">{b.display}</span>
          </div>
        ))}
        <div className="clock-date" style={{ textAlign: 'center', marginTop: '1rem' }}>{formatDate(time)}</div>
      </div>
    );
  };

  /* ===== 8. SWISS RAILWAY ===== */
  const renderSwiss = () => {
    const a = getAngles();
    return (
      <>
        <div className="swiss-clock">
          <div className="swiss-face">
            {[...Array(60)].map((_, i) => (
              <div key={i} className={`swiss-tick ${i % 5 === 0 ? 'swiss-tick-hour' : 'swiss-tick-min'}`}
                style={{ transform: `rotate(${i * 6}deg)` }} />
            ))}
            <div className="swiss-hand swiss-hour" style={{ transform: `rotate(${a.hour}deg)` }} />
            <div className="swiss-hand swiss-minute" style={{ transform: `rotate(${a.minute}deg)` }} />
            <div className="swiss-second-hand" style={{ transform: `rotate(${a.second}deg)` }}>
              <div className="swiss-second-line" />
              <div className="swiss-second-dot" />
            </div>
            <div className="swiss-center" />
          </div>
        </div>
        <div className="clock-date analog-date">{formatDate(time)}</div>
      </>
    );
  };

  /* ===== 9. MATRIX ===== */
  const renderMatrix = () => (
    <div className="matrix-clock">
      <MatrixRain />
      <div className="matrix-time">
        <span>{hours}</span><span className="matrix-sep">:</span>
        <span>{minutes}</span><span className="matrix-sep">:</span>
        <span>{seconds}</span>
      </div>
      <div className="matrix-date">{formatDate(time)}</div>
    </div>
  );

  /* ===== 10. DOT MATRIX (LED) ===== */
  const LED_STYLES = ['amber', 'green', 'red', 'cyan', 'blue', 'white'];
  const LED_LABELS = { amber: 'AMB', green: 'GRN', red: 'RED', cyan: 'CYN', blue: 'BLU', white: 'WHT' };
  const LED_SHAPES = ['round', 'square', 'diamond', 'bar', 'segment'];
  const LED_SHAPE_LABELS = { round: 'RND', square: 'SQR', diamond: 'DIA', bar: 'BAR', segment: '7SG' };
  const cycleLedStyle = () => {
    const idx = LED_STYLES.indexOf(ledStyle);
    setLedStyle(LED_STYLES[(idx + 1) % LED_STYLES.length]);
  };
  const cycleLedShape = () => {
    const idx = LED_SHAPES.indexOf(ledShape);
    setLedShape(LED_SHAPES[(idx + 1) % LED_SHAPES.length]);
  };

  /* 7-segment SVG digit */
  const SEGMENT_MAP = {
    '0': [1,1,1,0,1,1,1], '1': [0,0,1,0,0,1,0], '2': [1,0,1,1,1,0,1],
    '3': [1,0,1,1,0,1,1], '4': [0,1,1,1,0,1,0], '5': [1,1,0,1,0,1,1],
    '6': [1,1,0,1,1,1,1], '7': [1,0,1,0,0,1,0], '8': [1,1,1,1,1,1,1],
    '9': [1,1,1,1,0,1,1],
  };
  const SegmentDigit = ({ digit, color }) => {
    const segs = SEGMENT_MAP[digit] || [0,0,0,0,0,0,0];
    const on = color || '#ff8c00';
    const off = 'rgba(255,255,255,0.04)';
    /* segments: a(top), f(top-left), b(top-right), g(mid), e(bot-left), c(bot-right), d(bot) */
    const paths = [
      'M 4 1 L 26 1 L 23 4 L 7 4 Z',       /* a - top */
      'M 2 3 L 5 6 L 5 17 L 2 20 Z',        /* f - top-left */
      'M 28 3 L 28 20 L 25 17 L 25 6 Z',    /* b - top-right */
      'M 4 21 L 7 18 L 23 18 L 26 21 L 23 24 L 7 24 Z', /* g - middle */
      'M 2 22 L 5 25 L 5 36 L 2 39 Z',      /* e - bot-left */
      'M 28 22 L 28 39 L 25 36 L 25 25 Z',  /* c - bot-right */
      'M 4 41 L 7 38 L 23 38 L 26 41 Z',    /* d - bottom */
    ];
    return (
      <svg viewBox="0 0 30 42" className="seg-digit">
        {paths.map((d, i) => (
          <path key={i} d={d} fill={segs[i] ? on : off}
            style={segs[i] ? { filter: `drop-shadow(0 0 4px ${on})` } : undefined} />
        ))}
      </svg>
    );
  };
  const SegmentColon = ({ color }) => (
    <svg viewBox="0 0 10 42" className="seg-colon">
      <circle cx="5" cy="14" r="2.5" fill={color || '#ff8c00'} className="matrix-sep" />
      <circle cx="5" cy="28" r="2.5" fill={color || '#ff8c00'} className="matrix-sep" />
    </svg>
  );

  const LED_COLORS = {
    amber: '#ff8c00', green: '#00ff41', red: '#ff3232',
    cyan: '#00e6ff', blue: '#5078ff', white: '#ffffff',
  };

  const renderDotMatrix = () => {
    const chars = `${hours}:${minutes}:${seconds}`;
    const isSegment = ledShape === 'segment';
    return (
      <div className={`dotmatrix-clock led-${ledStyle} shape-${ledShape}`}>
        <div className="led-toggles">
          <button className="led-style-toggle" onClick={cycleLedShape} title="Change LED shape">
            {LED_SHAPE_LABELS[ledShape]}
          </button>
          <button className="led-style-toggle" onClick={cycleLedStyle} title="Change LED color">
            {LED_LABELS[ledStyle]}
          </button>
        </div>
        {isSegment ? (
          <div className="segment-display">
            {chars.split('').map((ch, ci) => (
              ch === ':'
                ? <SegmentColon key={ci} color={LED_COLORS[ledStyle]} />
                : <SegmentDigit key={ci} digit={ch} color={LED_COLORS[ledStyle]} />
            ))}
          </div>
        ) : (
          <div className="dotmatrix-display">
            {chars.split('').map((ch, ci) => {
              const pattern = DIGIT_PATTERNS[ch];
              if (!pattern) return null;
              const cols = pattern[0].length;
              return (
                <div key={ci} className={`dotmatrix-char${ch === ':' ? ' dotmatrix-colon' : ''}`}
                  style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                  {pattern.flat().map((dot, di) => (
                    <div key={di} className={`dm-dot${dot ? ' dm-active' : ''}`} />
                  ))}
                </div>
              );
            })}
          </div>
        )}
        <div className="clock-date dotmatrix-date">{formatDate(time)}</div>
      </div>
    );
  };

  /* ===== 11. MINIMAL RING ===== */
  const renderRing = () => {
    const h = time.getHours(), m = time.getMinutes(), s = time.getSeconds();
    const size = 300, cx = 150, sw = 6;
    const rings = [
      { value: h % 12, max: 12, r: 135, color: '#818cf8' },
      { value: m, max: 60, r: 115, color: '#6366f1' },
      { value: s, max: 60, r: 95, color: '#a78bfa' },
    ];
    return (
      <div className="ring-clock">
        <svg viewBox={`0 0 ${size} ${size}`} className="ring-svg">
          {rings.map((ring, i) => {
            const circ = 2 * Math.PI * ring.r;
            const offset = circ - (ring.value / ring.max) * circ;
            return (
              <g key={i}>
                <circle cx={cx} cy={cx} r={ring.r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={sw} />
                <circle cx={cx} cy={cx} r={ring.r} fill="none" stroke={ring.color} strokeWidth={sw}
                  strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
                  transform={`rotate(-90 ${cx} ${cx})`}
                  style={{ transition: ring.value === 0 ? 'none' : 'stroke-dashoffset 0.5s ease' }} />
              </g>
            );
          })}
        </svg>
        <div className="ring-display">
          <div className="ring-time">{hours}:{minutes}</div>
          <div className="ring-seconds">{seconds}</div>
          <div className="ring-date">{formatDate(time)}</div>
        </div>
      </div>
    );
  };

  /* ===== 12. TYPOGRAPHY ===== */
  const renderTypography = () => (
    <div className="typo-clock">
      <div className="typo-time">
        <span className="typo-hour">{hours}</span>
        <span className="typo-sep" />
        <span className="typo-min">{minutes}</span>
      </div>
      <div className="typo-seconds">{seconds}</div>
      <div className="typo-date">{formatDate(time)}</div>
    </div>
  );

  /* ---- renderer map ---- */
  const renderers = {
    digital: renderDigital, analog: renderAnalog, flip: renderFlip,
    neon: renderNeon, binary: renderBinary, word: renderWord,
    progress: renderProgress, swiss: renderSwiss, matrix: renderMatrix,
    dotmatrix: renderDotMatrix, ring: renderRing, typography: renderTypography,
  };

  return (
    <div className={`clock clock-${theme}`}>
      <button className="theme-toggle" onClick={() => setShowPicker(true)} title="Change clock theme">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      </button>

      {renderers[theme]?.() || renderDigital()}

      {showPicker && (
        <div className="theme-picker-overlay" onClick={() => setShowPicker(false)}>
          <div className="theme-picker" onClick={(e) => e.stopPropagation()}>
            <div className="theme-picker-title">Select Theme</div>
            <div className="theme-picker-grid">
              {THEMES.map(t => (
                <button key={t.id}
                  className={`theme-picker-item${theme === t.id ? ' active' : ''}`}
                  onClick={() => { setTheme(t.id); setShowPicker(false); }}>
                  <span className="theme-picker-icon"><ThemeIcon id={t.id} /></span>
                  <span className="theme-picker-name">{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Clock;
