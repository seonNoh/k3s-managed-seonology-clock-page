export const API_BASE = globalThis.location?.hostname === 'localhost' ? 'http://localhost:3001' : '';

export async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
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
