const crypto = require('node:crypto');

function createOAuthTransactionStore({
  ttlMs = 10 * 60 * 1000,
  maxEntries = 256,
  now = Date.now,
  randomBytes = crypto.randomBytes,
} = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new TypeError('ttlMs must be positive');
  if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) throw new TypeError('maxEntries must be positive');
  const transactions = new Map();

  function removeExpired(currentTime) {
    for (const [state, transaction] of transactions) {
      if (currentTime >= transaction.expiresAt) transactions.delete(state);
    }
  }

  function create(provider) {
    if (!provider) throw new TypeError('provider is required');
    const currentTime = now();
    removeExpired(currentTime);
    while (transactions.size >= maxEntries) {
      transactions.delete(transactions.keys().next().value);
    }
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(64).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    transactions.set(state, { provider, verifier, expiresAt: currentTime + ttlMs });
    return { state, verifier, challenge, challengeMethod: 'S256' };
  }

  function consume({ provider, state } = {}) {
    const transaction = transactions.get(state);
    if (!transaction) throw new Error('Invalid OAuth state');
    const currentTime = now();
    if (transaction.provider !== provider) throw new Error('OAuth provider mismatch');
    if (currentTime >= transaction.expiresAt) {
      transactions.delete(state);
      removeExpired(currentTime);
      throw new Error('OAuth state expired');
    }
    removeExpired(currentTime);
    transactions.delete(state);
    return { verifier: transaction.verifier };
  }

  return { create, begin: create, consume };
}

module.exports = { createOAuthTransactionStore };
