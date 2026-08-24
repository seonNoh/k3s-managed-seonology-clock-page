import { BookMarked, Check, ExternalLink, Pencil, Plus, Trash2, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getSafeExternalUrl } from '../../api/client.js';
import LoadingProgress from '../../components/LoadingProgress.jsx';
import {
  addBookmark,
  addBookmarkCategory,
  deleteBookmark,
  deleteBookmarkCategory,
  loadBookmarks,
  selectQuickLinks,
  updateBookmark,
} from './bookmarkApi.js';
import './bookmarks.css';

const EMPTY_FORM = Object.freeze({ name: '', url: '', color: '#526fd1', quickLink: false });

function BookmarkForm({ initialValue = EMPTY_FORM, submitLabel, onCancel, onSubmit }) {
  const [form, setForm] = useState(initialValue);

  const submit = async (event) => {
    event.preventDefault();
    await onSubmit(form);
  };

  return (
    <form className="bookmark-form" onSubmit={submit}>
      <label><span>이름</span><input aria-label="즐겨찾기 이름" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
      <label className="bookmark-form-url"><span>URL</span><input aria-label="즐겨찾기 URL" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} inputMode="url" required /></label>
      <label className="bookmark-color-field"><span>색상</span><input aria-label="즐겨찾기 색상" type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></label>
      <label className="bookmark-quick-field"><input type="checkbox" checked={form.quickLink} onChange={(event) => setForm({ ...form, quickLink: event.target.checked })} /><Zap size={16} aria-hidden="true" /><span>Quick Link</span></label>
      <div className="bookmark-form-actions">
        <button type="submit" className="bookmark-primary-action">{submitLabel}</button>
        <button type="button" onClick={onCancel}>취소</button>
      </div>
    </form>
  );
}

function BookmarkCard({ bookmark, categoryId, editing, onChange, onDelete, onToggleQuickLink }) {
  const safeUrl = getSafeExternalUrl(bookmark.url);
  const [editingValue, setEditingValue] = useState(false);

  if (editingValue) {
    return (
      <BookmarkForm
        initialValue={{ name: bookmark.name, url: bookmark.url, color: bookmark.color || '#526fd1', quickLink: Boolean(bookmark.quickLink) }}
        submitLabel="저장"
        onCancel={() => setEditingValue(false)}
        onSubmit={async (form) => {
          await onChange(categoryId, bookmark.id, form);
          setEditingValue(false);
        }}
      />
    );
  }

  return (
    <article className="bookmark-card" style={{ '--bookmark-color': bookmark.color || '#526fd1' }}>
      <a href={safeUrl || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!safeUrl}>
        <span className="bookmark-card-mark"><BookMarked size={20} aria-hidden="true" /></span>
        <span className="bookmark-card-copy"><b>{bookmark.name}</b><small>{safeUrl ? new URL(safeUrl).hostname : '유효하지 않은 URL'}</small></span>
        <ExternalLink size={17} aria-hidden="true" />
      </a>
      {bookmark.quickLink && <span className="bookmark-quick-badge"><Zap size={13} aria-hidden="true" />Quick Link</span>}
      {editing && (
        <div className="bookmark-card-actions">
          <button type="button" aria-label={`${bookmark.name} 수정`} onClick={() => setEditingValue(true)}><Pencil size={16} aria-hidden="true" /></button>
          <button type="button" aria-label={`${bookmark.name} Quick Link ${bookmark.quickLink ? '해제' : '지정'}`} aria-pressed={Boolean(bookmark.quickLink)} onClick={() => onToggleQuickLink(categoryId, bookmark)}><Zap size={16} aria-hidden="true" /></button>
          <button type="button" className="bookmark-danger-action" aria-label={`${bookmark.name} 삭제`} onClick={() => onDelete(categoryId, bookmark.id)}><Trash2 size={16} aria-hidden="true" /></button>
        </div>
      )}
    </article>
  );
}

export default function BookmarksManager() {
  const [data, setData] = useState({ categories: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [addingBookmarkTo, setAddingBookmarkTo] = useState(null);

  const reload = useCallback(async ({ signal } = {}) => {
    try {
      const nextData = await loadBookmarks({ signal });
      setError('');
      setData(nextData);
    } catch (nextError) {
      if (nextError.name !== 'AbortError') setError(nextError.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => reload({ signal: controller.signal }));
    return () => controller.abort();
  }, [reload]);

  const mutate = async (operation) => {
    setError('');
    try {
      await operation();
      await reload();
      return true;
    } catch (nextError) {
      setError(nextError.message);
      return false;
    }
  };

  const quickLinks = useMemo(() => selectQuickLinks(data), [data]);

  if (loading) {
    return (
      <LoadingProgress
        className="bookmark-loading-progress"
        label="즐겨찾기를 불러오는 중입니다."
        detail="서버 응답을 기다리고 있습니다."
      />
    );
  }

  return (
    <div className="bookmarks-manager" data-capability="bookmarks-manage">
      <div className="bookmarks-manager-toolbar">
        <div><b>즐겨찾기</b><span>{data.categories.length}개 카테고리 · {quickLinks.length}개 Quick Link</span></div>
        <div>
          <button type="button" onClick={() => setEditing(!editing)}>{editing ? <Check size={17} aria-hidden="true" /> : <Pencil size={17} aria-hidden="true" />}{editing ? '완료' : '편집'}</button>
          {editing && <button type="button" onClick={() => setAddingCategory(true)}><Plus size={17} aria-hidden="true" />카테고리 추가</button>}
        </div>
      </div>

      {error && <div className="bookmark-error" role="alert"><span>{error}</span><button type="button" onClick={() => reload()}>다시 시도</button></div>}

      {quickLinks.length > 0 && (
        <section className="bookmark-quick-section" data-capability="quick-links">
          <h3><Zap size={17} aria-hidden="true" />Quick Links</h3>
          <div>{quickLinks.map((bookmark) => <a key={bookmark.id} href={getSafeExternalUrl(bookmark.url)} target="_blank" rel="noopener noreferrer">{bookmark.name}</a>)}</div>
        </section>
      )}

      {addingCategory && (
        <form className="bookmark-category-form" onSubmit={async (event) => {
          event.preventDefault();
          if (!categoryName.trim()) return;
          if (await mutate(() => addBookmarkCategory(categoryName))) {
            setCategoryName('');
            setAddingCategory(false);
          }
        }}>
          <label><span>카테고리 이름</span><input aria-label="카테고리 이름" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} autoFocus required /></label>
          <button type="submit" className="bookmark-primary-action">추가</button>
          <button type="button" onClick={() => setAddingCategory(false)}>취소</button>
        </form>
      )}

      {data.categories.length === 0 && !addingCategory && <div className="bookmark-empty">편집을 눌러 첫 카테고리를 추가해 주세요.</div>}

      <div className="bookmark-categories">
        {data.categories.map((category) => (
          <section className="bookmark-category" key={category.id}>
            <header>
              <div><span>{String(category.order + 1).padStart(2, '0')}</span><h3>{category.name}</h3></div>
              {editing && <div><button type="button" onClick={() => setAddingBookmarkTo(category.id)}><Plus size={16} aria-hidden="true" />즐겨찾기 추가</button><button type="button" className="bookmark-danger-action" aria-label={`${category.name} 카테고리 삭제`} onClick={() => mutate(() => deleteBookmarkCategory(category.id))}><Trash2 size={16} aria-hidden="true" /></button></div>}
            </header>
            {addingBookmarkTo === category.id && (
              <BookmarkForm
                submitLabel="추가"
                onCancel={() => setAddingBookmarkTo(null)}
                onSubmit={async (form) => {
                  if (await mutate(() => addBookmark(category.id, form))) setAddingBookmarkTo(null);
                }}
              />
            )}
            <div className="bookmark-grid">
              {(category.bookmarks ?? []).map((bookmark) => (
                <BookmarkCard
                  key={bookmark.id}
                  bookmark={bookmark}
                  categoryId={category.id}
                  editing={editing}
                  onChange={(categoryId, bookmarkId, form) => mutate(() => updateBookmark(categoryId, bookmarkId, form))}
                  onDelete={(categoryId, bookmarkId) => mutate(() => deleteBookmark(categoryId, bookmarkId))}
                  onToggleQuickLink={(categoryId, bookmark) => mutate(() => updateBookmark(categoryId, bookmark.id, { quickLink: !bookmark.quickLink }))}
                />
              ))}
              {(category.bookmarks ?? []).length === 0 && <p>이 카테고리에 등록된 즐겨찾기가 없습니다.</p>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
