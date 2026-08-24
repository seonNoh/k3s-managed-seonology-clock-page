import { describe, expect, test, vi } from 'vitest';

import {
  DEFAULT_PREFERENCES,
  PREFERENCE_KEYS,
  normalizePreference,
  readPreference,
  writePreference,
} from '../../src/app/preferences.js';

describe('dashboard preferences', () => {
  test('새 사용자는 Split Console과 light mode를 기본으로 사용한다', () => {
    expect(DEFAULT_PREFERENCES.layout).toBe('split');
    expect(DEFAULT_PREFERENCES.colorMode).toBe('light');
    expect(DEFAULT_PREFERENCES.snowEnabled).toBe(true);
  });

  test.each([
    ['layout', 'classic', 'classic'],
    ['layout', 'unknown', 'split'],
    ['colorMode', 'dark', 'dark'],
    ['colorMode', 'system', 'light'],
    ['clockTheme', 'ring', 'ring'],
    ['clockTheme', 'missing', 'digital'],
    ['snowEnabled', 'false', false],
    ['snowEnabled', 'true', true],
    ['snowEnabled', 'broken', true],
  ])('%s 값 %s를 허용값으로 정규화한다', (name, value, expected) => {
    expect(normalizePreference(name, value)).toBe(expected);
  });

  test('storage 접근 실패와 손상 값은 안전한 기본값으로 복구한다', () => {
    const throwingStorage = { getItem: vi.fn(() => { throw new Error('blocked'); }) };
    const malformedStorage = { getItem: vi.fn(() => 'not-a-layout') };

    expect(readPreference(throwingStorage, 'layout')).toBe('split');
    expect(readPreference(malformedStorage, 'layout')).toBe('split');
    expect(readPreference(null, 'layout')).toBe('split');
  });

  test('검증된 값만 저장하고 저장 실패는 UI 실행을 중단하지 않는다', () => {
    const storage = { setItem: vi.fn() };
    const throwingStorage = { setItem: vi.fn(() => { throw new Error('quota'); }) };

    expect(writePreference(storage, 'layout', 'classic')).toBe('classic');
    expect(storage.setItem).toHaveBeenCalledWith(PREFERENCE_KEYS.layout, 'classic');
    expect(writePreference(storage, 'layout', 'invalid')).toBe('split');
    expect(writePreference(throwingStorage, 'colorMode', 'dark')).toBe('dark');
  });
});
