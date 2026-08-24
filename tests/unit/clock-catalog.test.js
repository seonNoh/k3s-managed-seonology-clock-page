import { describe, expect, test } from 'vitest';

import {
  CLOCK_TEMPLATES,
  CLOCK_TEMPLATE_IDS,
  getClockTemplate,
} from '../../src/features/clock/clockCatalog.js';

describe('clock template catalog', () => {
  test('12개 시계 템플릿은 중복 없이 안정적인 순서로 제공된다', () => {
    expect(CLOCK_TEMPLATE_IDS).toEqual([
      'digital', 'analog', 'flip', 'neon', 'binary', 'word',
      'progress', 'swiss', 'matrix', 'dotmatrix', 'ring', 'typography',
    ]);
    expect(new Set(CLOCK_TEMPLATE_IDS).size).toBe(12);
    expect(Object.isFrozen(CLOCK_TEMPLATES)).toBe(true);
  });

  test.each([
    ['digital', 'portrait'],
    ['analog', 'square'],
    ['flip', 'panorama'],
    ['neon', 'portrait'],
    ['binary', 'square'],
    ['word', 'panorama'],
    ['progress', 'panorama'],
    ['swiss', 'square'],
    ['matrix', 'panorama'],
    ['dotmatrix', 'portrait'],
    ['ring', 'square'],
    ['typography', 'panorama'],
  ])('%s는 %s 레이아웃을 사용한다', (id, layout) => {
    expect(getClockTemplate(id).layout).toBe(layout);
    expect(getClockTemplate(id).usesUnitColors).toBe(true);
  });

  test('알 수 없는 템플릿은 Digital 계약으로 복구한다', () => {
    expect(getClockTemplate('missing')).toBe(getClockTemplate('digital'));
  });
});
