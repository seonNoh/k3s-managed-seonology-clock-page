// Nominatim 역지오코딩 주소 → JMA bosai office code(부현예보 단위) 매핑.
// 대부분 도도부현은 ISO3166-2(JP-NN) → "NN0000". 예외 3개만 별도 처리.
// 홋카이도 내 세분(旭川/函館 등 8개 예보구역)은 삿포로(016000) 기본으로 두고 추후 과제.
const OFFICE_BY_PREF = (() => {
  const m = {};
  for (let n = 1; n <= 47; n += 1) {
    const p = String(n).padStart(2, '0');
    m[`JP-${p}`] = `${p}0000`;
  }
  m['JP-01'] = '016000'; // 北海道 → 石狩・空知・後志(札幌) 기본
  m['JP-46'] = '460100'; // 鹿児島 본토(아마미 도서 460040 제외)
  m['JP-47'] = '471000'; // 沖縄 본도/那覇(미야코·야에야마·다이토 제외)
  return m;
})();

export function isJapan(addr) {
  return (addr?.country_code || '').toLowerCase() === 'jp';
}

// 일본이면 office code, 아니면 null (호출측에서 null이면 Open-Meteo 폴백)
export function resolveJmaOffice(addr) {
  if (!isJapan(addr)) return null;
  return OFFICE_BY_PREF[addr['ISO3166-2-lvl4']] || null;
}
