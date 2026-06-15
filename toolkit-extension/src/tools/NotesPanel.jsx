import { useState, useEffect, useRef, useCallback } from 'react';
import './NotesPanel.css';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

function NotesPanel({ isOpen, onClose }) {
  const [notes, setNotes] = useState([]);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [view, setView] = useState('single'); // 'single' | 'list'
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef(null);
  const saveTimerRef = useRef(null);
  const swipeAccumRef = useRef(0);
  const swipeResetRef = useRef(null);
  const navigatingRef = useRef(false);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const [swipeOffset, setSwipeOffset] = useState(0);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/notes`);
      const data = await res.json();
      setNotes(data.notes || []);
      if (!activeNoteId && data.notes?.length > 0) {
        setActiveNoteId(data.notes[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch notes:', err);
    }
  }, [activeNoteId]);

  useEffect(() => {
    if (isOpen) {
      fetchNotes();
    }
  }, [isOpen, fetchNotes]);

  useEffect(() => {
    if (isOpen && view === 'single' && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen, view, activeNoteId]);

  const activeNote = notes.find(n => n.id === activeNoteId);

  const getTitle = (note) => {
    if (!note?.content) return 'New Note';
    const firstLine = note.content.split('\n')[0].trim();
    return firstLine || 'New Note';
  };

  const getPreview = (note) => {
    if (!note?.content) return '';
    const lines = note.content.split('\n');
    return lines.slice(1).join(' ').trim().slice(0, 80);
  };

  const createNote = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/notes`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setNotes(prev => [data.note, ...prev]);
        setActiveNoteId(data.note.id);
        setView('single');
      }
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  };

  const updateNote = useCallback(async (id, content) => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      console.error('Failed to save note:', err);
    } finally {
      setSaving(false);
    }
  }, []);

  const handleContentChange = (e) => {
    const content = e.target.value;
    setNotes(prev => prev.map(n => n.id === activeNoteId ? { ...n, content } : n));

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      updateNote(activeNoteId, content);
    }, 500);
  };

  const deleteNote = async (id) => {
    try {
      await fetch(`${API_BASE}/api/notes/${id}`, { method: 'DELETE' });
      setNotes(prev => {
        const remaining = prev.filter(n => n.id !== id);
        if (activeNoteId === id) {
          setActiveNoteId(remaining.length > 0 ? remaining[0].id : null);
        }
        return remaining;
      });
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  const openNote = (id) => {
    setActiveNoteId(id);
    setView('single');
    setShowSearch(false);
    setSearchQuery('');
  };

  // Trackpad & touch: swipe between notes
  const currentNoteIndex = notes.findIndex(n => n.id === activeNoteId);

  const navigateNote = useCallback((direction) => {
    if (navigatingRef.current) return;
    const idx = notes.findIndex(n => n.id === activeNoteId);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= notes.length) return;
    navigatingRef.current = true;
    setSwipeOffset(direction > 0 ? -40 : 40);
    setTimeout(() => {
      setActiveNoteId(notes[newIdx].id);
      setSwipeOffset(0);
      navigatingRef.current = false;
    }, 120);
  }, [notes, activeNoteId]);

  const handleEditorWheel = useCallback((e) => {
    if (view !== 'single' || notes.length <= 1 || navigatingRef.current) return;
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    if (Math.abs(e.deltaX) < 3) return;

    swipeAccumRef.current += e.deltaX;
    const clamped = Math.max(-50, Math.min(50, -swipeAccumRef.current * 0.4));
    setSwipeOffset(clamped);

    if (swipeResetRef.current) clearTimeout(swipeResetRef.current);
    swipeResetRef.current = setTimeout(() => {
      swipeAccumRef.current = 0;
      setSwipeOffset(0);
    }, 200);

    if (swipeAccumRef.current > 80) {
      swipeAccumRef.current = 0;
      navigateNote(1);
    } else if (swipeAccumRef.current < -80) {
      swipeAccumRef.current = 0;
      navigateNote(-1);
    }
  }, [view, notes.length, navigateNote]);

  const handleTouchStart = useCallback((e) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (view !== 'single' || notes.length <= 1) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      setSwipeOffset(Math.max(-50, Math.min(50, dx * 0.4)));
    }
  }, [view, notes.length]);

  const handleTouchEnd = useCallback((e) => {
    if (view !== 'single') { setSwipeOffset(0); return; }
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
      navigateNote(dx > 0 ? -1 : 1);
    } else {
      setSwipeOffset(0);
    }
  }, [view, navigateNote]);

  useEffect(() => {
    return () => {
      if (swipeResetRef.current) clearTimeout(swipeResetRef.current);
    };
  }, []);

  const filteredNotes = searchQuery
    ? notes.filter(n => n.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    : notes;

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)}d ago`;
    const sameYear = d.getFullYear() === now.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return sameYear ? `${m}/${day}` : `${d.getFullYear()}/${m}/${day}`;
  };

  const formatFullDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  };

  if (!isOpen) return null;

  return (
    <div className="notes-overlay" onClick={onClose}>
      <div className="notes-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="notes-header">
          <span className="notes-title">Notes</span>
          {view === 'single' && notes.length > 1 && (
            <div className="notes-nav">
              <button className="notes-nav-btn" onClick={() => navigateNote(-1)} disabled={currentNoteIndex <= 0}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span className="notes-nav-counter">{currentNoteIndex + 1} / {notes.length}</span>
              <button className="notes-nav-btn" onClick={() => navigateNote(1)} disabled={currentNoteIndex >= notes.length - 1}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
              </button>
            </div>
          )}
          <div className="notes-actions">
            <button className="notes-action-btn" onClick={createNote} title="New Note">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button
              className={`notes-action-btn${view === 'list' ? ' active' : ''}`}
              onClick={() => { setView(view === 'list' ? 'single' : 'list'); setShowSearch(false); setSearchQuery(''); }}
              title="List View"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
            <button
              className={`notes-action-btn${showSearch ? ' active' : ''}`}
              onClick={() => { setShowSearch(!showSearch); if (showSearch) setSearchQuery(''); else setView('list'); }}
              title="Search"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        {showSearch && (
          <div className="notes-search">
            <input
              type="text"
              className="notes-search-input"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {/* Content */}
        <div className="notes-body">
          {view === 'single' && activeNote ? (
            <div className="notes-editor"
              onWheel={handleEditorWheel}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div className="notes-meta">
                <span className="notes-meta-title" title={getTitle(activeNote)}>{getTitle(activeNote)}</span>
                <span className="notes-meta-time" title={formatFullDate(activeNote.updatedAt)}>
                  {activeNote.updatedAt ? `Updated ${formatDate(activeNote.updatedAt)}` : ''}
                </span>
              </div>
              <textarea
                ref={textareaRef}
                className="notes-textarea"
                value={activeNote.content}
                onChange={handleContentChange}
                placeholder="Start typing..."
                spellCheck={false}
                style={swipeOffset ? { transform: `translateX(${swipeOffset}px)`, opacity: 1 - Math.abs(swipeOffset) / 120 } : undefined}
              />
              {saving && <span className="notes-saving">saving...</span>}
            </div>
          ) : view === 'list' || !activeNote ? (
            <div className="notes-list">
              {filteredNotes.length === 0 ? (
                <div className="notes-empty">
                  {searchQuery ? 'No matching notes' : 'No notes yet'}
                </div>
              ) : (
                filteredNotes.map(note => (
                  <div
                    key={note.id}
                    className={`notes-list-item${note.id === activeNoteId ? ' active' : ''}`}
                    onClick={() => openNote(note.id)}
                  >
                    <div className="notes-list-item-header">
                      <span className="notes-list-title">{getTitle(note)}</span>
                      <button
                        className="notes-delete-btn"
                        onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                        title="Delete"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                    <div className="notes-list-preview">{getPreview(note)}</div>
                    <div className="notes-list-date" title={formatFullDate(note.updatedAt)}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <span>{formatDate(note.updatedAt)}</span>
                      <span className="notes-list-date-full">{formatFullDate(note.updatedAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default NotesPanel;
