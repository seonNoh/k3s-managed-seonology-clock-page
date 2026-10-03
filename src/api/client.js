export const API_BASE = globalThis.location?.hostname === 'localhost' ? 'http://localhost:3001' : '';

let authenticationRecoveryStarted = false;
const authenticationAbortController = new AbortController();

class AuthenticationRequiredError extends Error {
  constructor() {
    super('Authentication is required');
    this.name = 'AuthenticationRequiredError';
  }
}

function isInternalApi(input) {
  const location = globalThis.location;
  if (!location?.href) return false;
  const url = new URL(input instanceof Request ? input.url : input, location.href);
  return url.origin === location.origin && (url.pathname === '/api' || url.pathname.startsWith('/api/'));
}

export async function apiFetch(input, options = {}) {
  if (!isInternalApi(input)) return fetch(input, options);
  if (authenticationRecoveryStarted) throw new AuthenticationRequiredError();

  const callerSignal = options.signal || (input instanceof Request ? input.signal : undefined);
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, authenticationAbortController.signal])
    : authenticationAbortController.signal;
  const response = await fetch(input, { ...options, signal });
  if (response.status === 401 && response.headers.get('X-Forward-Auth-Required') === '1') {
    const error = new AuthenticationRequiredError();
    if (!authenticationRecoveryStarted) {
      authenticationRecoveryStarted = true;
      authenticationAbortController.abort(error);
      globalThis.location.reload();
    }
    throw error;
  }
  return response;
}

export async function requestJson(path, options = {}) {
  const response = await apiFetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json();
}

export function getSafeExternalUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function openExternalUrl(value) {
  const safeUrl = getSafeExternalUrl(value);
  if (!safeUrl) return false;
  const opened = window.open(safeUrl, '_blank', 'noopener,noreferrer');
  if (opened) opened.opener = null;
  return true;
}
