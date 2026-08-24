const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');

const { createApp } = require('../app');
const { loadConfig } = require('../config');

async function listen() {
  const config = loadConfig({
    CORS_ALLOWED_ORIGINS: 'https://clock.seonology.com,http://localhost:5173',
  });
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

test('CORS reflects only configured dashboard development origins', async t => {
  const runtime = await listen();
  t.after(() => runtime.close());

  const allowed = await fetch(`${runtime.origin}/health`, {
    headers: { Origin: 'http://localhost:5173' },
  });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');

  const denied = await fetch(`${runtime.origin}/health`, {
    headers: { Origin: 'https://attacker.example' },
  });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});
