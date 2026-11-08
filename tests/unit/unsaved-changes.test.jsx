import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { useUnsavedChanges } from '../../src/hooks/useUnsavedChanges.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const active = vi.hoisted(() => new Set());
vi.mock('../../src/api/client.js', () => ({
  setUnsavedChangesProbe: probe => { active.add(probe); return () => active.delete(probe); },
}));
let root;
afterEach(async () => { if (root) await act(async () => root.unmount()); active.clear(); });
function Editor({ dirty }) { useUnsavedChanges(dirty); return null; }
test('tracks the current editor state and unregisters it after unmount', async () => {
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Editor dirty />));
  expect([...active].some(probe => probe())).toBe(true);
  await act(async () => root.render(<Editor dirty={false} />));
  expect([...active].some(probe => probe())).toBe(false);
  await act(async () => root.unmount()); root = null;
  expect(active.size).toBe(0);
});
