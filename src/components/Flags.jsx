// 국기 SVG 컴포넌트 모음.
// OS 의존 국기 이모지(KR/JP/US regional indicator)는 Windows Chrome/Edge에서 국기로
// 렌더링되지 않아 알파벳 두 글자로 깨진다. 모든 브라우저에서 동일하게 표시되도록 인라인 SVG로 통일한다.

export const FlagKR = ({ size = 14 }) => (
  <svg className="flag-icon" width={size} height={Math.round(size * 2 / 3)} viewBox="0 0 900 600">
    <rect fill="#FFFFFF" width="900" height="600" />
    <circle cx="450" cy="300" r="150" fill="#CD2E3A" />
    <path fill="#0047A0" d="M450,150 A150,150 0 0,0 450,450 A75,75 0 0,0 450,300 A75,75 0 0,1 450,150Z" />
  </svg>
);

export const FlagJP = ({ size = 14 }) => (
  <svg className="flag-icon" width={size} height={Math.round(size * 2 / 3)} viewBox="0 0 900 600">
    <rect fill="#FFFFFF" width="900" height="600" />
    <circle fill="#BC002D" cx="450" cy="300" r="180" />
  </svg>
);

export const FlagUS = ({ size = 14 }) => (
  <svg className="flag-icon" width={size} height={Math.round(size * 2 / 3)} viewBox="0 0 900 600">
    <rect width="900" height="600" fill="#B22234" />
    {[1, 3, 5, 7, 9, 11].map((i) => (
      <rect key={i} y={(600 / 13) * i} width="900" height={600 / 13} fill="#FFFFFF" />
    ))}
    <rect width="360" height={(600 * 7) / 13} fill="#3C3B6E" />
    {Array.from({ length: 5 }).map((_, r) =>
      Array.from({ length: 6 }).map((_, c) => (
        <circle key={`${r}-${c}`} cx={30 + c * 60} cy={28 + r * 60} r="11" fill="#FFFFFF" />
      ))
    )}
  </svg>
);
