import { useState, useEffect, useMemo, useCallback } from 'react';
import Holidays from 'date-holidays';
import './Calendar.css';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

// Source color config
const SOURCE_COLORS = {
  doorkeeper: { bg: 'rgba(66, 133, 244, 0.25)', border: '#4285F4', dot: '#4285F4', label: 'Doorkeeper' },
  connpass: { bg: 'rgba(233, 79, 55, 0.25)', border: '#E94F37', dot: '#E94F37', label: 'connpass' },
  tourism: { bg: 'rgba(251, 191, 36, 0.25)', border: '#FBBF24', dot: '#FBBF24', label: '観光・祁り' },
  culture: { bg: 'rgba(16, 185, 129, 0.25)', border: '#10B981', dot: '#10B981', label: '文化・展示' },
};

function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewDate, setViewDate] = useState(new Date());
  const [sapporoEvents, setSapporoEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'it' | 'tourism'

  // Initialize holidays for Korea and Japan
  const krHolidays = useMemo(() => new Holidays('KR'), []);
  const jpHolidays = useMemo(() => new Holidays('JP'), []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Fetch Sapporo events for the current view month
  const fetchSapporoEvents = useCallback(async (forceRefresh = false) => {
    setEventsLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month + 1),
      });
      if (forceRefresh) params.set('refresh', 'true');

      const res = await fetch(`${API_BASE}/api/sapporo-events/all?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSapporoEvents(data.events || []);
        setLastFetched(data.fetchedAt);
      }
    } catch (err) {
      console.error('Failed to fetch Sapporo events:', err);
    } finally {
      setEventsLoading(false);
    }
  }, [year, month]);

  // Auto-fetch on month change
  useEffect(() => {
    fetchSapporoEvents();
  }, [fetchSapporoEvents]);

  // Auto-refresh every 30 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      fetchSapporoEvents();
    }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchSapporoEvents]);

  // Get first day of month and total days
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  const startDay = firstDayOfMonth.getDay();

  // Get holidays for this month
  const getHolidaysForDate = (date) => {
    const holidays = [];
    const krHoliday = krHolidays.isHoliday(date);
    if (krHoliday && krHoliday.length > 0) {
      holidays.push({ country: 'KR', name: krHoliday[0].name });
    }
    const jpHoliday = jpHolidays.isHoliday(date);
    if (jpHoliday && jpHoliday.length > 0) {
      holidays.push({ country: 'JP', name: jpHoliday[0].name });
    }
    return holidays;
  };

  // Get Sapporo events for a specific date
  const getEventsForDate = useCallback((date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return sapporoEvents.filter(event => {
      const start = event.startsAt ? event.startsAt.slice(0, 10) : '';
      const end = event.endsAt ? event.endsAt.slice(0, 10) : start;
      return dateStr >= start && dateStr <= end;
    });
  }, [sapporoEvents]);

  // Generate calendar days
  const days = [];
  const prevMonthDays = new Date(year, month, 0).getDate();

  for (let i = startDay - 1; i >= 0; i--) {
    days.push({
      day: prevMonthDays - i,
      isCurrentMonth: false,
      date: new Date(year, month - 1, prevMonthDays - i),
    });
  }

  for (let i = 1; i <= daysInMonth; i++) {
    const date = new Date(year, month, i);
    days.push({
      day: i,
      isCurrentMonth: true,
      date,
      isToday:
        i === currentDate.getDate() &&
        month === currentDate.getMonth() &&
        year === currentDate.getFullYear(),
      holidays: getHolidaysForDate(date),
    });
  }

  const remainingDays = 42 - days.length;
  for (let i = 1; i <= remainingDays; i++) {
    days.push({
      day: i,
      isCurrentMonth: false,
      date: new Date(year, month + 1, i),
    });
  }

  const prevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
    setSelectedDate(null);
  };

  const nextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
    setSelectedDate(null);
  };

  const goToToday = () => {
    setViewDate(new Date());
    setSelectedDate(null);
  };

  const monthNames = [
    '1월', '2월', '3월', '4월', '5월', '6월',
    '7월', '8월', '9월', '10월', '11월', '12월',
  ];

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  const FlagKR = ({ size = 14 }) => (
    <svg className="flag-icon" width={size} height={Math.round(size * 2 / 3)} viewBox="0 0 900 600">
      <rect fill="#FFFFFF" width="900" height="600"/>
      <circle cx="450" cy="300" r="150" fill="#CD2E3A"/>
      <path fill="#0047A0" d="M450,150 A150,150 0 0,0 450,450 A75,75 0 0,0 450,300 A75,75 0 0,1 450,150Z"/>
    </svg>
  );
  const FlagJP = ({ size = 14 }) => (
    <svg className="flag-icon" width={size} height={Math.round(size * 2 / 3)} viewBox="0 0 900 600">
      <rect fill="#FFFFFF" width="900" height="600"/>
      <circle fill="#BC002D" cx="450" cy="300" r="180"/>
    </svg>
  );

  // Get upcoming holidays
  const upcomingHolidays = useMemo(() => {
    const holidays = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 60; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() + i);
      const krHoliday = krHolidays.isHoliday(checkDate);
      const jpHoliday = jpHolidays.isHoliday(checkDate);
      if (krHoliday || jpHoliday) {
        if (krHoliday && krHoliday.length > 0) {
          holidays.push({ date: new Date(checkDate), name: krHoliday[0].name, country: 'KR' });
        }
        if (jpHoliday && jpHoliday.length > 0) {
          holidays.push({ date: new Date(checkDate), name: jpHoliday[0].name, country: 'JP' });
        }
      }
      if (holidays.length >= 6) break;
    }
    return holidays;
  }, [krHolidays, jpHolidays]);

  const formatHolidayDate = (date) => {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // Filtered events for selected date
  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    const events = getEventsForDate(selectedDate);
    if (activeTab === 'all') return events;
    if (activeTab === 'it') return events.filter(e => e.source === 'doorkeeper' || e.source === 'connpass');
    if (activeTab === 'tourism') return events.filter(e => e.source === 'tourism');
    if (activeTab === 'culture') return events.filter(e => e.source === 'culture');
    return events;
  }, [selectedDate, getEventsForDate, activeTab]);

  // Count events by source for a date
  const getEventSources = useCallback((date) => {
    const events = getEventsForDate(date);
    const sources = new Set(events.map(e => e.source));
    return { count: events.length, sources: [...sources] };
  }, [getEventsForDate]);

  // Upcoming Sapporo events (next 14 days)
  const upcomingEvents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekLater = new Date(today);
    weekLater.setDate(weekLater.getDate() + 14);
    return sapporoEvents.filter(event => {
      const start = new Date(event.startsAt);
      return start >= today && start <= weekLater;
    }).slice(0, 5);
  }, [sapporoEvents]);

  const formatEventTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const formatTimeOnly = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button className="calendar-nav" onClick={prevMonth}>‹</button>
        <div className="calendar-title">
          <span>{year}년 {monthNames[month]}</span>
          <button className="calendar-today" onClick={goToToday}>오늘</button>
          <button
            className={`calendar-refresh ${eventsLoading ? 'loading' : ''}`}
            onClick={() => fetchSapporoEvents(true)}
            title={lastFetched ? `마지막 갱신: ${new Date(lastFetched).toLocaleTimeString('ko-KR')}` : '이벤트 갱신'}
            disabled={eventsLoading}
          >
            ↻
          </button>
        </div>
        <button className="calendar-nav" onClick={nextMonth}>›</button>
      </div>

      {/* Source legend */}
      <div className="calendar-legend">
        {Object.entries(SOURCE_COLORS).map(([key, val]) => (
          <span key={key} className="legend-item">
            <span className="legend-dot" style={{ background: val.dot }} />
            <span className="legend-label">{val.label}</span>
          </span>
        ))}
        {eventsLoading && <span className="legend-loading">로딩중...</span>}
      </div>

      <div className="calendar-grid">
        {dayNames.map((day, index) => (
          <div
            key={day}
            className={`calendar-day-name ${index === 0 ? 'sunday' : index === 6 ? 'saturday' : ''}`}
          >
            {day}
          </div>
        ))}

        {days.map((dayInfo, index) => {
          const dayOfWeek = dayInfo.date.getDay();
          const hasKrHoliday = dayInfo.holidays?.some((h) => h.country === 'KR');
          const eventInfo = dayInfo.isCurrentMonth ? getEventSources(dayInfo.date) : { count: 0, sources: [] };
          const isSelected = selectedDate &&
            dayInfo.date.getDate() === selectedDate.getDate() &&
            dayInfo.date.getMonth() === selectedDate.getMonth() &&
            dayInfo.date.getFullYear() === selectedDate.getFullYear();

          return (
            <div
              key={index}
              className={`calendar-day ${!dayInfo.isCurrentMonth ? 'other-month' : ''} ${dayInfo.isToday ? 'today' : ''} ${dayOfWeek === 0 || hasKrHoliday ? 'sunday' : ''} ${dayOfWeek === 6 ? 'saturday' : ''} ${dayInfo.holidays?.length > 0 ? 'has-holiday' : ''} ${eventInfo.count > 0 ? 'has-event' : ''} ${isSelected ? 'selected' : ''}`}
              title={
                [
                  ...(dayInfo.holidays?.map((h) => h.name) || []),
                  ...(eventInfo.count > 0 ? [`${eventInfo.count}개 이벤트`] : []),
                ].join(' / ') || ''
              }
              onClick={() => dayInfo.isCurrentMonth && setSelectedDate(dayInfo.date)}
            >
              <span className="day-number">{dayInfo.day}</span>
              {dayInfo.holidays && dayInfo.holidays.length > 0 && (
                <div className="holiday-info">
                  {dayInfo.holidays.map((h, i) => (
                    <div key={i} className="holiday-label">
                      <span className="holiday-flag">{h.country === 'KR' ? <FlagKR size={10} /> : <FlagJP size={10} />}</span>
                      <span className="holiday-name-cell">{h.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {eventInfo.count > 0 && (
                <div className="event-dots">
                  {eventInfo.sources.map(src => (
                    <span key={src} className="event-dot" style={{ background: SOURCE_COLORS[src]?.dot || '#888' }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected date event detail */}
      {selectedDate && (
        <div className="event-detail-panel">
          <div className="event-detail-header">
            <span className="event-detail-date">
              {selectedDate.getMonth() + 1}/{selectedDate.getDate()} ({dayNames[selectedDate.getDay()]})
            </span>
            <div className="event-tabs">
              {[
                { key: 'all', label: '전체' },
                { key: 'it', label: 'IT' },
                { key: 'tourism', label: '관광' },
                { key: 'culture', label: '문화' },
              ].map(tab => (
                <button
                  key={tab.key}
                  className={`event-tab ${activeTab === tab.key ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button className="event-detail-close" onClick={() => setSelectedDate(null)}>✕</button>
          </div>
          {selectedDateEvents.length === 0 ? (
            <div className="event-empty">이벤트가 없습니다</div>
          ) : (
            <div className="event-list">
              {selectedDateEvents.map(event => (
                <a
                  key={event.id}
                  className="event-card"
                  href={event.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ borderLeftColor: SOURCE_COLORS[event.source]?.border || '#888' }}
                >
                  <div className="event-card-header">
                    <span className="event-source-badge" style={{ background: SOURCE_COLORS[event.source]?.bg, color: SOURCE_COLORS[event.source]?.border }}>
                      {SOURCE_COLORS[event.source]?.label || event.source}
                    </span>
                    <span className="event-time">
                      {event.source === 'tourism' || event.source === 'culture' ? '종일' : formatTimeOnly(event.startsAt)}
                    </span>
                  </div>
                  <div className="event-card-title">{event.titleKo || event.title}</div>
                  {event.venue && <div className="event-card-venue">📍 {event.venue}</div>}
                  {event.source !== 'tourism' && event.source !== 'culture' && event.participants > 0 && (
                    <div className="event-card-meta">
                      👥 {event.participants}{event.limit ? `/${event.limit}` : ''}명
                      {event.groupName && <span> · {event.groupName}</span>}
                    </div>
                  )}
                  {(event.source === 'tourism' || event.source === 'culture') && event.description && (
                    <div className="event-card-desc">{event.description}</div>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upcoming Sapporo events */}
      {upcomingEvents.length > 0 && !selectedDate && (
        <div className="upcoming-events">
          <div className="upcoming-title">📅 삿포로 이벤트 (2주 이내)</div>
          <div className="upcoming-list">
            {upcomingEvents.map(event => (
              <a
                key={event.id}
                className="upcoming-event-item"
                href={event.url || '#'}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="event-dot-inline" style={{ background: SOURCE_COLORS[event.source]?.dot || '#888' }} />
                <span className="upcoming-event-date">{formatEventTime(event.startsAt)}</span>
                <span className="upcoming-event-name">{event.titleKo || event.title}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming holidays section */}
      {upcomingHolidays.length > 0 && !selectedDate && (
        <div className="upcoming-holidays">
          <div className="upcoming-title">다가오는 휴일</div>
          <div className="upcoming-list">
            {upcomingHolidays.map((holiday, index) => (
              <div key={index} className="upcoming-item">
                <span className="upcoming-country">{holiday.country === 'KR' ? <FlagKR /> : <FlagJP />}</span>
                <span className="upcoming-date">{formatHolidayDate(holiday.date)}</span>
                <span className="upcoming-name">{holiday.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Calendar;
