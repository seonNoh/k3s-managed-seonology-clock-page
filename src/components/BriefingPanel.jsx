import { apiFetch } from '../api/client.js';
import { useState, useEffect, useMemo, useRef } from 'react';
import './BriefingPanel.css';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

const FONT_SCALE_KEY = 'briefing-font-scale';
const FONT_SCALES = [1, 1.15, 1.3, 1.45, 1.6];
const DEFAULT_FONT_SCALE = 1.15;

const PAGE_LIMIT = 50;
const MAX_PAGES = 5;
const CHIP_LABEL_MAX = 32;
const SENDER_LABEL_MAX = 14;
const JUMP_HIGHLIGHT_MS = 2000;

const SECTIONS = [
  { key: 'schedule_preparation', label: '오늘 일정 준비' },
  { key: 'risks', label: '리스크' },
  { key: 'action_items', label: '액션 아이템' },
  { key: 'decisions', label: '결정 사항' },
  { key: 'overview', label: '오늘의 흐름' },
  { key: 'unscheduled_work', label: '기타 업무' },
];

// 기본 펼침은 앞 4개 섹션.
const DEFAULT_OPEN_SECTIONS = SECTIONS.slice(0, 4).reduce((acc, s) => ({ ...acc, [s.key]: true }), {});

const TABS = [
  { key: 'briefing', label: '브리핑' },
  { key: 'schedule', label: '일정' },
  { key: 'evidence', label: '근거' },
];

const EVIDENCE_GROUPS = [
  { key: 'key_points', label: '주요 내용' },
  { key: 'decisions', label: '결정 사항' },
  { key: 'action_items', label: '액션 아이템' },
  { key: 'deadlines', label: '기한' },
];

function applyFontScale(value) {
  try { document.documentElement.style.setProperty('--bf-scale', String(value)); } catch { /* ignore */ }
}

function readStoredFontScale() {
  try {
    const raw = Number(localStorage.getItem(FONT_SCALE_KEY));
    if (FONT_SCALES.includes(raw)) return raw;
  } catch { /* ignore */ }
  return DEFAULT_FONT_SCALE;
}

function ellipsis(text, max) {
  const value = String(text == null ? '' : text).trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

// "이름 <주소>" 형태에서 표시 이름만 뽑는다. 표시 이름이 없으면 주소 로컬파트로 대체한다.
function senderShort(sender) {
  const raw = String(sender == null ? '' : sender).trim();
  if (!raw) return '';
  let name = raw.split('<')[0].trim().replace(/^["']|["']$/g, '').trim();
  if (!name) name = raw.replace(/[<>]/g, '').split('@')[0].trim();
  return ellipsis(name, SENDER_LABEL_MAX);
}

function hhmm(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function eventTimeLabel(event) {
  if (event.all_day) return '종일';
  const start = hhmm(event.start_at);
  const end = hhmm(event.end_at);
  if (start && end) return `${start}~${end}`;
  return start || end || '--:--';
}

function shortId(id) {
  return String(id == null ? '' : id).slice(0, 8);
}

function attentionClass(level) {
  const value = String(level == null ? '' : level).toLowerCase();
  if (value === 'urgent') return 'urgent';
  if (value === 'high') return 'high';
  return 'normal';
}

// 원장 항목은 {text, evidence_excerpt} 객체지만 문자열로 내려오는 경우도 방어한다.
function entryText(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  return entry.text || '';
}

function entryEvidence(entry) {
  if (!entry || typeof entry === 'string') return '';
  return entry.evidence_excerpt || '';
}

function claimChips(item) {
  const labels = (item.temporal_claims || []).map((claim) => claim && claim.label).filter(Boolean);
  return [...new Set(labels)].slice(0, 3);
}

function byPriority(a, b) {
  const left = Number.isFinite(a.priority) ? a.priority : Number.MAX_SAFE_INTEGER;
  const right = Number.isFinite(b.priority) ? b.priority : Number.MAX_SAFE_INTEGER;
  return left - right;
}

// mails/events 는 커서 페이지네이션이라 next_cursor 가 빌 때까지 이어받되 5페이지에서 끊는다.
async function fetchAllPages(path) {
  const items = [];
  let cursor = '';
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = `limit=${PAGE_LIMIT}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const response = await apiFetch(`${API_BASE}${path}?${query}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    items.push(...(data.items || []));
    cursor = data.next_cursor || '';
    if (!cursor) break;
  }
  return items;
}

// 전체 브리핑 모달 본문. 브리핑 본문·일정 타임라인·메일 원장을 탭으로 나누고,
// 본문 항목의 출처 칩에서 원본 메일/일정 카드로 점프할 수 있게 연결한다.
function BriefingPanel() {
  const [latest, setLatest] = useState(null);
  const [error, setError] = useState(null);
  const [mails, setMails] = useState([]);
  const [events, setEvents] = useState([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sourceError, setSourceError] = useState(null);

  const [tab, setTab] = useState('briefing');
  const [openSections, setOpenSections] = useState(DEFAULT_OPEN_SECTIONS);
  const [expandedMails, setExpandedMails] = useState({});
  const [fontScale, setFontScale] = useState(readStoredFontScale);

  const [jumpTick, setJumpTick] = useState(0);
  const jumpTargetRef = useRef(null);
  const highlightTimerRef = useRef(null);

  // 카드도 같은 변수를 읽으므로 documentElement 에 반영한다.
  useEffect(() => { applyFontScale(fontScale); }, [fontScale]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await apiFetch(`${API_BASE}/api/briefing/latest`);
        if (!response.ok) {
          if (!cancelled) setError(`브리핑을 불러오지 못했습니다 (HTTP ${response.status})`);
          return;
        }
        const data = await response.json();
        if (!cancelled) setLatest(data);
      } catch (e) {
        if (!cancelled) setError(`브리핑을 불러오지 못했습니다: ${String(e.message || e)}`);
      }
    })();

    (async () => {
      const [mailResult, eventResult] = await Promise.allSettled([
        fetchAllPages('/api/briefing/mails'),
        fetchAllPages('/api/briefing/events'),
      ]);
      if (cancelled) return;
      const failures = [];
      if (mailResult.status === 'fulfilled') setMails(mailResult.value);
      else failures.push(`메일 ${String(mailResult.reason && mailResult.reason.message ? mailResult.reason.message : mailResult.reason)}`);
      if (eventResult.status === 'fulfilled') setEvents(eventResult.value);
      else failures.push(`일정 ${String(eventResult.reason && eventResult.reason.message ? eventResult.reason.message : eventResult.reason)}`);
      if (failures.length > 0) setSourceError(`출처 자료를 불러오지 못했습니다: ${failures.join(' / ')}`);
      setSourcesLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
  }, []);

  // 탭 전환 직후의 DOM 을 기다렸다가 대상 카드로 스크롤하고 2초간 하이라이트한다.
  useEffect(() => {
    const targetId = jumpTargetRef.current;
    if (!targetId) return undefined;
    jumpTargetRef.current = null;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => {
      const element = document.getElementById(targetId);
      if (!element) return;
      // smooth 는 탭 전환 직후의 재레이아웃과 겹치면 스크롤이 유실되는 경우가
      // 실측되어(2026-08-27), 장거리 점프는 즉시 스크롤로 확정한다.
      element.scrollIntoView({ behavior: 'auto', block: 'center' });
      element.classList.add('bf-jump-highlight');
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => {
        const current = document.getElementById(targetId);
        if (current) current.classList.remove('bf-jump-highlight');
        highlightTimerRef.current = null;
      }, JUMP_HIGHLIGHT_MS);
    }));
    return () => cancelAnimationFrame(frame);
  }, [jumpTick]);

  const mailMap = useMemo(() => {
    const map = new Map();
    for (const mail of mails) if (mail && mail.source_mail_id) map.set(String(mail.source_mail_id), mail);
    return map;
  }, [mails]);

  const eventMap = useMemo(() => {
    const map = new Map();
    for (const event of events) if (event && event.source_event_id) map.set(String(event.source_event_id), event);
    return map;
  }, [events]);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => String(a.start_at || '').localeCompare(String(b.start_at || ''))),
    [events],
  );

  const sortedMails = useMemo(
    () => [...mails].sort((a, b) => String(b.received_at || '').localeCompare(String(a.received_at || ''))),
    [mails],
  );

  const result = latest && latest.detail ? latest.detail.structured_result : null;

  // 일정 탭에서 이벤트마다 붙일 준비 항목을 미리 묶어 둔다.
  const prepsByEvent = useMemo(() => {
    const map = new Map();
    const preparations = (result && result.schedule_preparation) || [];
    for (const item of preparations) {
      for (const scheduleId of item.source_schedule_ids || []) {
        const key = String(scheduleId);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
      }
    }
    return map;
  }, [result]);

  const changeFontScale = (direction) => {
    const index = FONT_SCALES.indexOf(fontScale);
    const current = index === -1 ? FONT_SCALES.indexOf(DEFAULT_FONT_SCALE) : index;
    const next = Math.min(FONT_SCALES.length - 1, Math.max(0, current + direction));
    const value = FONT_SCALES[next];
    setFontScale(value);
    try { localStorage.setItem(FONT_SCALE_KEY, String(value)); } catch { /* ignore */ }
  };

  const jumpTo = (targetTab, elementId, mailId) => {
    if (mailId) setExpandedMails((prev) => ({ ...prev, [mailId]: true }));
    setTab(targetTab);
    jumpTargetRef.current = elementId;
    setJumpTick((tick) => tick + 1);
  };

  const sourceChips = (item) => {
    const chips = [];
    const seen = new Set();
    for (const rawId of item.source_mail_ids || []) {
      const id = String(rawId);
      const key = `mail-${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const mail = mailMap.get(id);
      const sender = mail ? senderShort(mail.sender) : '';
      const title = mail ? (mail.title || '') : '';
      const label = mail
        ? ellipsis(sender && title ? `${sender} · ${title}` : (title || sender || id), CHIP_LABEL_MAX)
        : `메일 ${shortId(id)}`;
      chips.push({ key, kind: 'mail', id, label, known: !!mail });
    }
    for (const rawId of item.source_schedule_ids || []) {
      const id = String(rawId);
      const key = `event-${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const event = eventMap.get(id);
      const label = event
        ? `일정: ${ellipsis(event.title || id, CHIP_LABEL_MAX)}`
        : `일정: ${shortId(id)}`;
      chips.push({ key, kind: 'event', id, label, known: !!event });
    }
    return chips;
  };

  if (error) return <div className="briefing-panel-message">{error}</div>;
  if (!latest) return <div className="briefing-panel-message">불러오는 중...</div>;
  const run = latest.run;
  if (!run) return <div className="briefing-panel-message">아직 생성된 브리핑이 없습니다.</div>;

  const statusClass = run.status === 'succeeded' ? 'ok' : (run.status === 'failed' ? 'bad' : 'pending');
  const scalePercent = `${Math.round(fontScale * 100)}%`;

  return (
    <div className="briefing-panel">
      <div className="briefing-panel-top">
        <div className="briefing-panel-head">
          <span className={`briefing-panel-dot briefing-panel-dot-${statusClass}`} />
          <span className="briefing-panel-date">{run.target_date}</span>
          <span className="briefing-panel-meta">
            mail {run.mail_count} · calendar {run.calendar_count} · {run.trigger} r{run.revision}
          </span>
          {run.status !== 'succeeded' && (
            <span className="briefing-panel-status">{run.status}{run.error_code ? ` (${run.error_code})` : ''}</span>
          )}
          <div className="briefing-scale">
            <button
              type="button"
              className="briefing-scale-button"
              onClick={() => changeFontScale(-1)}
              disabled={fontScale <= FONT_SCALES[0]}
              aria-label="글씨 작게"
            >
              A&#8722;
            </button>
            <span className="briefing-scale-value">{scalePercent}</span>
            <button
              type="button"
              className="briefing-scale-button"
              onClick={() => changeFontScale(1)}
              disabled={fontScale >= FONT_SCALES[FONT_SCALES.length - 1]}
              aria-label="글씨 크게"
            >
              A+
            </button>
          </div>
        </div>
        <div className="briefing-tabs" role="tablist">
          {TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={tab === entry.key}
              className={`briefing-tab${tab === entry.key ? ' active' : ''}`}
              onClick={() => setTab(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'briefing' && (
        <div className="briefing-tabpanel">
          {!result && <div className="briefing-panel-message">이 run 에는 본문이 없습니다.</div>}
          {result && SECTIONS.map(({ key, label }) => {
            const items = [...(result[key] || [])].sort(byPriority);
            if (items.length === 0) return null;
            const opened = !!openSections[key];
            return (
              <div key={key} className="briefing-section">
                <button
                  type="button"
                  className="briefing-section-header"
                  onClick={() => setOpenSections((prev) => ({ ...prev, [key]: !opened }))}
                >
                  <span className={`briefing-caret${opened ? ' open' : ''}`}>&#9656;</span>
                  <span className="briefing-section-label">{label}</span>
                  <span className="briefing-section-count">{items.length}</span>
                </button>
                {opened && (
                  <ul className="briefing-items">
                    {items.map((item, index) => {
                      const chips = sourceChips(item);
                      const claims = claimChips(item);
                      return (
                        <li key={item.analysis_item_id || `${key}-${index}`} className="briefing-item">
                          <p className="briefing-item-text">{item.text}</p>
                          {chips.length > 0 && (
                            <div className="briefing-item-sources">
                              {chips.map((chip) => (chip.known ? (
                                <button
                                  key={chip.key}
                                  type="button"
                                  className={`briefing-source-chip briefing-source-${chip.kind}`}
                                  onClick={() => (chip.kind === 'mail'
                                    ? jumpTo('evidence', `bf-mail-${chip.id}`, chip.id)
                                    : jumpTo('schedule', `bf-event-${chip.id}`, null))}
                                  title={chip.label}
                                >
                                  {chip.label}
                                </button>
                              ) : (
                                <span key={chip.key} className="briefing-source-chip briefing-source-unknown">{chip.label}</span>
                              )))}
                            </div>
                          )}
                          {claims.length > 0 && (
                            <div className="briefing-item-claims">
                              {claims.map((claim) => (
                                <span key={claim} className="briefing-claim-chip">{claim}</span>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
          {sourcesLoading && <div className="briefing-panel-note">출처 자료를 불러오는 중...</div>}
          {sourceError && <div className="briefing-panel-note briefing-panel-note-bad">{sourceError}</div>}
        </div>
      )}

      {tab === 'schedule' && (
        <div className="briefing-tabpanel">
          {sourcesLoading && sortedEvents.length === 0 && <div className="briefing-panel-message">불러오는 중...</div>}
          {!sourcesLoading && sortedEvents.length === 0 && <div className="briefing-panel-message">등록된 일정이 없습니다.</div>}
          {sortedEvents.length > 0 && (
            <ol className="briefing-timeline">
              {sortedEvents.map((event, index) => {
                const id = String(event.source_event_id || `idx-${index}`);
                const preps = prepsByEvent.get(id) || [];
                return (
                  <li key={id} id={`bf-event-${id}`} className="briefing-timeline-row">
                    <div className="briefing-timeline-time">{eventTimeLabel(event)}</div>
                    <div className="briefing-timeline-body">
                      <div className="briefing-timeline-title">{event.title || '(제목 없음)'}</div>
                      <div className="briefing-timeline-meta">
                        {event.organizer && <span className="briefing-timeline-organizer">{event.organizer}</span>}
                        {event.status && <span className="briefing-badge">{event.status}</span>}
                        {event.response_status && <span className="briefing-badge">{event.response_status}</span>}
                        {event.source_missing && <span className="briefing-badge briefing-badge-warn">원본 없음</span>}
                      </div>
                      {preps.length > 0 && (
                        <ul className="briefing-timeline-preps">
                          {preps.map((prep, prepIndex) => (
                            <li key={prep.analysis_item_id || `${id}-prep-${prepIndex}`}>{prep.text}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      {tab === 'evidence' && (
        <div className="briefing-tabpanel">
          {sourcesLoading && sortedMails.length === 0 && <div className="briefing-panel-message">불러오는 중...</div>}
          {!sourcesLoading && sortedMails.length === 0 && <div className="briefing-panel-message">분석된 메일이 없습니다.</div>}
          {sourceError && <div className="briefing-panel-note briefing-panel-note-bad">{sourceError}</div>}
          {sortedMails.map((mail, index) => {
            const id = String(mail.source_mail_id || `idx-${index}`);
            const analysis = mail.analysis || {};
            const expanded = !!expandedMails[id];
            return (
              <div key={id} id={`bf-mail-${id}`} className="briefing-mail-card">
                <button
                  type="button"
                  className="briefing-mail-head"
                  onClick={() => setExpandedMails((prev) => ({ ...prev, [id]: !expanded }))}
                >
                  <span className={`briefing-attn briefing-attn-${attentionClass(analysis.attention_level || mail.importance)}`} />
                  <span className="briefing-mail-title">{mail.title || '(제목 없음)'}</span>
                  <span className="briefing-mail-sender">{senderShort(mail.sender)}</span>
                  <span className="briefing-mail-time">{hhmm(mail.received_at)}</span>
                  <span className={`briefing-caret${expanded ? ' open' : ''}`}>&#9656;</span>
                </button>
                {analysis.summary && <p className="briefing-mail-summary">{analysis.summary}</p>}
                {expanded && (
                  <div className="briefing-mail-detail">
                    {analysis.summary_evidence_excerpt && (
                      <blockquote className="briefing-evidence">{analysis.summary_evidence_excerpt}</blockquote>
                    )}
                    {EVIDENCE_GROUPS.map(({ key, label }) => {
                      const entries = analysis[key] || [];
                      if (entries.length === 0) return null;
                      return (
                        <div key={key} className="briefing-evidence-group">
                          <div className="briefing-evidence-label">{label}</div>
                          <ul className="briefing-evidence-list">
                            {entries.map((entry, entryIndex) => (
                              <li key={(entry && entry.item_id) || `${id}-${key}-${entryIndex}`} className="briefing-evidence-item">
                                <span className="briefing-evidence-text">{entryText(entry)}</span>
                                {entryEvidence(entry) && (
                                  <blockquote className="briefing-evidence">{entryEvidence(entry)}</blockquote>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                    {!analysis.summary_evidence_excerpt
                      && EVIDENCE_GROUPS.every(({ key }) => (analysis[key] || []).length === 0)
                      && <div className="briefing-panel-note">이 메일에는 분석 원장이 없습니다.</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default BriefingPanel;
