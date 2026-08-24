const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { mkdtemp, readFile, readdir, stat, symlink, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');

const { createEncryptedTokenStore } = require('../infrastructure/storage/encrypted-token-store');
const { createAtomicJsonStore } = require('../infrastructure/storage/atomic-json-store');

const execFileAsync = promisify(execFile);
const recoveryScript = path.resolve(__dirname, '../../scripts/recover-cloud-token-backup.mjs');

async function fixture(key = Buffer.alloc(32, 0x11), options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clock-token-store-'));
  const filePath = path.join(directory, 'tokens.json');
  return {
    directory,
    filePath,
    backupPath: `${filePath}.migration-backup.json`,
    legacyBackupPath: `${filePath}.plaintext-backup`,
    key,
    store: createEncryptedTokenStore({ filePath, key, ...options }),
  };
}

async function assertDirectoryDoesNotContain(directory, pattern) {
  for (const entry of await readdir(directory)) {
    assert.doesNotMatch(await readFile(path.join(directory, entry), 'utf8'), pattern);
  }
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
  const { backupPath, directory, filePath, legacyBackupPath, store } = await fixture();
  const legacy = { google: { refresh_token: 'legacy-fixture-refresh' } };
  const original = `${JSON.stringify(legacy, null, 2)}\n`;
  await writeFile(filePath, original, { mode: 0o644 });

  assert.deepEqual(await store.read(), legacy);
  const migrated = await readFile(filePath, 'utf8');
  assert.doesNotMatch(migrated, /legacy-fixture-refresh/);
  assert.equal(JSON.parse(migrated).algorithm, 'aes-256-gcm');
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  assert.equal(backup.kind, 'cloud-token-migration-backup');
  assert.equal(backup.aad, 'seonology-clock/cloud-token-migration-backup/v1');
  assert.equal((await stat(backupPath)).mode & 0o777, 0o600);
  assert.equal((await stat(filePath)).mode & 0o777, 0o600);
  await assert.rejects(readFile(legacyBackupPath, 'utf8'), { code: 'ENOENT' });
  await assertDirectoryDoesNotContain(directory, /legacy-fixture-refresh/);
});

test('legacy tokens migrate when a readable mounted file cannot be chmodded by the app user', async () => {
  let chmodCalls = 0;
  const chmodFile = async () => {
    chmodCalls += 1;
    const error = new Error('operation not permitted');
    error.code = 'EPERM';
    throw error;
  };
  const { filePath, store } = await fixture(Buffer.alloc(32, 0x11), { chmodFile });
  const legacy = { google: { refresh_token: 'mounted-file-fixture' } };
  await writeFile(filePath, `${JSON.stringify(legacy)}\n`, { mode: 0o664 });

  assert.deepEqual(await store.read(), legacy);
  assert.equal(chmodCalls, 1);
  assert.equal(JSON.parse(await readFile(filePath, 'utf8')).algorithm, 'aes-256-gcm');
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
  assert.doesNotMatch(await readFile(backupPath, 'utf8'), /retry-fixture/);

  failWrites = false;
  assert.deepEqual(await store.read(), {
    microsoft: { refresh_token: 'retry-fixture' },
  });
  assert.equal(JSON.parse(await readFile(filePath, 'utf8')).algorithm, 'aes-256-gcm');
});

test('migration is idempotent and does not replace the encrypted original backup', async () => {
  const { backupPath, filePath, store } = await fixture();
  const original = '{"google":{"access_token":"once-fixture"}}\n';
  await writeFile(filePath, original);

  await store.read();
  const firstEnvelope = await readFile(filePath, 'utf8');
  const firstBackup = await readFile(backupPath, 'utf8');
  await store.read();

  assert.equal(await readFile(filePath, 'utf8'), firstEnvelope);
  assert.equal(await readFile(backupPath, 'utf8'), firstBackup);
  assert.doesNotMatch(firstBackup, /once-fixture/);
});

test('the recovery CLI restores an exact 0600 plaintext only to an explicit new target', async () => {
  const { backupPath, directory, key, filePath, store } = await fixture();
  const original = '{"google":{"refresh_token":"rollback-fixture"}}\n';
  await writeFile(filePath, original);
  await store.read();
  const targetPath = path.join(directory, 'explicit-recovery.json');

  const { stdout, stderr } = await execFileAsync(process.execPath, [
    recoveryScript,
    '--backup', backupPath,
    '--target', targetPath,
  ], {
    env: { ...process.env, CLOUD_TOKEN_ENCRYPTION_KEY: key.toString('base64') },
  });

  assert.equal(await readFile(targetPath, 'utf8'), original);
  assert.equal((await stat(targetPath)).mode & 0o777, 0o600);
  assert.doesNotMatch(`${stdout}${stderr}`, /rollback-fixture/);

  await assert.rejects(execFileAsync(process.execPath, [
    recoveryScript,
    '--backup', backupPath,
    '--target', targetPath,
  ], {
    env: { ...process.env, CLOUD_TOKEN_ENCRYPTION_KEY: key.toString('base64') },
  }), /already exists/i);
  assert.equal(await readFile(targetPath, 'utf8'), original);
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
  assert.doesNotMatch(await readFile(backupPath, 'utf8'), /keep-fixture/);
  assert.doesNotMatch(await readFile(filePath, 'utf8'), /keep-fixture|add-fixture/);
});

test('an existing plaintext backup is encrypted and removed on the next read', async () => {
  const { backupPath, directory, legacyBackupPath, store } = await fixture();
  const tokens = { google: { refresh_token: 'upgrade-fixture' } };
  const original = `${JSON.stringify(tokens, null, 2)}\n`;
  await store.write(tokens);
  await writeFile(legacyBackupPath, original, { mode: 0o600 });

  assert.deepEqual(await store.read(), tokens);

  await assert.rejects(readFile(legacyBackupPath, 'utf8'), { code: 'ENOENT' });
  assert.equal(JSON.parse(await readFile(backupPath, 'utf8')).kind, 'cloud-token-migration-backup');
  await assertDirectoryDoesNotContain(directory, /upgrade-fixture/);
  assert.deepEqual(await store.read(), tokens);
});

test('a corrupt encrypted backup fails closed and leaves the legacy backup untouched', async () => {
  const { backupPath, filePath, legacyBackupPath, store } = await fixture();
  const tokens = { microsoft: { refresh_token: 'corruption-fixture' } };
  const original = `${JSON.stringify(tokens)}\n`;
  await store.write(tokens);
  await writeFile(backupPath, '{"kind":"cloud-token-migration-backup","ciphertext":"corrupt"}\n');
  await writeFile(legacyBackupPath, original);

  await assert.rejects(store.read(), /backup|decrypt/i);

  assert.equal(await readFile(legacyBackupPath, 'utf8'), original);
  assert.doesNotMatch(await readFile(filePath, 'utf8'), /corruption-fixture/);
});

test('recovery with the wrong key fails without creating the target or logging secrets', async () => {
  const { backupPath, directory, filePath, store } = await fixture();
  const original = '{"google":{"refresh_token":"wrong-key-fixture"}}\n';
  await writeFile(filePath, original);
  await store.read();
  const targetPath = path.join(directory, 'wrong-key-target.json');

  let failure;
  try {
    await execFileAsync(process.execPath, [
      recoveryScript,
      '--backup', backupPath,
      '--target', targetPath,
    ], {
      env: { ...process.env, CLOUD_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 0x22).toString('base64') },
    });
  } catch (error) {
    failure = error;
  }

  assert.ok(failure);
  assert.match(`${failure.stdout || ''}${failure.stderr || ''}`, /recovery failed|decrypt/i);
  assert.doesNotMatch(`${failure.stdout || ''}${failure.stderr || ''}`, /wrong-key-fixture/);
  await assert.rejects(readFile(targetPath, 'utf8'), { code: 'ENOENT' });
});
