import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let apiFetch;
let requestJson;
let setUnsavedChangesProbe;
let navigate;
let messageListeners;

beforeEach(async () => {
  vi.resetModules();
  messageListeners = [];
  const addEventListener = globalThis.addEventListener.bind(globalThis);
  vi.spyOn(globalThis, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'message') messageListeners.push(listener);
    addEventListener(type, listener, options);
  });
  navigate = vi.fn();
  vi.stubGlobal('location', {
    hostname: 'clock.seonology.com',
    origin: 'https://clock.seonology.com',
    href: 'https://clock.seonology.com/?layout=classic#today',
    reload: navigate,
  });
  ({ apiFetch, requestJson, setUnsavedChangesProbe } = await import('../../src/api/client.js'));
});

afterEach(() => {
  for (const listener of messageListeners) globalThis.removeEventListener('message', listener);
  document.querySelectorAll('[data-seonology-auth-banner]').forEach(element => element.remove());
  vi.unstubAllGlobals();
});

const authResponse = () => new Response('', { status: 401, headers: { 'X-Forward-Auth-Required': '1' } });

describe('API authentication recovery', () => {
  it('navigates once and makes no later polling requests after the explicit auth signal', async () => {
    const fetch = vi.fn().mockResolvedValue(authResponse());
    vi.stubGlobal('fetch', fetch);
    await expect(apiFetch('/api/todos')).rejects.toMatchObject({ name: 'AuthenticationRequiredError' });
    await expect(apiFetch('/api/browser-stats')).rejects.toMatchObject({ name: 'AuthenticationRequiredError' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledExactlyOnceWith();
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

// Console must own the top-level navigation when Clock is embedded.
describe('embedded authentication recovery', () => {
  it('asks Console to navigate once instead of reloading the iframe', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal('top', { postMessage });
    globalThis.location.ancestorOrigins = ['https://www.seonology.com'];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(authResponse()));
    await Promise.allSettled([apiFetch('/api/todos'), apiFetch('/api/browser-stats')]);
    expect(postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: 'seonology:forward-auth-required', href: globalThis.location.href },
      'https://www.seonology.com',
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});


describe('preserving input during authentication expiry', () => {
  it('keeps a failed write and later reads on the document without replaying', async () => {
    const fetch = vi.fn().mockResolvedValue(authResponse());
    vi.stubGlobal('fetch', fetch);
    await expect(apiFetch('/api/todos', { method: 'POST', body: 'draft' })).rejects.toMatchObject({ name: 'AuthenticationRequiredError' });
    await expect(apiFetch('/api/todos')).rejects.toMatchObject({ name: 'AuthenticationRequiredError' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
    expect(document.querySelector('[data-seonology-auth-banner]').textContent).toContain('다시 로그인');
  });
  it('keeps dirty reads in the iframe without messaging the Console', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal('top', { postMessage });
    globalThis.location.ancestorOrigins = ['https://www.seonology.com'];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(authResponse()));
    const remove = setUnsavedChangesProbe(() => true);
    await expect(apiFetch('/api/todos')).rejects.toMatchObject({ name: 'AuthenticationRequiredError' });
    remove();
    expect(postMessage).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(document.querySelector('[data-seonology-auth-banner]')).not.toBeNull();
  });
  it('reloads its own frame when the top ancestor cannot be verified', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal('top', { postMessage });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(authResponse()));
    await expect(apiFetch('/api/todos')).rejects.toMatchObject({ name: 'AuthenticationRequiredError' });
    expect(postMessage).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});


it('resets the Clock abort controller after the verified Console recovery signal', async () => {
  const parent = { postMessage: vi.fn() };
  vi.stubGlobal('top', parent);
  globalThis.location.ancestorOrigins = ['https://www.seonology.com'];
  const fetch = vi.fn().mockResolvedValueOnce(authResponse()).mockImplementationOnce((input, options) => {
    expect(options.signal.aborted).toBe(false);
    return Promise.resolve(new Response('recovered'));
  });
  vi.stubGlobal('fetch', fetch);
  await expect(apiFetch('/api/todos')).rejects.toMatchObject({ name: 'AuthenticationRequiredError' });
  const event = new MessageEvent('message', {
    origin: 'https://www.seonology.com', data: { type: 'seonology:forward-auth-restored' },
  });
  Object.defineProperty(event, 'source', { value: parent });
  globalThis.dispatchEvent(event);
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(await (await apiFetch('/api/todos')).text()).toBe('recovered');
});


describe('sibling frame state discovery', () => {
 it('responds once before its first internal API call and observes the same pending-write controller', async () => {
  const postMessage=vi.fn();const top={postMessage};vi.stubGlobal('top',top);
  const query=requestId=>messageListeners.forEach(listener=>listener({data:{type:'seonology:forward-auth-state-request',requestId},origin:'https://www.seonology.com',source:top}));
  query(1);expect(postMessage).toHaveBeenCalledExactlyOnceWith({type:'seonology:forward-auth-state',requestId:1,requiresInPlaceRecovery:false},'https://www.seonology.com');
  postMessage.mockClear();let finish;const fetch=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));vi.stubGlobal('fetch',fetch);
  const pending=apiFetch('/api/todos',{method:'POST',body:'input'});
  query(2);expect(postMessage).toHaveBeenCalledExactlyOnceWith({type:'seonology:forward-auth-state',requestId:2,requiresInPlaceRecovery:true},'https://www.seonology.com');
  finish(new Response('ok'));await pending;postMessage.mockClear();query(3);
  expect(postMessage).toHaveBeenCalledExactlyOnceWith({type:'seonology:forward-auth-state',requestId:3,requiresInPlaceRecovery:false},'https://www.seonology.com');
  expect(fetch).toHaveBeenCalledTimes(1);expect(navigate).not.toHaveBeenCalled();
 });
});

it('coordinates a failed lazy asset with an in-flight API 401 through one recovery latch', async () => {
  sessionStorage.clear();let release;
  const fetch=vi.fn(input=>String(input).includes('/api/browser-stats')?new Promise(resolve=>{release=resolve}):Promise.resolve(authResponse()));
  vi.stubGlobal('fetch',fetch);
  const api=apiFetch('/api/browser-stats');
  const {protectedAssetImport}=await import('../../src/api/forwardAuth.js');
  void protectedAssetImport(async()=>{throw new TypeError('Failed to fetch dynamically imported module')},'/assets/late.js');
  await vi.waitFor(()=>expect(navigate).toHaveBeenCalledTimes(1));
  release(authResponse());await expect(api).rejects.toMatchObject({name:'AuthenticationRequiredError'});
  expect(navigate).toHaveBeenCalledTimes(1);
});

it('preserves the document when a lazy asset expires while an API write is pending', async () => {
  sessionStorage.clear();let release;
  const fetch=vi.fn(input=>String(input).includes('/api/notes/pending')?new Promise(resolve=>{release=resolve}):Promise.resolve(authResponse()));
  vi.stubGlobal('fetch',fetch);const writing=apiFetch('/api/notes/pending',{method:'PUT',body:'preserved'});
  const {protectedAssetImport}=await import('../../src/api/forwardAuth.js');
  void protectedAssetImport(async()=>{throw new TypeError('Failed to fetch dynamically imported module')},'/assets/late.js');
  await vi.waitFor(()=>expect(document.querySelector('[data-seonology-auth-banner]')).not.toBeNull());
  expect(navigate).not.toHaveBeenCalled();release(new Response('ok'));await writing;
});
