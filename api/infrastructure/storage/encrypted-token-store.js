const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { link, mkdir, open, unlink } = require('node:fs/promises');

const { createAtomicJsonStore } = require('./atomic-json-store');

const PROVIDERS = new Set(['google', 'microsoft']);
const TOKEN_FIELDS = new Set(['access_token', 'refresh_token', 'expires_at']);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isProviderTokens(value) {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some(key => !TOKEN_FIELDS.has(key))) return false;
  if (!('access_token' in value) && !('refresh_token' in value)) return false;
  if ('access_token' in value && (typeof value.access_token !== 'string' || value.access_token.length === 0)) return false;
  if ('refresh_token' in value && (typeof value.refresh_token !== 'string' || value.refresh_token.length === 0)) return false;
  if ('expires_at' in value && (!Number.isSafeInteger(value.expires_at) || value.expires_at < 0)) return false;
  return true;
}

function isTokenState(value) {
  if (!isPlainObject(value)) return false;
  return Object.entries(value).every(([provider, tokens]) => (
    PROVIDERS.has(provider) && isProviderTokens(tokens)
  ));
}

function assertTokenState(value) {
  if (!isTokenState(value)) throw new Error('Invalid cloud token schema');
  return value;
}

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
  return value?.version === 1
    && value.algorithm === 'aes-256-gcm'
    && typeof value.iv === 'string'
    && typeof value.tag === 'string'
    && typeof value.ciphertext === 'string';
}

async function syncDirectory(directory) {
  const handle = await open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readSecureRegularFile(targetPath, description) {
  let handle;
  try {
    const noFollow = fs.constants.O_NOFOLLOW || 0;
    handle = await open(targetPath, fs.constants.O_RDONLY | noFollow);
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error(`${description} must be a regular file`);
    await handle.chmod(0o600);
    await handle.sync();
    return await handle.readFile('utf8');
  } catch (error) {
    throw new Error(`Unable to read secure ${description}`, { cause: error });
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

async function preservePlaintextBackup({ backupPath, directory, source }) {
  async function verifyExistingBackup() {
    const existing = await readSecureRegularFile(backupPath, 'plaintext token backup');
    if (existing !== source) throw new Error('Existing plaintext token backup does not match the source');
  }

  try {
    await verifyExistingBackup();
    return;
  } catch (error) {
    if (error.cause?.code !== 'ENOENT') {
      throw new Error('Unable to preserve plaintext token backup', { cause: error });
    }
  }

  await mkdir(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(backupPath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`,
  );
  let temporaryHandle;
  try {
    temporaryHandle = await open(temporaryPath, 'wx', 0o600);
    await temporaryHandle.writeFile(source, 'utf8');
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = null;
    try {
      await link(temporaryPath, backupPath);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      await verifyExistingBackup();
    }
    await unlink(temporaryPath);
    await syncDirectory(directory);
  } catch (error) {
    if (temporaryHandle) await temporaryHandle.close().catch(() => {});
    await unlink(temporaryPath).catch(unlinkError => {
      if (unlinkError.code !== 'ENOENT') throw unlinkError;
    });
    throw new Error('Unable to preserve plaintext token backup', { cause: error });
  }
}

function createEncryptedTokenStore({ filePath, key, createStore = createAtomicJsonStore }) {
  const encryptionKey = normalizeKey(key);
  const resolvedPath = path.resolve(filePath);
  const directory = path.dirname(resolvedPath);
  const backupPath = `${resolvedPath}.plaintext-backup`;
  const rawStore = createStore({
    filePath,
    defaultValue: {},
    validate: isPlainObject,
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
      return assertTokenState(JSON.parse(Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8')));
    } catch (error) {
      throw new Error('Unable to decrypt token store', { cause: error });
    }
  }

  async function readCurrent() {
    const persisted = await rawStore.read();
    if (isEnvelope(persisted)) return decrypt(persisted);
    if (Object.keys(persisted).length === 0) return {};

    const source = await readSecureRegularFile(resolvedPath, 'plaintext token store');
    let legacy;
    try {
      legacy = JSON.parse(source);
    } catch (error) {
      throw new Error('Invalid JSON in plaintext token store', { cause: error });
    }
    if (isEnvelope(legacy)) return decrypt(legacy);
    assertTokenState(legacy);
    if (Object.keys(legacy).length === 0) return {};

    await preservePlaintextBackup({ backupPath, directory, source });
    await rawStore.write(encrypt(legacy));
    return cloneJson(legacy);
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
        const next = assertTokenState(cloneJson(value));
        await readCurrent();
        await rawStore.write(encrypt(next));
        return cloneJson(next);
      });
    },
    update(updater) {
      return enqueue(async () => {
        const current = await readCurrent();
        const candidate = await updater(cloneJson(current));
        const next = assertTokenState(cloneJson(candidate === undefined ? current : candidate));
        await rawStore.write(encrypt(next));
        return cloneJson(next);
      });
    },
  };
}

module.exports = { createEncryptedTokenStore };
