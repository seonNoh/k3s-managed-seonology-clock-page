import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  addBookmark,
  addBookmarkCategory,
  deleteBookmark,
  deleteBookmarkCategory,
  loadBookmarks,
  normalizeBookmarkUrl,
  selectQuickLinks,
  updateBookmark,
} from '../../src/features/bookmarks/bookmarkApi.js';
import { API_BASE } from '../../src/api/client.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function response(body = { success: true }, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

describe('bookmark API client', () => {
  it('스킴이 없는 URL만 https로 정규화하고 안전하지 않은 URL은 거부한다', () => {
    expect(normalizeBookmarkUrl('example.com/docs')).toBe('https://example.com/docs');
    expect(normalizeBookmarkUrl('http://example.com')).toBe('http://example.com/');
    expect(normalizeBookmarkUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeBookmarkUrl('https://user:pass@example.com')).toBeNull();
  });

  it('유효하고 Quick Link로 지정된 항목만 선택한다', () => {
    const data = {
      categories: [{ bookmarks: [
        { id: 'safe', url: 'https://example.com', quickLink: true },
        { id: 'normal', url: 'https://example.org', quickLink: false },
        { id: 'unsafe', url: 'javascript:alert(1)', quickLink: true },
      ] }],
    };

    expect(selectQuickLinks(data).map((bookmark) => bookmark.id)).toEqual(['safe']);
  });

  it('즐겨찾기 CRUD 요청을 정확한 경로와 본문으로 전송한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetchMock);

    await loadBookmarks();
    await addBookmarkCategory('Work');
    await addBookmark('cat-1', { name: 'Docs', url: 'example.com', color: '#526fd1', quickLink: true });
    await updateBookmark('cat-1', 'bm-1', { name: 'Docs 2', url: 'https://example.org', quickLink: false });
    await deleteBookmark('cat-1', 'bm-1');
    await deleteBookmarkCategory('cat-1');

    expect(fetchMock.mock.calls.map(([url, options]) => [url, options?.method ?? 'GET'])).toEqual([
      [`${API_BASE}/api/bookmarks`, 'GET'],
      [`${API_BASE}/api/bookmarks/categories`, 'POST'],
      [`${API_BASE}/api/bookmarks/categories/cat-1/bookmarks`, 'POST'],
      [`${API_BASE}/api/bookmarks/categories/cat-1/bookmarks/bm-1`, 'PATCH'],
      [`${API_BASE}/api/bookmarks/categories/cat-1/bookmarks/bm-1`, 'DELETE'],
      [`${API_BASE}/api/bookmarks/categories/cat-1`, 'DELETE'],
    ]);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({
      name: 'Docs',
      url: 'https://example.com/',
      quickLink: true,
    });
  });

  it('서버 오류 메시지를 버리지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ error: 'Category not found' }, 404)));

    await expect(deleteBookmarkCategory('missing')).rejects.toThrow('Category not found');
  });
});
