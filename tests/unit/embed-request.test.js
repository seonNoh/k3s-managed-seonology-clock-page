import { describe, expect, it, vi } from 'vitest';

import {
  readEmbedRequest,
  readPreferredColorMode,
  subscribePreferredColorMode,
} from '../../src/features/embed/embedRequest.js';

describe('readEmbedRequest', () => {
  it('returns the requested tool id when embed is enabled', () => {
    expect(readEmbedRequest('?embed=1&tool=json')).toEqual({ toolId: 'json' });
    expect(readEmbedRequest('?embed=true&tool=%20cron%20')).toEqual({ toolId: 'cron' });
  });

  it('keeps an empty or unknown tool id so the caller can report it', () => {
    expect(readEmbedRequest('?embed=1')).toEqual({ toolId: '' });
    expect(readEmbedRequest('?embed=1&tool=nope')).toEqual({ toolId: 'nope' });
  });

  it('stays off for the normal dashboard', () => {
    expect(readEmbedRequest('')).toBeNull();
    expect(readEmbedRequest('?tool=json')).toBeNull();
    expect(readEmbedRequest('?embed=0&tool=json')).toBeNull();
  });
});

describe('preferred color mode', () => {
  it('follows prefers-color-scheme', () => {
    expect(readPreferredColorMode(() => ({ matches: true }))).toBe('dark');
    expect(readPreferredColorMode(() => ({ matches: false }))).toBe('light');
    expect(readPreferredColorMode(undefined)).toBe('light');
  });

  it('subscribes to and releases the media query listener', () => {
    const query = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const onChange = vi.fn();
    const unsubscribe = subscribePreferredColorMode(onChange, () => query);
    expect(query.addEventListener).toHaveBeenCalledWith('change', onChange);
    unsubscribe();
    expect(query.removeEventListener).toHaveBeenCalledWith('change', onChange);
  });
});
