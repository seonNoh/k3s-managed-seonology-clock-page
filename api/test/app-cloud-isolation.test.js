const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtemp } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createApp } = require('../app');
const { loadConfig } = require('../config');
const { start } = require('../server');

async function fixtureConfig() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'clock-app-cloud-'));
  return loadConfig({
    BOOKMARKS_DIR: dataDirectory,
    CLOUD_TOKEN_ENCRYPTION_KEY: 'fixture-encryption-key-32-bytes!',
    GOOGLE_CLIENT_ID: 'injected-google-client',
    GOOGLE_CLIENT_SECRET: 'fixture-google-secret',
    GOOGLE_REDIRECT_URI: 'https://clock.seonology.com/api/auth/google/callback',
    MS_CLIENT_ID: 'injected-microsoft-client',
    MS_CLIENT_SECRET: 'fixture-microsoft-secret',
    MS_REDIRECT_URI: 'https://clock.seonology.com/api/auth/microsoft/callback',
  });
}

async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      server.close();
      await once(server, 'close');
    },
  };
}

async function runningServer(server) {
  await once(server, 'listening');
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.close();
      await once(server, 'close');
    },
  };
}

test('server.start passes the injected cloud configuration into its app', async t => {
  const config = await fixtureConfig();
  config.port = 0;
  const runtime = await runningServer(start({ config }));
  t.after(() => runtime.close());

  const response = await fetch(`${runtime.origin}/api/auth/google`, { redirect: 'manual' });

  assert.equal(response.status, 302);
  const authorizationUrl = new URL(response.headers.get('location'));
  assert.equal(authorizationUrl.searchParams.get('client_id'), 'injected-google-client');
});

test('separate app factories do not share OAuth transaction state', async t => {
  const config = await fixtureConfig();
  const first = await listen(createApp({ config }));
  const second = await listen(createApp({ config }));
  t.after(async () => { await first.close(); await second.close(); });

  const start = await fetch(`${first.origin}/api/auth/google`, { redirect: 'manual' });
  assert.equal(start.status, 302);
  const state = new URL(start.headers.get('location')).searchParams.get('state');

  const callback = await fetch(
    `${second.origin}/api/auth/google/callback?code=fixture-code&state=${encodeURIComponent(state)}`,
  );

  assert.equal(callback.status, 400);
  assert.match(await callback.text(), /invalid oauth state/i);
});

test('createApp uses the injected cloud token storage', async t => {
  const config = await fixtureConfig();
  config.cloud.tokenEncryptionKey = '';
  const runtime = await listen(createApp({
    config,
    storage: {
      cloudTokenStore: {
        read: async () => ({ google: { refresh_token: 'fixture-refresh' } }),
        update: async updater => updater({}),
      },
    },
  }));
  t.after(() => runtime.close());

  const response = await fetch(`${runtime.origin}/api/gdrive/status`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { connected: true, configured: true });
});
