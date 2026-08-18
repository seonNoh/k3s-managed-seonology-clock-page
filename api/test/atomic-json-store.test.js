const assert = require('node:assert/strict');
const { mkdtemp, readFile, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createAtomicJsonStore } = require('../infrastructure/storage/atomic-json-store');

async function fixture(defaultValue = { count: 0 }) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clock-json-store-'));
  const filePath = path.join(directory, 'state.json');
  const store = createAtomicJsonStore({
    filePath,
    defaultValue,
    validate: value => Number.isInteger(value.count),
    mode: 0o600,
  });
  return { filePath, store };
}

test('missing files return independent clones of the default value', async () => {
  const { store } = await fixture();

  const first = await store.read();
  first.count = 99;

  assert.deepEqual(await store.read(), { count: 0 });
});

test('existing valid JSON is returned', async () => {
  const { filePath, store } = await fixture();
  await writeFile(filePath, '{"count":7}');

  assert.deepEqual(await store.read(), { count: 7 });
});

test('malformed JSON fails closed instead of replacing data with defaults', async () => {
  const { filePath, store } = await fixture();
  await writeFile(filePath, '{broken');

  await assert.rejects(store.read(), /invalid JSON/i);
});

test('concurrent updates are serialized without lost writes', async () => {
  const { filePath, store } = await fixture();

  await Promise.all(Array.from({ length: 24 }, () => store.update(async value => {
    await new Promise(resolve => setImmediate(resolve));
    value.count += 1;
    return value;
  })));

  assert.deepEqual(await store.read(), { count: 24 });
  assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')), { count: 24 });
});
