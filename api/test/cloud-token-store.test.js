const assert = require('node:assert/strict');
const { mkdtemp, readFile, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createEncryptedTokenStore } = require('../infrastructure/storage/encrypted-token-store');

async function fixture(key = Buffer.alloc(32, 0x11)) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clock-token-store-'));
  const filePath = path.join(directory, 'tokens.json');
  return { filePath, store: createEncryptedTokenStore({ filePath, key }) };
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
  const { filePath, store } = await fixture();
  const legacy = { google: { refresh_token: 'legacy-fixture-refresh' } };
  await writeFile(filePath, JSON.stringify(legacy));

  assert.deepEqual(await store.read(), legacy);
  const migrated = await readFile(filePath, 'utf8');
  assert.doesNotMatch(migrated, /legacy-fixture-refresh/);
  assert.equal(JSON.parse(migrated).algorithm, 'aes-256-gcm');
});
