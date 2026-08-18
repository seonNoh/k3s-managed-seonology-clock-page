import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TOOL_CATALOG,
  createToolRegistry,
  getToolMetadata,
} from '../../packages/toolkit-core/src/catalog.js';

const VALID_SURFACES = ['web', 'popup', 'newtab', 'context'];

test('shared metadata catalog provides stable tool details without duplicate IDs', () => {
  assert.equal(getToolMetadata('markdown').name, 'Markdown Preview');
  assert.deepEqual(getToolMetadata('markdown').aliases, ['md']);
  assert.equal(new Set(TOOL_CATALOG.map((tool) => tool.id)).size, TOOL_CATALOG.length);
});

test('registry construction rejects duplicate tool IDs', () => {
  assert.throws(() => createToolRegistry({
    catalog: [
      { id: 'json', name: 'JSON Formatter', aliases: [], surfaces: ['web'] },
      { id: 'json', name: 'JSON Formatter', aliases: [], surfaces: ['web'] },
    ],
    loaders: { json: () => Promise.resolve() },
    validSurfaces: VALID_SURFACES,
  }), /duplicate tool id: json/i);
});

test('registry construction rejects incomplete tool metadata', () => {
  assert.throws(() => createToolRegistry({
    catalog: [{ id: 'json', aliases: [], surfaces: ['web'] }],
    loaders: { json: () => Promise.resolve() },
    validSurfaces: VALID_SURFACES,
  }), /invalid metadata for tool: json/i);
});

test('registry construction rejects invalid surfaces', () => {
  assert.throws(() => createToolRegistry({
    catalog: [{ id: 'json', name: 'JSON Formatter', aliases: [], surfaces: ['sidebar'] }],
    loaders: { json: () => Promise.resolve() },
    validSurfaces: VALID_SURFACES,
  }), /invalid surface: sidebar/i);
});

test('registry construction rejects metadata entries without a loader', () => {
  assert.throws(() => createToolRegistry({
    catalog: [{ id: 'json', name: 'JSON Formatter', aliases: [], surfaces: ['web'] }],
    loaders: {},
    validSurfaces: VALID_SURFACES,
  }), /missing loader for tool: json/i);
});
