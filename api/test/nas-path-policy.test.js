const assert = require('node:assert/strict');
const test = require('node:test');

const { createNasPathPolicy } = require('../domains/nas/path-policy');

const policy = createNasPathPolicy({ allowedRoots: ['/volume1/team', '/volume2/archive'] });

test('paths inside an allowed root are accepted', () => {
  assert.equal(policy.assertPath('/volume1/team/reports/2026'), '/volume1/team/reports/2026');
  assert.equal(policy.assertPath('/volume2/archive'), '/volume2/archive');
});

test('traversal and sibling-prefix paths are rejected', () => {
  assert.throws(() => policy.assertPath('/volume1/team/../private'), /path/i);
  assert.throws(() => policy.assertPath('/volume1/team-secrets/file'), /path/i);
});

test('relative paths are rejected', () => {
  assert.throws(() => policy.assertPath('volume1/team/file'), /absolute/i);
});

test('NUL, CRLF, and backslash characters are rejected in paths and names', () => {
  for (const value of ['bad\0name', 'bad\r\nname', 'bad\\name']) {
    assert.throws(() => policy.assertName(value), /name/i);
  }
  assert.throws(() => policy.assertPath('/volume1/team/bad\0path'), /path/i);
  assert.throws(() => policy.assertPath('/volume1/team/bad\r\npath'), /path/i);
  assert.throws(() => policy.assertPath('/volume1/team/bad\\path'), /path/i);
});

test('invalid sort and direction values are rejected', () => {
  assert.throws(() => policy.assertSort('name&additional=real_path'), /sort/i);
  assert.throws(() => policy.assertDirection('DESC&limit=0'), /direction/i);
  assert.equal(policy.assertSort('size'), 'size');
  assert.equal(policy.assertDirection('DESC'), 'DESC');
});
