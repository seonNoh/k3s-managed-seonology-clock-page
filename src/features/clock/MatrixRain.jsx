import { memo } from 'react';

const CHARACTERS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF';

function seededFraction(seed) {
  const value = Math.sin(seed * 9301 + 49297) * 233280;
  return value - Math.floor(value);
}

function buildColumns(count) {
  return Object.freeze(Array.from({ length: count }, (_, columnIndex) => {
    const seed = columnIndex + 1;
    return Object.freeze({
      id: columnIndex,
      left: `${(columnIndex / count) * 100}%`,
      delay: `${seededFraction(seed) * 8}s`,
      duration: `${4 + seededFraction(seed + 41) * 8}s`,
      fontSize: `${0.7 + seededFraction(seed + 83) * 0.5}rem`,
      opacity: 0.15 + seededFraction(seed + 127) * 0.35,
      chars: Object.freeze(Array.from({ length: 30 }, (_, rowIndex) => (
        CHARACTERS[Math.floor(seededFraction(seed * 131 + rowIndex) * CHARACTERS.length)]
      ))),
    });
  }));
}

const MATRIX_COLUMNS = buildColumns(35);

const MatrixRain = memo(function MatrixRain() {
  return (
    <div className="matrix-rain" aria-hidden="true">
      {MATRIX_COLUMNS.map((column) => (
        <div
          key={column.id}
          className="matrix-column"
          style={{
            left: column.left,
            animationDelay: column.delay,
            animationDuration: column.duration,
            fontSize: column.fontSize,
            opacity: column.opacity,
          }}
        >
          {column.chars.map((character, rowIndex) => <span key={rowIndex}>{character}</span>)}
        </div>
      ))}
    </div>
  );
});

export default MatrixRain;
