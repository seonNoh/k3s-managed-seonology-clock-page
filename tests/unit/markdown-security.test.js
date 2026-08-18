// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { renderMarkdown } from '../../src/utils/markdown.js';

describe('safe Markdown rendering', () => {
  test('removes unsafe HTML, event attributes, and javascript URLs while preserving Markdown', () => {
    const html = renderMarkdown([
      '# Safe heading',
      '',
      '**bold** and [safe link](https://example.com)',
      '',
      '<img src="x" onerror="alert(1)">',
      '<script>alert(1)</script>',
      '[unsafe link](javascript:alert(1))',
    ].join('\n'));

    expect(html).toContain('<h1>Safe heading</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toMatch(/<script|<img|onerror|javascript:/i);
  });
});
