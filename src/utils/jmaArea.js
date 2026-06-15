// Nominatim 역지오코딩 주소(+좌표) → JMA bosai office code(부현예보 단위) 매핑.
// 대부분 도도부현은 ISO3166-2(JP-NN) → "NN0000" 1:1.
// 단 한 도도부현이 여러 예보구역으로 쪼개진 곳(홋카이도 8·가고시마 2·오키나와 4)은
// 브라우저 좌표로 가장 가까운 구역(대표 도시 좌표 기준)을 고른다.
const OFFICE_BY_PREF = (() => {
  const m = {};
  for (let n = 1; n <= 47; n += 1) {
    const p = String(n).padStart(2, '0');
    m[`JP-${p}`] = `${p}0000`;
  }
  return m;
})();

// 복수 예보구역 도도부현: [office, 대표도시 위도, 경도]
const MULTI_OFFICE = {
  'JP-01': [ // 北海道 8구역
    ['016000', 43.06, 141.35], // 石狩・空知・後志(札幌)
    ['017000', 41.77, 140.73], // 渡島・檜山(函館)
    ['012000', 43.77, 142.37], // 上川・留萌(旭川)
    ['011000', 45.42, 141.67], // 宗谷(稚内)
    ['013000', 43.80, 143.89], // 網走・北見・紋別(北見)
    ['014030', 42.92, 143.20], // 十勝(帯広)
    ['014100', 42.98, 144.38], // 釧路・根室(釧路)
    ['015000', 42.32, 140.97], // 胆振・日高(室蘭)
  ],
  'JP-46': [ // 鹿児島
    ['460100', 31.56, 130.56], // 본토(鹿児島)
    ['460040', 28.38, 129.49], // 奄美(名瀬)
  ],
  'JP-47': [ // 沖縄
    ['471000', 26.21, 127.68], // 본도(那覇)
    ['472000', 24.80, 125.28], // 宮古島
    ['473000', 24.34, 124.16], // 八重山(石垣)
    ['474000', 25.83, 131.23], // 大東島
  ],
};

function nearest(list, lat, lon) {
  let best = list[0][0];
  let bestD = Infinity;
  for (const [code, la, lo] of list) {
    const d = (la - lat) ** 2 + (lo - lon) ** 2;
    if (d < bestD) { bestD = d; best = code; }
  }
  return best;
}

export function isJapan(addr) {
  return (addr?.country_code || '').toLowerCase() === 'jp';
}

// 일본이면 office code(복수구역은 좌표 최근접), 아니면 null(호출측 Open-Meteo 폴백)
export function resolveJmaOffice(addr, lat, lon) {
  if (!isJapan(addr)) return null;
  const iso = addr['ISO3166-2-lvl4'];
  if (MULTI_OFFICE[iso] && lat != null && lon != null) return nearest(MULTI_OFFICE[iso], lat, lon);
  return OFFICE_BY_PREF[iso] || null;
}
