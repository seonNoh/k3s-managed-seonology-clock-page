import { useState, useCallback, useRef } from 'react';
import './SpeedTest.css';

const CF_BASE = 'https://speed.cloudflare.com';
const PARALLEL_STREAMS = 16;

function SpeedGraph({ data, color, height = 40 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = height - (v / max) * (height - 4);
    return `${x},${y}`;
  }).join(' ');
  const fillPoints = `0,${height} ${points} 100,${height}`;
  return (
    <svg className="speed-graph-svg" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
      <polygon points={fillPoints} fill={`${color}15`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function SpeedTest({ isOpen, onClose }) {
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [download, setDownload] = useState(0);
  const [upload, setUpload] = useState(0);
  const [latency, setLatency] = useState(0);
  const [jitter, setJitter] = useState(0);
  const [serverLocation, setServerLocation] = useState('');
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [clientIp, setClientIp] = useState('');
  const [dlPeak, setDlPeak] = useState(0);
  const [dlMin, setDlMin] = useState(0);
  const [ulPeak, setUlPeak] = useState(0);
  const [ulMin, setUlMin] = useState(0);
  const [loadedLatency, setLoadedLatency] = useState(0);
  const [totalTransferred, setTotalTransferred] = useState(0);
  const [dlGraph, setDlGraph] = useState([]);
  const [ulGraph, setUlGraph] = useState([]);
  const [testTime, setTestTime] = useState('');
  const abortRef = useRef(null);

  const measureLatency = useCallback(async (signal) => {
    const pings = [];
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      await fetch(`${CF_BASE}/__down?bytes=0`, { signal, cache: 'no-store' });
      const end = performance.now();
      pings.push(end - start);
    }
    const warmPings = pings.slice(2);
    warmPings.sort((a, b) => a - b);
    const median = warmPings[Math.floor(warmPings.length / 2)];
    const jit = warmPings.length > 1
      ? warmPings.slice(1).reduce((acc, p, i) => acc + Math.abs(p - warmPings[i]), 0) / (warmPings.length - 1)
      : 0;
    return { latency: Math.round(median), jitter: Math.round(jit * 10) / 10 };
  }, []);

  const measureLoadedLatency = useCallback(async (signal) => {
    const pings = [];
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      try {
        await fetch(`${CF_BASE}/__down?bytes=0`, { signal, cache: 'no-store' });
        pings.push(performance.now() - start);
      } catch { /* ignore */ }
    }
    if (pings.length === 0) return 0;
    return Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
  }, []);

  const measureDownload = useCallback(async (signal) => {
    const DURATION_MS = 12000;
    const RAMPUP_MS = 3000;
    let totalBytes = 0;
    let stableBytes = 0;
    let stableStart = 0;
    const startTime = performance.now();
    const samples = [];
    let peak = 0;
    let min = Infinity;
    let loadedPing = 0;

    const downloadWorker = async () => {
      const sizes = [1e6, 5e6, 10e6, 25e6, 25e6];
      let sizeIdx = 0;
      while (performance.now() - startTime < DURATION_MS) {
        if (signal.aborted) return;
        const bytes = sizes[Math.min(sizeIdx, sizes.length - 1)];
        try {
          const res = await fetch(
            `${CF_BASE}/__down?bytes=${bytes}&_=${Date.now()}-${Math.random()}`,
            { signal, cache: 'no-store' }
          );
          const buf = await res.arrayBuffer();
          totalBytes += buf.byteLength;
          if (performance.now() - startTime >= RAMPUP_MS) {
            if (!stableStart) stableStart = performance.now();
            stableBytes += buf.byteLength;
          }
          sizeIdx++;
        } catch (e) {
          if (e.name === 'AbortError') return;
          break;
        }
      }
    };

    const workers = Array.from({ length: PARALLEL_STREAMS }, () => downloadWorker());

    const loadedLatencyPromise = (async () => {
      await new Promise(r => setTimeout(r, RAMPUP_MS + 1000));
      if (!signal.aborted) loadedPing = await measureLoadedLatency(signal);
    })();

    const liveInterval = setInterval(() => {
      const elapsed = (performance.now() - startTime) / 1000;
      if (elapsed > 1) {
        let mbps;
        if (stableStart && stableBytes > 0) {
          const stableElapsed = (performance.now() - stableStart) / 1000;
          mbps = (stableBytes * 8) / stableElapsed / 1e6;
        } else {
          mbps = (totalBytes * 8) / elapsed / 1e6;
        }
        const rounded = Math.round(mbps * 10) / 10;
        setCurrentSpeed(rounded);
        if (elapsed > RAMPUP_MS / 1000) {
          samples.push(rounded);
          if (rounded > peak) peak = rounded;
          if (rounded > 0 && rounded < min) min = rounded;
        }
      }
    }, 250);

    await Promise.all(workers);
    await loadedLatencyPromise;
    clearInterval(liveInterval);

    setDlGraph([...samples]);
    setDlPeak(Math.round(peak * 10) / 10);
    setDlMin(min === Infinity ? 0 : Math.round(min * 10) / 10);
    if (loadedPing > 0) setLoadedLatency(loadedPing);
    setTotalTransferred(prev => prev + totalBytes);

    if (stableStart && stableBytes > 0) {
      const stableElapsed = (performance.now() - stableStart) / 1000;
      return Math.round((stableBytes * 8) / stableElapsed / 1e6 * 10) / 10;
    }
    const totalElapsed = (performance.now() - startTime) / 1000;
    return Math.round((totalBytes * 8) / totalElapsed / 1e6 * 10) / 10;
  }, [measureLoadedLatency]);

  const measureUpload = useCallback(async (signal) => {
    const DURATION_MS = 10000;
    const RAMPUP_MS = 2000;
    let totalBytes = 0;
    let stableBytes = 0;
    let stableStart = 0;
    const startTime = performance.now();
    const samples = [];
    let peak = 0;
    let min = Infinity;

    const uploadWorker = async () => {
      const sizes = [1e6, 2e6, 5e6, 5e6];
      let sizeIdx = 0;
      while (performance.now() - startTime < DURATION_MS) {
        if (signal.aborted) return;
        const bytes = sizes[Math.min(sizeIdx, sizes.length - 1)];
        const payload = new ArrayBuffer(bytes);
        try {
          await fetch(`${CF_BASE}/__up`, { method: 'POST', body: payload, signal });
          totalBytes += bytes;
          if (performance.now() - startTime >= RAMPUP_MS) {
            if (!stableStart) stableStart = performance.now();
            stableBytes += bytes;
          }
          sizeIdx++;
        } catch (e) {
          if (e.name === 'AbortError') return;
          break;
        }
      }
    };

    const workers = Array.from({ length: PARALLEL_STREAMS }, () => uploadWorker());

    const liveInterval = setInterval(() => {
      const elapsed = (performance.now() - startTime) / 1000;
      if (elapsed > 1) {
        let mbps;
        if (stableStart && stableBytes > 0) {
          const stableElapsed = (performance.now() - stableStart) / 1000;
          mbps = (stableBytes * 8) / stableElapsed / 1e6;
        } else {
          mbps = (totalBytes * 8) / elapsed / 1e6;
        }
        const rounded = Math.round(mbps * 10) / 10;
        setCurrentSpeed(rounded);
        if (elapsed > RAMPUP_MS / 1000) {
          samples.push(rounded);
          if (rounded > peak) peak = rounded;
          if (rounded > 0 && rounded < min) min = rounded;
        }
      }
    }, 250);

    await Promise.all(workers);
    clearInterval(liveInterval);

    setUlGraph([...samples]);
    setUlPeak(Math.round(peak * 10) / 10);
    setUlMin(min === Infinity ? 0 : Math.round(min * 10) / 10);
    setTotalTransferred(prev => prev + totalBytes);

    if (stableStart && stableBytes > 0) {
      const stableElapsed = (performance.now() - stableStart) / 1000;
      return Math.round((stableBytes * 8) / stableElapsed / 1e6 * 10) / 10;
    }
    const totalElapsed = (performance.now() - startTime) / 1000;
    return Math.round((totalBytes * 8) / totalElapsed / 1e6 * 10) / 10;
  }, []);

  const fetchServerInfo = useCallback(async (signal) => {
    try {
      const res = await fetch(`${CF_BASE}/__down?bytes=0`, { signal, cache: 'no-store' });
      const cfRay = res.headers.get('cf-ray') || '';
      const loc = cfRay.split('-').pop() || '';
      return loc;
    } catch {
      return '';
    }
  }, []);

  const fetchClientIp = useCallback(async () => {
    try {
      const res = await fetch('https://1.1.1.1/cdn-cgi/trace');
      const text = await res.text();
      const match = text.match(/ip=(.+)/);
      return match ? match[1].trim() : '';
    } catch {
      return '';
    }
  }, []);

  const formatBytes = (bytes) => {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
    return (bytes / 1e3).toFixed(0) + ' KB';
  };

  const runTest = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setDlGraph([]); setUlGraph([]);
    setDlPeak(0); setDlMin(0); setUlPeak(0); setUlMin(0);
    setLoadedLatency(0); setTotalTransferred(0);
    setTestTime(''); setClientIp('');

    try {
      const [loc, ip] = await Promise.all([fetchServerInfo(signal), fetchClientIp()]);
      setServerLocation(loc);
      setClientIp(ip);

      setPhase('latency'); setProgress(10);
      const { latency: lat, jitter: jit } = await measureLatency(signal);
      setLatency(lat); setJitter(jit); setProgress(25);

      setPhase('download'); setProgress(30);
      const dl = await measureDownload(signal);
      setDownload(dl); setProgress(65);

      setPhase('upload'); setProgress(70);
      const ul = await measureUpload(signal);
      setUpload(ul); setProgress(100);

      setPhase('done');
      setCurrentSpeed(dl);
      setTestTime(new Date().toLocaleTimeString());
    } catch (e) {
      if (e.name !== 'AbortError') setPhase('idle');
    }
  }, [fetchServerInfo, fetchClientIp, measureLatency, measureDownload, measureUpload]);

  const handleClose = () => {
    if (abortRef.current) abortRef.current.abort();
    onClose();
  };

  const handleStart = () => {
    setDownload(0); setUpload(0); setLatency(0); setJitter(0);
    setCurrentSpeed(0); setProgress(0); setServerLocation('');
    runTest();
  };

  const gaugeRadius = 90;
  const gaugeCircumference = Math.PI * gaugeRadius;
  const maxSpeed = 500;
  const displaySpeed = phase === 'done' ? download : currentSpeed;
  const ratio = Math.min(displaySpeed / maxSpeed, 1);
  const dashOffset = gaugeCircumference * (1 - ratio);

  const getGaugeColor = (speed) => {
    if (speed >= 100) return '#22c55e';
    if (speed >= 50) return '#6366f1';
    if (speed >= 20) return '#eab308';
    return '#ef4444';
  };

  if (!isOpen) return null;

  const showDetails = phase === 'done';

  return (
    <div className="speed-overlay" onClick={handleClose}>
      <div className="speed-modal" onClick={e => e.stopPropagation()}>
        <div className="speed-header">
          <div className="speed-header-left">
            <svg className="speed-header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            <span className="speed-header-title">Speed Test</span>
            {serverLocation && <span className="speed-header-server">Cloudflare {serverLocation}</span>}
          </div>
          <button className="speed-close-btn" onClick={handleClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="speed-body">
          <div className="speed-gauge">
            <svg width="220" height="130" viewBox="0 0 220 130">
              <path className="speed-gauge-bg" d={`M 20 120 A ${gaugeRadius} ${gaugeRadius} 0 0 1 200 120`} />
              <path className="speed-gauge-fill" d={`M 20 120 A ${gaugeRadius} ${gaugeRadius} 0 0 1 200 120`}
                style={{ strokeDasharray: gaugeCircumference, strokeDashoffset: dashOffset, stroke: getGaugeColor(displaySpeed) }} />
            </svg>
            <div className="speed-gauge-value">
              <div className="speed-gauge-number">{phase === 'idle' ? '\u2014' : displaySpeed.toFixed(1)}</div>
              <div className="speed-gauge-unit">Mbps</div>
              <div className="speed-gauge-label">
                {phase === 'idle' && 'Ready'}
                {phase === 'latency' && 'Measuring Latency...'}
                {phase === 'download' && 'Download'}
                {phase === 'upload' && 'Upload'}
                {phase === 'done' && 'Download'}
              </div>
            </div>
          </div>

          {phase !== 'idle' && phase !== 'done' && (
            <div className="speed-progress-bar">
              <div className="speed-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          )}

          <div className="speed-stats">
            <div className="speed-stat-card">
              <svg className="speed-stat-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="7 17 17 7" /><polyline points="7 7 17 7 17 17" />
              </svg>
              <div><span className="speed-stat-value">{download || '\u2014'}</span><span className="speed-stat-unit">Mbps</span></div>
              <span className="speed-stat-label">Download</span>
            </div>
            <div className="speed-stat-card">
              <svg className="speed-stat-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 7 7 17" /><polyline points="7 7 7 17 17 17" />
              </svg>
              <div><span className="speed-stat-value">{upload || '\u2014'}</span><span className="speed-stat-unit">Mbps</span></div>
              <span className="speed-stat-label">Upload</span>
            </div>
            <div className="speed-stat-card">
              <svg className="speed-stat-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              <div><span className="speed-stat-value">{latency || '\u2014'}</span><span className="speed-stat-unit">ms</span></div>
              <span className="speed-stat-label">Latency</span>
            </div>
          </div>

          {showDetails && (dlGraph.length > 2 || ulGraph.length > 2) && (
            <div className="speed-graphs">
              {dlGraph.length > 2 && (
                <div className="speed-graph-box">
                  <div className="speed-graph-header">
                    <span className="speed-graph-title">{'\u2193'} Download</span>
                    <span className="speed-graph-range">{dlMin} \u2013 {dlPeak} Mbps</span>
                  </div>
                  <SpeedGraph data={dlGraph} color="#6366f1" />
                </div>
              )}
              {ulGraph.length > 2 && (
                <div className="speed-graph-box">
                  <div className="speed-graph-header">
                    <span className="speed-graph-title">{'\u2191'} Upload</span>
                    <span className="speed-graph-range">{ulMin} \u2013 {ulPeak} Mbps</span>
                  </div>
                  <SpeedGraph data={ulGraph} color="#22c55e" />
                </div>
              )}
            </div>
          )}

          {showDetails && (
            <div className="speed-details">
              <div className="speed-detail-row">
                <span className="speed-detail-label">Jitter</span>
                <span className="speed-detail-value">{jitter} ms</span>
              </div>
              <div className="speed-detail-row">
                <span className="speed-detail-label">Unloaded Latency</span>
                <span className="speed-detail-value">{latency} ms</span>
              </div>
              {loadedLatency > 0 && (
                <div className="speed-detail-row">
                  <span className="speed-detail-label">Loaded Latency</span>
                  <span className="speed-detail-value">
                    {loadedLatency} ms
                    {loadedLatency > latency * 2 && <span className="speed-badge warn">Bufferbloat</span>}
                    {loadedLatency <= latency * 2 && loadedLatency > latency * 1.3 && <span className="speed-badge ok">Moderate</span>}
                    {loadedLatency <= latency * 1.3 && <span className="speed-badge good">Good</span>}
                  </span>
                </div>
              )}
              <div className="speed-detail-row">
                <span className="speed-detail-label">Download Peak / Min</span>
                <span className="speed-detail-value">{dlPeak} / {dlMin} Mbps</span>
              </div>
              <div className="speed-detail-row">
                <span className="speed-detail-label">Upload Peak / Min</span>
                <span className="speed-detail-value">{ulPeak} / {ulMin} Mbps</span>
              </div>
              {clientIp && (
                <div className="speed-detail-row">
                  <span className="speed-detail-label">Your IP</span>
                  <span className="speed-detail-value">{clientIp}</span>
                </div>
              )}
              {serverLocation && (
                <div className="speed-detail-row">
                  <span className="speed-detail-label">Server</span>
                  <span className="speed-detail-value">Cloudflare {serverLocation}</span>
                </div>
              )}
              <div className="speed-detail-row">
                <span className="speed-detail-label">Data Used</span>
                <span className="speed-detail-value">{formatBytes(totalTransferred)}</span>
              </div>
              {testTime && (
                <div className="speed-detail-row">
                  <span className="speed-detail-label">Tested at</span>
                  <span className="speed-detail-value">{testTime}</span>
                </div>
              )}
            </div>
          )}

          <button className="speed-start-btn" onClick={handleStart} disabled={phase !== 'idle' && phase !== 'done'}>
            {phase === 'idle' ? 'Start Test' : phase === 'done' ? 'Test Again' : 'Testing...'}
          </button>
          <div className="speed-data-note">{'\uCE21\uC815 \uC2DC \uC57D 10~25MB \uB370\uC774\uD130\uB97C \uC0AC\uC6A9\uD569\uB2C8\uB2E4'}</div>
        </div>
      </div>
    </div>
  );
}

function SpeedTestMini({ onClick }) {
  return (
    <div className="speed-mini" onClick={onClick} title="Internet Speed Test">
      <span className="speed-mini-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
      </span>
      <span className="speed-mini-text">Speed Test</span>
    </div>
  );
}

export { SpeedTestMini };
export default SpeedTest;
