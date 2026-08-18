const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { createOAuthTransactionStore } = require('../domains/cloud/oauth-transaction');

function deterministicBytes(size) {
  return Buffer.alloc(size, 0x61);
}

function sequentialBytes() {
  let value = 0x61;
  return size => Buffer.alloc(size, value++);
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

test('creating a transaction removes unconsumed expired states', () => {
  let time = 1_000;
  const store = createOAuthTransactionStore({
    ttlMs: 500,
    now: () => time,
    randomBytes: sequentialBytes(),
    maxEntries: 2,
  });
  const expired = store.create('google');
  time = 1_501;

  store.create('google');

  assert.throws(
    () => store.consume({ provider: 'google', state: expired.state }),
    /invalid/i,
  );
});

test('capacity evicts the oldest live state and preserves the newest states', () => {
  const store = createOAuthTransactionStore({
    ttlMs: 60_000,
    now: () => 1_000,
    randomBytes: sequentialBytes(),
    maxEntries: 2,
  });
  const oldest = store.create('google');
  const middle = store.create('google');
  const newest = store.create('google');

  assert.throws(() => store.consume({ provider: 'google', state: oldest.state }), /invalid/i);
  assert.equal(store.consume({ provider: 'google', state: middle.state }).verifier, middle.verifier);
  assert.equal(store.consume({ provider: 'google', state: newest.state }).verifier, newest.verifier);
});
