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

test('registry construction rejects missing or empty surface metadata', () => {
  const loaders = { json: () => Promise.resolve() };

  assert.throws(() => createToolRegistry({
    catalog: [{ id: 'json', name: 'JSON Formatter', aliases: [] }],
    loaders,
    validSurfaces: VALID_SURFACES,
  }), /invalid surfaces for tool: json/i);
  assert.throws(() => createToolRegistry({
    catalog: [{ id: 'json', name: 'JSON Formatter', aliases: [], surfaces: [] }],
    loaders,
    validSurfaces: VALID_SURFACES,
  }), /invalid surfaces for tool: json/i);
});

test('registry construction rejects non-array or duplicate surfaces', () => {
  const loaders = { json: () => Promise.resolve() };

  assert.throws(() => createToolRegistry({
    catalog: [{ id: 'json', name: 'JSON Formatter', aliases: [], surfaces: 'web' }],
    loaders,
    validSurfaces: VALID_SURFACES,
  }), /invalid surfaces for tool: json/i);
  assert.throws(() => createToolRegistry({
    catalog: [{ id: 'json', name: 'JSON Formatter', aliases: [], surfaces: ['web', 'web'] }],
    loaders,
    validSurfaces: VALID_SURFACES,
  }), /duplicate surface: web/i);
});

test('registry construction rejects metadata entries without a loader', () => {
  assert.throws(() => createToolRegistry({
    catalog: [{ id: 'json', name: 'JSON Formatter', aliases: [], surfaces: ['web'] }],
    loaders: {},
    validSurfaces: VALID_SURFACES,
  }), /missing loader for tool: json/i);
});

test('registry creates one stable lazy component for each tool surface', () => {
  const createdComponents = [];
  const createLazyComponent = (load) => {
    const component = { load };
    createdComponents.push(component);
    return component;
  };
  const loaders = { json: () => Promise.resolve() };
  const [tool] = createToolRegistry({
    catalog: [{ id: 'json', name: 'JSON Formatter', aliases: [], surfaces: ['popup', 'newtab'] }],
    loaders,
    validSurfaces: VALID_SURFACES,
    createLazyComponent,
  });

  assert.equal(createdComponents.length, 2);
  assert.equal(tool.components.popup, createdComponents[0]);
  assert.equal(tool.components.newtab, createdComponents[1]);
  assert.equal(tool.components.popup, tool.components.popup);
  assert.equal(tool.components.newtab, tool.components.newtab);
  assert.ok(Object.isFrozen(tool.components));
});
