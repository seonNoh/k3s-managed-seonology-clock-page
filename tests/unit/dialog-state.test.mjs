import test from 'node:test';
import assert from 'node:assert/strict';

import {
  closeTopDialog,
  filterToolCatalog,
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

test('closing the top dialog closes one surface in priority order', () => {
  const toolClosed = closeTopDialog({
    toolsExpanded: true,
    activeToolId: 'markdown',
    activeModal: 'services',
  });
  assert.deepEqual(toolClosed, {
    toolsExpanded: true,
    activeToolId: null,
    activeModal: 'services',
  });

  const launcherClosed = closeTopDialog(toolClosed);
  assert.deepEqual(launcherClosed, {
    toolsExpanded: false,
    activeToolId: null,
    activeModal: 'services',
  });

  const modalClosed = closeTopDialog(launcherClosed);
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
