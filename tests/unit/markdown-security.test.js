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

  test('removes untrusted new-tab targets from raw HTML and generated Markdown links', () => {
    const rawHtml = renderMarkdown('<a href="https://example.com" target="_blank">raw link</a>');
    const markdownLink = renderMarkdown('[Markdown link](https://example.com)');

    expect(rawHtml).toContain('href="https://example.com"');
    expect(rawHtml).not.toContain('target=');
    expect(markdownLink).toContain('href="https://example.com"');
    expect(markdownLink).not.toContain('target=');
  });
});
