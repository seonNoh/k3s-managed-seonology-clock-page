const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { link, lstat, mkdir, open, unlink } = require('node:fs/promises');

const { createAtomicJsonStore } = require('./atomic-json-store');

const BACKUP_AAD = 'seonology-clock/cloud-token-migration-backup/v1';
const BACKUP_KIND = 'cloud-token-migration-backup';
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

function parseTokenSource(source, description) {
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid JSON in ${description}`, { cause: error });
  }
  return assertTokenState(value);
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

function isBackupEnvelope(value) {
  return isEnvelope(value)
    && value.kind === BACKUP_KIND
    && value.aad === BACKUP_AAD
    && value.encoding === 'utf8';
}

function encryptJson(value, encryptionKey) {
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

function decryptJson(envelope, encryptionKey) {
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

function encryptBackupSource(source, encryptionKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  cipher.setAAD(Buffer.from(BACKUP_AAD, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(source, 'utf8'),
    cipher.final(),
  ]);
  return {
    version: 1,
    kind: BACKUP_KIND,
    algorithm: 'aes-256-gcm',
    encoding: 'utf8',
    aad: BACKUP_AAD,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function decryptBackupSource(envelope, encryptionKey) {
  if (!isBackupEnvelope(envelope)) throw new Error('Invalid cloud token migration backup format');
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey,
      Buffer.from(envelope.iv, 'base64'),
    );
    decipher.setAAD(Buffer.from(BACKUP_AAD, 'utf8'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const source = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    parseTokenSource(source, 'cloud token migration backup');
    return source;
  } catch (error) {
    throw new Error('Unable to decrypt cloud token migration backup', { cause: error });
  }
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

function isMissingSecureFile(error) {
  return error?.cause?.code === 'ENOENT';
}

async function readOptionalSecureFile(targetPath, description) {
  try {
    return await readSecureRegularFile(targetPath, description);
  } catch (error) {
    if (isMissingSecureFile(error)) return null;
    throw error;
  }
}

async function createExclusiveAtomicFile({ targetPath, content, mode = 0o600, verifyExisting }) {
  const directory = path.dirname(targetPath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(targetPath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`,
  );
  let temporaryHandle;
  try {
    temporaryHandle = await open(temporaryPath, 'wx', mode);
    await temporaryHandle.writeFile(content, 'utf8');
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = null;
    try {
      await link(temporaryPath, targetPath);
    } catch (error) {
      if (error.code !== 'EEXIST' || !verifyExisting) throw error;
      await verifyExisting();
    }
    await unlink(temporaryPath);
    await syncDirectory(directory);
  } catch (error) {
    if (temporaryHandle) await temporaryHandle.close().catch(() => {});
    await unlink(temporaryPath).catch(unlinkError => {
      if (unlinkError.code !== 'ENOENT') throw unlinkError;
    });
    throw error;
  }
}

async function ensureEncryptedBackup({ backupPath, encryptionKey, source }) {
  async function verifyExisting() {
    let envelope;
    try {
      envelope = JSON.parse(await readSecureRegularFile(backupPath, 'encrypted token migration backup'));
    } catch (error) {
      throw new Error('Unable to verify encrypted token migration backup', { cause: error });
    }
    const recovered = decryptBackupSource(envelope, encryptionKey);
    if (recovered !== source) throw new Error('Encrypted token migration backup does not match the source');
  }

  try {
    await verifyExisting();
    return;
  } catch (error) {
    if (!isMissingSecureFile(error.cause)) throw error;
  }

  const envelope = encryptBackupSource(source, encryptionKey);
  try {
    await createExclusiveAtomicFile({
      targetPath: backupPath,
      content: `${JSON.stringify(envelope, null, 2)}\n`,
      verifyExisting,
    });
    await verifyExisting();
  } catch (error) {
    throw new Error('Unable to preserve encrypted token migration backup', { cause: error });
  }
}

async function removeVerifiedPlaintextBackup({ legacyBackupPath, source }) {
  let handle;
  try {
    const noFollow = fs.constants.O_NOFOLLOW || 0;
    handle = await open(legacyBackupPath, fs.constants.O_RDONLY | noFollow);
    const opened = await handle.stat();
    if (!opened.isFile()) throw new Error('Plaintext token backup must be a regular file');
    const currentSource = await handle.readFile('utf8');
    if (currentSource !== source) throw new Error('Plaintext token backup changed during migration');
    const atPath = await lstat(legacyBackupPath);
    if (!atPath.isFile() || atPath.dev !== opened.dev || atPath.ino !== opened.ino) {
      throw new Error('Plaintext token backup path changed during migration');
    }
    await unlink(legacyBackupPath);
    await syncDirectory(path.dirname(legacyBackupPath));
  } catch (error) {
    throw new Error('Unable to remove verified plaintext token backup', { cause: error });
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

async function validateEncryptedBackupIfPresent({ backupPath, encryptionKey }) {
  const persisted = await readOptionalSecureFile(backupPath, 'encrypted token migration backup');
  if (persisted === null) return null;
  let envelope;
  try {
    envelope = JSON.parse(persisted);
  } catch (error) {
    throw new Error('Invalid JSON in encrypted token migration backup', { cause: error });
  }
  return decryptBackupSource(envelope, encryptionKey);
}

async function reconcileLegacyBackup({ backupPath, encryptionKey, legacyBackupPath }) {
  const legacySource = await readOptionalSecureFile(legacyBackupPath, 'plaintext token backup');
  if (legacySource === null) {
    await validateEncryptedBackupIfPresent({ backupPath, encryptionKey });
    return;
  }
  parseTokenSource(legacySource, 'plaintext token backup');
  await ensureEncryptedBackup({ backupPath, encryptionKey, source: legacySource });
  await removeVerifiedPlaintextBackup({ legacyBackupPath, source: legacySource });
}

function createEncryptedTokenStore({ filePath, key, createStore = createAtomicJsonStore }) {
  const encryptionKey = normalizeKey(key);
  const resolvedPath = path.resolve(filePath);
  const backupPath = `${resolvedPath}.migration-backup.json`;
  const legacyBackupPath = `${resolvedPath}.plaintext-backup`;
  const rawStore = createStore({
    filePath,
    defaultValue: {},
    validate: isPlainObject,
    mode: 0o600,
  });
  let queue = Promise.resolve();

  async function readCurrent() {
    const persisted = await rawStore.read();
    if (isEnvelope(persisted)) {
      const current = decryptJson(persisted, encryptionKey);
      await reconcileLegacyBackup({ backupPath, encryptionKey, legacyBackupPath });
      return current;
    }
    if (Object.keys(persisted).length === 0) return {};

    const source = await readSecureRegularFile(resolvedPath, 'plaintext token store');
    let legacy;
    try {
      legacy = JSON.parse(source);
    } catch (error) {
      throw new Error('Invalid JSON in plaintext token store', { cause: error });
    }
    if (isEnvelope(legacy)) {
      const current = decryptJson(legacy, encryptionKey);
      await reconcileLegacyBackup({ backupPath, encryptionKey, legacyBackupPath });
      return current;
    }
    assertTokenState(legacy);
    if (Object.keys(legacy).length === 0) return {};

    const previousBackup = await readOptionalSecureFile(legacyBackupPath, 'plaintext token backup');
    if (previousBackup !== null && previousBackup !== source) {
      throw new Error('Plaintext token backup does not match the source');
    }
    await ensureEncryptedBackup({ backupPath, encryptionKey, source });
    await rawStore.write(encryptJson(legacy, encryptionKey));
    if (previousBackup !== null) {
      await removeVerifiedPlaintextBackup({ legacyBackupPath, source: previousBackup });
    }
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
        await rawStore.write(encryptJson(next, encryptionKey));
        return cloneJson(next);
      });
    },
    update(updater) {
      return enqueue(async () => {
        const current = await readCurrent();
        const candidate = await updater(cloneJson(current));
        const next = assertTokenState(cloneJson(candidate === undefined ? current : candidate));
        await rawStore.write(encryptJson(next, encryptionKey));
        return cloneJson(next);
      });
    },
  };
}

async function recoverCloudTokenBackup({ backupPath, targetPath, key }) {
  if (!backupPath) throw new TypeError('backupPath is required');
  if (!targetPath) throw new TypeError('targetPath is required');
  const resolvedBackupPath = path.resolve(backupPath);
  const resolvedTargetPath = path.resolve(targetPath);
  if (resolvedBackupPath === resolvedTargetPath) throw new Error('Recovery target must differ from the backup');
  const encryptionKey = normalizeKey(key);
  const persisted = await readSecureRegularFile(resolvedBackupPath, 'encrypted token migration backup');
  let envelope;
  try {
    envelope = JSON.parse(persisted);
  } catch (error) {
    throw new Error('Invalid JSON in encrypted token migration backup', { cause: error });
  }
  const source = decryptBackupSource(envelope, encryptionKey);

  try {
    await createExclusiveAtomicFile({ targetPath: resolvedTargetPath, content: source });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Recovery target already exists', { cause: error });
    throw new Error('Unable to write recovery target', { cause: error });
  }
  return resolvedTargetPath;
}

module.exports = {
  BACKUP_AAD,
  BACKUP_KIND,
  createEncryptedTokenStore,
  recoverCloudTokenBackup,
};
