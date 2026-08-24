const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtempSync } = require('node:fs');
const { writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const dataDirectory = mkdtempSync(path.join(os.tmpdir(), 'clock-bookmark-security-'));
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

async function requestJson(origin, pathname, method, body) {
  const response = await fetch(`${origin}${pathname}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

test('bookmark mutations accept only credential-free HTTP(S) URLs', async t => {
  const runtime = await listen();
  t.after(() => runtime.close());
  await writeFile(path.join(dataDirectory, 'bookmarks.json'), JSON.stringify({
    categories: [{ id: 'default', name: 'Bookmarks', order: 0, bookmarks: [] }],
  }));

  const invalidUrls = [
    'javascript:alert(document.domain)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'https://user:password@example.com/private',
    '//example.com/path',
  ];

  for (const url of invalidUrls) {
    const result = await requestJson(
      runtime.origin,
      '/api/bookmarks/categories/default/bookmarks',
      'POST',
      { name: 'Unsafe', url },
    );
    assert.equal(result.response.status, 400, `${url} must be rejected`);
  }

  const valid = await requestJson(
    runtime.origin,
    '/api/bookmarks/categories/default/bookmarks',
    'POST',
    { name: 'Safe', url: 'https://example.com/path?q=1' },
  );
  assert.equal(valid.response.status, 200);
  assert.equal(valid.body.bookmark.url, 'https://example.com/path?q=1');

  const invalidPatch = await requestJson(
    runtime.origin,
    `/api/bookmarks/categories/default/bookmarks/${valid.body.bookmark.id}`,
    'PATCH',
    { url: 'javascript:alert(1)' },
  );
  assert.equal(invalidPatch.response.status, 400);
});

test('full bookmark replacement rejects unsafe nested URLs', async t => {
  const runtime = await listen();
  t.after(() => runtime.close());
  await writeFile(path.join(dataDirectory, 'bookmarks.json'), JSON.stringify({ categories: [] }));

  const result = await requestJson(runtime.origin, '/api/bookmarks', 'PUT', {
    categories: [{
      id: 'unsafe',
      name: 'Unsafe',
      order: 0,
      bookmarks: [{ id: 'payload', name: 'Payload', url: 'javascript:alert(1)' }],
    }],
  });

  assert.equal(result.response.status, 400);
  assert.equal(result.body.error, 'Invalid bookmarks data');
});

test('bookmark reads omit unsafe URLs already present in persisted data', async t => {
  const runtime = await listen();
  t.after(() => runtime.close());
  await writeFile(path.join(dataDirectory, 'bookmarks.json'), JSON.stringify({
    categories: [{
      id: 'legacy',
      name: 'Legacy',
      order: 0,
      bookmarks: [
        { id: 'safe', name: 'Safe', url: 'http://example.com' },
        { id: 'unsafe', name: 'Unsafe', url: 'javascript:alert(1)' },
      ],
    }],
  }));

  const response = await fetch(`${runtime.origin}/api/bookmarks`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.categories[0].bookmarks.map(bookmark => bookmark.id), ['safe']);
});
