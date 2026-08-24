import { expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('nginx CSP blocks inline scripts and permits the configured Google font', () => {
  const config = fs.readFileSync(path.join(repoRoot, 'nginx.conf'), 'utf8');
  const policies = [...config.matchAll(/Content-Security-Policy "([^"]+)"/g)].map(match => match[1]);

  expect(policies.length).toBeGreaterThanOrEqual(2);
  for (const policy of policies) {
    expect(policy).toMatch(/script-src 'self'(?:;|$)/);
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(policy).toMatch(/style-src[^;]*https:\/\/fonts\.googleapis\.com/);
    expect(policy).toMatch(/font-src[^;]*https:\/\/fonts\.gstatic\.com/);
    expect(policy).toMatch(/object-src 'none'/);
  }
});
