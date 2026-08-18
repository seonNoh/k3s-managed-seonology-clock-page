const { abortError } = require('../nas/nas-uploader');

async function uploadOneDriveChunks({ stream, size, session, chunkSize = 10 * 1024 * 1024, signal }) {
  if (!Number.isSafeInteger(size) || size <= 0) throw new TypeError('Upload size must be positive');
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) throw new TypeError('chunkSize must be positive');
  if (!session || typeof session.uploadChunk !== 'function') throw new TypeError('Upload session is required');

  let pending = Buffer.alloc(0);
  let offset = 0;

  async function send(chunk) {
    if (signal?.aborted) throw abortError();
    const start = offset;
    const end = start + chunk.length - 1;
    const response = await session.uploadChunk({ chunk, start, end, total: size, signal });
    const statusCode = response?.statusCode;
    if (!Number.isInteger(statusCode) || statusCode < 200 || statusCode >= 300) {
      throw new Error(`OneDrive upload failed with HTTP ${statusCode || 'unknown'}`);
    }
    offset = end + 1;
  }

  for await (const sourceChunk of stream) {
    if (signal?.aborted) throw abortError();
    pending = Buffer.concat([pending, Buffer.from(sourceChunk)]);
    if (offset + pending.length > size) throw new Error('Upload exceeds declared size');
    while (pending.length >= chunkSize) {
      await send(pending.subarray(0, chunkSize));
      pending = pending.subarray(chunkSize);
    }
  }
  if (pending.length > 0) await send(pending);
  if (offset !== size) throw new Error(`Upload size mismatch: expected ${size}, received ${offset}`);
}

module.exports = { uploadOneDriveChunks };
