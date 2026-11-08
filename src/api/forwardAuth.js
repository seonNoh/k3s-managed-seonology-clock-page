// The marker identifies ingress authentication expiry, not an application's own 401.
const unsavedChangesProbes = new Set               ();
const recoveryListeners = new Set            ();
export function onForwardAuthRecovered(listener            )             {
  recoveryListeners.add(listener);
  return () => { recoveryListeners.delete(listener); };
}
function publishRecovery() {
  for (const listener of recoveryListeners) {
    try { listener(); } catch { /* One detached frame must not block other subscribers. */ }
  }
}

export function setUnsavedChangesProbe(probe               )             {
  // A wrapper makes separate registrations of the same callback independent.
  const registration = () => probe();
  unsavedChangesProbes.add(registration);
  return () => { unsavedChangesProbes.delete(registration); };
}

export function hasUnsavedChanges()          {
  for (const probe of unsavedChangesProbes) {
    try { if (probe()) return true; } catch { return true; }
  }
  return false;
}

export class AuthenticationRequiredError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'AuthenticationRequiredError';
  }
}

                                                              
                                                                                                                                    
                                                                                                        
                                                                           

function protectedLoginUrl(page     )         {
  // These GET paths are protected by the live ingress rules; public health checks are unsuitable.
  if (page.hostname === 'pedia.seonology.com') return new URL('/editor.html?seonology-reauth=1', page).href;
  if (page.hostname === 'mcp.seonology.com') return new URL('/hub/forward-auth.js?seonology-reauth=1', page).href;
  if (page.hostname === 'www.seonology.com') return new URL('/api/v1/auth/forward?return_to=%2Ffavicon.ico', page).href;
  return new URL('/favicon.ico?seonology-reauth=1', page).href;
}

export function createForwardAuthFetch(
  fetcher              ,
  browser             ,
  hooks                = {},
)            {
  let started = false;
  let preservingDocument = false;
  let pendingWrites = 0;
  let banner                         ;
  let status                         ;
  let popup                = null;
  let poll                    ;
  let timeout                    ;
  let generation = 0;
  let awaitingConsole = false;
  browser.addEventListener?.('message', (event              ) => {
    if (event.data?.type === 'seonology:forward-auth-state-request') {
      const requestId = event.data.requestId;
      if (browser.top && browser.top !== browser.self && event.source === browser.top &&
          event.origin === 'https://www.seonology.com' && Number.isSafeInteger(requestId) && requestId > 0) {
        browser.top.postMessage({ type: 'seonology:forward-auth-state', requestId,
          requiresInPlaceRecovery: (started && preservingDocument) || pendingWrites > 0 || hasUnsavedChanges(),
        }, 'https://www.seonology.com');
      }
      return;
    }
    if (!awaitingConsole || event.source !== browser.top ||
        event.origin !== 'https://www.seonology.com' ||
        event.data?.type !== 'seonology:forward-auth-restored') return;
    awaitingConsole = false;
    started = false;
    generation += 1;
    hooks.onRecovered?.();
    // Input may have changed while the Console popup was open.
    if (!hasUnsavedChanges()) browser.location.reload();
  });

  function stopWatching() {
    if (poll !== undefined) browser.clearInterval?.(poll);
    if (timeout !== undefined) browser.clearTimeout?.(timeout);
    poll = undefined;
    timeout = undefined;
  }

  function openLogin() {
    if (popup && !popup.closed) { popup.focus?.(); return; }
    const page = new URL(browser.location.href);
    // Keep window.open directly in the click handler to preserve user activation.
    try { popup = browser.open?.(protectedLoginUrl(page), '_blank', 'popup,width=520,height=720') ?? null; }
    catch { popup = null; }
    if (!popup) {
      if (status) status.textContent = '로그인 팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 로그인해 주세요.';
      return;
    }
    if (status) status.textContent = '로그인 창에서 인증을 완료해 주세요. 현재 입력은 이 화면에 유지됩니다.';
    stopWatching();
    poll = browser.setInterval?.(() => {
      if (!popup || popup.closed) {
        stopWatching(); popup = null;
        if (status) status.textContent = '로그인 창이 닫혔습니다. 인증을 완료하지 못했다면 다시 로그인해 주세요.';
        return;
      }
      try {
        const href = popup.location.href;
        // A new popup initially contains a complete about:blank document. It is not authentication success.
        if (href === 'about:blank' || new URL(href).origin !== page.origin || popup.document.readyState !== 'complete') return;
        stopWatching();
        popup.close(); popup = null;
        banner?.remove(); banner = undefined; status = undefined;
        started = false; preservingDocument = false; generation += 1;
        hooks.onRecovered?.();
        publishRecovery();
      } catch {
        // Keycloak and the certificate broker are cross-origin until authentication returns to this app.
      }
    }, 250);
    timeout = browser.setTimeout?.(() => {
      stopWatching();
      if (popup && !popup.closed) popup.close();
      popup = null;
      if (status) status.textContent = '로그인 대기 시간이 지났습니다. 다시 로그인해 주세요.';
    }, 120000);
  }

  function showBanner() {
    const document = browser.document;
    if (!document?.body) return;
    // A previously open dialog may have been closed or removed while requests remain paused.
    const activeDialog = document.activeElement?.closest?.('dialog[open]');
    const dialogs = document.querySelectorAll?.('dialog[open]');
    const host = activeDialog ?? dialogs?.[dialogs.length - 1] ?? document.body;
    if (banner) {
      if (!banner.isConnected || banner.parentElement !== host) host.appendChild(banner);
      return;
    }
    banner = document.createElement('section');
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-label', '로그인 만료 안내');
    banner.setAttribute('data-seonology-auth-banner', '');
    banner.style.cssText = 'position:fixed;inset:0 0 auto 0;z-index:2147483647;box-sizing:border-box;padding:16px 20px;background:#fff4d6;color:#241a00;border-bottom:2px solid #805c00;font:14px/1.6 system-ui,sans-serif;box-shadow:0 2px 10px #0003;text-align:left;';
    const title = document.createElement('strong');
    title.textContent = '로그인이 만료되었습니다. 입력을 유지한 채 다시 로그인해 주세요.';
    banner.appendChild(title);
    status = document.createElement('p');
    status.textContent = '실패한 요청은 자동으로 다시 보내지 않습니다. 로그인 후 필요한 작업을 직접 다시 시도해 주세요.';
    banner.appendChild(status);
    const login = document.createElement('button');
    login.type = 'button'; login.textContent = '다시 로그인';
    login.style.cssText = 'padding:8px 14px;margin:0 12px 0 0;background:#302300;color:white;border:1px solid #302300;border-radius:4px;font:inherit;cursor:pointer;';
    login.addEventListener('click', openLogin);
    banner.appendChild(login);
    const reload = document.createElement('button');
    reload.type = 'button'; reload.textContent = '새로고침 (입력이 사라질 수 있음)';
    reload.style.cssText = 'padding:8px 14px;background:white;color:#241a00;border:1px solid #805c00;border-radius:4px;font:inherit;cursor:pointer;';
    reload.addEventListener('click', () => browser.location.reload());
    banner.appendChild(reload);
    // Native modal dialogs occupy the browser top layer, above every body z-index.
    host.appendChild(banner);
  }

  function recover(safeRead         ) {
    if (started) { if (preservingDocument) showBanner(); return; }
    started = true;
    hooks.onRequired?.();
    if (!safeRead || pendingWrites > 0 || hasUnsavedChanges()) { preservingDocument = true; showBanner(); return; }
    if (browser.top && browser.top !== browser.self) {
      // ancestorOrigins is ordered from the immediate parent to the outermost ancestor.
      const ancestors = browser.location.ancestorOrigins;
      if (ancestors?.length && ancestors[ancestors.length - 1] === 'https://www.seonology.com') {
        awaitingConsole = true;
        browser.top.postMessage({ type: 'seonology:forward-auth-required', href: browser.location.href }, 'https://www.seonology.com');
        return;
      }
    }
    if (new URL(browser.location.href).hostname === 'www.seonology.com') {
      const bridge = new URL('/api/v1/auth/forward', browser.location.href);
      const current = new URL(browser.location.href);
      bridge.searchParams.set('return_to', current.pathname + current.search + current.hash);
      browser.location.assign(bridge.href);
    } else browser.location.reload();
  }

  const request            = Object.assign(async (input                   , init              ) => {
    const page = new URL(browser.location.href);
    const url = new URL(input instanceof Request ? input.url : String(input), page);
    const internal = url.origin === page.origin;
    if (internal && started) {
      if (preservingDocument) showBanner();
      throw new AuthenticationRequiredError();
    }
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const safeRead = ['GET', 'HEAD', 'OPTIONS'].includes(method);
    const writing = internal && !safeRead;
    const requestGeneration = generation;
    if (writing) pendingWrites += 1;
    try {
      const response = await (init === undefined ? fetcher(input) : fetcher(input, init));
      if (internal && response.status === 401 &&
          response.headers.get('X-Forward-Auth-Required') === '1' &&
          (!response.url || new URL(response.url).origin === page.origin)) {
        if (generation === requestGeneration) recover(safeRead);
        throw new AuthenticationRequiredError();
      }
      return response;
    } finally { if (writing) pendingWrites -= 1; }
  }, { requestRecovery: () => recover(true), requiresInPlaceRecovery: () => (started && preservingDocument) || pendingWrites > 0 || hasUnsavedChanges() });
  return request;
}

let shared                       ;
function sharedFetch()            {
  return shared ??= createForwardAuthFetch((...args) => globalThis.fetch(...args), window);
}
export const authFetch               = (...args) => {
  if (typeof window === 'undefined') return globalThis.fetch(...args);
  return sharedFetch()(...args);
};
export function requestForwardAuthRecovery()       {
  if (typeof window !== 'undefined') sharedFetch().requestRecovery();
}

export function requiresInPlaceRecovery()          {
  return shared?.requiresInPlaceRecovery() ?? hasUnsavedChanges();
}

// A sibling can ask for state before this frame makes its first guarded request.

