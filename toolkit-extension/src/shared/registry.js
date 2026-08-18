import { TOOL_CATALOG, createToolRegistry } from '@seonology/toolkit-core/catalog';
import * as base64 from './transforms/base64';
import * as jsonT from './transforms/json';
import * as epoch from './transforms/epoch';
import * as text from './transforms/text';

export const CATEGORIES = {
  tools: 'Dev Tools',
  infra: 'Infra / SRE',
  live: 'Live Info',
  clock: 'Clock',
};

const EXTENSION_TOOL_LOADERS = {
  base64: () => import('../tools/Base64Tool.jsx'),
  json: () => import('../tools/JsonFormatter.jsx'),
  epoch: () => import('../tools/EpochConverter.jsx'),
  regex: () => import('../tools/RegexTester.jsx'),
  password: () => import('../tools/PasswordGenerator.jsx'),
  unit: () => import('../tools/UnitConverter.jsx'),
  cron: () => import('../tools/CronEditor.jsx'),
  cidr: () => import('../tools/SubnetVisualizer.jsx'),
  color: () => import('../tools/ColorPicker.jsx'),
  textcount: () => import('../tools/TextCounter.jsx'),
  markdown: () => import('../tools/MarkdownPreview.jsx'),
  rbac: () => import('../tools/RbacVisualizer.jsx'),
  terraform: () => import('../tools/TerraformParser.jsx'),
  cicd: () => import('../tools/CiCdVisualizer.jsx'),
  slo: () => import('../tools/SloCalculator.jsx'),
  gl2gh: () => import('../tools/GitlabToGithub.jsx'),
  excel2md: () => import('../tools/ExcelToMarkdown.jsx'),
  archicon: () => import('../tools/ArchIconSearch.jsx'),
  mermaid: () => import('../tools/MermaidEditor.jsx'),
  weather: () => import('../tools/Weather.jsx'),
  exchange: () => import('../tools/ExchangeRate.jsx'),
  dns: () => import('../tools/DnsLookup.jsx'),
  iplookup: () => import('../tools/IpLookup.jsx'),
  history: () => import('../tools/TodayInHistory.jsx'),
  speedtest: () => import('../tools/SpeedTest.jsx'),
  clock: () => import('../tools/Clock.jsx'),
};

const CONTEXT_ACTIONS = {
  base64: [
    { id: 'b64-decode', title: 'Decode Base64', run: base64.decode },
    { id: 'b64-encode', title: 'Encode Base64', run: base64.encode },
  ],
  json: [{ id: 'json-format', title: 'Format JSON', run: jsonT.format }],
  epoch: [{ id: 'epoch-to-date', title: 'Epoch → Date', run: epoch.toDate }],
  textcount: [{ id: 'text-count', title: 'Count chars/words', run: text.count }],
};

const EXTENSION_CATALOG = TOOL_CATALOG.filter((tool) => tool.surfaces.some((surface) => surface !== 'web'));

export const TOOLS = Object.freeze(createToolRegistry({
  catalog: EXTENSION_CATALOG,
  loaders: EXTENSION_TOOL_LOADERS,
}).map((tool) => Object.freeze({
  ...tool,
  context: CONTEXT_ACTIONS[tool.id] || [],
})));

export const byId = (id) => TOOLS.find((tool) => tool.id === id);
export const bySurface = (surface) => TOOLS.filter((tool) => tool.surfaces.includes(surface));
export const contextItems = () => TOOLS.flatMap((tool) => tool.context.map((action) => ({ ...action, toolId: tool.id })));
