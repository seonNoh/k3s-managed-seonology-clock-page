import { describe, expect, test } from 'vitest';

import { describeWeatherCode } from '../../src/features/dashboard/weatherStatus.js';

describe('weather status label', () => {
  test.each([
    [0, 'CLEAR'],
    [2, 'CLOUDY'],
    [45, 'FOG'],
    [63, 'RAIN'],
    [73, 'SNOW'],
    [95, 'STORM'],
    [999, 'UNKNOWN'],
  ])('WMO code %s를 %s로 표시한다', (code, expected) => {
    expect(describeWeatherCode(code)).toBe(expected);
  });
});
