const assert = require('node:assert/strict');
const test = require('node:test');

const { setupGoogleRoutes } = require('../cloud-drives');

function routeFixture(overrides = {}) {
  const routes = new Map();
  const app = {
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    post() {},
  };
  const transaction = {
    state: 'state-fixture',
    verifier: 'verifier-fixture',
    challenge: 'challenge-fixture',
    challengeMethod: 'S256',
  };
  const dependencies = {
    config: {
      clientId: 'client-fixture',
      clientSecret: 'secret-fixture',
      redirectUri: 'https://clock.seonology.com/api/auth/google/callback',
    },
    tokenStore: { read: async () => ({}), update: async updater => updater({}) },
    oauthTransactions: {
      create: () => transaction,
      consume: () => ({ verifier: transaction.verifier }),
    },
    httpsPost: async () => ({
      access_token: 'access-fixture',
      refresh_token: 'refresh-fixture',
      expires_in: 3600,
    }),
    ...overrides,
  };
  setupGoogleRoutes(app, dependencies);
  return { routes, transaction };
}

function responseFixture() {
  return {
    statusCode: 200,
    payload: undefined,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
    send(value) { this.payload = value; return this; },
    redirect(value) { this.redirectedTo = value; return this; },
  };
}

test('OAuth start is unavailable when credentials are missing', async () => {
  const { routes } = routeFixture({
    config: { clientId: '', clientSecret: '', redirectUri: 'https://clock.seonology.com/api/auth/google/callback' },
  });
  const res = responseFixture();

  await routes.get('GET /api/auth/google')({}, res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.payload, { error: 'Google Drive is unavailable' });
});

test('OAuth start binds state and PKCE S256 challenge to the authorization URL', async () => {
  const { routes, transaction } = routeFixture();
  const res = responseFixture();

  await routes.get('GET /api/auth/google')({}, res);

  const location = new URL(res.redirectedTo);
  assert.equal(location.searchParams.get('state'), transaction.state);
  assert.equal(location.searchParams.get('code_challenge'), transaction.challenge);
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
});

test('OAuth callback consumes state and sends the matching PKCE verifier', async () => {
  let exchangeBody;
  const { routes } = routeFixture({
    httpsPost: async (hostname, path, body) => {
      exchangeBody = body;
      return { access_token: 'access-fixture', refresh_token: 'refresh-fixture', expires_in: 3600 };
    },
  });
  const res = responseFixture();

  await routes.get('GET /api/auth/google/callback')({ query: { code: 'code-fixture', state: 'state-fixture' } }, res);

  assert.equal(exchangeBody.code_verifier, 'verifier-fixture');
  assert.equal(res.statusCode, 200);
});
