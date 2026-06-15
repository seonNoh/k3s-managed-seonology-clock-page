import { useState, useEffect, useRef } from 'react';
import './FlipClock.css';

function FlipCard({ digit, prevDigit, isFlipping }) {
  return (
    <div className="flip-card">
      {/* Static base - always shows CURRENT digit */}
      <div className="flip-card-inner">
        <div className="card-face card-top">
          <span>{digit}</span>
        </div>
        <div className="card-face card-bottom">
          <span>{digit}</span>
        </div>
      </div>

      {/* Animated flip overlay */}
      {isFlipping && (
        <div className="flip-animation">
          {/* Covers bottom half with old digit during animation */}
          <div className="flip-bottom-cover">
            <span>{prevDigit}</span>
          </div>
          {/* Top flap: shows old digit, folds away to reveal new */}
          <div className="flip-top">
            <span>{prevDigit}</span>
          </div>
          {/* Bottom flap: shows new digit, unfolds into view */}
          <div className="flip-bottom">
            <span>{digit}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Custom hook to track previous value
function usePrevious(value) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

function FlipUnit({ value, prevValue, label }) {
  const [isFlipping, setIsFlipping] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (value !== prevValue) {
      setIsFlipping(true);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setIsFlipping(false);
      }, 600);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, prevValue]);

  const digits = String(value).padStart(2, '0').split('');
  const prevDigits = String(prevValue).padStart(2, '0').split('');

  return (
    <div className="flip-unit">
      <div className="flip-unit-cards">
        {digits.map((digit, index) => (
          <FlipCard
            key={index}
            digit={digit}
            prevDigit={prevDigits[index]}
            isFlipping={isFlipping && digit !== prevDigits[index]}
          />
        ))}
      </div>
      <span className="flip-unit-label">{label}</span>
    </div>
  );
}

function FlipClock({ time: externalTime, embedded = false }) {
  const [internalTime, setInternalTime] = useState(new Date());

  useEffect(() => {
    if (externalTime !== undefined) return;
    const timer = setInterval(() => {
      setInternalTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, [externalTime]);

  const time = externalTime || internalTime;

  const hours = time.getHours();
  const minutes = time.getMinutes();
  const seconds = time.getSeconds();

  const prevHours = usePrevious(hours);
  const prevMinutes = usePrevious(minutes);
  const prevSeconds = usePrevious(seconds);

  return (
    <div className={`flip-clock${embedded ? ' flip-clock-embedded' : ''}`}>
      <div className="flip-clock-inner">
        <FlipUnit value={hours} prevValue={prevHours} label="HOURS" />
        <div className="flip-clock-separator">
          <span className="separator-dot"></span>
          <span className="separator-dot"></span>
        </div>
        <FlipUnit value={minutes} prevValue={prevMinutes} label="MINUTES" />
        <div className="flip-clock-separator">
          <span className="separator-dot"></span>
          <span className="separator-dot"></span>
        </div>
        <FlipUnit value={seconds} prevValue={prevSeconds} label="SECONDS" />
      </div>
    </div>
  );
}

export default FlipClock;
