const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const { mkdtemp, writeFile } = require('node:fs/promises');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { Writable } = require('node:stream');
const test = require('node:test');

const express = require('express');
const { createApp } = require('../app');
const { setupGoogleRoutes, setupMicrosoftRoutes } = require('../cloud-drives');
const { loadConfig } = require('../config');
const { createOAuthTransactionStore } = require('../domains/cloud/oauth-transaction');

class PendingRequest extends Writable {
  constructor(onFinal) {
    super({ autoDestroy: false });
    this.onFinal = onFinal;
  }

  _write(chunk, encoding, callback) {
    this.chunks = this.chunks || [];
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  _final(callback) {
    if (this.onFinal) this.onFinal();
    callback();
  }
}

function tokenStore(provider) {
  return {
    read: async () => ({ [provider]: { access_token: 'fixture-access' } }),
    update: async updater => updater({}),
  };
}

function responseFixture({ statusCode = 200, headers = {}, body = '' }) {
  const response = new EventEmitter();
  response.statusCode = statusCode;
  response.headers = headers;
  response.resume = () => {};
  response.deliver = callback => {
    callback(response);
    queueMicrotask(() => {
      if (body) response.emit('data', Buffer.from(body));
      response.emit('end');
    });
  };
  return response;
}

async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.close();
      await once(server, 'close');
    },
  };
}

test('Google filesLimit destroys an upload request that already started', async t => {
  const originalRequest = https.request;
  let uploadRequest;
  https.request = (options, callback) => {
    const isSessionStart = options.hostname === 'www.googleapis.com';
    const request = new PendingRequest(() => {
      if (isSessionStart) {
        responseFixture({
          statusCode: 200,
          headers: { location: 'https://upload.fixture/session' },
        }).deliver(callback);
      }
    });
    if (options.hostname === 'upload.fixture') uploadRequest = request;
    return request;
  };
  t.after(() => { https.request = originalRequest; });

  const app = express();
  setupGoogleRoutes(app, {
    config: {
      clientId: 'fixture-client',
      clientSecret: 'fixture-secret',
      redirectUri: 'https://clock.seonology.com/api/auth/google/callback',
    },
    tokenStore: {
      read: async () => ({ google: { access_token: 'fixture-access' } }),
      update: async updater => updater({}),
    },
    oauthTransactions: createOAuthTransactionStore({}),
    httpsPost: async () => ({}),
    httpsGet: async () => ({}),
  });
  const runtime = await listen(app);
  t.after(() => runtime.close());
  const form = new FormData();
  form.append('parentId', 'root');
  form.append('file', new Blob(['first']), 'first.txt');
  form.append('file', new Blob(['second']), 'second.txt');

  const response = await fetch(`${runtime.origin}/api/gdrive/upload`, { method: 'POST', body: form });

  assert.equal(response.status, 400);
  assert.ok(uploadRequest, 'the first upstream upload must have started');
  assert.equal(uploadRequest.destroyed, true);
});

test('NAS late target field destroys an upload request that already started', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clock-nas-route-'));
  const caPath = path.join(directory, 'nas-ca.pem');
  await writeFile(caPath, 'fixture-ca');
  const config = loadConfig({
    BOOKMARKS_DIR: directory,
    NAS_HOST: 'nas.fixture',
    NAS_PORT: '5001',
    NAS_ACCOUNT: 'fixture-account',
    NAS_PASSWORD: 'fixture-password',
    NAS_ALLOWED_ROOTS: '/volume1/team',
    NAS_CA_PATH: caPath,
    NAS_TLS_SERVERNAME: 'nas.fixture',
  });
  const originalRequest = https.request;
  let uploadRequest;
  https.request = (...args) => {
    const callback = args.find(argument => typeof argument === 'function');
    const first = args[0];
    const requestUrl = typeof first === 'string' ? new URL(first) : first;
    const requestPath = requestUrl instanceof URL
      ? `${requestUrl.pathname}${requestUrl.search}`
      : requestUrl.path;
    const isLogin = requestPath.includes('SYNO.API.Auth');
    const request = new PendingRequest(() => {
      if (isLogin) {
        responseFixture({
          body: JSON.stringify({ success: true, data: { sid: 'fixture-sid' } }),
        }).deliver(callback);
      }
    });
    if (requestPath === '/webapi/entry.cgi?_sid=fixture-sid') uploadRequest = request;
    return request;
  };
  t.after(() => { https.request = originalRequest; });
  const runtime = await listen(createApp({ config }));
  t.after(() => runtime.close());
  const form = new FormData();
  form.append('file', new Blob(['content']), 'fixture.txt');
  form.append('path', '/volume1/team/late');

  const response = await fetch(
    `${runtime.origin}/api/nas/upload?path=${encodeURIComponent('/volume1/team')}`,
    { method: 'POST', body: form },
  );
  const responseBody = await response.text();

  assert.equal(response.status, 400, responseBody);
  assert.ok(uploadRequest, 'the NAS upstream upload must have started');
  assert.equal(uploadRequest.destroyed, true);
});

test('Google accepts a legacy multipart upload whose parentId follows the file', async t => {
  const originalRequest = https.request;
  let metadataRequest;
  let uploadRequest;
  https.request = (options, callback) => {
    const request = new PendingRequest(() => {
      if (options.hostname === 'www.googleapis.com') {
        responseFixture({
          statusCode: 200,
          headers: { location: 'https://upload.fixture/session' },
        }).deliver(callback);
      } else if (options.hostname === 'upload.fixture') {
        responseFixture({ statusCode: 200, body: '{}' }).deliver(callback);
      }
    });
    if (options.hostname === 'www.googleapis.com') metadataRequest = request;
    if (options.hostname === 'upload.fixture') uploadRequest = request;
    return request;
  };
  t.after(() => { https.request = originalRequest; });

  const app = express();
  setupGoogleRoutes(app, {
    config: {
      clientId: 'fixture-client',
      clientSecret: 'fixture-secret',
      redirectUri: 'https://clock.seonology.com/api/auth/google/callback',
    },
    tokenStore: tokenStore('google'),
    oauthTransactions: createOAuthTransactionStore({}),
    httpsPost: async () => ({}),
    httpsGet: async () => ({}),
  });
  const runtime = await listen(app);
  t.after(() => runtime.close());
  const form = new FormData();
  form.append('file', new Blob(['legacy-google']), 'legacy.txt');
  form.append('parentId', 'legacy-parent');

  const response = await fetch(`${runtime.origin}/api/gdrive/upload`, { method: 'POST', body: form });

  assert.equal(response.status, 200, await response.text());
  assert.deepEqual(JSON.parse(Buffer.concat(metadataRequest.chunks).toString()), {
    name: 'legacy.txt',
    parents: ['legacy-parent'],
  });
  assert.equal(Buffer.concat(uploadRequest.chunks).toString(), 'legacy-google');
});

test('OneDrive accepts file-first multipart with a late or omitted legacy size field', async t => {
  const originalRequest = https.request;
  let sessionRequest;
  let uploadRequest;
  let uploadOptions;
  https.request = (options, callback) => {
    const request = new PendingRequest(() => {
      if (options.hostname === 'graph.microsoft.com') {
        responseFixture({
          statusCode: 200,
          body: JSON.stringify({ uploadUrl: 'https://upload.fixture/session' }),
        }).deliver(callback);
      } else if (options.hostname === 'upload.fixture') {
        responseFixture({ statusCode: 201 }).deliver(callback);
      }
    });
    if (options.hostname === 'graph.microsoft.com') sessionRequest = request;
    if (options.hostname === 'upload.fixture') {
      uploadRequest = request;
      uploadOptions = options;
    }
    return request;
  };
  t.after(() => { https.request = originalRequest; });

  const app = express();
  setupMicrosoftRoutes(app, {
    config: {
      clientId: 'fixture-client',
      clientSecret: 'fixture-secret',
      redirectUri: 'https://clock.seonology.com/api/auth/microsoft/callback',
    },
    tokenStore: tokenStore('microsoft'),
    oauthTransactions: createOAuthTransactionStore({}),
    httpsPost: async () => ({}),
    httpsGet: async () => ({}),
  });
  const runtime = await listen(app);
  t.after(() => runtime.close());
  const form = new FormData();
  form.append('file', new Blob(['legacy-onedrive']), 'legacy.txt');
  form.append('parentId', 'legacy-parent');

  const response = await fetch(`${runtime.origin}/api/onedrive/upload`, { method: 'POST', body: form });

  assert.equal(response.status, 200, await response.text());
  assert.match(Buffer.concat(sessionRequest.chunks).toString(), /legacy\.txt/);
  assert.equal(uploadOptions.headers['Content-Range'], 'bytes 0-14/15');
  assert.equal(Buffer.concat(uploadRequest.chunks).toString(), 'legacy-onedrive');

  const lateSizeForm = new FormData();
  lateSizeForm.append('file', new Blob(['legacy-size']), 'late-size.txt');
  lateSizeForm.append('parentId', 'legacy-parent');
  lateSizeForm.append('size', '11');
  const lateSizeResponse = await fetch(`${runtime.origin}/api/onedrive/upload`, {
    method: 'POST',
    body: lateSizeForm,
  });

  assert.equal(lateSizeResponse.status, 200, await lateSizeResponse.text());
  assert.equal(uploadOptions.headers['Content-Range'], 'bytes 0-10/11');
  assert.equal(Buffer.concat(uploadRequest.chunks).toString(), 'legacy-size');
});

test('NAS accepts a legacy multipart upload whose path follows the file', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clock-nas-route-'));
  const caPath = path.join(directory, 'nas-ca.pem');
  await writeFile(caPath, 'fixture-ca');
  const config = loadConfig({
    BOOKMARKS_DIR: directory,
    NAS_HOST: 'nas.fixture',
    NAS_PORT: '5001',
    NAS_ACCOUNT: 'fixture-account',
    NAS_PASSWORD: 'fixture-password',
    NAS_ALLOWED_ROOTS: '/volume1/team',
    NAS_CA_PATH: caPath,
    NAS_TLS_SERVERNAME: 'nas.fixture',
  });
  const originalRequest = https.request;
  let uploadRequest;
  https.request = (...args) => {
    const callback = args.find(argument => typeof argument === 'function');
    const first = args[0];
    const requestUrl = typeof first === 'string' ? new URL(first) : first;
    const requestPath = requestUrl instanceof URL
      ? `${requestUrl.pathname}${requestUrl.search}`
      : requestUrl.path;
    const request = new PendingRequest(() => {
      if (requestPath.includes('SYNO.API.Auth')) {
        responseFixture({ body: JSON.stringify({ success: true, data: { sid: 'fixture-sid' } }) }).deliver(callback);
      } else if (requestPath === '/webapi/entry.cgi?_sid=fixture-sid') {
        responseFixture({ body: JSON.stringify({ success: true }) }).deliver(callback);
      }
    });
    if (requestPath === '/webapi/entry.cgi?_sid=fixture-sid') uploadRequest = request;
    return request;
  };
  t.after(() => { https.request = originalRequest; });
  const runtime = await listen(createApp({ config }));
  t.after(() => runtime.close());
  const form = new FormData();
  form.append('file', new Blob(['legacy-nas']), 'legacy.txt');
  form.append('path', '/volume1/team/legacy');

  const response = await fetch(`${runtime.origin}/api/nas/upload`, { method: 'POST', body: form });

  assert.equal(response.status, 200, await response.text());
  const upstreamBody = Buffer.concat(uploadRequest.chunks).toString();
  assert.match(upstreamBody, /name="path"\r\n\r\n\/volume1\/team\/legacy/);
  assert.match(upstreamBody, /legacy-nas/);
});
