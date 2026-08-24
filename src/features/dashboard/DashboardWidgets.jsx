import { useEffect, useState } from 'react';

import { requestJson } from '../../api/client.js';
import { describeWeatherCode } from './weatherStatus.js';
export { default as GoogleSearch } from './GoogleSearch.jsx';

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
