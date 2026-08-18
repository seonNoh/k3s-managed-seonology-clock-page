// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import {
  MERMAID_CONFIG,
  createLatestRenderGuard,
} from '../../src/components/MermaidEditor.jsx';
import { sanitizeMermaidSvg } from '../../packages/toolkit-core/src/markdown.js';

describe('Mermaid security', () => {
  test('uses Mermaid strict security mode', () => {
    expect(MERMAID_CONFIG.securityLevel).toBe('strict');
  });

  test('removes executable SVG content', () => {
    const svg = sanitizeMermaidSvg(
      '<svg onload="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)"><text>diagram</text></a></svg>'
    );

    expect(svg).toContain('<svg');
    expect(svg).toContain('<text>diagram</text>');
    expect(svg).not.toMatch(/<script|onload|javascript:/i);
  });

  test('accepts only the most recent asynchronous render request', () => {
    const guard = createLatestRenderGuard();
    const firstRequest = guard.next();
    const latestRequest = guard.next();

    expect(guard.isCurrent(firstRequest)).toBe(false);
    expect(guard.isCurrent(latestRequest)).toBe(true);
  });
});
