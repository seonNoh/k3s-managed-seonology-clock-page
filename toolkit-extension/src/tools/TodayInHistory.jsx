import { useState, useEffect } from 'react';
import './TodayInHistory.css';

function TodayInHistory() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState({ month: 0, day: 0 });

  useEffect(() => {
    const fetchHistory = async () => {
      const now = new Date();
      const month = now.getMonth() + 1;
      const day = now.getDate();
      setToday({ month, day });

      try {
        // Using Wikipedia's "On This Day" API - English version (more reliable)
        const res = await fetch(
          `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${month}/${day}`,
          {
            headers: {
              'Accept': 'application/json',
            },
          }
        );

        if (!res.ok) {
          throw new Error('Failed to fetch');
        }

        const data = await res.json();

        // Get recent significant events (last 100 years prioritized)
        const filteredEvents = data.events
          ?.filter((event) => event.year && event.text)
          .sort((a, b) => b.year - a.year)
          .slice(0, 5)
          .map((event) => ({
            year: event.year,
            text: event.text,
          }));

        setEvents(filteredEvents || []);
        setLoading(false);
      } catch (error) {
        console.error('History fetch error:', error);
        // Fallback: show pre-defined events
        setEvents(getFallbackEvents(month, day));
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  // Fallback events for common dates
  const getFallbackEvents = (month, day) => {
    const fallbackData = {
      '1-1': [
        { year: 1863, text: '에이브러햄 링컨이 노예해방선언에 서명' },
        { year: 1995, text: '세계무역기구(WTO) 출범' },
      ],
      '3-1': [
        { year: 1919, text: '3.1 독립운동' },
      ],
      '8-15': [
        { year: 1945, text: '대한민국 광복' },
      ],
      '12-25': [
        { year: 336, text: '첫 기록된 크리스마스 축하' },
      ],
    };

    return fallbackData[`${month}-${day}`] || [
      { year: new Date().getFullYear(), text: '이 날의 역사 정보를 불러오는 중입니다...' },
    ];
  };

  if (loading) {
    return (
      <div className="history-loading">
        <div className="history-loading-spinner"></div>
        <span>역사 정보 로딩 중...</span>
      </div>
    );
  }

  return (
    <div className="today-history">
      <div className="history-date">
        {today.month}월 {today.day}일의 역사
      </div>

      <div className="history-events">
        {events.length === 0 ? (
          <div className="history-empty">
            오늘의 역사 정보가 없습니다.
          </div>
        ) : (
          events.map((event, index) => (
            <div key={index} className="history-event">
              <span className="event-year">{event.year}</span>
              <span className="event-text">{event.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default TodayInHistory;
