import { useState, useEffect } from 'react';
import {
  Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain,
  CloudSnow, Snowflake, CloudLightning, Thermometer, MapPin,
} from 'lucide-react';
import './Weather.css';

// WMO weather code → lucide 아이콘 + 설명.
// OS 의존 날씨 이모지는 mac/Windows에서 그림이 달라지므로 벡터 아이콘으로 통일한다.
const WEATHER_CODES = {
  0: { Icon: Sun, desc: '맑음' },
  1: { Icon: CloudSun, desc: '대체로 맑음' },
  2: { Icon: CloudSun, desc: '구름 조금' },
  3: { Icon: Cloud, desc: '흐림' },
  45: { Icon: CloudFog, desc: '안개' },
  48: { Icon: CloudFog, desc: '짙은 안개' },
  51: { Icon: CloudDrizzle, desc: '이슬비' },
  53: { Icon: CloudDrizzle, desc: '이슬비' },
  55: { Icon: CloudDrizzle, desc: '이슬비' },
  56: { Icon: CloudSnow, desc: '진눈깨비' },
  57: { Icon: CloudSnow, desc: '진눈깨비' },
  61: { Icon: CloudRain, desc: '약한 비' },
  63: { Icon: CloudRain, desc: '비' },
  65: { Icon: CloudRain, desc: '강한 비' },
  66: { Icon: CloudSnow, desc: '진눈깨비' },
  67: { Icon: CloudSnow, desc: '강한 진눈깨비' },
  71: { Icon: Snowflake, desc: '약한 눈' },
  73: { Icon: Snowflake, desc: '눈' },
  75: { Icon: Snowflake, desc: '강한 눈' },
  77: { Icon: CloudSnow, desc: '눈보라' },
  80: { Icon: CloudRain, desc: '소나기' },
  81: { Icon: CloudRain, desc: '소나기' },
  82: { Icon: CloudRain, desc: '강한 소나기' },
  85: { Icon: CloudSnow, desc: '눈 소나기' },
  86: { Icon: CloudSnow, desc: '강한 눈 소나기' },
  95: { Icon: CloudLightning, desc: '뇌우' },
  96: { Icon: CloudLightning, desc: '우박 뇌우' },
  99: { Icon: CloudLightning, desc: '강한 우박 뇌우' },
};

function Weather() {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [locationName, setLocationName] = useState('');

  useEffect(() => {
    const fetchWeather = async (lat, lon) => {
      try {
        // Fetch weather data from Open-Meteo
        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`
        );
        const weatherData = await weatherRes.json();

        setWeather({
          temp: Math.round(weatherData.current.temperature_2m),
          feelsLike: Math.round(weatherData.current.apparent_temperature),
          humidity: weatherData.current.relative_humidity_2m,
          windSpeed: Math.round(weatherData.current.wind_speed_10m),
          weatherCode: weatherData.current.weather_code,
          tempMax: Math.round(weatherData.daily.temperature_2m_max[0]),
          tempMin: Math.round(weatherData.daily.temperature_2m_min[0]),
        });

        // Try to get location name via reverse geocoding
        try {
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ko`
          );
          const geoData = await geoRes.json();
          const city = geoData.address?.city || geoData.address?.town || geoData.address?.village || geoData.address?.county || '';
          setLocationName(city);
        } catch {
          setLocationName('현재 위치');
        }

        setLoading(false);
      } catch {
        setError('날씨 정보를 불러올 수 없습니다');
        setLoading(false);
      }
    };

    const getLocation = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            fetchWeather(position.coords.latitude, position.coords.longitude);
          },
          () => {
            // Default to Seoul if geolocation fails
            fetchWeather(37.5665, 126.9780);
            setLocationName('서울');
          }
        );
      } else {
        // Default to Seoul
        fetchWeather(37.5665, 126.9780);
        setLocationName('서울');
      }
    };

    getLocation();

    // Refresh weather every 30 minutes
    const interval = setInterval(getLocation, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="weather-loading">
        <div className="weather-loading-spinner"></div>
        <span>날씨 정보 로딩 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="weather-error">
        <span>{error}</span>
      </div>
    );
  }

  const weatherInfo = WEATHER_CODES[weather.weatherCode] || { Icon: Thermometer, desc: '알 수 없음' };
  const WeatherIcon = weatherInfo.Icon;

  return (
    <div className="weather">
      <div className="weather-main">
        <div className="weather-icon"><WeatherIcon size={56} strokeWidth={1.5} /></div>
        <div className="weather-temp">
          <span className="temp-current">{weather.temp}°</span>
          <span className="temp-desc">{weatherInfo.desc}</span>
        </div>
      </div>

      <div className="weather-details">
        <div className="weather-detail">
          <span className="detail-label">체감</span>
          <span className="detail-value">{weather.feelsLike}°</span>
        </div>
        <div className="weather-detail">
          <span className="detail-label">최고/최저</span>
          <span className="detail-value">{weather.tempMax}° / {weather.tempMin}°</span>
        </div>
        <div className="weather-detail">
          <span className="detail-label">습도</span>
          <span className="detail-value">{weather.humidity}%</span>
        </div>
        <div className="weather-detail">
          <span className="detail-label">바람</span>
          <span className="detail-value">{weather.windSpeed}km/h</span>
        </div>
      </div>

      {locationName && (
        <div className="weather-location">
          <MapPin size={14} strokeWidth={2} />
          <span style={{ marginLeft: 4 }}>{locationName}</span>
        </div>
      )}
    </div>
  );
}

export default Weather;
