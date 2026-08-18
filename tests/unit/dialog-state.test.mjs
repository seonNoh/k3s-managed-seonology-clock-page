import test from 'node:test';
import assert from 'node:assert/strict';

import {
  closeTopDialog,
  filterToolCatalog,
  openToolLauncher,
  openToolDialog,
} from '../../src/features/tool-launcher/dialog-state.js';

test('opening a tool closes the launcher and replaces the active tool', () => {
  const next = openToolDialog(
    { toolsExpanded: true, activeToolId: 'base64', activeModal: null },
    'markdown',
  );

  assert.deepEqual(next, {
    toolsExpanded: false,
    activeToolId: 'markdown',
    activeModal: null,
  });
});

test('opening the launcher closes an active tool and modal before showing the launcher', () => {
  const next = openToolLauncher({
    toolsExpanded: false,
    activeToolId: 'markdown',
    activeModal: 'services',
  });

  assert.deepEqual(next, {
    toolsExpanded: true,
    activeToolId: null,
    activeModal: null,
  });
});

test('closing the top dialog follows states that keep dialog surfaces mutually exclusive', () => {
  const launcherClosed = closeTopDialog({
    toolsExpanded: true,
    activeToolId: null,
    activeModal: null,
  });
  assert.deepEqual(launcherClosed, {
    toolsExpanded: false,
    activeToolId: null,
    activeModal: null,
  });

  const modalClosed = closeTopDialog({
    toolsExpanded: false,
    activeToolId: null,
    activeModal: 'services',
  });
  assert.deepEqual(modalClosed, {
    toolsExpanded: false,
    activeToolId: null,
    activeModal: null,
  });
});

test('tool filtering derives matches without mutating the catalog', () => {
  const tools = [
    { id: 'json', name: 'JSON Formatter', aliases: ['pretty'] },
    { id: 'markdown', name: 'Markdown Preview', aliases: ['md'] },
  ];

  assert.deepEqual(filterToolCatalog(tools, 'pretty').map((tool) => tool.id), ['json']);
  assert.deepEqual(filterToolCatalog(tools, ' MD ').map((tool) => tool.id), ['markdown']);
  assert.equal(tools.length, 2);
});
