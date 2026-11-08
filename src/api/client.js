export const API_BASE = globalThis.location?.hostname === 'localhost' ? 'http://localhost:3001' : '';

import { AuthenticationRequiredError, createSharedForwardAuthFetch, hasUnsavedChanges } from './forwardAuth.js';
export { setUnsavedChangesProbe, hasUnsavedChanges, onForwardAuthRecovered } from './forwardAuth.js';

let authenticationAbortController = new AbortController();
let authenticationFetch;
function getAuthenticationFetch() {
  return authenticationFetch ??= createSharedForwardAuthFetch((input, options) => fetch(input, options), globalThis, {
    onRequired: () => authenticationAbortController.abort(new AuthenticationRequiredError()),
    onRecovered: () => { authenticationAbortController = new AbortController(); },
  });
}
export function requestForwardAuthRecovery() {
  if (globalThis.location?.href) getAuthenticationFetch().requestRecovery();
}

export function requiresInPlaceRecovery() {
  return authenticationFetch?.requiresInPlaceRecovery() ?? hasUnsavedChanges();
}

// Register the frame-state responder even before the first internal API request.
if (typeof window !== 'undefined' && globalThis.location?.href) getAuthenticationFetch();

function isInternalApi(input) {
  const location = globalThis.location;
  if (!location?.href) return false;
  const url = new URL(input instanceof Request ? input.url : input, location.href);
  return url.origin === location.origin && (url.pathname === '/api' || url.pathname.startsWith('/api/'));
}

export async function apiFetch(input, options = {}) {
  if (!isInternalApi(input)) return fetch(input, options);
  const callerSignal = options.signal || (input instanceof Request ? input.signal : undefined);
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, authenticationAbortController.signal])
    : authenticationAbortController.signal;
  return getAuthenticationFetch()(input, { ...options, signal });
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
