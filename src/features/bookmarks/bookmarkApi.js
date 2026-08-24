import { API_BASE, getSafeExternalUrl } from '../../api/client.js';

async function requestBookmarkJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Bookmark request failed with status ${response.status}`);
  return data;
}

function segment(value) {
  return encodeURIComponent(String(value));
}

export function normalizeBookmarkUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return getSafeExternalUrl(candidate);
}

export function selectQuickLinks(data) {
  return (data?.categories ?? [])
    .flatMap((category) => category.bookmarks ?? [])
    .filter((bookmark) => bookmark.quickLink && getSafeExternalUrl(bookmark.url));
}

export function loadBookmarks({ signal } = {}) {
  return requestBookmarkJson('/api/bookmarks', { signal });
}

export function addBookmarkCategory(name) {
  return requestBookmarkJson('/api/bookmarks/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: String(name).trim() }),
  });
}

export function deleteBookmarkCategory(categoryId) {
  return requestBookmarkJson(`/api/bookmarks/categories/${segment(categoryId)}`, { method: 'DELETE' });
}

export function addBookmark(categoryId, input) {
  const url = normalizeBookmarkUrl(input.url);
  if (!url) return Promise.reject(new Error('HTTP(S) URL을 입력해 주세요.'));
  return requestBookmarkJson(`/api/bookmarks/categories/${segment(categoryId)}/bookmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: String(input.name).trim(),
      url,
      icon: input.icon || 'default',
      color: input.color || '#526fd1',
      quickLink: Boolean(input.quickLink),
    }),
  });
}

export function updateBookmark(categoryId, bookmarkId, patch) {
  const next = { ...patch };
  if (patch.url !== undefined) {
    next.url = normalizeBookmarkUrl(patch.url);
    if (!next.url) return Promise.reject(new Error('HTTP(S) URL을 입력해 주세요.'));
  }
  if (patch.name !== undefined) next.name = String(patch.name).trim();
  return requestBookmarkJson(`/api/bookmarks/categories/${segment(categoryId)}/bookmarks/${segment(bookmarkId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(next),
  });
}

export function deleteBookmark(categoryId, bookmarkId) {
  return requestBookmarkJson(`/api/bookmarks/categories/${segment(categoryId)}/bookmarks/${segment(bookmarkId)}`, { method: 'DELETE' });
}
