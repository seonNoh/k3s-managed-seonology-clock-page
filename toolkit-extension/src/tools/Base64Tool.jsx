import { useState, useCallback, useRef } from 'react';
import './Base64Tool.css';

function Base64Tool({ isOpen, onClose }) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [mode, setMode] = useState('encode'); // 'encode' | 'decode'
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [fileInfo, setFileInfo] = useState(null);
  const fileRef = useRef(null);

  const handleConvert = useCallback((text, m) => {
    setError('');
    setFileInfo(null);
    if (!text) { setOutput(''); return; }
    try {
      if (m === 'encode') {
        // Handle Unicode properly
        const encoded = btoa(unescape(encodeURIComponent(text)));
        setOutput(encoded);
      } else {
        const decoded = decodeURIComponent(escape(atob(text.trim())));
        setOutput(decoded);
      }
    } catch {
      setError(m === 'decode' ? 'Invalid Base64 string' : 'Encoding failed');
      setOutput('');
    }
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);
    handleConvert(val, mode);
  };

  const handleModeChange = (m) => {
    setMode(m);
    setInput('');
    setOutput('');
    setError('');
    setFileInfo(null);
  };

  const handleSwap = () => {
    const newMode = mode === 'encode' ? 'decode' : 'encode';
    const newInput = output;
    setMode(newMode);
    setInput(newInput);
    setError('');
    setFileInfo(null);
    handleConvert(newInput, newMode);
  };

  const handleCopy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard access denied */ }
  };

  const handleClear = () => {
    setInput('');
    setOutput('');
    setError('');
    setFileInfo(null);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInput(text);
      handleConvert(text, mode);
    } catch { /* clipboard access denied */ }
  };

  // File to Base64
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileInfo({ name: file.name, size: file.size, type: file.type || 'unknown' });
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1] || '';
      setMode('encode');
      setInput(`[File: ${file.name}]`);
      setOutput(base64);
      // Also store dataUri for display
      setError('');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Download decoded base64 as file
  const handleDownload = () => {
    if (!input.trim() || mode !== 'decode') return;
    try {
      const binary = atob(input.trim());
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'decoded_file';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to decode as file');
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  if (!isOpen) return null;

  return (
    <div className="b64-overlay" onClick={onClose}>
      <div className="b64-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="b64-header">
          <div className="b64-header-left">
            <svg className="b64-header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M7 15h0M2 9.5h20" />
            </svg>
            <span className="b64-header-title">Base64 Encoder / Decoder</span>
          </div>
          <button className="b64-close-btn" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Toolbar */}
        <div className="b64-toolbar">
          <div className="b64-mode-toggle">
            <button className={`b64-mode-btn ${mode === 'encode' ? 'active' : ''}`} onClick={() => handleModeChange('encode')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Encode
            </button>
            <button className={`b64-mode-btn ${mode === 'decode' ? 'active' : ''}`} onClick={() => handleModeChange('decode')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />
              </svg>
              Decode
            </button>
          </div>

          <div className="b64-toolbar-actions">
            <button className="b64-tool-btn" onClick={handlePaste} title="Paste from clipboard">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              </svg>
              Paste
            </button>
            <button className="b64-tool-btn" onClick={() => fileRef.current?.click()} title="Encode file to Base64">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              File
            </button>
            <input ref={fileRef} type="file" hidden onChange={handleFileSelect} />
            {mode === 'decode' && (
              <button className="b64-tool-btn" onClick={handleDownload} title="Download as file">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Save
              </button>
            )}
            <button className="b64-tool-btn" onClick={handleClear} title="Clear all">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
              </svg>
              Clear
            </button>
          </div>
        </div>

        {/* File Info */}
        {fileInfo && (
          <div className="b64-file-info">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            </svg>
            <span>{fileInfo.name}</span>
            <span className="b64-file-meta">{formatSize(fileInfo.size)} · {fileInfo.type}</span>
          </div>
        )}

        {/* Body */}
        <div className="b64-body">
          {/* Input */}
          <div className="b64-pane">
            <div className="b64-pane-header">
              <span className="b64-pane-label">{mode === 'encode' ? 'PLAIN TEXT' : 'BASE64 INPUT'}</span>
              <span className="b64-char-count">{input.length.toLocaleString()} chars</span>
            </div>
            <textarea
              className="b64-textarea"
              value={input}
              onChange={handleInputChange}
              placeholder={mode === 'encode' ? 'Enter text to encode...' : 'Paste Base64 string here...'}
              spellCheck={false}
            />
          </div>

          {/* Swap */}
          <div className="b64-swap-col">
            <button className="b64-swap-btn" onClick={handleSwap} title="Swap input/output">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </button>
          </div>

          {/* Output */}
          <div className="b64-pane">
            <div className="b64-pane-header">
              <span className="b64-pane-label">{mode === 'encode' ? 'BASE64 OUTPUT' : 'DECODED TEXT'}</span>
              <button className={`b64-copy-btn${copied ? ' copied' : ''}`} onClick={handleCopy} disabled={!output}>
                {copied ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
            <textarea
              className="b64-textarea b64-output"
              value={output}
              readOnly
              placeholder="Result will appear here..."
            />
            {error && <div className="b64-error">{error}</div>}
          </div>
        </div>

        {/* Stats */}
        {output && (
          <div className="b64-stats">
            <span>Input: {input.length.toLocaleString()} chars</span>
            <span>Output: {output.length.toLocaleString()} chars</span>
            {mode === 'encode' && <span>Size increase: {input.length ? `+${((output.length / input.length - 1) * 100).toFixed(0)}%` : '—'}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export default Base64Tool;
