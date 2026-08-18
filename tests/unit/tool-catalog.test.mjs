import test from 'node:test';
import assert from 'node:assert/strict';

import { WEB_TOOL_CATALOG, getWebTool } from '../../src/features/tool-launcher/toolRegistry.web.js';

const EXPECTED_TOOL_IDS = [
  'notes', 'chat', 'markdown', 'unit', 'base64', 'json', 'ip', 'password',
  'color', 'cron', 'subnet', 'slo', 'cicd', 'excel', 'rbac', 'terraform',
  'gl2gh', 'archicon', 'speedtest', 'regex', 'epoch', 'textcounter', 'dns',
  'mermaid', 'infra', 'repos', 'nas', 'gdrive', 'onedrive',
];

test('web tool catalog has one complete entry for every dialog tool', () => {
  assert.deepEqual(WEB_TOOL_CATALOG.map((tool) => tool.id).sort(), EXPECTED_TOOL_IDS.sort());
  assert.equal(new Set(WEB_TOOL_CATALOG.map((tool) => tool.id)).size, WEB_TOOL_CATALOG.length);

  for (const tool of WEB_TOOL_CATALOG) {
    assert.equal(typeof tool.name, 'string');
    assert.ok(tool.name.length > 0);
    assert.ok(Array.isArray(tool.aliases));
    assert.equal(typeof tool.load, 'function');
    assert.ok(tool.component);
  }
});

test('web tool lookup returns the stable registry object', () => {
  const markdown = getWebTool('markdown');
  assert.equal(markdown, WEB_TOOL_CATALOG.find((tool) => tool.id === 'markdown'));
  assert.equal(getWebTool('missing'), null);
});
