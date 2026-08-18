const { once } = require('node:events');

function abortError() {
  const error = new Error('Upload aborted');
  error.name = 'AbortError';
  return error;
}

function createUploadBoundary({ target = '', maxBytes, maxFiles = 1 }) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new TypeError('maxBytes must be positive');
  if (!Number.isSafeInteger(maxFiles) || maxFiles <= 0) throw new TypeError('maxFiles must be positive');
  let selectedTarget = target;
  let fileStarted = false;
  let fileCount = 0;
  let bytes = 0;

  return {
    setTarget(value) {
      if (fileStarted) throw new Error('Target must be provided before file data');
      selectedTarget = value;
      return selectedTarget;
    },
    startFile() {
      fileStarted = true;
      fileCount += 1;
      if (!selectedTarget) throw new Error('Target must be provided before file data');
      if (fileCount > maxFiles) throw new Error('Upload file count limit exceeded');
      return selectedTarget;
    },
    addBytes(length) {
      if (!Number.isSafeInteger(length) || length < 0) throw new TypeError('Invalid upload byte length');
      bytes += length;
      if (bytes > maxBytes) throw new Error('Upload size limit exceeded');
      return bytes;
    },
    get target() { return selectedTarget; },
    get bytes() { return bytes; },
  };
}

async function writeWithBackpressure(writable, chunk, signal) {
  if (signal?.aborted) throw abortError();
  if (writable.write(chunk)) return;

  let abortListener;
  const drain = once(writable, 'drain');
  const aborted = signal && new Promise((resolve, reject) => {
    abortListener = () => reject(abortError());
    signal.addEventListener('abort', abortListener, { once: true });
  });
  try {
    if (aborted) await Promise.race([drain, aborted]);
    else await drain;
  } finally {
    if (abortListener) signal.removeEventListener('abort', abortListener);
  }
}

module.exports = { abortError, createUploadBoundary, writeWithBackpressure };
