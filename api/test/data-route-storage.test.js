const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtempSync } = require('node:fs');
const { readFile, stat, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const dataDirectory = mkdtempSync(path.join(os.tmpdir(), 'clock-data-routes-'));
process.env.BOOKMARKS_DIR = dataDirectory;

const { createApp } = require('../app');
const { loadConfig } = require('../config');

async function listen() {
  const config = loadConfig({ BOOKMARKS_DIR: dataDirectory });
  const server = createApp({ config }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.close();
      await once(server, 'close');
    },
  };
}

test('malformed persisted data returns an error and every mutation preserves the original bytes', async t => {
  const runtime = await listen();
  t.after(() => runtime.close());
  const malformed = Buffer.from('{broken persisted data');
  const cases = [
    {
      file: 'bookmarks.json',
      read: '/api/bookmarks',
      mutate: '/api/bookmarks',
      method: 'PUT',
      body: { categories: [] },
    },
    {
      file: 'todos.json',
      read: '/api/todos',
      mutate: '/api/todos',
      method: 'POST',
      body: { text: 'must not overwrite' },
    },
    {
      file: 'notes.json',
      read: '/api/notes',
      mutate: '/api/notes',
      method: 'POST',
      body: {},
    },
    {
      file: 'chat-history.json',
      read: '/api/chat/history',
      mutate: '/api/chat/history',
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'must not overwrite' }] },
    },
  ];

  for (const fixture of cases) {
    const filePath = path.join(dataDirectory, fixture.file);
    await writeFile(filePath, malformed);

    const readResponse = await fetch(`${runtime.origin}${fixture.read}`);
    assert.equal(readResponse.status, 500, `${fixture.file} read must fail closed`);
    assert.deepEqual(await readFile(filePath), malformed);

    const mutationResponse = await fetch(`${runtime.origin}${fixture.mutate}`, {
      method: fixture.method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(fixture.body),
    });
    assert.equal(mutationResponse.status, 500, `${fixture.file} mutation must fail closed`);
    assert.deepEqual(await readFile(filePath), malformed);
  }
});

test('valid persisted data keeps the existing CRUD response contracts', async t => {
  const runtime = await listen();
  t.after(() => runtime.close());
  await Promise.all([
    writeFile(path.join(dataDirectory, 'bookmarks.json'), JSON.stringify({ categories: [] })),
    writeFile(path.join(dataDirectory, 'todos.json'), JSON.stringify({ todos: [] })),
    writeFile(path.join(dataDirectory, 'notes.json'), JSON.stringify({ notes: [] })),
    writeFile(path.join(dataDirectory, 'chat-history.json'), JSON.stringify({ conversations: [] })),
  ]);

  const bookmarkResponse = await fetch(`${runtime.origin}/api/bookmarks`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ categories: [] }),
  });
  assert.equal(bookmarkResponse.status, 200);
  assert.deepEqual(await bookmarkResponse.json(), { success: true });

  const todoResponse = await fetch(`${runtime.origin}/api/todos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'fixture todo' }),
  });
  assert.equal(todoResponse.status, 200);
  const todoBody = await todoResponse.json();
  assert.equal(todoBody.success, true);
  assert.equal(todoBody.todo.text, 'fixture todo');

  const noteResponse = await fetch(`${runtime.origin}/api/notes`, { method: 'POST' });
  assert.equal(noteResponse.status, 200);
  const noteBody = await noteResponse.json();
  assert.equal(noteBody.success, true);
  assert.equal(noteBody.note.content, '');

  const chatResponse = await fetch(`${runtime.origin}/api/chat/history`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'fixture-chat', messages: [{ role: 'user', content: 'fixture' }] }),
  });
  assert.equal(chatResponse.status, 200);
  assert.deepEqual(await chatResponse.json(), { success: true });

  for (const file of ['bookmarks.json', 'todos.json', 'notes.json', 'chat-history.json']) {
    const metadata = await stat(path.join(dataDirectory, file));
    assert.equal(metadata.mode & 0o777, 0o600, `${file} must be replaced with private permissions`);
  }
});
