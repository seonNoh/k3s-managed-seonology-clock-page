const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { createOAuthTransactionStore } = require('../domains/cloud/oauth-transaction');

function deterministicBytes(size) {
  return Buffer.alloc(size, 0x61);
}

test('OAuth transactions use an S256 challenge derived from the verifier', () => {
  const store = createOAuthTransactionStore({
    ttlMs: 60_000,
    now: () => 1_000,
    randomBytes: deterministicBytes,
  });

  const transaction = store.create('google');
  const expected = crypto.createHash('sha256').update(transaction.verifier).digest('base64url');

  assert.equal(transaction.challenge, expected);
  assert.equal(transaction.challengeMethod, 'S256');
});

test('state mismatch is rejected', () => {
  const store = createOAuthTransactionStore({ ttlMs: 60_000, now: () => 1_000 });
  store.create('google');

  assert.throws(() => store.consume({ provider: 'google', state: 'wrong' }), /state/i);
});

test('expired state is rejected', () => {
  let time = 1_000;
  const store = createOAuthTransactionStore({ ttlMs: 500, now: () => time });
  const transaction = store.create('google');
  time = 1_501;

  assert.throws(() => store.consume({ provider: 'google', state: transaction.state }), /expired/i);
});

test('consumed state cannot be replayed', () => {
  const store = createOAuthTransactionStore({ ttlMs: 60_000, now: () => 1_000 });
  const transaction = store.create('google');

  assert.equal(store.consume({ provider: 'google', state: transaction.state }).verifier, transaction.verifier);
  assert.throws(() => store.consume({ provider: 'google', state: transaction.state }), /state/i);
});

test('a state issued for another provider is rejected without consuming it', () => {
  const store = createOAuthTransactionStore({ ttlMs: 60_000, now: () => 1_000 });
  const transaction = store.create('google');

  assert.throws(() => store.consume({ provider: 'microsoft', state: transaction.state }), /provider/i);
  assert.equal(store.consume({ provider: 'google', state: transaction.state }).verifier, transaction.verifier);
});
