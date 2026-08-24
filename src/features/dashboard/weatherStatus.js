const WEATHER_CODES = new Map([
  [0, 'CLEAR'],
  [1, 'CLOUDY'], [2, 'CLOUDY'], [3, 'CLOUDY'],
  [45, 'FOG'], [48, 'FOG'],
  [51, 'RAIN'], [53, 'RAIN'], [55, 'RAIN'], [56, 'RAIN'], [57, 'RAIN'],
  [61, 'RAIN'], [63, 'RAIN'], [65, 'RAIN'], [66, 'RAIN'], [67, 'RAIN'],
  [80, 'RAIN'], [81, 'RAIN'], [82, 'RAIN'],
  [71, 'SNOW'], [73, 'SNOW'], [75, 'SNOW'], [77, 'SNOW'], [85, 'SNOW'], [86, 'SNOW'],
  [95, 'STORM'], [96, 'STORM'], [99, 'STORM'],
]);

export function describeWeatherCode(code) {
  return WEATHER_CODES.get(Number(code)) ?? 'UNKNOWN';
}
