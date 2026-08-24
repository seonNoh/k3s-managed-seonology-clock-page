// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, test } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = React;

const mountedRoots = [];

async function renderProgress(props) {
  const { default: LoadingProgress } = await import('../../src/components/LoadingProgress.jsx');
  const container = document.createElement('div');
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(<LoadingProgress {...props} />);
  });
  return container;
}

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();
    await act(async () => root.unmount());
  }
});

describe('LoadingProgress', () => {
  test('renders real determinate progress and clamps the visual value to the declared range', async () => {
    const container = await renderProgress({
      label: '인프라 상태를 동기화하는 중입니다.',
      detail: '데이터 소스 2/3 완료',
      value: 240,
      max: 300,
    });

    const progressbar = container.querySelector('[role="progressbar"]');
    expect(progressbar.getAttribute('aria-valuemin')).toBe('0');
    expect(progressbar.getAttribute('aria-valuemax')).toBe('300');
    expect(progressbar.getAttribute('aria-valuenow')).toBe('240');
    expect(container.querySelector('.loading-progress__value').textContent).toBe('80%');
    expect(container.querySelector('.loading-progress__fill').style.width).toBe('80%');
    expect(container.textContent).toContain('데이터 소스 2/3 완료');
  });

  test('does not invent a percentage when total progress is unknown', async () => {
    const container = await renderProgress({
      label: 'Google Drive 파일을 불러오는 중입니다.',
      detail: '서버 응답을 기다리고 있습니다.',
    });

    const progressbar = container.querySelector('[role="progressbar"]');
    expect(progressbar.getAttribute('aria-valuenow')).toBeNull();
    expect(progressbar.getAttribute('aria-valuetext')).toBe('진행 중');
    expect(container.querySelector('.loading-progress__value').textContent).toBe('진행 중');
    expect(container.textContent).not.toMatch(/\d+%/);
    expect(container.querySelector('.loading-progress').classList.contains('is-indeterminate')).toBe(true);
  });

  test('supports compact loading surfaces without changing the progress semantics', async () => {
    const container = await renderProgress({ label: '검색 결과를 확인하는 중입니다.', compact: true });

    expect(container.querySelector('.loading-progress').classList.contains('is-compact')).toBe(true);
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  });
});
