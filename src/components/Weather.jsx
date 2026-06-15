import { useState, useEffect, useRef } from 'react';
import {
  Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain,
  CloudSnow, Snowflake, CloudLightning, Thermometer, MapPin, AlertTriangle,
} from 'lucide-react';
import { resolveJmaOffice } from '../utils/jmaArea';
import './Weather.css';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

// Open-Meteo WMO weather code → lucide 아이콘 + 한국어 설명 (현재 실황·시간별·비일본 예보용)
const WEATHER_CODES = {
  0: { Icon: Sun, desc: '맑음' }, 1: { Icon: CloudSun, desc: '대체로 맑음' }, 2: { Icon: CloudSun, desc: '구름 조금' },
  3: { Icon: Cloud, desc: '흐림' }, 45: { Icon: CloudFog, desc: '안개' }, 48: { Icon: CloudFog, desc: '짙은 안개' },
  51: { Icon: CloudDrizzle, desc: '이슬비' }, 53: { Icon: CloudDrizzle, desc: '이슬비' }, 55: { Icon: CloudDrizzle, desc: '이슬비' },
  56: { Icon: CloudSnow, desc: '진눈깨비' }, 57: { Icon: CloudSnow, desc: '진눈깨비' },
  61: { Icon: CloudRain, desc: '약한 비' }, 63: { Icon: CloudRain, desc: '비' }, 65: { Icon: CloudRain, desc: '강한 비' },
  66: { Icon: CloudSnow, desc: '진눈깨비' }, 67: { Icon: CloudSnow, desc: '강한 진눈깨비' },
  71: { Icon: Snowflake, desc: '약한 눈' }, 73: { Icon: Snowflake, desc: '눈' }, 75: { Icon: Snowflake, desc: '강한 눈' },
  77: { Icon: CloudSnow, desc: '눈보라' }, 80: { Icon: CloudRain, desc: '소나기' }, 81: { Icon: CloudRain, desc: '소나기' },
  82: { Icon: CloudRain, desc: '강한 소나기' }, 85: { Icon: CloudSnow, desc: '눈 소나기' }, 86: { Icon: CloudSnow, desc: '강한 눈 소나기' },
  95: { Icon: CloudLightning, desc: '뇌우' }, 96: { Icon: CloudLightning, desc: '우박 뇌우' }, 99: { Icon: CloudLightning, desc: '강한 우박 뇌우' },
};
const omInfo = (code) => WEATHER_CODES[code] || { Icon: Thermometer, desc: '-' };

// JMA weatherCode(100맑음/200흐림/300비/400눈 대분류) → lucide 아이콘
function jmaIcon(code) {
  const n = parseInt(code, 10);
  if (n >= 100 && n < 200) return Sun;
  if (n >= 200 && n < 300) return Cloud;
  if (n >= 300 && n < 400) return CloudRain;
  if (n >= 400 && n <= 450) return CloudSnow;
  return Cloud;
}

// US AQI 등급
function aqiLevel(aqi) {
  if (aqi == null) return { label: '-', cls: '' };
  if (aqi <= 50) return { label: '좋음', cls: 'good' };
  if (aqi <= 100) return { label: '보통', cls: 'moderate' };
  if (aqi <= 150) return { label: '민감군 주의', cls: 'sensitive' };
  if (aqi <= 200) return { label: '나쁨', cls: 'unhealthy' };
  return { label: '매우 나쁨', cls: 'hazardous' };
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

// Open-Meteo hourly → 현재 시각 이후 12개 시점
function buildHourly(om) {
  const h = om?.hourly;
  if (!h?.time) return null;
  const now = Date.now();
  let start = h.time.findIndex((t) => new Date(t).getTime() >= now);
  if (start < 0) start = 0;
  return h.time.slice(start, start + 12).map((t, i) => ({
    time: new Date(t).getHours(),
    temp: Math.round(h.temperature_2m[start + i]),
    pop: h.precipitation_probability?.[start + i] ?? null,
    code: h.weather_code[start + i],
  }));
}

// Open-Meteo daily → 7일 (비일본 폴백)
function buildOmDaily(om) {
  const d = om?.daily;
  if (!d?.time) return null;
  return d.time.map((t, i) => ({
    date: t,
    code: d.weather_code[i],
    pop: d.precipitation_probability_max?.[i] ?? null,
    max: Math.round(d.temperature_2m_max[i]),
    min: Math.round(d.temperature_2m_min[i]),
    om: true,
  }));
}

// JMA bosai forecast JSON 파싱 → 오늘 하늘(일본어) + 주간
function parseJma(data) {
  const out = { office: data?.[0]?.publishingOffice || '', skyJa: '', skyCode: '', areaName: '', weekly: [] };
  const short = data?.[0]?.timeSeries?.[0]?.areas?.[0];
  if (short) {
    out.areaName = short.area?.name || '';
    out.skyJa = (short.weathers?.[0] || '').replace(/　+/g, ' ').trim();
    out.skyCode = short.weatherCodes?.[0] || '';
  }
  const wk = data?.[1]?.timeSeries;
  const wkSky = wk?.[0]?.areas?.[0];
  const wkTemp = wk?.[1]?.areas?.[0];
  const times = wk?.[0]?.timeDefines || [];
  out.weekly = times.map((t, i) => ({
    date: t,
    code: wkSky?.weatherCodes?.[i] || '',
    pop: wkSky?.pops?.[i] || '',
    max: wkTemp?.tempsMax?.[i] || '',
    min: wkTemp?.tempsMin?.[i] || '',
  })).filter((d) => d.max !== '' || d.min !== ''); // 오늘(빈값) 제외
  return out;
}

function Weather() {
  const [s, setS] = useState({ loading: true, error: null });
  const [warning, setWarning] = useState(null);
  const sseRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const closeSse = () => { if (sseRef.current) { sseRef.current.close(); sseRef.current = null; } };

    const load = async (lat, lon, fallbackName) => {
      try {
        const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=7&timezone=auto`;
        const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,us_aqi&timezone=auto`;
        const geoUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&accept-language=ko`;

        const [omR, aqR, geoR] = await Promise.allSettled([fetch(omUrl), fetch(aqUrl), fetch(geoUrl)]);
        if (cancelled) return;
        const om = omR.status === 'fulfilled' ? await omR.value.json() : null;
        const aq = aqR.status === 'fulfilled' ? await aqR.value.json() : null;
        const geo = geoR.status === 'fulfilled' ? await geoR.value.json() : null;
        const addr = geo?.address || {};
        const office = resolveJmaOffice(addr, lat, lon);
        const locName = addr.city || addr.town || addr.village || addr.county || fallbackName || '현재 위치';

        const cur = om?.current ? {
          temp: Math.round(om.current.temperature_2m),
          feelsLike: Math.round(om.current.apparent_temperature),
          humidity: om.current.relative_humidity_2m,
          windSpeed: Math.round(om.current.wind_speed_10m),
          code: om.current.weather_code,
        } : null;
        const hourly = buildHourly(om);
        const air = aq?.current ? { pm25: Math.round(aq.current.pm2_5), pm10: Math.round(aq.current.pm10), aqi: aq.current.us_aqi } : null;
        const todayMax = om?.daily ? Math.round(om.daily.temperature_2m_max[0]) : null;
        const todayMin = om?.daily ? Math.round(om.daily.temperature_2m_min[0]) : null;

        let jma = null;
        if (office) {
          try {
            const r = await fetch(`${API_BASE}/api/jma/forecast?code=${office}`);
            if (r.ok) jma = parseJma(await r.json());
          } catch { /* JMA 실패 → Open-Meteo 폴백 */ }
        }
        const weekly = jma?.weekly?.length ? jma.weekly : buildOmDaily(om);

        if (cancelled) return;
        setS({
          loading: false, error: null, locationName: locName, current: cur, hourly, air,
          todayMax, todayMin, source: jma ? 'jma' : 'om', jma, weekly, office,
        });

        // 특보 SSE (일본 지역만)
        closeSse();
        setWarning(null);
        if (office) {
          const es = new EventSource(`${API_BASE}/api/jma/warning/stream?code=${office}`);
          es.addEventListener('warning', (e) => {
            try {
              const w = JSON.parse(e.data);
              setWarning(w.headlineText && w.headlineText.trim() ? w : null);
            } catch { /* ignore */ }
          });
          es.onerror = () => { /* 브라우저가 자동 재연결 */ };
          sseRef.current = es;
        }
      } catch {
        if (!cancelled) setS({ loading: false, error: '날씨 정보를 불러올 수 없습니다' });
      }
    };

    const start = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (p) => load(p.coords.latitude, p.coords.longitude),
          () => load(37.5665, 126.9780, '서울'),
        );
      } else load(37.5665, 126.9780, '서울');
    };

    start();
    const iv = setInterval(start, 30 * 60 * 1000);
    return () => { cancelled = true; clearInterval(iv); closeSse(); };
  }, []);

  if (s.loading) {
    return (
      <div className="weather-loading">
        <div className="weather-loading-spinner"></div>
        <span>날씨 정보 로딩 중...</span>
      </div>
    );
  }
  if (s.error) return <div className="weather-error"><span>{s.error}</span></div>;

  const CurIcon = omInfo(s.current?.code).Icon;
  // 하늘 설명: 일본이면 JMA 일본어 원문, 아니면 Open-Meteo 한국어
  const skyDesc = s.source === 'jma' && s.jma?.skyJa ? s.jma.skyJa : omInfo(s.current?.code).desc;
  const air = s.air ? aqiLevel(s.air.aqi) : null;

  return (
    <div className="weather weather-pro">
      {warning && (
        <div className="wx-alert">
          <AlertTriangle size={16} />
          <span>{warning.headlineText}</span>
        </div>
      )}

      <div className="weather-main">
        <div className="weather-icon"><CurIcon size={56} strokeWidth={1.5} /></div>
        <div className="weather-temp">
          <span className="temp-current">{s.current?.temp}°</span>
          <span className="temp-desc">{skyDesc}</span>
        </div>
      </div>

      <div className="weather-details">
        <div className="weather-detail"><span className="detail-label">체감</span><span className="detail-value">{s.current?.feelsLike}°</span></div>
        <div className="weather-detail"><span className="detail-label">최고/최저</span><span className="detail-value">{s.todayMax}° / {s.todayMin}°</span></div>
        <div className="weather-detail"><span className="detail-label">습도</span><span className="detail-value">{s.current?.humidity}%</span></div>
        <div className="weather-detail"><span className="detail-label">바람</span><span className="detail-value">{s.current?.windSpeed}km/h</span></div>
      </div>

      {s.air && (
        <div className="wx-air">
          <span className="wx-air-title">대기질</span>
          <span className={`wx-air-badge ${air.cls}`}>{air.label}</span>
          <span className="wx-air-detail">PM2.5 {s.air.pm25} · PM10 {s.air.pm10} · AQI {s.air.aqi ?? '-'}</span>
        </div>
      )}

      {s.hourly?.length > 0 && (
        <div className="wx-section">
          <div className="wx-section-title">시간별</div>
          <div className="wx-hourly">
            {s.hourly.map((h, i) => {
              const HIcon = omInfo(h.code).Icon;
              return (
                <div key={i} className="wx-hour">
                  <span className="wx-hour-t">{h.time}시</span>
                  <HIcon size={20} strokeWidth={1.6} />
                  <span className="wx-hour-pop">{h.pop != null ? `${h.pop}%` : ''}</span>
                  <span className="wx-hour-temp">{h.temp}°</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {s.weekly?.length > 0 && (
        <div className="wx-section">
          <div className="wx-section-title">주간 예보</div>
          <div className="wx-weekly">
            {s.weekly.map((d, i) => {
              const WIcon = d.om ? omInfo(d.code).Icon : jmaIcon(d.code);
              const dow = WEEKDAY[new Date(d.date).getDay()];
              return (
                <div key={i} className="wx-day">
                  <span className="wx-day-dow">{dow}</span>
                  <WIcon size={20} strokeWidth={1.6} />
                  <span className="wx-day-pop">{d.pop !== '' && d.pop != null ? `${d.pop}%` : '-'}</span>
                  <span className="wx-day-temp"><b>{d.max !== '' ? d.max : '-'}°</b> {d.min !== '' ? d.min : '-'}°</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="weather-location">
        <MapPin size={14} strokeWidth={2} />
        <span style={{ marginLeft: 4 }}>{s.locationName}</span>
        <span className="wx-source">· {s.source === 'jma' ? '気象庁(JMA)' : 'Open-Meteo'}</span>
      </div>
    </div>
  );
}

export default Weather;
