import { useState, useEffect } from 'react';
import './ExchangeRate.css';

function ExchangeRate() {
  const [rates, setRates] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    const fetchRates = async () => {
      try {
        // Using exchangerate-api.com free tier
        const res = await fetch(
          'https://api.exchangerate-api.com/v4/latest/USD'
        );
        const data = await res.json();

        // Calculate KRW to JPY rate
        const krwRate = data.rates.KRW;
        const jpyRate = data.rates.JPY;
        const krwToJpy = jpyRate / krwRate; // How many JPY per 1 KRW
        const jpyToKrw = krwRate / jpyRate; // How many KRW per 1 JPY

        setRates({
          usdToKrw: krwRate,
          usdToJpy: jpyRate,
          krwToJpy: krwToJpy * 100, // Per 100 KRW
          jpyToKrw: jpyToKrw, // Per 1 JPY
        });

        setLastUpdated(new Date());
        setLoading(false);
      } catch {
        setError('환율 정보를 불러올 수 없습니다');
        setLoading(false);
      }
    };

    fetchRates();

    // Refresh every hour
    const interval = setInterval(fetchRates, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (date) => {
    if (!date) return '';
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="exchange-loading">
        <div className="exchange-loading-spinner"></div>
        <span>환율 정보 로딩 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="exchange-error">
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="exchange-rate">
      <div className="exchange-cards">
        <div className="exchange-card">
          <div className="exchange-pair">
            <span className="currency-flag">🇺🇸</span>
            <span className="currency-code">USD</span>
            <span className="exchange-arrow">→</span>
            <span className="currency-flag">🇰🇷</span>
            <span className="currency-code">KRW</span>
          </div>
          <div className="exchange-value">
            ₩{rates.usdToKrw.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="exchange-card">
          <div className="exchange-pair">
            <span className="currency-flag">🇺🇸</span>
            <span className="currency-code">USD</span>
            <span className="exchange-arrow">→</span>
            <span className="currency-flag">🇯🇵</span>
            <span className="currency-code">JPY</span>
          </div>
          <div className="exchange-value">
            ¥{rates.usdToJpy.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="exchange-card highlight">
          <div className="exchange-pair">
            <span className="currency-flag">🇰🇷</span>
            <span className="currency-code">100원</span>
            <span className="exchange-arrow">→</span>
            <span className="currency-flag">🇯🇵</span>
            <span className="currency-code">JPY</span>
          </div>
          <div className="exchange-value">
            ¥{rates.krwToJpy.toFixed(2)}
          </div>
        </div>

        <div className="exchange-card highlight">
          <div className="exchange-pair">
            <span className="currency-flag">🇯🇵</span>
            <span className="currency-code">100엔</span>
            <span className="exchange-arrow">→</span>
            <span className="currency-flag">🇰🇷</span>
            <span className="currency-code">KRW</span>
          </div>
          <div className="exchange-value">
            ₩{(rates.jpyToKrw * 100).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {lastUpdated && (
        <div className="exchange-updated">
          마지막 업데이트: {formatTime(lastUpdated)}
        </div>
      )}
    </div>
  );
}

export default ExchangeRate;
