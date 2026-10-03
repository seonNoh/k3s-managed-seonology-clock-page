import { apiFetch } from '../api/client.js';
import { useState, useEffect, useRef } from 'react';
import { Sunrise } from 'lucide-react';
import './BriefingCard.css';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
const SEEN_KEY = 'briefing-last-seen-run';
const FONT_SCALE_KEY = 'briefing-font-scale';
const FONT_SCALES = [1, 1.15, 1.3, 1.45, 1.6];
const DEFAULT_FONT_SCALE = 1.15;

// 좌하 상주 카드. 최신 브리핑 요약을 보여주고, SSE 로 신규 도착을 감지해
// NEW 배지·하이라이트·브라우저 알림을 띄운다. 클릭하면 전체 모달을 연다.
function BriefingCard({ onClick }) {
  const [latest, setLatest] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  const [fresh, setFresh] = useState(false);
  const sseRef = useRef(null);

  const load = async () => {
    try {
      const r = await apiFetch(`${API_BASE}/api/briefing/latest`);
      if (!r.ok) { setUnavailable(true); return; }
      const data = await r.json();
      setLatest(data);
      setUnavailable(false);
      let seen = null;
      try { seen = localStorage.getItem(SEEN_KEY); } catch { /* ignore */ }
      if (data.run && data.run.status === 'succeeded' && data.run.id !== seen) setFresh(true);
    } catch {
      setUnavailable(true);
    }
  };

  // 패널에서 저장한 글씨 배율을 카드에도 적용한다(조절 버튼은 패널에만 있다).
  useEffect(() => {
    let scale = DEFAULT_FONT_SCALE;
    try {
      const stored = Number(localStorage.getItem(FONT_SCALE_KEY));
      if (FONT_SCALES.includes(stored)) scale = stored;
    } catch { /* ignore */ }
    try { document.documentElement.style.setProperty('--bf-scale', String(scale)); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10 * 60 * 1000); // SSE 유실 대비 저빈도 보정
    const es = new EventSource(`${API_BASE}/api/briefing/stream`);
    es.addEventListener('briefing', (e) => {
      let event = null;
      try { event = JSON.parse(e.data); } catch { return; }
      load();
      if (event && event.event === 'completed') {
        setFresh(true);
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Morning Briefing', { body: `${event.target_date} 브리핑이 도착했습니다.` });
          }
        } catch { /* ignore */ }
      }
    });
    es.onerror = () => { /* 브라우저가 자동 재연결 */ };
    sseRef.current = es;
    return () => { clearInterval(interval); es.close(); };
  }, []);

  const open = () => {
    if (latest && latest.run) {
      try { localStorage.setItem(SEEN_KEY, latest.run.id); } catch { /* ignore */ }
    }
    setFresh(false);
    try {
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    } catch { /* ignore */ }
    onClick();
  };

  if (unavailable && !latest) return null;

  const run = latest && latest.run;
  const result = latest && latest.detail && latest.detail.structured_result;
  const statusClass = run ? (run.status === 'succeeded' ? 'ok' : (run.status === 'failed' ? 'bad' : 'pending')) : 'pending';
  const counts = result
    ? `일정 ${(result.schedule_preparation || []).length} · 리스크 ${(result.risks || []).length} · 결정 ${(result.decisions || []).length}`
    : (run && run.status !== 'succeeded' ? `상태 ${run.status}${run.error_code ? ` (${run.error_code})` : ''}` : '');
  const firstLine = result
    ? (((result.schedule_preparation || [])[0] || (result.overview || [])[0] || {}).text || '')
    : '';

  return (
    <div className={`briefing-preview${fresh ? ' briefing-fresh' : ''}`} onClick={open}>
      <div className="briefing-preview-header">
        <span className="briefing-icon"><Sunrise size={18} /></span>
        <span className="briefing-title">Briefing</span>
        <span className={`briefing-status-dot briefing-status-${statusClass}`} />
        {run && <span className="briefing-date">{run.target_date}</span>}
        {fresh && <span className="briefing-new">NEW</span>}
      </div>
      {counts && <div className="briefing-counts">{counts}</div>}
      {firstLine && <div className="briefing-first-line">{firstLine.length > 34 ? firstLine.slice(0, 34) + '...' : firstLine}</div>}
      {!run && <div className="briefing-empty">브리핑 없음</div>}
    </div>
  );
}

export default BriefingCard;
