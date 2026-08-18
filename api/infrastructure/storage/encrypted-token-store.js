const crypto = require('node:crypto');

const { createAtomicJsonStore } = require('./atomic-json-store');

function normalizeKey(key) {
  if (Buffer.isBuffer(key)) {
    if (key.length !== 32) throw new TypeError('Encryption key must be 32 bytes');
    return Buffer.from(key);
  }
  if (typeof key !== 'string' || key.length === 0) throw new TypeError('Encryption key is required');
  let decoded;
  if (/^[a-f0-9]{64}$/i.test(key)) decoded = Buffer.from(key, 'hex');
  else if (/^[A-Za-z0-9+/]{43}=$/.test(key)) decoded = Buffer.from(key, 'base64');
  else decoded = Buffer.from(key, 'utf8');
  if (decoded.length !== 32) throw new TypeError('Encryption key must be 32 bytes');
  return decoded;
}

function isEnvelope(value) {
  return value?.algorithm === 'aes-256-gcm'
    && typeof value.iv === 'string'
    && typeof value.tag === 'string'
    && typeof value.ciphertext === 'string';
}

function createEncryptedTokenStore({ filePath, key }) {
  const encryptionKey = normalizeKey(key);
  const rawStore = createAtomicJsonStore({
    filePath,
    defaultValue: {},
    validate: value => value !== null && typeof value === 'object' && !Array.isArray(value),
    mode: 0o600,
  });
  let queue = Promise.resolve();

  function encrypt(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return {
      version: 1,
      algorithm: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
  }

  function decrypt(envelope) {
    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        encryptionKey,
        Buffer.from(envelope.iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      return JSON.parse(Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8'));
    } catch (error) {
      throw new Error('Unable to decrypt token store', { cause: error });
    }
  }

  async function readCurrent({ migrate = true } = {}) {
    const persisted = await rawStore.read();
    if (isEnvelope(persisted)) return decrypt(persisted);
    if (Object.keys(persisted).length === 0) return {};
    if (migrate) await rawStore.write(encrypt(persisted));
    return persisted;
  }

  function enqueue(operation) {
    const current = queue.catch(() => {}).then(operation);
    queue = current;
    return current;
  }

  return {
    read() {
      return enqueue(() => readCurrent());
    },
    write(value) {
      return enqueue(async () => {
        await rawStore.write(encrypt(value));
        return JSON.parse(JSON.stringify(value));
      });
    },
    update(updater) {
      return enqueue(async () => {
        const current = await readCurrent({ migrate: false });
        const candidate = await updater(JSON.parse(JSON.stringify(current)));
        const next = candidate === undefined ? current : candidate;
        await rawStore.write(encrypt(next));
        return JSON.parse(JSON.stringify(next));
      });
    },
  };
}

module.exports = { createEncryptedTokenStore };
