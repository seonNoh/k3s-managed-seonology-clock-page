import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import './RbacVisualizer.css';

/* ═══════════════════════════════════════════════
   K8s RBAC sample YAML
   ═══════════════════════════════════════════════ */

const SAMPLE_YAML = `# ── Roles ──
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: cluster-admin-role
rules:
  - apiGroups: ["*"]
    resources: ["*"]
    verbs: ["*"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: read-only
rules:
  - apiGroups: [""]
    resources: ["pods", "services", "configmaps"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments", "replicasets"]
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: dev-role
  namespace: development
rules:
  - apiGroups: ["", "apps"]
    resources: ["pods", "deployments", "services"]
    verbs: ["get", "list", "create", "update", "delete"]
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: log-reader
  namespace: monitoring
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/log"]
    verbs: ["get", "list"]
---
# ── Bindings ──
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: admin-binding
subjects:
  - kind: User
    name: alice
    apiGroup: rbac.authorization.k8s.io
  - kind: Group
    name: platform-team
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: cluster-admin-role
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: readonly-binding
subjects:
  - kind: User
    name: bob
    apiGroup: rbac.authorization.k8s.io
  - kind: ServiceAccount
    name: monitoring-sa
    namespace: monitoring
roleRef:
  kind: ClusterRole
  name: read-only
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: dev-binding
  namespace: development
subjects:
  - kind: User
    name: charlie
    apiGroup: rbac.authorization.k8s.io
  - kind: Group
    name: dev-team
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: dev-role
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: log-reader-binding
  namespace: monitoring
subjects:
  - kind: ServiceAccount
    name: monitoring-sa
    namespace: monitoring
roleRef:
  kind: Role
  name: log-reader
  apiGroup: rbac.authorization.k8s.io`;

/* ═══════════════════════════════════════════════
   Minimal YAML parser for K8s RBAC
   ═══════════════════════════════════════════════ */

function parseRbacYaml(text) {
  const docs = text.split(/^---$/m).filter(d => d.trim());
  const roles = [];       // Role / ClusterRole
  const bindings = [];    // RoleBinding / ClusterRoleBinding

  for (const doc of docs) {
    const obj = miniYamlParse(doc);
    if (!obj || !obj.kind) continue;

    if (obj.kind === 'Role' || obj.kind === 'ClusterRole') {
      roles.push({
        kind: obj.kind,
        name: obj.metadata?.name || 'unnamed',
        namespace: obj.metadata?.namespace || '',
        rules: (obj.rules || []).map(r => ({
          apiGroups: toArr(r.apiGroups),
          resources: toArr(r.resources),
          verbs: toArr(r.verbs),
        })),
      });
    }

    if (obj.kind === 'RoleBinding' || obj.kind === 'ClusterRoleBinding') {
      bindings.push({
        kind: obj.kind,
        name: obj.metadata?.name || 'unnamed',
        namespace: obj.metadata?.namespace || '',
        subjects: (obj.subjects || []).map(s => ({
          kind: s.kind || 'User',
          name: s.name || '',
          namespace: s.namespace || '',
        })),
        roleRef: {
          kind: obj.roleRef?.kind || '',
          name: obj.roleRef?.name || '',
        },
      });
    }
  }

  return { roles, bindings };
}

function toArr(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return [v];
  return [];
}

/* Minimal YAML → JS object (handles the K8s RBAC subset) */
function miniYamlParse(text) {
  const lines = text.split('\n');
  const root = {};
  const stack = [{ indent: -1, obj: root, key: null }];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue;
    const indent = raw.search(/\S/);
    const trimmed = raw.trim();

    // pop stack
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];

    // array item
    if (trimmed.startsWith('- ')) {
      const content = trimmed.slice(2).trim();
      let target = parent.obj;
      if (parent.key && !Array.isArray(parent.obj[parent.key])) {
        parent.obj[parent.key] = [];
      }
      if (parent.key) target = parent.obj[parent.key];

      if (content.includes(':')) {
        const item = {};
        const [k, ...rest] = content.split(':');
        const val = rest.join(':').trim().replace(/^["']|["']$/g, '');
        item[k.trim()] = val;
        if (Array.isArray(target)) target.push(item);
        stack.push({ indent, obj: item, key: null });
      } else {
        const val = content.replace(/^["']|["']$/g, '');
        if (Array.isArray(target)) target.push(val);
      }
      continue;
    }

    // key: value
    if (trimmed.includes(':')) {
      const colonIdx = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIdx).trim();
      const valRaw = trimmed.slice(colonIdx + 1).trim();

      let target = parent.obj;
      if (Array.isArray(target) && target.length > 0) {
        target = target[target.length - 1];
      }

      if (valRaw === '' || valRaw === '|' || valRaw === '>') {
        // nested object or will be array
        target[key] = {};
        stack.push({ indent, obj: target, key });
      } else if (valRaw.startsWith('[') && valRaw.endsWith(']')) {
        // inline array
        target[key] = valRaw.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      } else if (valRaw.startsWith('"') || valRaw.startsWith("'")) {
        target[key] = valRaw.replace(/^["']|["']$/g, '');
      } else {
        target[key] = valRaw;
      }
    }
  }

  return root;
}

/* ═══════════════════════════════════════════════
   Build graph model
   ═══════════════════════════════════════════════ */

function buildGraph(roles, bindings) {
  const nodes = [];
  const edges = [];
  const nodeMap = {};

  const addNode = (id, type, label, extra = {}) => {
    if (nodeMap[id]) return;
    const node = { id, type, label, ...extra };
    nodes.push(node);
    nodeMap[id] = node;
  };

  // Add role nodes
  roles.forEach(r => {
    const id = `role:${r.kind}:${r.name}`;
    addNode(id, r.kind === 'ClusterRole' ? 'clusterrole' : 'role', r.name, {
      namespace: r.namespace,
      rules: r.rules,
    });
  });

  // Add binding → subjects + edges
  bindings.forEach(b => {
    const roleId = `role:${b.roleRef.kind}:${b.roleRef.name}`;

    // Ensure role node exists (even if not defined)
    if (!nodeMap[roleId]) {
      addNode(roleId, b.roleRef.kind === 'ClusterRole' ? 'clusterrole' : 'role', b.roleRef.name, {
        namespace: '',
        rules: [],
        missing: true,
      });
    }

    const bindingId = `binding:${b.kind}:${b.name}`;
    addNode(bindingId, b.kind === 'ClusterRoleBinding' ? 'clusterrolebinding' : 'rolebinding', b.name, {
      namespace: b.namespace,
    });

    // edge: binding → role
    edges.push({ from: bindingId, to: roleId, type: 'binds' });

    // subjects
    b.subjects.forEach(s => {
      const subjectId = `subject:${s.kind}:${s.name}${s.namespace ? ':' + s.namespace : ''}`;
      addNode(subjectId, s.kind.toLowerCase(), s.name, { namespace: s.namespace });

      // edge: subject → binding
      edges.push({ from: subjectId, to: bindingId, type: 'bound-by' });
    });
  });

  return { nodes, edges };
}

/* ═══════════════════════════════════════════════
   Layout engine – layered left to right
   ═══════════════════════════════════════════════ */

function layoutGraph(nodes, edges) {
  // Layers: subjects → bindings → roles
  const typeLayer = {
    user: 0, group: 0, serviceaccount: 0,
    rolebinding: 1, clusterrolebinding: 1,
    role: 2, clusterrole: 2,
  };

  const layers = [[], [], []];
  nodes.forEach(n => {
    const l = typeLayer[n.type] ?? 0;
    layers[l].push(n.id);
  });

  const NODE_W = 180;
  const NODE_H = 52;
  const LAYER_GAP = 140;
  const NODE_GAP = 16;

  const positions = {};
  layers.forEach((layer, li) => {
    const totalH = layer.length * (NODE_H + NODE_GAP) - NODE_GAP;
    const startY = Math.max(30, (Math.max(1, ...layers.map(l => l.length)) * (NODE_H + NODE_GAP)) / 2 - totalH / 2 + 30);
    layer.forEach((id, ni) => {
      positions[id] = {
        x: li * (NODE_W + LAYER_GAP) + 40,
        y: startY + ni * (NODE_H + NODE_GAP),
        w: NODE_W,
        h: NODE_H,
      };
    });
  });

  const svgW = 3 * (NODE_W + LAYER_GAP) + 80;
  const maxPerLayer = Math.max(1, ...layers.map(l => l.length));
  const svgH = maxPerLayer * (NODE_H + NODE_GAP) + 100;

  return { positions, svgW, svgH, layers };
}

/* ═══════════════════════════════════════════════
   Color & icon helpers
   ═══════════════════════════════════════════════ */

const TYPE_COLORS = {
  user: '#6366f1',
  group: '#8b5cf6',
  serviceaccount: '#0ea5e9',
  rolebinding: '#f59e0b',
  clusterrolebinding: '#f97316',
  role: '#10b981',
  clusterrole: '#14b8a6',
};

const TYPE_LABELS = {
  user: 'User',
  group: 'Group',
  serviceaccount: 'ServiceAccount',
  rolebinding: 'RoleBinding',
  clusterrolebinding: 'ClusterRoleBinding',
  role: 'Role',
  clusterrole: 'ClusterRole',
};

const VERB_COLORS = {
  get: '#22c55e',
  list: '#22c55e',
  watch: '#22c55e',
  create: '#3b82f6',
  update: '#f59e0b',
  patch: '#f59e0b',
  delete: '#ef4444',
  '*': '#a855f7',
};

/* ═══════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════ */

export default function RbacVisualizer({ isOpen, onClose }) {
  const [yaml, setYaml] = useState(SAMPLE_YAML);
  const [error, setError] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const svgRef = useRef(null);
  const graphRef = useRef(null);

  // Parse & build
  const parsed = useMemo(() => {
    try {
      setError('');
      if (!yaml.trim()) return null;
      const { roles, bindings } = parseRbacYaml(yaml);
      if (roles.length === 0 && bindings.length === 0) {
        setError('No Role/ClusterRole/Binding resources found.');
        return null;
      }
      const { nodes, edges } = buildGraph(roles, bindings);
      const layout = layoutGraph(nodes, edges);
      return { roles, bindings, nodes, edges, ...layout };
    } catch (e) {
      setError('Parse error: ' + e.message);
      return null;
    }
  }, [yaml]);

  // Connected nodes for highlight
  const connectedSet = useMemo(() => {
    if (!hoveredNode || !parsed) return new Set();
    const set = new Set([hoveredNode]);
    // bfs both directions
    const q = [hoveredNode];
    while (q.length > 0) {
      const cur = q.shift();
      parsed.edges.forEach(e => {
        if (e.from === cur && !set.has(e.to)) { set.add(e.to); q.push(e.to); }
        if (e.to === cur && !set.has(e.from)) { set.add(e.from); q.push(e.from); }
      });
    }
    return set;
  }, [hoveredNode, parsed]);

  // Search filter
  const matchSearch = useCallback((node) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return node.label.toLowerCase().includes(q) || node.type.toLowerCase().includes(q);
  }, [searchQuery]);

  const matchFilter = useCallback((node) => {
    if (filterType === 'all') return true;
    if (filterType === 'subjects') return ['user', 'group', 'serviceaccount'].includes(node.type);
    if (filterType === 'bindings') return ['rolebinding', 'clusterrolebinding'].includes(node.type);
    if (filterType === 'roles') return ['role', 'clusterrole'].includes(node.type);
    return true;
  }, [filterType]);

  // Get details for selected node
  const getNodeDetails = useCallback((nodeId) => {
    if (!parsed) return null;
    const node = parsed.nodes.find(n => n.id === nodeId);
    if (!node) return null;

    // Find connected edges
    const inEdges = parsed.edges.filter(e => e.to === nodeId);
    const outEdges = parsed.edges.filter(e => e.from === nodeId);
    const connectedNodes = [...inEdges.map(e => e.from), ...outEdges.map(e => e.to)]
      .map(id => parsed.nodes.find(n => n.id === id))
      .filter(Boolean);

    // For subjects: determine effective permissions via binding chain
    let effectivePermissions = [];
    if (['user', 'group', 'serviceaccount'].includes(node.type)) {
      // subject → binding → role
      outEdges.forEach(be => {
        const binding = parsed.nodes.find(n => n.id === be.to);
        if (!binding) return;
        const roleEdge = parsed.edges.find(e => e.from === be.to && e.type === 'binds');
        if (!roleEdge) return;
        const role = parsed.nodes.find(n => n.id === roleEdge.to);
        if (!role || !role.rules) return;
        role.rules.forEach(rule => {
          effectivePermissions.push({
            role: role.label,
            roleKind: role.type,
            binding: binding.label,
            namespace: binding.namespace || role.namespace || '(cluster)',
            apiGroups: rule.apiGroups,
            resources: rule.resources,
            verbs: rule.verbs,
          });
        });
      });
    }

    return { node, connectedNodes, effectivePermissions };
  }, [parsed]);

  const handleReset = useCallback(() => {
    setYaml(SAMPLE_YAML);
    setSelectedNode(null);
    setHoveredNode(null);
    setError('');
  }, []);

  // Effect: Clear selection on YAML change
  useEffect(() => {
    setSelectedNode(null);
    setHoveredNode(null);
  }, [yaml]);

  if (!isOpen) return null;

  // Stats
  const stats = parsed ? {
    subjects: parsed.nodes.filter(n => ['user', 'group', 'serviceaccount'].includes(n.type)).length,
    bindings: parsed.nodes.filter(n => ['rolebinding', 'clusterrolebinding'].includes(n.type)).length,
    roles: parsed.nodes.filter(n => ['role', 'clusterrole'].includes(n.type)).length,
  } : null;

  const details = selectedNode ? getNodeDetails(selectedNode) : null;

  return (
    <div className="rbac-overlay" onClick={onClose}>
      <div className="rbac-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="rbac-header">
          <div className="rbac-title-row">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <h2>RBAC Visualizer</h2>
            <span className="rbac-subtitle">Kubernetes / Cloud</span>
          </div>
          <button className="rbac-close" onClick={onClose}>✕</button>
        </div>

        <div className="rbac-body">
          {/* Left panel – editor */}
          <div className="rbac-editor-panel">
            <div className="rbac-editor-toolbar">
              <span className="rbac-editor-label">RBAC YAML</span>
              <div className="rbac-toolbar-actions">
                <button className="rbac-btn-sm" onClick={handleReset}>
                  Reset Sample
                </button>
                <button className="rbac-btn-sm rbac-btn-danger" onClick={() => { setYaml(''); setError(''); }}>
                  Clear
                </button>
              </div>
            </div>
            <textarea
              className="rbac-textarea"
              value={yaml}
              onChange={e => setYaml(e.target.value)}
              placeholder="Paste your K8s RBAC YAML here (Role, ClusterRole, RoleBinding, ClusterRoleBinding)..."
              spellCheck={false}
            />

            {error && <div className="rbac-error">{error}</div>}

            {/* Stats */}
            {stats && (
              <div className="rbac-stats">
                <div className="rbac-stat">
                  <span className="rbac-stat-val">{stats.subjects}</span>
                  <span className="rbac-stat-label">Subjects</span>
                </div>
                <div className="rbac-stat">
                  <span className="rbac-stat-val">{stats.bindings}</span>
                  <span className="rbac-stat-label">Bindings</span>
                </div>
                <div className="rbac-stat">
                  <span className="rbac-stat-val">{stats.roles}</span>
                  <span className="rbac-stat-label">Roles</span>
                </div>
              </div>
            )}

            {/* Detail panel */}
            {details && (
              <div className="rbac-detail">
                <div className="rbac-detail-header">
                  <span className="rbac-detail-badge" style={{ background: TYPE_COLORS[details.node.type] + '25', color: TYPE_COLORS[details.node.type], borderColor: TYPE_COLORS[details.node.type] + '40' }}>
                    {TYPE_LABELS[details.node.type]}
                  </span>
                  <h3>{details.node.label}</h3>
                  <button className="rbac-btn-sm" onClick={() => setSelectedNode(null)}>✕</button>
                </div>

                {details.node.namespace && (
                  <div className="rbac-detail-row">
                    <span className="rbac-detail-key">namespace</span>
                    <span className="rbac-detail-value">{details.node.namespace}</span>
                  </div>
                )}

                {/* Connected nodes */}
                {details.connectedNodes.length > 0 && (
                  <div className="rbac-detail-section">
                    <span className="rbac-detail-key">Connected ({details.connectedNodes.length})</span>
                    <div className="rbac-connected-list">
                      {details.connectedNodes.map((cn, i) => (
                        <button
                          key={i}
                          className="rbac-connected-item"
                          onClick={() => setSelectedNode(cn.id)}
                        >
                          <span className="rbac-conn-dot" style={{ background: TYPE_COLORS[cn.type] }} />
                          <span className="rbac-conn-type">{TYPE_LABELS[cn.type]}</span>
                          <span className="rbac-conn-name">{cn.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rules for roles */}
                {details.node.rules && details.node.rules.length > 0 && (
                  <div className="rbac-detail-section">
                    <span className="rbac-detail-key">Rules ({details.node.rules.length})</span>
                    <div className="rbac-rules-list">
                      {details.node.rules.map((rule, ri) => (
                        <div key={ri} className="rbac-rule-card">
                          <div className="rbac-rule-row">
                            <span className="rbac-rule-label">resources</span>
                            <div className="rbac-rule-tags">
                              {rule.resources.map((r, idx) => (
                                <span key={idx} className="rbac-resource-tag">{r}</span>
                              ))}
                            </div>
                          </div>
                          <div className="rbac-rule-row">
                            <span className="rbac-rule-label">verbs</span>
                            <div className="rbac-rule-tags">
                              {rule.verbs.map((v, idx) => (
                                <span key={idx} className="rbac-verb-tag" style={{ color: VERB_COLORS[v] || '#94a3b8', borderColor: (VERB_COLORS[v] || '#94a3b8') + '40' }}>
                                  {v}
                                </span>
                              ))}
                            </div>
                          </div>
                          {rule.apiGroups.length > 0 && rule.apiGroups[0] !== '' && (
                            <div className="rbac-rule-row">
                              <span className="rbac-rule-label">apiGroups</span>
                              <span className="rbac-rule-apis">{rule.apiGroups.join(', ')}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Effective permissions for subjects */}
                {details.effectivePermissions.length > 0 && (
                  <div className="rbac-detail-section">
                    <span className="rbac-detail-key">Effective Permissions</span>
                    <div className="rbac-perms-list">
                      {details.effectivePermissions.map((perm, pi) => (
                        <div key={pi} className="rbac-perm-card">
                          <div className="rbac-perm-header">
                            <span className="rbac-perm-role">{perm.role}</span>
                            <span className="rbac-perm-ns">{perm.namespace}</span>
                          </div>
                          <div className="rbac-perm-resources">
                            {perm.resources.map((r, idx) => (
                              <span key={idx} className="rbac-resource-tag">{r}</span>
                            ))}
                          </div>
                          <div className="rbac-perm-verbs">
                            {perm.verbs.map((v, idx) => (
                              <span key={idx} className="rbac-verb-tag" style={{ color: VERB_COLORS[v] || '#94a3b8', borderColor: (VERB_COLORS[v] || '#94a3b8') + '40' }}>
                                {v}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right panel – graph */}
          <div className="rbac-visual-panel">
            {/* Toolbar */}
            <div className="rbac-visual-toolbar">
              <div className="rbac-search-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  className="rbac-search-input"
                  placeholder="Search nodes..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="rbac-filter-btns">
                {[['all', 'All'], ['subjects', 'Subjects'], ['bindings', 'Bindings'], ['roles', 'Roles']].map(([v, l]) => (
                  <button key={v} className={`rbac-filter-btn ${filterType === v ? 'active' : ''}`} onClick={() => setFilterType(v)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Graph area */}
            {!parsed && !error && (
              <div className="rbac-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.25">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <p>Paste your RBAC YAML to visualize permissions</p>
              </div>
            )}

            {parsed && (
              <>
                {/* Layer labels */}
                <div className="rbac-layer-labels">
                  <span className="rbac-layer-label" style={{ color: '#6366f1' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    Subjects
                  </span>
                  <span className="rbac-layer-label" style={{ color: '#f59e0b' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
                    Bindings
                  </span>
                  <span className="rbac-layer-label" style={{ color: '#10b981' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                    Roles
                  </span>
                </div>

                {/* SVG Graph */}
                <div className="rbac-graph-scroll" ref={graphRef}>
                  <svg
                    ref={svgRef}
                    className="rbac-graph-svg"
                    width={Math.max(parsed.svgW, 500)}
                    height={Math.max(parsed.svgH, 250)}
                    viewBox={`0 0 ${Math.max(parsed.svgW, 500)} ${Math.max(parsed.svgH, 250)}`}
                  >
                    <defs>
                      <marker id="rbac-arrow" viewBox="0 0 10 7" refX="10" refY="3.5"
                        markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" opacity="0.6" />
                      </marker>
                      <marker id="rbac-arrow-hl" viewBox="0 0 10 7" refX="10" refY="3.5"
                        markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#a5b4fc" />
                      </marker>
                      <filter id="rbac-glow">
                        <feGaussianBlur stdDeviation="3" result="b" />
                        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                    </defs>

                    {/* Edges */}
                    {parsed.edges.map((edge, i) => {
                      const from = parsed.positions[edge.from];
                      const to = parsed.positions[edge.to];
                      if (!from || !to) return null;
                      const fromNode = parsed.nodes.find(n => n.id === edge.from);
                      const toNode = parsed.nodes.find(n => n.id === edge.to);
                      if (!matchFilter(fromNode) && !matchFilter(toNode)) return null;

                      const isHL = connectedSet.has(edge.from) && connectedSet.has(edge.to);
                      const dimmed = hoveredNode && !isHL;

                      const x1 = from.x + from.w;
                      const y1 = from.y + from.h / 2;
                      const x2 = to.x;
                      const y2 = to.y + to.h / 2;
                      const mx = (x1 + x2) / 2;

                      return (
                        <path
                          key={i}
                          d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                          fill="none"
                          stroke={isHL ? '#a5b4fc' : '#6366f1'}
                          strokeWidth={isHL ? 2.5 : 1.2}
                          opacity={dimmed ? 0.1 : isHL ? 1 : 0.35}
                          markerEnd={isHL ? 'url(#rbac-arrow-hl)' : 'url(#rbac-arrow)'}
                          filter={isHL ? 'url(#rbac-glow)' : 'none'}
                          className="rbac-edge"
                        />
                      );
                    })}

                    {/* Nodes */}
                    {parsed.nodes.map(node => {
                      const pos = parsed.positions[node.id];
                      if (!pos) return null;
                      if (!matchFilter(node)) return null;
                      const isSearchMatch = matchSearch(node);
                      const isHover = hoveredNode === node.id;
                      const isSelected = selectedNode === node.id;
                      const isConnected = connectedSet.has(node.id);
                      const dimmed = hoveredNode && !isConnected;
                      const color = TYPE_COLORS[node.type] || '#64748b';

                      return (
                        <g
                          key={node.id}
                          className={`rbac-node ${isHover ? 'hovered' : ''} ${isSelected ? 'selected' : ''}`}
                          onMouseEnter={() => setHoveredNode(node.id)}
                          onMouseLeave={() => setHoveredNode(null)}
                          onClick={() => setSelectedNode(node.id === selectedNode ? null : node.id)}
                          style={{ cursor: 'pointer' }}
                          opacity={dimmed ? 0.2 : isSearchMatch ? 1 : 0.25}
                        >
                          <rect
                            x={pos.x} y={pos.y}
                            width={pos.w} height={pos.h}
                            rx="10"
                            fill={isSelected ? `${color}25` : isHover ? `${color}15` : '#12122a'}
                            stroke={isSelected ? color : isHover ? color : `${color}50`}
                            strokeWidth={isSelected ? 2 : isHover ? 1.5 : 1}
                          />
                          {/* Color bar */}
                          <rect x={pos.x} y={pos.y} width="4" height={pos.h} rx="2" fill={color} opacity={isHover || isSelected ? 1 : 0.6} />
                          {/* Type badge */}
                          <text x={pos.x + 14} y={pos.y + 16} fill={color} fontSize="9" fontWeight="600" fontFamily="'SF Mono', monospace" opacity="0.8">
                            {TYPE_LABELS[node.type]}
                          </text>
                          {/* Name */}
                          <text x={pos.x + 14} y={pos.y + 34} fill={isHover || isSelected ? '#fff' : '#e2e8f0'} fontSize="12.5" fontWeight="600" fontFamily="'SF Mono', 'Fira Code', monospace">
                            {node.label.length > 18 ? node.label.slice(0, 17) + '…' : node.label}
                          </text>
                          {/* Namespace badge */}
                          {node.namespace && (
                            <text x={pos.x + 14} y={pos.y + 46} fill="#64748b" fontSize="9" fontFamily="sans-serif">
                              ns: {node.namespace}
                            </text>
                          )}
                          {/* Missing indicator */}
                          {node.missing && (
                            <text x={pos.x + pos.w - 12} y={pos.y + 16} fill="#f87171" fontSize="12" fontWeight="700">?</text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Legend */}
                <div className="rbac-legend">
                  {Object.entries(TYPE_COLORS).map(([type, color]) => (
                    <div key={type} className="rbac-legend-item">
                      <span className="rbac-legend-dot" style={{ background: color }} />
                      <span>{TYPE_LABELS[type]}</span>
                    </div>
                  ))}
                  <div className="rbac-legend-item">
                    <span className="rbac-legend-line" />
                    <span>Binding</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
