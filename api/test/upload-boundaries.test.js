const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const test = require('node:test');

const { uploadOneDriveChunks } = require('../domains/cloud/onedrive-uploader');
const { createUploadBoundary, writeWithBackpressure } = require('../domains/nas/nas-uploader');

test('upload boundary rejects oversized and additional files', () => {
  const boundary = createUploadBoundary({ target: '/volume1/team', maxBytes: 5, maxFiles: 1 });
  boundary.startFile({ filename: 'first.bin' });
  boundary.addBytes(5);

  assert.throws(() => boundary.addBytes(1), /size/i);
  assert.throws(() => boundary.startFile({ filename: 'second.bin' }), /file count/i);
});

test('multipart file data is rejected when the target field arrives too late', () => {
  const boundary = createUploadBoundary({ maxBytes: 10, maxFiles: 1 });

  assert.throws(() => boundary.startFile({ filename: 'first.bin' }), /before file/i);
  assert.throws(() => boundary.setTarget('/volume1/team'), /before file/i);
});

test('OneDrive uploads chunks sequentially with literal content ranges', async () => {
  const calls = [];
  const session = {
    async uploadChunk({ chunk, start, end, total }) {
      calls.push({ body: chunk.toString(), start, end, total });
      return { statusCode: end + 1 === total ? 201 : 202 };
    },
  };

  await uploadOneDriveChunks({
    stream: Readable.from([Buffer.from('abc'), Buffer.from('defghij')]),
    size: 10,
    session,
    chunkSize: 4,
  });

  assert.deepEqual(calls, [
    { body: 'abcd', start: 0, end: 3, total: 10 },
    { body: 'efgh', start: 4, end: 7, total: 10 },
    { body: 'ij', start: 8, end: 9, total: 10 },
  ]);
});

test('OneDrive upload rejects client aborts and upstream non-2xx responses', async () => {
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(uploadOneDriveChunks({
    stream: Readable.from([Buffer.from('data')]),
    size: 4,
    session: { uploadChunk: async () => ({ statusCode: 202 }) },
    chunkSize: 4,
    signal: aborted.signal,
  }), /abort/i);

  await assert.rejects(uploadOneDriveChunks({
    stream: Readable.from([Buffer.from('data')]),
    size: 4,
    session: { uploadChunk: async () => ({ statusCode: 503 }) },
    chunkSize: 4,
  }), /503/);
});

test('NAS writes wait for drain when the upstream applies backpressure', async () => {
  class BackpressuredRequest extends EventEmitter {
    write() { return false; }
  }
  const request = new BackpressuredRequest();
  let settled = false;
  const write = writeWithBackpressure(request, Buffer.from('data')).then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);

  request.emit('drain');
  await write;
  assert.equal(settled, true);
});
