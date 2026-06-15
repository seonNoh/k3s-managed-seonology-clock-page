import { useState, useEffect } from 'react';
import './Weather.css';

const WEATHER_CODES = {
  0: { icon: '☀️', desc: '맑음' },
  1: { icon: '🌤', desc: '대체로 맑음' },
  2: { icon: '⛅', desc: '구름 조금' },
  3: { icon: '☁️', desc: '흐림' },
  45: { icon: '🌫', desc: '안개' },
  48: { icon: '🌫', desc: '짙은 안개' },
  51: { icon: '🌦', desc: '이슬비' },
  53: { icon: '🌦', desc: '이슬비' },
  55: { icon: '🌦', desc: '이슬비' },
  56: { icon: '🌨', desc: '진눈깨비' },
  57: { icon: '🌨', desc: '진눈깨비' },
  61: { icon: '🌧', desc: '약한 비' },
  63: { icon: '🌧', desc: '비' },
  65: { icon: '🌧', desc: '강한 비' },
  66: { icon: '🌨', desc: '진눈깨비' },
  67: { icon: '🌨', desc: '강한 진눈깨비' },
  71: { icon: '❄️', desc: '약한 눈' },
  73: { icon: '❄️', desc: '눈' },
  75: { icon: '❄️', desc: '강한 눈' },
  77: { icon: '🌨', desc: '눈보라' },
  80: { icon: '🌧', desc: '소나기' },
  81: { icon: '🌧', desc: '소나기' },
  82: { icon: '⛈', desc: '강한 소나기' },
  85: { icon: '🌨', desc: '눈 소나기' },
  86: { icon: '🌨', desc: '강한 눈 소나기' },
  95: { icon: '⛈', desc: '뇌우' },
  96: { icon: '⛈', desc: '우박 뇌우' },
  99: { icon: '⛈', desc: '강한 우박 뇌우' },
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

  const weatherInfo = WEATHER_CODES[weather.weatherCode] || { icon: '🌡', desc: '알 수 없음' };

  return (
    <div className="weather">
      <div className="weather-main">
        <div className="weather-icon">{weatherInfo.icon}</div>
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
          <span>📍 {locationName}</span>
        </div>
      )}
    </div>
  );
}

export default Weather;
