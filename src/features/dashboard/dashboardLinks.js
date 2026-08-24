export const DASHBOARD_LINK_GROUPS = Object.freeze([
  Object.freeze({
    id: 'everyday',
    index: '01',
    name: 'Everyday',
    links: Object.freeze([
      Object.freeze({ name: 'Gmail', href: 'https://mail.google.com' }),
      Object.freeze({ name: 'Papago', href: 'https://papago.naver.com' }),
      Object.freeze({ name: 'Notion', href: 'https://www.notion.so' }),
    ]),
  }),
  Object.freeze({
    id: 'intelligence',
    index: '02',
    name: 'Intelligence',
    links: Object.freeze([
      Object.freeze({ name: 'Claude', href: 'https://claude.ai' }),
      Object.freeze({ name: 'Gemini', href: 'https://gemini.google.com' }),
      Object.freeze({ name: 'YouTube', href: 'https://www.youtube.com' }),
    ]),
  }),
  Object.freeze({
    id: 'build',
    index: '03',
    name: 'Build',
    links: Object.freeze([
      Object.freeze({ name: 'VS Code', href: 'vscode://' }),
      Object.freeze({ name: 'IntelliJ', href: 'jetbrains://idea/' }),
      Object.freeze({ name: 'Kiro', href: 'kiro://' }),
      Object.freeze({ name: 'Anti Gravity', href: 'antigravity://' }),
    ]),
  }),
]);
