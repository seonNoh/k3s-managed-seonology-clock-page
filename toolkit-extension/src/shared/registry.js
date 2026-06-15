import * as base64 from './transforms/base64';
import * as jsonT from './transforms/json';
import * as epoch from './transforms/epoch';
import * as url from './transforms/url';
import * as text from './transforms/text';

export const CATEGORIES = {
  tools: 'Dev Tools',
  infra: 'Infra / SRE',
  live:  'Live Info',
  clock: 'Clock',
};

// component: surface에서 React.lazy(loader)로 임베드. transform: context menu/단축키용 순수 함수.
export const TOOLS = [
  {
    id: 'base64',
    name: 'Base64',
    aliases: ['encode', 'decode', 'b64'],
    category: 'tools',
    icon: 'b64',
    surfaces: ['popup', 'newtab', 'context'],
    weight: 'light',
    load: () => import('../tools/Base64Tool.jsx'),
    context: [
      { id: 'b64-decode', title: 'Decode Base64', run: base64.decode },
      { id: 'b64-encode', title: 'Encode Base64', run: base64.encode },
    ],
  },
  {
    id: 'json', name: 'JSON Formatter', aliases: ['format','pretty','minify'],
    category: 'tools', icon: 'json', surfaces: ['popup','newtab','context'],
    weight: 'light', load: () => import('../tools/JsonFormatter.jsx'),
    context: [{ id: 'json-format', title: 'Format JSON', run: jsonT.format }],
  },
  { id: 'epoch', name: 'Epoch Converter', aliases: ['unix','timestamp'], category: 'tools',
    icon: 'epoch', surfaces: ['popup','newtab','context'], weight: 'light',
    load: () => import('../tools/EpochConverter.jsx'),
    context: [{ id: 'epoch-to-date', title: 'Epoch → Date', run: epoch.toDate }] },
  { id: 'regex', name: 'Regex Tester', aliases: ['regexp','pattern'], category: 'tools',
    icon: 'regex', surfaces: ['popup','newtab'], weight: 'light',
    load: () => import('../tools/RegexTester.jsx') },
  { id: 'password', name: 'Password Generator', aliases: ['pw','random'], category: 'tools',
    icon: 'pw', surfaces: ['popup','newtab'], weight: 'light',
    load: () => import('../tools/PasswordGenerator.jsx') },
  { id: 'unit', name: 'Unit Converter', aliases: ['convert'], category: 'tools',
    icon: 'unit', surfaces: ['popup','newtab'], weight: 'light',
    load: () => import('../tools/UnitConverter.jsx') },
  { id: 'cron', name: 'Cron Editor', category: 'tools', icon: 'cron',
    surfaces: ['popup','newtab'], weight: 'light', load: () => import('../tools/CronEditor.jsx') },
  { id: 'cidr', name: 'CIDR / Subnet', aliases: ['subnet','ip'], category: 'tools',
    icon: 'cidr', surfaces: ['popup','newtab'], weight: 'light',
    load: () => import('../tools/SubnetVisualizer.jsx') },
  { id: 'color', name: 'Color Picker', category: 'tools', icon: 'color',
    surfaces: ['popup','newtab'], weight: 'light', load: () => import('../tools/ColorPicker.jsx') },
  { id: 'textcount', name: 'Text Counter', category: 'tools', icon: 'text',
    surfaces: ['popup','newtab','context'], weight: 'light',
    load: () => import('../tools/TextCounter.jsx'),
    context: [{ id: 'text-count', title: 'Count chars/words', run: text.count }] },
  { id: 'markdown', name: 'Markdown Preview', category: 'tools', icon: 'md',
    surfaces: ['newtab'], weight: 'light', load: () => import('../tools/MarkdownPreview.jsx') },

  // ── Infra / SRE ──
  { id: 'rbac', name: 'RBAC Visualizer', category: 'infra', icon: 'rbac',
    surfaces: ['newtab'], weight: 'heavy', load: () => import('../tools/RbacVisualizer.jsx') },
  { id: 'terraform', name: 'Terraform Parser', category: 'infra', icon: 'tf',
    surfaces: ['newtab'], weight: 'heavy', load: () => import('../tools/TerraformParser.jsx') },
  { id: 'cicd', name: 'CI/CD Visualizer', category: 'infra', icon: 'cicd',
    surfaces: ['newtab'], weight: 'heavy', load: () => import('../tools/CiCdVisualizer.jsx') },
  { id: 'slo', name: 'SLO Calculator', category: 'infra', icon: 'slo',
    surfaces: ['popup','newtab'], weight: 'light', load: () => import('../tools/SloCalculator.jsx') },
  { id: 'gl2gh', name: 'GitLab → GitHub', category: 'infra', icon: 'gl2gh',
    surfaces: ['newtab'], weight: 'light', load: () => import('../tools/GitlabToGithub.jsx') },
  { id: 'excel2md', name: 'Excel → Markdown', category: 'infra', icon: 'xls',
    surfaces: ['popup','newtab'], weight: 'light', load: () => import('../tools/ExcelToMarkdown.jsx') },
  { id: 'archicon', name: 'Arch Icon Search', category: 'infra', icon: 'arch',
    surfaces: ['newtab'], weight: 'light', load: () => import('../tools/ArchIconSearch.jsx') },
  { id: 'mermaid', name: 'Mermaid Editor', category: 'infra', icon: 'mermaid',
    surfaces: ['newtab'], weight: 'heavy', load: () => import('../tools/MermaidEditor.jsx') },

  // ── Live Info ──
  { id: 'weather', name: 'Weather', category: 'live', icon: 'weather',
    surfaces: ['popup','newtab'], weight: 'light', net: true, load: () => import('../tools/Weather.jsx') },
  { id: 'exchange', name: 'Exchange Rate', category: 'live', icon: 'fx',
    surfaces: ['popup','newtab'], weight: 'light', net: true, load: () => import('../tools/ExchangeRate.jsx') },
  { id: 'dns', name: 'DNS Lookup', category: 'live', icon: 'dns',
    surfaces: ['popup','newtab'], weight: 'light', net: true, load: () => import('../tools/DnsLookup.jsx') },
  { id: 'iplookup', name: 'IP Lookup', category: 'live', icon: 'ip',
    surfaces: ['popup','newtab'], weight: 'light', net: true, load: () => import('../tools/IpLookup.jsx') },
  { id: 'history', name: 'Today in History', category: 'live', icon: 'history',
    surfaces: ['popup','newtab'], weight: 'light', net: true, load: () => import('../tools/TodayInHistory.jsx') },
  { id: 'speedtest', name: 'Speed Test', category: 'live', icon: 'speed',
    surfaces: ['newtab'], weight: 'light', net: true, load: () => import('../tools/SpeedTest.jsx') },

  // ── Clock ──
  { id: 'clock', name: 'Clock', category: 'clock', icon: 'clock',
    surfaces: ['newtab'], weight: 'light', load: () => import('../tools/Clock.jsx') },
];

export const byId = (id) => TOOLS.find(t => t.id === id);
export const bySurface = (s) => TOOLS.filter(t => t.surfaces.includes(s));
export const contextItems = () => TOOLS.flatMap(t => (t.context || []).map(c => ({ ...c, toolId: t.id })));
