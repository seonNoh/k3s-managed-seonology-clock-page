const assert = require('node:assert/strict');
const { mkdtemp, readFile, stat, symlink, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createEncryptedTokenStore } = require('../infrastructure/storage/encrypted-token-store');
const { createAtomicJsonStore } = require('../infrastructure/storage/atomic-json-store');

async function fixture(key = Buffer.alloc(32, 0x11), options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clock-token-store-'));
  const filePath = path.join(directory, 'tokens.json');
  return {
    directory,
    filePath,
    backupPath: `${filePath}.plaintext-backup`,
    store: createEncryptedTokenStore({ filePath, key, ...options }),
  };
}

test('tokens round-trip through an AES-256-GCM envelope without plaintext leakage', async () => {
  const { filePath, store } = await fixture();
  const tokens = { google: { access_token: 'fixture-access', refresh_token: 'fixture-refresh' } };

  await store.write(tokens);

  assert.deepEqual(await store.read(), tokens);
  const persisted = await readFile(filePath, 'utf8');
  assert.doesNotMatch(persisted, /fixture-access|fixture-refresh/);
  assert.equal(JSON.parse(persisted).algorithm, 'aes-256-gcm');
});

test('a wrong encryption key fails closed', async () => {
  const { filePath, store } = await fixture();
  await store.write({ microsoft: { refresh_token: 'fixture-refresh' } });
  const wrongKeyStore = createEncryptedTokenStore({ filePath, key: Buffer.alloc(32, 0x22) });

  await assert.rejects(wrongKeyStore.read(), /decrypt|authenticate/i);
});

test('legacy plaintext tokens are migrated to the encrypted envelope on read', async () => {
  const { backupPath, filePath, store } = await fixture();
  const legacy = { google: { refresh_token: 'legacy-fixture-refresh' } };
  const original = `${JSON.stringify(legacy, null, 2)}\n`;
  await writeFile(filePath, original, { mode: 0o644 });

  assert.deepEqual(await store.read(), legacy);
  const migrated = await readFile(filePath, 'utf8');
  assert.doesNotMatch(migrated, /legacy-fixture-refresh/);
  assert.equal(JSON.parse(migrated).algorithm, 'aes-256-gcm');
  assert.equal(await readFile(backupPath, 'utf8'), original);
  assert.equal((await stat(backupPath)).mode & 0o777, 0o600);
  assert.equal((await stat(filePath)).mode & 0o777, 0o600);
});

test('malformed legacy plaintext is rejected without changing the original file', async () => {
  const { backupPath, filePath, store } = await fixture();
  const original = '{"google":{"refresh_token":42}}\n';
  await writeFile(filePath, original);

  await assert.rejects(store.read(), /invalid.*token/i);

  assert.equal(await readFile(filePath, 'utf8'), original);
  await assert.rejects(readFile(backupPath, 'utf8'), { code: 'ENOENT' });
});

test('a failed encrypted write leaves the plaintext and its backup recoverable for retry', async () => {
  let failWrites = true;
  const createStore = options => {
    const store = createAtomicJsonStore(options);
    return {
      ...store,
      write(value) {
        if (failWrites) return Promise.reject(new Error('forced encrypted write failure'));
        return store.write(value);
      },
    };
  };
  const { backupPath, filePath, store } = await fixture(Buffer.alloc(32, 0x11), { createStore });
  const original = '{\n  "microsoft": {\n    "refresh_token": "retry-fixture"\n  }\n}\n';
  await writeFile(filePath, original);

  await assert.rejects(store.read(), /forced encrypted write failure/);
  assert.equal(await readFile(filePath, 'utf8'), original);
  assert.equal(await readFile(backupPath, 'utf8'), original);

  failWrites = false;
  assert.deepEqual(await store.read(), {
    microsoft: { refresh_token: 'retry-fixture' },
  });
  assert.equal(JSON.parse(await readFile(filePath, 'utf8')).algorithm, 'aes-256-gcm');
});

test('migration is idempotent and does not replace the original plaintext backup', async () => {
  const { backupPath, filePath, store } = await fixture();
  const original = '{"google":{"access_token":"once-fixture"}}\n';
  await writeFile(filePath, original);

  await store.read();
  const firstEnvelope = await readFile(filePath, 'utf8');
  const firstBackup = await readFile(backupPath, 'utf8');
  await store.read();

  assert.equal(await readFile(filePath, 'utf8'), firstEnvelope);
  assert.equal(await readFile(backupPath, 'utf8'), firstBackup);
  assert.equal(firstBackup, original);
});

test('the preserved plaintext backup can restore and remigrate the original state', async () => {
  const { backupPath, filePath, store } = await fixture();
  const original = '{"google":{"refresh_token":"rollback-fixture"}}\n';
  await writeFile(filePath, original);
  await store.read();

  await writeFile(filePath, await readFile(backupPath, 'utf8'));

  assert.deepEqual(await store.read(), {
    google: { refresh_token: 'rollback-fixture' },
  });
  assert.equal(await readFile(backupPath, 'utf8'), original);
  assert.doesNotMatch(await readFile(filePath, 'utf8'), /rollback-fixture/);
});

test('migration fails closed when the backup path is a symlink', async () => {
  const { backupPath, directory, filePath, store } = await fixture();
  const original = '{"google":{"refresh_token":"path-fixture"}}\n';
  const unrelatedPath = path.join(directory, 'unrelated.json');
  await writeFile(filePath, original);
  await writeFile(unrelatedPath, 'unrelated\n');
  await symlink(unrelatedPath, backupPath);

  await assert.rejects(store.read(), /backup/i);

  assert.equal(await readFile(filePath, 'utf8'), original);
  assert.equal(await readFile(unrelatedPath, 'utf8'), 'unrelated\n');
});

test('update validates and backs up legacy plaintext before replacing provider tokens', async () => {
  const { backupPath, filePath, store } = await fixture();
  const original = '{"google":{"refresh_token":"keep-fixture"}}\n';
  await writeFile(filePath, original);

  const updated = await store.update(tokens => ({
    ...tokens,
    microsoft: { refresh_token: 'add-fixture' },
  }));

  assert.deepEqual(updated, {
    google: { refresh_token: 'keep-fixture' },
    microsoft: { refresh_token: 'add-fixture' },
  });
  assert.equal(await readFile(backupPath, 'utf8'), original);
  assert.doesNotMatch(await readFile(filePath, 'utf8'), /keep-fixture|add-fixture/);
});
