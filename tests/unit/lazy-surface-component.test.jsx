// @vitest-environment jsdom
import React, { Suspense, lazy, useState } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, test } from 'vitest';

import { createToolRegistry } from '../../packages/toolkit-core/src/catalog.js';
import { byId } from '../../toolkit-extension/src/shared/registry.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('surface lazy components', () => {
  test('extension registry exposes stable lazy components for popup and newtab', () => {
    const json = byId('json');

    expect(json.components.popup).toBe(json.components.popup);
    expect(json.components.newtab).toBe(json.components.newtab);
    expect(json.components.popup).not.toBe(json.components.newtab);
  });

  test('a parent rerender preserves the selected tool component state', async () => {
    function StatefulTool() {
      const [count, setCount] = useState(0);
      return <button type="button" data-testid="tool-count" onClick={() => setCount((value) => value + 1)}>{count}</button>;
    }

    const [tool] = createToolRegistry({
      catalog: [{ id: 'json', name: 'JSON Formatter', aliases: [], surfaces: ['popup'] }],
      loaders: { json: () => Promise.resolve({ default: StatefulTool }) },
      createLazyComponent: lazy,
    });
    const container = document.createElement('div');
    const root = createRoot(container);

    function Parent() {
      const [revision, setRevision] = useState(0);
      const Component = tool.components.popup;

      return (
        <>
          <button type="button" data-testid="rerender" onClick={() => setRevision((value) => value + 1)}>{revision}</button>
          <Suspense fallback={<span>Loading</span>}>
            <Component />
          </Suspense>
        </>
      );
    }

    try {
      await act(async () => {
        root.render(<Parent />);
      });
      await act(async () => {});

      const toolCount = container.querySelector('[data-testid="tool-count"]');
      await act(async () => {
        toolCount.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(toolCount.textContent).toBe('1');

      await act(async () => {
        container.querySelector('[data-testid="rerender"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.querySelector('[data-testid="tool-count"]').textContent).toBe('1');
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
});
