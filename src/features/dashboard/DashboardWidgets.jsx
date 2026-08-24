import { useEffect, useState } from 'react';

import { getSafeExternalUrl, openExternalUrl, requestJson } from '../../api/client.js';
import { describeWeatherCode } from './weatherStatus.js';

function useWeatherStatus() {
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const load = async (latitude, longitude) => {
      try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Weather request failed: ${response.status}`);
        const result = await response.json();
        if (active) setWeather({ temperature: Math.round(result.current.temperature_2m), code: result.current.weather_code });
      } catch (error) {
        if (active && error.name !== 'AbortError') setWeather(null);
      }
    };

    const fallback = () => load(37.5665, 126.9780);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => load(coords.latitude, coords.longitude),
        fallback,
        { timeout: 5000, maximumAge: 900000 },
      );
    } else {
      fallback();
    }

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return weather;
}

function useExchangeStatus() {
  const [rate, setRate] = useState(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch('https://api.manana.kr/exchange/rate/KRW/KRW,JPY.json', { signal: controller.signal });
        if (!response.ok) throw new Error(`Exchange request failed: ${response.status}`);
        const result = await response.json();
        const jpy = result.find((item) => item.name === 'JPYKRW=X');
        if (active) setRate(jpy ? (jpy.rate * 100).toFixed(2) : null);
      } catch (error) {
        if (active && error.name !== 'AbortError') setRate(null);
      }
    };
    load();
    const interval = setInterval(load, 300000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(interval);
    };
  }, []);

  return rate;
}

export function GoogleSearch() {
  const [query, setQuery] = useState('');

  const submit = (event) => {
    event.preventDefault();
    const normalized = query.trim();
    if (!normalized) return;
    openExternalUrl(`https://www.google.com/search?q=${encodeURIComponent(normalized)}`);
    setQuery('');
  };

  return (
    <form className="split-search" role="search" onSubmit={submit}>
      <b aria-hidden="true">G</b>
      <input
        type="search"
        aria-label="Google 검색"
        placeholder="Google 검색"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <button type="submit">Search</button>
    </form>
  );
}

export function StatusSummary({ onOpenWeather, onOpenExchange }) {
  const weather = useWeatherStatus();
  const rate = useExchangeStatus();

  return (
    <div className="split-clock-meta">
      <button type="button" onClick={onOpenWeather}><b>WEATHER</b><span>{weather ? `${weather.temperature}° / ${describeWeatherCode(weather.code)}` : '--° / --'}</span></button>
      <button type="button" onClick={onOpenExchange}><b>EXCHANGE</b><span>₩100 = ¥{rate ?? '--'}</span></button>
      <div><b>TIMEZONE</b><span>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span></div>
      <div><b>SECONDS</b><span className="split-live-indicator">LIVE</span></div>
    </div>
  );
}

export function TodoSummary({ onOpen }) {
  const [pending, setPending] = useState([]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const load = async () => {
      try {
        const result = await requestJson('/api/todos', { signal: controller.signal });
        if (active) setPending((result.todos ?? []).filter((todo) => !todo.completed).slice(0, 3));
      } catch (error) {
        if (active && error.name !== 'AbortError') setPending([]);
      }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(interval);
    };
  }, []);

  return (
    <button type="button" className="split-summary-card" onClick={onOpen}>
      <span>TODO</span>
      <b>{pending.length ? `${pending.length}개 항목 대기 중` : '대기 중인 항목 없음'}</b>
    </button>
  );
}

export function QuickLinksDrawer({ open, onClose }) {
  const [links, setLinks] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    const controller = new AbortController();
    requestJson('/api/bookmarks', { signal: controller.signal })
      .then((result) => {
        const nextLinks = (result.categories ?? []).flatMap((category) => category.bookmarks ?? [])
          .filter((bookmark) => bookmark.quickLink && getSafeExternalUrl(bookmark.url));
        if (active) setLinks(nextLinks);
      })
      .catch(() => { if (active) setLinks([]); })
      .finally(() => { if (active) setLoaded(true); });
    return () => {
      active = false;
      controller.abort();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="split-overlay" onMouseDown={onClose}>
      <section className="split-dialog split-links-dialog" role="dialog" aria-modal="true" aria-labelledby="quick-links-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span>BOOKMARKS</span><h2 id="quick-links-title">Quick Links</h2></div><button type="button" className="split-dialog-close" onClick={onClose}>Close</button></header>
        <div className="split-quick-links">
          {!loaded && <p>불러오는 중입니다.</p>}
          {loaded && links.length === 0 && <p>등록된 Quick Link가 없습니다.</p>}
          {links.map((bookmark) => (
            <a key={bookmark.id} href={getSafeExternalUrl(bookmark.url)} target="_blank" rel="noopener noreferrer">
              <b>{bookmark.name}</b><span>{new URL(bookmark.url).hostname}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ServiceDirectory() {
  const [services, setServices] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    requestJson('/api/services', { signal: controller.signal })
      .then((result) => { if (active) setServices((result.services ?? []).filter((service) => getSafeExternalUrl(service.url))); })
      .catch(() => { if (active) setServices([]); })
      .finally(() => { if (active) setLoaded(true); });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return (
    <div className="split-service-grid">
      {!loaded && <p>서비스를 불러오는 중입니다.</p>}
      {loaded && services.length === 0 && <p>표시할 서비스가 없습니다.</p>}
      {services.map((service) => (
        <a key={service.id} href={getSafeExternalUrl(service.url)} target="_blank" rel="noopener noreferrer">
          <b>{service.name}</b><span>{service.description}</span>
        </a>
      ))}
    </div>
  );
}
