import { lazy } from 'react';

function defineTool({ load, ...metadata }) {
  return Object.freeze({
    ...metadata,
    load,
    component: lazy(load),
  });
}

export const WEB_TOOL_CATALOG = Object.freeze([
  defineTool({ id: 'notes', name: 'Notes', aliases: ['memo'], load: () => import('../../components/NotesPanel.jsx') }),
  defineTool({ id: 'chat', name: 'AI Chat', aliases: ['assistant'], load: () => import('../../components/ChatPanel.jsx') }),
  defineTool({ id: 'markdown', name: 'Markdown Preview', aliases: ['md'], load: () => import('../../components/MarkdownPreview.jsx') }),
  defineTool({ id: 'unit', name: 'Unit Converter', aliases: ['convert'], load: () => import('../../components/UnitConverter.jsx') }),
  defineTool({ id: 'base64', name: 'Base64', aliases: ['encode', 'decode', 'b64'], load: () => import('../../components/Base64Tool.jsx') }),
  defineTool({ id: 'json', name: 'JSON Formatter', aliases: ['pretty', 'minify'], load: () => import('../../components/JsonFormatter.jsx') }),
  defineTool({ id: 'ip', name: 'IP Lookup', aliases: ['network'], load: () => import('../../components/IpLookup.jsx') }),
  defineTool({ id: 'password', name: 'Password Generator', aliases: ['pw', 'random'], load: () => import('../../components/PasswordGenerator.jsx') }),
  defineTool({ id: 'color', name: 'Color Picker', aliases: ['hex', 'rgb'], load: () => import('../../components/ColorPicker.jsx') }),
  defineTool({ id: 'cron', name: 'Cron Editor', aliases: ['schedule'], load: () => import('../../components/CronEditor.jsx') }),
  defineTool({ id: 'subnet', name: 'CIDR / Subnet', aliases: ['cidr'], load: () => import('../../components/SubnetVisualizer.jsx') }),
  defineTool({ id: 'slo', name: 'SLO / SLI Calculator', aliases: ['sli'], load: () => import('../../components/SloCalculator.jsx') }),
  defineTool({ id: 'cicd', name: 'CI/CD Visualizer', aliases: ['pipeline'], load: () => import('../../components/CiCdVisualizer.jsx') }),
  defineTool({ id: 'excel', name: 'Excel to Markdown', aliases: ['xlsx', 'table'], load: () => import('../../components/ExcelToMarkdown.jsx') }),
  defineTool({ id: 'rbac', name: 'RBAC Visualizer', aliases: ['role'], load: () => import('../../components/RbacVisualizer.jsx') }),
  defineTool({ id: 'terraform', name: 'Terraform Parser', aliases: ['tf', 'state'], load: () => import('../../components/TerraformParser.jsx') }),
  defineTool({ id: 'gl2gh', name: 'GitLab to GitHub', aliases: ['actions', 'pipeline'], load: () => import('../../components/GitlabToGithub.jsx') }),
  defineTool({ id: 'archicon', name: 'Architecture Icon Search', aliases: ['icon'], load: () => import('../../components/ArchIconSearch.jsx') }),
  defineTool({ id: 'speedtest', name: 'Speed Test', aliases: ['network'], load: () => import('../../components/SpeedTest.jsx') }),
  defineTool({ id: 'regex', name: 'Regex Tester', aliases: ['regexp', 'pattern'], load: () => import('../../components/RegexTester.jsx') }),
  defineTool({ id: 'epoch', name: 'Epoch Converter', aliases: ['unix', 'timestamp'], load: () => import('../../components/EpochConverter.jsx') }),
  defineTool({ id: 'textcounter', name: 'Text Counter', aliases: ['words', 'characters'], load: () => import('../../components/TextCounter.jsx') }),
  defineTool({ id: 'dns', name: 'DNS Lookup', aliases: ['domain'], load: () => import('../../components/DnsLookup.jsx') }),
  defineTool({ id: 'mermaid', name: 'Mermaid Editor', aliases: ['diagram'], load: () => import('../../components/MermaidEditor.jsx') }),
  defineTool({ id: 'infra', name: 'Infrastructure Dashboard', aliases: ['kubernetes', 'cluster'], load: () => import('../../components/InfraDashboard.jsx') }),
  defineTool({ id: 'repos', name: 'Repository Catalog', aliases: ['github', 'gitlab'], load: () => import('../../components/RepoCatalog.jsx') }),
  defineTool({ id: 'nas', name: 'NAS Browser', aliases: ['files', 'storage'], load: () => import('../../components/NasBrowser.jsx') }),
  defineTool({ id: 'gdrive', name: 'Google Drive', aliases: ['cloud', 'files'], props: { provider: 'gdrive' }, load: () => import('../../components/CloudBrowser.jsx') }),
  defineTool({ id: 'onedrive', name: 'OneDrive', aliases: ['cloud', 'files'], props: { provider: 'onedrive' }, load: () => import('../../components/CloudBrowser.jsx') }),
]);

const WEB_TOOLS_BY_ID = new Map(WEB_TOOL_CATALOG.map((tool) => [tool.id, tool]));

export function getWebTool(id) {
  return WEB_TOOLS_BY_ID.get(id) || null;
}
