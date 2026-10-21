const EMBED_FLAGS = new Set(['1', 'true']);

// Reads `?embed=1&tool=<id>` from a query string. The tool id is returned as given
// (trimmed) so an unknown id can be reported back to the embedding page verbatim.
export function readEmbedRequest(search = '') {
  const params = new URLSearchParams(search);
  const embed = EMBED_FLAGS.has(String(params.get('embed') ?? '').trim().toLowerCase());
  if (!embed) return null;
  return Object.freeze({ toolId: String(params.get('tool') ?? '').trim() });
}

export function currentEmbedRequest() {
  if (typeof window === 'undefined') return null;
  return readEmbedRequest(window.location.search);
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function readPreferredColorMode(matchMedia = globalThis.matchMedia) {
  if (typeof matchMedia !== 'function') return 'light';
  return matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export function subscribePreferredColorMode(onChange, matchMedia = globalThis.matchMedia) {
  if (typeof matchMedia !== 'function') return () => {};
  const query = matchMedia(DARK_QUERY);
  query.addEventListener?.('change', onChange);
  return () => query.removeEventListener?.('change', onChange);
}
