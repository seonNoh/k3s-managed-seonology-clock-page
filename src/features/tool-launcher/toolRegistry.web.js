import { lazy } from 'react';
import { createToolRegistry, toolsForSurface } from '@seonology/toolkit-core/catalog';

const WEB_TOOL_LOADERS = {
  notes: () => import('../../components/NotesPanel.jsx'),
  chat: () => import('../../components/ChatPanel.jsx'),
  markdown: () => import('../../components/MarkdownPreview.jsx'),
  unit: () => import('../../components/UnitConverter.jsx'),
  base64: () => import('../../components/Base64Tool.jsx'),
  json: () => import('../../components/JsonFormatter.jsx'),
  ip: () => import('../../components/IpLookup.jsx'),
  password: () => import('../../components/PasswordGenerator.jsx'),
  color: () => import('../../components/ColorPicker.jsx'),
  cron: () => import('../../components/CronEditor.jsx'),
  subnet: () => import('../../components/SubnetVisualizer.jsx'),
  slo: () => import('../../components/SloCalculator.jsx'),
  cicd: () => import('../../components/CiCdVisualizer.jsx'),
  excel: () => import('../../components/ExcelToMarkdown.jsx'),
  rbac: () => import('../../components/RbacVisualizer.jsx'),
  terraform: () => import('../../components/TerraformParser.jsx'),
  gl2gh: () => import('../../components/GitlabToGithub.jsx'),
  archicon: () => import('../../components/ArchIconSearch.jsx'),
  speedtest: () => import('../../components/SpeedTest.jsx'),
  regex: () => import('../../components/RegexTester.jsx'),
  epoch: () => import('../../components/EpochConverter.jsx'),
  textcounter: () => import('../../components/TextCounter.jsx'),
  dns: () => import('../../components/DnsLookup.jsx'),
  mermaid: () => import('../../components/MermaidEditor.jsx'),
  infra: () => import('../../components/InfraDashboard.jsx'),
  repos: () => import('../../components/RepoCatalog.jsx'),
  nas: () => import('../../components/NasBrowser.jsx'),
  gdrive: () => import('../../components/CloudBrowser.jsx'),
  onedrive: () => import('../../components/CloudBrowser.jsx'),
};

const WEB_TOOL_MODULES = new Map();
const WEB_TOOL_PROMISES = new Map();

function loadWebToolModule(id) {
  const loader = WEB_TOOL_LOADERS[id];
  if (!loader) return Promise.reject(new Error(`Unknown web tool: ${id}`));
  if (WEB_TOOL_MODULES.has(id)) return Promise.resolve(WEB_TOOL_MODULES.get(id));
  if (WEB_TOOL_PROMISES.has(id)) return WEB_TOOL_PROMISES.get(id);

  const promise = loader()
    .then((module) => {
      WEB_TOOL_MODULES.set(id, module);
      return module;
    })
    .catch((error) => {
      WEB_TOOL_PROMISES.delete(id);
      throw error;
    });
  WEB_TOOL_PROMISES.set(id, promise);
  return promise;
}

const CACHED_WEB_TOOL_LOADERS = Object.freeze(Object.fromEntries(
  Object.keys(WEB_TOOL_LOADERS).map((id) => [id, () => loadWebToolModule(id)]),
));

export const WEB_TOOL_REGISTRY = Object.freeze(createToolRegistry({
  catalog: toolsForSurface('web'),
  loaders: CACHED_WEB_TOOL_LOADERS,
}).map((tool) => Object.freeze({ ...tool, component: lazy(tool.load) })));

export const WEB_TOOL_CATALOG = WEB_TOOL_REGISTRY;

const WEB_TOOLS_BY_ID = new Map(WEB_TOOL_REGISTRY.map((tool) => [tool.id, tool]));

export function getWebTool(id) {
  return WEB_TOOLS_BY_ID.get(id) || null;
}

export function preloadWebTool(id) {
  return loadWebToolModule(id);
}

export function getLoadedWebToolComponent(id) {
  return WEB_TOOL_MODULES.get(id)?.default ?? null;
}
