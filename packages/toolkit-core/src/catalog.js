export const TOOL_SURFACES = Object.freeze(['web', 'popup', 'newtab', 'context']);

const freezeTool = (tool) => Object.freeze({
  ...tool,
  aliases: Object.freeze([...(tool.aliases || [])]),
  surfaces: Object.freeze([...tool.surfaces]),
});

export const TOOL_CATALOG = Object.freeze([
  freezeTool({ id: 'notes', name: 'Notes', aliases: ['memo'], surfaces: ['web'] }),
  freezeTool({ id: 'chat', name: 'AI Chat', aliases: ['assistant'], surfaces: ['web'] }),
  freezeTool({ id: 'markdown', name: 'Markdown Preview', aliases: ['md'], category: 'tools', icon: 'md', weight: 'light', surfaces: ['web', 'newtab'] }),
  freezeTool({ id: 'unit', name: 'Unit Converter', aliases: ['convert'], category: 'tools', icon: 'unit', weight: 'light', surfaces: ['web', 'popup', 'newtab'] }),
  freezeTool({ id: 'base64', name: 'Base64', aliases: ['encode', 'decode', 'b64'], category: 'tools', icon: 'b64', weight: 'light', surfaces: ['web', 'popup', 'newtab', 'context'] }),
  freezeTool({ id: 'json', name: 'JSON Formatter', aliases: ['format', 'pretty', 'minify'], category: 'tools', icon: 'json', weight: 'light', surfaces: ['web', 'popup', 'newtab', 'context'] }),
  freezeTool({ id: 'ip', name: 'IP Lookup', aliases: ['network'], surfaces: ['web'] }),
  freezeTool({ id: 'password', name: 'Password Generator', aliases: ['pw', 'random'], category: 'tools', icon: 'pw', weight: 'light', surfaces: ['web', 'popup', 'newtab'] }),
  freezeTool({ id: 'color', name: 'Color Picker', aliases: ['hex', 'rgb'], category: 'tools', icon: 'color', weight: 'light', surfaces: ['web', 'popup', 'newtab'] }),
  freezeTool({ id: 'cron', name: 'Cron Editor', aliases: ['schedule'], category: 'tools', icon: 'cron', weight: 'light', surfaces: ['web', 'popup', 'newtab'] }),
  freezeTool({ id: 'subnet', name: 'CIDR / Subnet', aliases: ['cidr'], surfaces: ['web'] }),
  freezeTool({ id: 'slo', name: 'SLO / SLI Calculator', aliases: ['sli'], category: 'infra', icon: 'slo', weight: 'light', surfaces: ['web', 'popup', 'newtab'] }),
  freezeTool({ id: 'cicd', name: 'CI/CD Visualizer', aliases: ['pipeline'], category: 'infra', icon: 'cicd', weight: 'heavy', surfaces: ['web', 'newtab'] }),
  freezeTool({ id: 'excel', name: 'Excel to Markdown', aliases: ['xlsx', 'table'], surfaces: ['web'] }),
  freezeTool({ id: 'rbac', name: 'RBAC Visualizer', aliases: ['role'], category: 'infra', icon: 'rbac', weight: 'heavy', surfaces: ['web', 'newtab'] }),
  freezeTool({ id: 'terraform', name: 'Terraform Parser', aliases: ['tf', 'state'], category: 'infra', icon: 'tf', weight: 'heavy', surfaces: ['web', 'newtab'] }),
  freezeTool({ id: 'gl2gh', name: 'GitLab to GitHub', aliases: ['actions', 'pipeline'], category: 'infra', icon: 'gl2gh', weight: 'light', surfaces: ['web', 'newtab'] }),
  freezeTool({ id: 'archicon', name: 'Architecture Icon Search', aliases: ['icon'], category: 'infra', icon: 'arch', weight: 'light', surfaces: ['web', 'newtab'] }),
  freezeTool({ id: 'speedtest', name: 'Speed Test', aliases: ['network'], category: 'live', icon: 'speed', weight: 'light', net: true, surfaces: ['web', 'newtab'] }),
  freezeTool({ id: 'regex', name: 'Regex Tester', aliases: ['regexp', 'pattern'], category: 'tools', icon: 'regex', weight: 'light', surfaces: ['web', 'popup', 'newtab'] }),
  freezeTool({ id: 'epoch', name: 'Epoch Converter', aliases: ['unix', 'timestamp'], category: 'tools', icon: 'epoch', weight: 'light', surfaces: ['web', 'popup', 'newtab', 'context'] }),
  freezeTool({ id: 'textcounter', name: 'Text Counter', aliases: ['words', 'characters'], surfaces: ['web'] }),
  freezeTool({ id: 'dns', name: 'DNS Lookup', aliases: ['domain'], category: 'live', icon: 'dns', weight: 'light', net: true, surfaces: ['web', 'popup', 'newtab'] }),
  freezeTool({ id: 'mermaid', name: 'Mermaid Editor', aliases: ['diagram'], category: 'infra', icon: 'mermaid', weight: 'heavy', surfaces: ['web', 'newtab'] }),
  freezeTool({ id: 'infra', name: 'Infrastructure Dashboard', aliases: ['kubernetes', 'cluster'], surfaces: ['web'] }),
  freezeTool({ id: 'repos', name: 'Repository Catalog', aliases: ['github', 'gitlab'], surfaces: ['web'] }),
  freezeTool({ id: 'nas', name: 'NAS Browser', aliases: ['files', 'storage'], surfaces: ['web'] }),
  freezeTool({ id: 'gdrive', name: 'Google Drive', aliases: ['cloud', 'files'], props: { provider: 'gdrive' }, surfaces: ['web'] }),
  freezeTool({ id: 'onedrive', name: 'OneDrive', aliases: ['cloud', 'files'], props: { provider: 'onedrive' }, surfaces: ['web'] }),
  freezeTool({ id: 'cidr', name: 'CIDR / Subnet', aliases: ['subnet', 'ip'], category: 'tools', icon: 'cidr', weight: 'light', surfaces: ['popup', 'newtab'] }),
  freezeTool({ id: 'textcount', name: 'Text Counter', aliases: [], category: 'tools', icon: 'text', weight: 'light', surfaces: ['popup', 'newtab', 'context'] }),
  freezeTool({ id: 'excel2md', name: 'Excel → Markdown', aliases: [], category: 'infra', icon: 'xls', weight: 'light', surfaces: ['popup', 'newtab'] }),
  freezeTool({ id: 'weather', name: 'Weather', aliases: [], category: 'live', icon: 'weather', weight: 'light', net: true, surfaces: ['popup', 'newtab'] }),
  freezeTool({ id: 'exchange', name: 'Exchange Rate', aliases: [], category: 'live', icon: 'fx', weight: 'light', net: true, surfaces: ['popup', 'newtab'] }),
  freezeTool({ id: 'iplookup', name: 'IP Lookup', aliases: [], category: 'live', icon: 'ip', weight: 'light', net: true, surfaces: ['popup', 'newtab'] }),
  freezeTool({ id: 'history', name: 'Today in History', aliases: [], category: 'live', icon: 'history', weight: 'light', net: true, surfaces: ['popup', 'newtab'] }),
  freezeTool({ id: 'clock', name: 'Clock', aliases: [], category: 'clock', icon: 'clock', weight: 'light', surfaces: ['newtab'] }),
]);

const TOOLS_BY_ID = new Map(TOOL_CATALOG.map((tool) => [tool.id, tool]));

export function getToolMetadata(id) {
  return TOOLS_BY_ID.get(id) || null;
}

export function toolsForSurface(surface) {
  return TOOL_CATALOG.filter((tool) => tool.surfaces.includes(surface));
}

export function createToolRegistry({ catalog, loaders, validSurfaces = TOOL_SURFACES, createLazyComponent }) {
  const seenIds = new Set();
  const allowedSurfaces = new Set(validSurfaces);

  return Object.freeze(catalog.map((tool) => {
    if (!tool?.id || seenIds.has(tool.id)) throw new Error(`Duplicate tool id: ${tool?.id}`);
    seenIds.add(tool.id);
    if (typeof tool.name !== 'string' || !tool.name.trim() || !Array.isArray(tool.aliases)) {
      throw new Error(`Invalid metadata for tool: ${tool.id}`);
    }
    if (!Array.isArray(tool.surfaces) || tool.surfaces.length === 0) {
      throw new Error(`Invalid surfaces for tool: ${tool.id}`);
    }
    const seenSurfaces = new Set();
    for (const surface of tool.surfaces) {
      if (seenSurfaces.has(surface)) {
        throw new Error(`Duplicate surface: ${surface}`);
      }
      seenSurfaces.add(surface);
      if (!allowedSurfaces.has(surface)) throw new Error(`Invalid surface: ${surface}`);
    }
    const load = loaders[tool.id];
    if (typeof load !== 'function') throw new Error(`Missing loader for tool: ${tool.id}`);
    const components = typeof createLazyComponent === 'function'
      ? Object.freeze(Object.fromEntries(tool.surfaces.map((surface) => [surface, createLazyComponent(load)])))
      : null;
    return Object.freeze({
      ...tool,
      load,
      ...(components ? { components } : {}),
    });
  }));
}
