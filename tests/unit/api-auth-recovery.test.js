import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let apiFetch;
let requestJson;
let navigate;

beforeEach(async () => {
  vi.resetModules();
  navigate = vi.fn();
  vi.stubGlobal('location', {
    hostname: 'clock.seonology.com',
    origin: 'https://clock.seonology.com',
    href: 'https://clock.seonology.com/?layout=classic#today',
    assign: navigate,
  });
  ({ apiFetch, requestJson } = await import('../../src/api/client.js'));
});

afterEach(() => vi.unstubAllGlobals());

const authResponse = () => new Response('', { status: 401, headers: { 'X-Forward-Auth-Required': '1' } });

describe('API authentication recovery', () => {
  it('navigates once and makes no later polling requests after the explicit auth signal', async () => {
    const fetch = vi.fn().mockResolvedValue(authResponse());
    vi.stubGlobal('fetch', fetch);
    await expect(apiFetch('/api/todos')).rejects.toMatchObject({ name: 'AuthenticationRequiredError' });
    await expect(apiFetch('/api/browser-stats')).rejects.toMatchObject({ name: 'AuthenticationRequiredError' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledExactlyOnceWith('https://clock.seonology.com/?layout=classic#today');
  });

  it('recognizes the exact API root without matching unrelated prefixes', async () => {
    const fetch = vi.fn().mockResolvedValue(authResponse());
    vi.stubGlobal('fetch', fetch);
    expect((await apiFetch('/apiary')).status).toBe(401);
    expect(navigate).not.toHaveBeenCalled();
    await expect(apiFetch('/api')).rejects.toMatchObject({ name: 'AuthenticationRequiredError' });
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('aborts concurrent internal API requests when authentication recovery starts', async () => {
    let pendingSignal;
    vi.stubGlobal('fetch', vi.fn((url, options) => {
      if (url === '/api/todos') return Promise.resolve(authResponse());
      pendingSignal = options.signal;
      return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
    }));
    const pending = apiFetch('/api/browser-stats').catch(error => error);
    await expect(apiFetch('/api/todos')).rejects.toMatchObject({ name: 'AuthenticationRequiredError' });
    expect(pendingSignal.aborted).toBe(true);
    expect((await pending).name).toBe('AuthenticationRequiredError');
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 500, 307])('does not navigate on status %s without the explicit auth signal', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
    expect((await apiFetch('/api/todos')).status).toBe(status);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not navigate after a network failure or an external auth response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(authResponse()));
    await expect(apiFetch('/api/todos')).rejects.toThrow('Failed to fetch');
    expect((await apiFetch('https://api.example.com/api/weather')).status).toBe(401);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('preserves FormData and raw streaming responses', async () => {
    const body = new FormData();
    body.append('file', new Blob(['content']), 'test.txt');
    const response = new Response('stream-result');
    const fetch = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetch);
    const result = await apiFetch('/api/clipboard/images', { method: 'POST', body, headers: { 'X-Test': 'upload' } });
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body, headers: { 'X-Test': 'upload' } });
    expect(result).toBe(response);
    expect(await result.text()).toBe('stream-result');
  });

  it('preserves caller cancellation without triggering navigation', async () => {
    const controller = new AbortController();
    let signal;
    vi.stubGlobal('fetch', vi.fn((url, options) => {
      signal = options.signal;
      return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    }));
    const pending = apiFetch('/api/todos', { signal: controller.signal }).catch(error => error);
    const reason = new DOMException('Cancelled', 'AbortError');
    controller.abort(reason);
    expect(await pending).toBe(reason);
    expect(signal.aborted).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps caller cancellation connected after response headers arrive', async () => {
    const controller = new AbortController();
    let signal;
    vi.stubGlobal('fetch', vi.fn((url, options) => {
      signal = options.signal;
      return Promise.resolve(new Response('stream-result'));
    }));
    await apiFetch('/api/clipboard/images/1', { signal: controller.signal });
    controller.abort();
    expect(signal.aborted).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('uses the same recovery path for requestJson', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(authResponse()));
    await expect(requestJson('/api/todos')).rejects.toMatchObject({ name: 'AuthenticationRequiredError' });
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
