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

export const WEB_TOOL_REGISTRY = Object.freeze(createToolRegistry({
  catalog: toolsForSurface('web'),
  loaders: WEB_TOOL_LOADERS,
}).map((tool) => Object.freeze({ ...tool, component: lazy(tool.load) })));

export const WEB_TOOL_CATALOG = WEB_TOOL_REGISTRY;

const WEB_TOOLS_BY_ID = new Map(WEB_TOOL_REGISTRY.map((tool) => [tool.id, tool]));

export function getWebTool(id) {
  return WEB_TOOLS_BY_ID.get(id) || null;
}
