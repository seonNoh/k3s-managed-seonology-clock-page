import { expect, test } from 'vitest';

import { getSafeExternalUrl } from '../../src/api/client.js';

test('frontend external URL policy accepts only credential-free HTTP(S) URLs', () => {
  expect(getSafeExternalUrl('https://example.com/path')).toBe('https://example.com/path');
  expect(getSafeExternalUrl('http://example.com')).toBe('http://example.com/');
  expect(getSafeExternalUrl('javascript:alert(1)')).toBeNull();
  expect(getSafeExternalUrl('data:text/html,test')).toBeNull();
  expect(getSafeExternalUrl('https://user:password@example.com')).toBeNull();
  expect(getSafeExternalUrl('//example.com')).toBeNull();
});
