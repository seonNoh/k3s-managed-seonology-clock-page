const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const { mkdtemp, readFile, readdir, writeFile } = require('node:fs/promises');
const http = require('node:http');
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

async function uploadSpoolDirectories() {
  const entries = await readdir(os.tmpdir(), { withFileTypes: true });
  return new Set(entries
    .filter(entry => entry.isDirectory() && entry.name.startsWith('clock-upload-'))
    .map(entry => path.join(os.tmpdir(), entry.name)));
}

async function waitForNewSpool(before) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const current = await uploadSpoolDirectories();
    const added = [...current].filter(directory => !before.has(directory));
    if (added.length === 1) return added[0];
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Deferred upload spool was not created');
}

async function waitForRemoval(directory) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    try {
      await readdir(directory);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Deferred upload spool was not removed: ${directory}`);
}

function incompleteFileFirstRequest(origin, route, fieldName) {
  const boundary = 'clock-abort-boundary';
  const target = new URL(route, origin);
  let receivedResponse = false;
  let clientError = null;
  const request = http.request({
    hostname: target.hostname,
    port: target.port,
    path: target.pathname + target.search,
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  });
  request.on('response', () => { receivedResponse = true; });
  request.on('error', error => { clientError = error; });
  request.write([
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="abort.txt"',
    'Content-Type: application/octet-stream',
    '',
    'spooled-before-abort',
    `--${boundary}`,
    `Content-Disposition: form-data; name="${fieldName}"`,
    '',
    'unfinished-late-field',
  ].join('\r\n'));
  return {
    request,
    get receivedResponse() { return receivedResponse; },
    get clientError() { return clientError; },
  };
}

async function abortAfterFileSpool(origin, route, fieldName) {
  const before = await uploadSpoolDirectories();
  const client = incompleteFileFirstRequest(origin, route, fieldName);
  const spoolDirectory = await waitForNewSpool(before);
  assert.deepEqual(await readdir(spoolDirectory), ['payload']);
  assert.equal(await readFile(path.join(spoolDirectory, 'payload'), 'utf8'), 'spooled-before-abort');

  const closed = new Promise(resolve => client.request.once('close', resolve));
  client.request.destroy(new Error('fixture client abort'));
  await closed;
  await waitForRemoval(spoolDirectory);

  assert.equal(client.receivedResponse, false);
  assert.match(client.clientError?.message || '', /fixture client abort/);
  assert.deepEqual(
    [...await uploadSpoolDirectories()].sort(),
    [...before].sort(),
    'client abort must leave no new upload spool',
  );
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

test('Google removes a completed file-first spool when the unfinished late field is aborted', async t => {
  const originalRequest = https.request;
  let upstreamRequests = 0;
  https.request = () => {
    upstreamRequests += 1;
    return new PendingRequest();
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

  await abortAfterFileSpool(runtime.origin, '/api/gdrive/upload', 'parentId');

  assert.equal(upstreamRequests, 0);
});

test('OneDrive removes a completed file-first spool when the unfinished late field is aborted', async t => {
  const originalRequest = https.request;
  let upstreamRequests = 0;
  https.request = () => {
    upstreamRequests += 1;
    return new PendingRequest();
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

  await abortAfterFileSpool(runtime.origin, '/api/onedrive/upload', 'parentId');

  assert.equal(upstreamRequests, 0);
});

test('NAS removes a completed file-first spool when the unfinished late field is aborted', async t => {
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
  let uploadRequests = 0;
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
      }
    });
    if (requestPath === '/webapi/entry.cgi?_sid=fixture-sid') uploadRequests += 1;
    return request;
  };
  t.after(() => { https.request = originalRequest; });
  const runtime = await listen(createApp({ config }));
  t.after(() => runtime.close());

  await abortAfterFileSpool(runtime.origin, '/api/nas/upload', 'path');

  assert.equal(uploadRequests, 0);
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
