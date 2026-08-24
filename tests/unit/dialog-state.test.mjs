import test from 'node:test';
import assert from 'node:assert/strict';

import {
  closeTopDialog,
  filterToolCatalog,
  openTool,
  openToolLauncher,
  openToolDialog,
} from '../../src/features/tool-launcher/dialog-state.js';

test('opening a tool records where Escape should return', () => {
  const next = openTool(
    { toolsExpanded: true, activeToolId: 'base64', activeModal: null, toolReturnTarget: null },
    'markdown',
    'launcher',
  );

  assert.deepEqual(next, {
    toolsExpanded: false,
    activeToolId: 'markdown',
    activeModal: null,
    toolReturnTarget: 'launcher',
  });
  assert.equal(openToolDialog, openTool);
});

test('opening the launcher closes an active tool and modal before showing the launcher', () => {
  const next = openToolLauncher({
    toolsExpanded: false,
    activeToolId: 'markdown',
    activeModal: 'services',
    toolReturnTarget: 'dashboard',
  });

  assert.deepEqual(next, {
    toolsExpanded: true,
    activeToolId: null,
    activeModal: null,
    toolReturnTarget: null,
  });
});

test('Escape from a launcher tool returns to the launcher before the dashboard', () => {
  const launcherRestored = closeTopDialog({
    toolsExpanded: false,
    activeToolId: 'markdown',
    activeModal: null,
    toolReturnTarget: 'launcher',
  });
  assert.deepEqual(launcherRestored, {
    toolsExpanded: true,
    activeToolId: null,
    activeModal: null,
    toolReturnTarget: null,
  });

  const launcherClosed = closeTopDialog(launcherRestored);
  assert.deepEqual(launcherClosed, {
    toolsExpanded: false,
    activeToolId: null,
    activeModal: null,
    toolReturnTarget: null,
  });
});

test('Escape from a directly opened tool returns to the dashboard', () => {
  const toolClosed = closeTopDialog({
    toolsExpanded: false,
    activeToolId: 'infra',
    activeModal: null,
    toolReturnTarget: 'dashboard',
  });
  assert.deepEqual(toolClosed, {
    toolsExpanded: false,
    activeToolId: null,
    activeModal: null,
    toolReturnTarget: null,
  });
});

test('closing the top dialog keeps non-tool surfaces mutually exclusive', () => {
  const launcherClosed = closeTopDialog({
    toolsExpanded: true,
    activeToolId: null,
    activeModal: null,
    toolReturnTarget: null,
  });
  assert.deepEqual(launcherClosed, {
    toolsExpanded: false,
    activeToolId: null,
    activeModal: null,
    toolReturnTarget: null,
  });

  const modalClosed = closeTopDialog({
    toolsExpanded: false,
    activeToolId: null,
    activeModal: 'services',
    toolReturnTarget: null,
  });
  assert.deepEqual(modalClosed, {
    toolsExpanded: false,
    activeToolId: null,
    activeModal: null,
    toolReturnTarget: null,
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
