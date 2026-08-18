const crypto = require('node:crypto');

function createOAuthTransactionStore({
  ttlMs = 10 * 60 * 1000,
  now = Date.now,
  randomBytes = crypto.randomBytes,
} = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new TypeError('ttlMs must be positive');
  const transactions = new Map();

  function create(provider) {
    if (!provider) throw new TypeError('provider is required');
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(64).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    transactions.set(state, { provider, verifier, expiresAt: now() + ttlMs });
    return { state, verifier, challenge, challengeMethod: 'S256' };
  }

  function consume({ provider, state } = {}) {
    const transaction = transactions.get(state);
    if (!transaction) throw new Error('Invalid OAuth state');
    if (transaction.provider !== provider) throw new Error('OAuth provider mismatch');
    if (now() > transaction.expiresAt) {
      transactions.delete(state);
      throw new Error('OAuth state expired');
    }
    transactions.delete(state);
    return { verifier: transaction.verifier };
  }

  return { create, begin: create, consume };
}

module.exports = { createOAuthTransactionStore };
