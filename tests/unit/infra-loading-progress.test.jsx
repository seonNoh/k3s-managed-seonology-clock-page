// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';

import InfraDashboard from '../../src/components/InfraDashboard.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = React;

function deferredResponse(data) {
  let resolve;
  const promise = new Promise((done) => {
    resolve = () => done({ ok: true, json: async () => data });
  });
  return { promise, resolve };
}

describe('InfraDashboard loading progress', () => {
  let root;
  let container;

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    if (root) await act(async () => root.unmount());
    root = undefined;
    container = undefined;
  });

  test('reports completion across the three infrastructure data sources', async () => {
    vi.useFakeTimers();
    const pending = {
      '/api/infra/cluster': deferredResponse({ nodes: [], totalPods: 0, namespaces: {} }),
      '/api/infra/tailscale': deferredResponse({ devices: [] }),
      '/api/infra/nas': deferredResponse({
        cpu: {}, memory: {}, volumes: [], disks: [], network: [], connections: [],
      }),
    };
    vi.stubGlobal('fetch', vi.fn((url) => pending[new URL(url, 'https://clock.seonology.com').pathname].promise));
    container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root.render(<InfraDashboard isOpen onClose={() => {}} />);
    });

    const progressValue = () => container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow');
    expect(progressValue()).toBe('0');
    expect(container.textContent).toContain('데이터 소스 0/3 완료');

    await act(async () => pending['/api/infra/cluster'].resolve());
    expect(progressValue()).toBe('1');
    expect(container.querySelector('.loading-progress__value').textContent).toBe('33%');

    await act(async () => pending['/api/infra/tailscale'].resolve());
    expect(progressValue()).toBe('2');
    expect(container.querySelector('.loading-progress__value').textContent).toBe('67%');

    await act(async () => pending['/api/infra/nas'].resolve());
    expect(progressValue()).toBe('3');
    expect(container.querySelector('.loading-progress__value').textContent).toBe('100%');

    await act(async () => vi.advanceTimersByTime(500));
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
});
