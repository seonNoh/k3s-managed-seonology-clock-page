import { expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('browser tab bridge uses an explicit same-origin message boundary', () => {
  for (const relativePath of [
    'src/components/BrowserStats.jsx',
    'toolkit-extension/src/tools/BrowserStats.jsx',
  ]) {
    const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    expect(source).toMatch(/window\.postMessage\([\s\S]*window\.location\.origin\)/);
    expect(source).not.toMatch(/window\.postMessage\([\s\S]*,\s*['"]\*['"]\)/);
  }

  const bridge = fs.readFileSync(path.join(repoRoot, 'chrome-extension/content_script.js'), 'utf8');
  expect(bridge).toMatch(/event\.origin\s*!==\s*window\.location\.origin/);
});
