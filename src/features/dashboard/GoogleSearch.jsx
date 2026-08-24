import { useEffect, useRef, useState } from 'react';

import { API_BASE, openExternalUrl } from '../../api/client.js';

export default function GoogleSearch({ variant = 'split' }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef(null);
  const timerRef = useRef(null);
  const controllerRef = useRef(null);

  useEffect(() => {
    const closeOutside = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      clearTimeout(timerRef.current);
      controllerRef.current?.abort();
    };
  }, []);

  const loadSuggestions = (nextQuery) => {
    clearTimeout(timerRef.current);
    controllerRef.current?.abort();
    if (!nextQuery.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        const response = await fetch(`${API_BASE}/api/suggest?q=${encodeURIComponent(nextQuery)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Suggestion request failed: ${response.status}`);
        const result = await response.json();
        const nextSuggestions = Array.isArray(result) ? result.filter((item) => typeof item === 'string').slice(0, 8) : [];
        setSuggestions(nextSuggestions);
        setSelectedIndex(-1);
        setOpen(nextSuggestions.length > 0);
      } catch (error) {
        if (error.name !== 'AbortError') {
          setSuggestions([]);
          setOpen(false);
        }
      }
    }, 200);
  };

  const search = (text) => {
    const normalized = text.trim();
    if (!normalized) return;
    openExternalUrl(`https://www.google.com/search?q=${encodeURIComponent(normalized)}`);
    setQuery('');
    setSuggestions([]);
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (!open || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter' && selectedIndex >= 0) {
      event.preventDefault();
      search(suggestions[selectedIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const isClassic = variant === 'classic';
  return (
    <div className={isClassic ? 'search-bar-wrapper' : 'split-search-wrapper'} ref={wrapperRef}>
      <form className={isClassic ? 'search-bar' : 'split-search'} role="search" onSubmit={(event) => { event.preventDefault(); search(query); }}>
        {isClassic ? (
          <svg className="search-bar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        ) : <b aria-hidden="true">G</b>}
        <input
          className={isClassic ? 'search-bar-input' : undefined}
          type="search"
          aria-label="Google 검색"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="google-search-suggestions"
          aria-activedescendant={selectedIndex >= 0 ? `google-search-suggestion-${selectedIndex}` : undefined}
          placeholder={isClassic ? 'Search Google...' : 'Google 검색'}
          value={query}
          onChange={(event) => { setQuery(event.target.value); loadSuggestions(event.target.value); }}
          onKeyDown={onKeyDown}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        />
        {isClassic && query ? (
          <button type="button" className="search-bar-clear" aria-label="검색어 지우기" onClick={() => { setQuery(''); setSuggestions([]); setOpen(false); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        ) : !isClassic ? <button type="submit">Search</button> : null}
      </form>
      {open && suggestions.length > 0 && (
        <div className="search-suggestions" id="google-search-suggestions" role="listbox" aria-label="Google 검색 제안">
          {suggestions.map((suggestion, index) => (
            <button
              id={`google-search-suggestion-${index}`}
              key={`${suggestion}-${index}`}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              className={`search-suggestion-item${index === selectedIndex ? ' selected' : ''}`}
              onClick={() => search(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <svg className="suggest-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span className="suggest-text">{suggestion}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
