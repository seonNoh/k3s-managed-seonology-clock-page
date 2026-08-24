import './LoadingProgress.css';

function LoadingProgress({
  label,
  detail,
  value,
  max = 100,
  compact = false,
  className = '',
}) {
  const determinate = Number.isFinite(value) && Number.isFinite(max) && max > 0;
  const safeValue = determinate ? Math.min(Math.max(value, 0), max) : null;
  const percent = determinate ? Math.round((safeValue / max) * 100) : null;
  const classes = [
    'loading-progress',
    determinate ? 'is-determinate' : 'is-indeterminate',
    compact ? 'is-compact' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <section className={classes} role="status" aria-live="polite" aria-atomic="true">
      <div className="loading-progress__heading">
        <span className="loading-progress__label">{label}</span>
        <span className="loading-progress__value">{determinate ? `${percent}%` : '진행 중'}</span>
      </div>
      {detail && <p className="loading-progress__detail">{detail}</p>}
      <div
        className="loading-progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={determinate ? 0 : undefined}
        aria-valuemax={determinate ? max : undefined}
        aria-valuenow={determinate ? safeValue : undefined}
        aria-valuetext={determinate ? `${percent}%` : '진행 중'}
      >
        <span
          className="loading-progress__fill"
          style={determinate ? { width: `${percent}%` } : undefined}
        />
      </div>
    </section>
  );
}

export default LoadingProgress;
