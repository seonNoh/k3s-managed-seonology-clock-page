import { useState, useEffect, useCallback, useRef } from 'react';
import './NasBrowser.css';

const API = (import.meta.env.VITE_API_URL || '') + '/api/nas';

function formatSize(b) {
  if (!b || b === 0) return '-';
  if (b < 1024) return `${b} B`;
  if (b < 1024**2) return `${(b/1024).toFixed(1)} KB`;
  if (b < 1024**3) return `${(b/1024**2).toFixed(1)} MB`;
  return `${(b/1024**3).toFixed(2)} GB`;
}

function formatTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function NasBrowser({ isOpen, onClose }) {
  const [path, setPath] = useState('');
  const [shares, setShares] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [showMkdir, setShowMkdir] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const fetchShares = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/shares`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShares(data.shares || []);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);

  const fetchFiles = useCallback(async (p) => {
    setLoading(true); setError(''); setSelected(null);
    try {
      const res = await fetch(`${API}/files?path=${encodeURIComponent(p)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFiles(data.files || []);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (!path) { fetchShares(); setFiles([]); }
    else fetchFiles(path);
  }, [isOpen, path, fetchShares, fetchFiles]);

  const navigate = (p) => { setPath(p); setShowMkdir(false); setRenaming(null); setConfirmDelete(null); };
  const goUp = () => {
    if (!path) return;
    const parts = path.split('/').filter(Boolean);
    if (parts.length <= 1) { setPath(''); return; }
    parts.pop();
    setPath('/' + parts.join('/'));
  };

  const handleMkdir = async () => {
    if (!newName.trim()) return;
    try {
      const res = await fetch(`${API}/mkdir`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: path, name: newName.trim() }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setNewName(''); setShowMkdir(false); fetchFiles(path);
    } catch (e) { setError(e.message); }
  };

  const handleRename = async () => {
    if (!renameVal.trim() || !renaming) return;
    try {
      const res = await fetch(`${API}/rename`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: renaming, name: renameVal.trim() }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setRenaming(null); fetchFiles(path);
    } catch (e) { setError(e.message); }
  };

  const handleDelete = async (filePath) => {
    try {
      const res = await fetch(`${API}/delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setConfirmDelete(null); fetchFiles(path);
    } catch (e) { setError(e.message); }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !path) return;
    setUploading(true); setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('path', path);
      const res = await fetch(`${API}/upload`, { method: 'POST', body: form });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      fetchFiles(path);
    } catch (e) { setError(e.message); } finally { setUploading(false); e.target.value = ''; }
  };

  const handleDownload = (filePath) => {
    window.open(`${API}/download?path=${encodeURIComponent(filePath)}`, '_blank');
  };

  if (!isOpen) return null;

  const breadcrumbs = path ? path.split('/').filter(Boolean) : [];

  return (
    <div className="nb-overlay" onClick={onClose}>
      <div className="nb-modal" onClick={e => e.stopPropagation()}>
        <div className="nb-header">
          <div className="nb-header-left">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span className="nb-title">NAS File Browser</span>
          </div>
          <div className="nb-header-actions">
            {path && (
              <>
                <button className="nb-tool-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
                <input ref={fileInputRef} type="file" hidden onChange={handleUpload} />
                <button className="nb-tool-btn" onClick={() => { setShowMkdir(true); setNewName(''); }}>New Folder</button>
              </>
            )}
            <button className="nb-close-btn" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div className="nb-breadcrumb">
          <button className="nb-bc-item" onClick={() => navigate('')}>NAS</button>
          {breadcrumbs.map((p, i) => (
            <span key={i}>
              <span className="nb-bc-sep">/</span>
              <button className="nb-bc-item" onClick={() => navigate('/' + breadcrumbs.slice(0, i + 1).join('/'))}>{p}</button>
            </span>
          ))}
        </div>

        {error && <div className="nb-error">{error}<button className="nb-err-close" onClick={() => setError('')}>x</button></div>}

        {showMkdir && (
          <div className="nb-mkdir-bar">
            <input className="nb-input" value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleMkdir()} placeholder="Folder name..." autoFocus />
            <button className="nb-btn-ok" onClick={handleMkdir}>Create</button>
            <button className="nb-btn-cancel" onClick={() => setShowMkdir(false)}>Cancel</button>
          </div>
        )}

        <div className="nb-body">
          {loading && <div className="nb-loading">Loading...</div>}

          {!path && !loading && (
            <div className="nb-share-grid">
              {shares.map((s, i) => (
                <button key={i} className="nb-share-item" onClick={() => navigate(s.path)}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  <span className="nb-share-name">{s.name}</span>
                </button>
              ))}
            </div>
          )}

          {path && !loading && (
            <div className="nb-file-list">
              <button className="nb-file-row nb-up-row" onClick={goUp}>
                <span className="nb-file-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                </span>
                <span className="nb-file-name">..</span>
                <span className="nb-file-size"></span>
                <span className="nb-file-time"></span>
              </button>
              {files.map((f, i) => (
                <div key={i} className={`nb-file-row${selected === f.path ? ' selected' : ''}${f.isdir ? ' dir' : ''}`}
                  onClick={() => setSelected(f.path === selected ? null : f.path)}
                  onDoubleClick={() => f.isdir && navigate(f.path)}>
                  <span className="nb-file-icon">
                    {f.isdir ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    )}
                  </span>
                  {renaming === f.path ? (
                    <span className="nb-rename-wrap">
                      <input className="nb-input nb-rename-input" value={renameVal}
                        onChange={e => setRenameVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(null); }}
                        onClick={e => e.stopPropagation()} autoFocus />
                    </span>
                  ) : (
                    <span className="nb-file-name">{f.name}</span>
                  )}
                  <span className="nb-file-size">{f.isdir ? '-' : formatSize(f.size)}</span>
                  <span className="nb-file-time">{formatTime(f.time)}</span>
                  <span className="nb-file-actions" onClick={e => e.stopPropagation()}>
                    {!f.isdir && (
                      <button className="nb-act-btn" onClick={() => handleDownload(f.path)} title="Download">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      </button>
                    )}
                    <button className="nb-act-btn" onClick={() => { setRenaming(f.path); setRenameVal(f.name); }} title="Rename">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    {confirmDelete === f.path ? (
                      <>
                        <button className="nb-act-btn nb-act-danger" onClick={() => handleDelete(f.path)}>Yes</button>
                        <button className="nb-act-btn" onClick={() => setConfirmDelete(null)}>No</button>
                      </>
                    ) : (
                      <button className="nb-act-btn" onClick={() => setConfirmDelete(f.path)} title="Delete">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>
                      </button>
                    )}
                  </span>
                </div>
              ))}
              {files.length === 0 && !loading && <div className="nb-empty">Empty folder</div>}
            </div>
          )}
        </div>

        <div className="nb-statusbar">
          <span>{path || 'NAS Root'}</span>
          <span>{path ? `${files.length} items` : `${shares.length} shares`}</span>
        </div>
      </div>
    </div>
  );
}

export default NasBrowser;
