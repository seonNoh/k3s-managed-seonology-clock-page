const assert = require('node:assert/strict');
const test = require('node:test');

const { loadConfig } = require('../config');

test('Agent Platform token default uses the issuer-compatible public Keycloak endpoint', () => {
  const config = loadConfig({});
  assert.equal(
    config.agentPlatform.tokenUrl,
    'https://auth.seonology.com/realms/master/protocol/openid-connect/token',
  );
});
