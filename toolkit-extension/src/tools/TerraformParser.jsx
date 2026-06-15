import { useState, useCallback, useMemo } from 'react';
import './TerraformParser.css';

/* ═══════════════════════════════════════════════
   Sample terraform.tfstate (v4)
   ═══════════════════════════════════════════════ */

const SAMPLE_STATE = JSON.stringify({
  version: 4,
  terraform_version: "1.7.5",
  serial: 42,
  lineage: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  outputs: {
    cluster_endpoint: { value: "https://k8s.example.com:6443", type: "string", sensitive: false },
    vpc_id: { value: "vpc-0abc123def456789", type: "string", sensitive: false },
    db_password: { value: "***", type: "string", sensitive: true }
  },
  resources: [
    {
      mode: "managed",
      type: "aws_vpc",
      name: "main",
      provider: "provider[\"registry.terraform.io/hashicorp/aws\"]",
      instances: [{
        schema_version: 1,
        attributes: {
          id: "vpc-0abc123def456789",
          cidr_block: "10.0.0.0/16",
          enable_dns_hostnames: true,
          enable_dns_support: true,
          tags: { Name: "main-vpc", Environment: "production" }
        },
        dependencies: []
      }]
    },
    {
      mode: "managed",
      type: "aws_subnet",
      name: "public_a",
      provider: "provider[\"registry.terraform.io/hashicorp/aws\"]",
      instances: [{
        schema_version: 1,
        attributes: {
          id: "subnet-0pub1a2b3c4d5e6f",
          vpc_id: "vpc-0abc123def456789",
          cidr_block: "10.0.1.0/24",
          availability_zone: "ap-northeast-2a",
          map_public_ip_on_launch: true,
          tags: { Name: "public-subnet-a", Tier: "public" }
        },
        dependencies: ["aws_vpc.main"]
      }]
    },
    {
      mode: "managed",
      type: "aws_subnet",
      name: "public_b",
      provider: "provider[\"registry.terraform.io/hashicorp/aws\"]",
      instances: [{
        schema_version: 1,
        attributes: {
          id: "subnet-0pub7a8b9c0d1e2f",
          vpc_id: "vpc-0abc123def456789",
          cidr_block: "10.0.2.0/24",
          availability_zone: "ap-northeast-2b",
          map_public_ip_on_launch: true,
          tags: { Name: "public-subnet-b", Tier: "public" }
        },
        dependencies: ["aws_vpc.main"]
      }]
    },
    {
      mode: "managed",
      type: "aws_subnet",
      name: "private_a",
      provider: "provider[\"registry.terraform.io/hashicorp/aws\"]",
      instances: [{
        schema_version: 1,
        attributes: {
          id: "subnet-0prv1a2b3c4d5e6f",
          vpc_id: "vpc-0abc123def456789",
          cidr_block: "10.0.10.0/24",
          availability_zone: "ap-northeast-2a",
          map_public_ip_on_launch: false,
          tags: { Name: "private-subnet-a", Tier: "private" }
        },
        dependencies: ["aws_vpc.main"]
      }]
    },
    {
      mode: "managed",
      type: "aws_security_group",
      name: "web_sg",
      provider: "provider[\"registry.terraform.io/hashicorp/aws\"]",
      instances: [{
        schema_version: 1,
        attributes: {
          id: "sg-0web1a2b3c4d5e6f",
          name: "web-security-group",
          vpc_id: "vpc-0abc123def456789",
          ingress: [{ from_port: 80, to_port: 80, protocol: "tcp", cidr_blocks: ["0.0.0.0/0"] }, { from_port: 443, to_port: 443, protocol: "tcp", cidr_blocks: ["0.0.0.0/0"] }],
          egress: [{ from_port: 0, to_port: 0, protocol: "-1", cidr_blocks: ["0.0.0.0/0"] }],
          tags: { Name: "web-sg" }
        },
        dependencies: ["aws_vpc.main"]
      }]
    },
    {
      mode: "managed",
      type: "aws_instance",
      name: "web_server",
      provider: "provider[\"registry.terraform.io/hashicorp/aws\"]",
      instances: [{
        schema_version: 1,
        attributes: {
          id: "i-0web1a2b3c4d5e6f",
          ami: "ami-0abcdef1234567890",
          instance_type: "t3.medium",
          subnet_id: "subnet-0pub1a2b3c4d5e6f",
          vpc_security_group_ids: ["sg-0web1a2b3c4d5e6f"],
          public_ip: "54.180.123.45",
          private_ip: "10.0.1.100",
          tags: { Name: "web-server", Role: "web" }
        },
        dependencies: ["aws_subnet.public_a", "aws_security_group.web_sg"]
      }]
    },
    {
      mode: "managed",
      type: "aws_db_instance",
      name: "main_db",
      provider: "provider[\"registry.terraform.io/hashicorp/aws\"]",
      instances: [{
        schema_version: 2,
        attributes: {
          id: "main-database",
          engine: "postgres",
          engine_version: "15.4",
          instance_class: "db.r6g.large",
          allocated_storage: 100,
          db_subnet_group_name: "main-db-subnet-group",
          vpc_security_group_ids: ["sg-0web1a2b3c4d5e6f"],
          endpoint: "main-database.abc123.ap-northeast-2.rds.amazonaws.com:5432",
          tags: { Name: "main-db", Environment: "production" }
        },
        dependencies: ["aws_subnet.private_a", "aws_security_group.web_sg"]
      }]
    },
    {
      mode: "managed",
      type: "aws_s3_bucket",
      name: "static_assets",
      provider: "provider[\"registry.terraform.io/hashicorp/aws\"]",
      instances: [{
        schema_version: 0,
        attributes: {
          id: "my-static-assets-bucket",
          bucket: "my-static-assets-bucket",
          region: "ap-northeast-2",
          acl: "private",
          versioning: [{ enabled: true }],
          tags: { Name: "static-assets", Purpose: "CDN Origin" }
        },
        dependencies: []
      }]
    },
    {
      mode: "data",
      type: "aws_ami",
      name: "ubuntu",
      provider: "provider[\"registry.terraform.io/hashicorp/aws\"]",
      instances: [{
        schema_version: 0,
        attributes: {
          id: "ami-0abcdef1234567890",
          name: "ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-20240101",
          architecture: "x86_64"
        }
      }]
    }
  ]
}, null, 2);

/* ═══════════════════════════════════════════════
   Parser
   ═══════════════════════════════════════════════ */

function parseTfState(jsonText) {
  const state = JSON.parse(jsonText);
  if (!state.version) throw new Error('Invalid Terraform state: missing version');

  const meta = {
    version: state.version,
    tfVersion: state.terraform_version || 'unknown',
    serial: state.serial || 0,
    lineage: state.lineage || '',
  };

  const outputs = Object.entries(state.outputs || {}).map(([k, v]) => ({
    name: k,
    value: v.sensitive ? '(sensitive)' : (typeof v.value === 'object' ? JSON.stringify(v.value) : String(v.value)),
    type: v.type || typeof v.value,
    sensitive: !!v.sensitive,
  }));

  const resources = (state.resources || []).map(r => {
    const addr = `${r.type}.${r.name}`;
    const inst = r.instances?.[0] || {};
    const attrs = inst.attributes || {};
    const deps = (inst.dependencies || []).map(d => d.replace(/^module\.[^.]+\./, ''));
    const tags = attrs.tags || {};
    const provider = (r.provider || '').replace(/provider\["([^"]+)"\]/, '$1').split('/').pop() || 'unknown';

    return {
      address: addr,
      mode: r.mode || 'managed',
      type: r.type,
      name: r.name,
      provider,
      id: attrs.id || '',
      attributes: attrs,
      dependencies: deps,
      tags,
      instanceCount: r.instances?.length || 0,
    };
  });

  return { meta, outputs, resources };
}

/* ═══════════════════════════════════════════════
   Type categorization & colors
   ═══════════════════════════════════════════════ */

const TYPE_CATEGORIES = {
  compute: { match: /instance|lambda|function|ecs|eks|container|fargate/, color: '#f97316', label: 'Compute' },
  network: { match: /vpc|subnet|security_group|route|internet_gateway|nat|elb|lb|alb|nlb/, color: '#3b82f6', label: 'Network' },
  storage: { match: /s3|bucket|ebs|volume|efs/, color: '#8b5cf6', label: 'Storage' },
  database: { match: /db_instance|rds|dynamodb|elasticache|redis/, color: '#10b981', label: 'Database' },
  iam: { match: /iam|role|policy|user|group/, color: '#f59e0b', label: 'IAM' },
  dns: { match: /route53|dns|record|zone/, color: '#06b6d4', label: 'DNS' },
  monitoring: { match: /cloudwatch|alarm|metric|log_group/, color: '#ec4899', label: 'Monitoring' },
  data: { match: /^data\./, color: '#64748b', label: 'Data Source' },
};

function getCategory(resource) {
  if (resource.mode === 'data') return TYPE_CATEGORIES.data;
  const t = resource.type.toLowerCase();
  for (const [, cat] of Object.entries(TYPE_CATEGORIES)) {
    if (cat.match.test(t)) return cat;
  }
  return { color: '#94a3b8', label: 'Other' };
}

/* ═══════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════ */

export default function TerraformParser({ isOpen, onClose }) {
  const [input, setInput] = useState(SAMPLE_STATE);
  const [error, setError] = useState('');
  const [selectedResource, setSelectedResource] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [viewMode, setViewMode] = useState('list'); // list | graph | table
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => {
    try {
      setError('');
      if (!input.trim()) return null;
      return parseTfState(input);
    } catch (e) {
      setError('Parse error: ' + e.message);
      return null;
    }
  }, [input]);

  const filteredResources = useMemo(() => {
    if (!parsed) return [];
    return parsed.resources.filter(r => {
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || r.address.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) ||
        Object.values(r.tags).some(v => String(v).toLowerCase().includes(q));
      const cat = getCategory(r);
      const matchCat = filterCategory === 'all' || cat.label.toLowerCase() === filterCategory.toLowerCase();
      return matchSearch && matchCat;
    });
  }, [parsed, searchQuery, filterCategory]);

  // Dependency graph data
  const graphData = useMemo(() => {
    if (!parsed) return null;
    const nodes = parsed.resources.map(r => ({
      id: r.address,
      ...r,
      cat: getCategory(r),
    }));
    const edges = [];
    parsed.resources.forEach(r => {
      r.dependencies.forEach(dep => {
        edges.push({ from: r.address, to: dep });
      });
    });
    return { nodes, edges };
  }, [parsed]);

  // Stats by category
  const categoryStats = useMemo(() => {
    if (!parsed) return {};
    const stats = {};
    parsed.resources.forEach(r => {
      const cat = getCategory(r);
      stats[cat.label] = (stats[cat.label] || 0) + 1;
    });
    return stats;
  }, [parsed]);

  const handleCopy = useCallback((text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, []);

  const handleReset = useCallback(() => {
    setInput(SAMPLE_STATE);
    setSelectedResource(null);
    setError('');
  }, []);

  if (!isOpen) return null;

  // Simple topological layer calculation for graph view
  const layerMap = {};
  if (graphData) {
    const addrSet = new Set(graphData.nodes.map(n => n.id));
    const placed = new Set();
    const remaining = new Set(addrSet);
    let layer = 0;
    let safety = 0;
    while (remaining.size > 0 && safety < 20) {
      const batch = [];
      for (const addr of remaining) {
        const r = parsed.resources.find(x => x.address === addr);
        if (!r) continue;
        const deps = r.dependencies.filter(d => addrSet.has(d));
        if (deps.every(d => placed.has(d))) batch.push(addr);
      }
      if (batch.length === 0) {
        // break cycle
        batch.push([...remaining][0]);
      }
      batch.forEach(a => { layerMap[a] = layer; placed.add(a); remaining.delete(a); });
      layer++;
      safety++;
    }
  }

  return (
    <div className="tfp-overlay" onClick={onClose}>
      <div className="tfp-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="tfp-header">
          <div className="tfp-title-row">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            <h2>Terraform State Parser</h2>
          </div>
          <button className="tfp-close" onClick={onClose}>✕</button>
        </div>

        <div className="tfp-body">
          {/* Left – editor panel */}
          <div className="tfp-editor-panel">
            <div className="tfp-editor-toolbar">
              <span className="tfp-editor-label">terraform.tfstate</span>
              <div className="tfp-toolbar-actions">
                <button className="tfp-btn-sm" onClick={handleReset}>Reset Sample</button>
                <button className="tfp-btn-sm tfp-btn-danger" onClick={() => { setInput(''); setError(''); setSelectedResource(null); }}>Clear</button>
              </div>
            </div>
            <textarea
              className="tfp-textarea"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder='Paste your terraform.tfstate JSON here...'
              spellCheck={false}
            />

            {error && <div className="tfp-error">{error}</div>}

            {/* Meta info */}
            {parsed && (
              <div className="tfp-meta">
                <div className="tfp-meta-row">
                  <span className="tfp-meta-key">Terraform</span>
                  <span className="tfp-meta-val">{parsed.meta.tfVersion}</span>
                </div>
                <div className="tfp-meta-row">
                  <span className="tfp-meta-key">State v{parsed.meta.version}</span>
                  <span className="tfp-meta-val">Serial #{parsed.meta.serial}</span>
                </div>
                <div className="tfp-meta-row">
                  <span className="tfp-meta-key">Resources</span>
                  <span className="tfp-meta-val">{parsed.resources.length}</span>
                </div>
                {parsed.outputs.length > 0 && (
                  <div className="tfp-meta-row">
                    <span className="tfp-meta-key">Outputs</span>
                    <span className="tfp-meta-val">{parsed.outputs.length}</span>
                  </div>
                )}
              </div>
            )}

            {/* Category stats */}
            {parsed && Object.keys(categoryStats).length > 0 && (
              <div className="tfp-cat-stats">
                {Object.entries(categoryStats).map(([label, count]) => {
                  const cat = Object.values(TYPE_CATEGORIES).find(c => c.label === label) || { color: '#94a3b8' };
                  return (
                    <button
                      key={label}
                      className={`tfp-cat-chip ${filterCategory.toLowerCase() === label.toLowerCase() ? 'active' : ''}`}
                      style={{ '--cat-color': cat.color }}
                      onClick={() => setFilterCategory(filterCategory.toLowerCase() === label.toLowerCase() ? 'all' : label)}
                    >
                      <span className="tfp-cat-dot" style={{ background: cat.color }} />
                      {label} <span className="tfp-cat-count">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Outputs */}
            {parsed && parsed.outputs.length > 0 && (
              <div className="tfp-outputs">
                <span className="tfp-section-label">Outputs</span>
                <div className="tfp-outputs-list">
                  {parsed.outputs.map((o, i) => (
                    <div key={i} className="tfp-output-item">
                      <span className="tfp-output-name">{o.name}</span>
                      <span className={`tfp-output-value ${o.sensitive ? 'sensitive' : ''}`}>
                        {o.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right – visualization */}
          <div className="tfp-visual-panel">
            {/* Toolbar */}
            <div className="tfp-visual-toolbar">
              <div className="tfp-search-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  className="tfp-search-input"
                  placeholder="Search resources, IDs, tags..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="tfp-view-btns">
                {[['list', 'List'], ['graph', 'Graph'], ['table', 'Table']].map(([v, l]) => (
                  <button key={v} className={`tfp-view-btn ${viewMode === v ? 'active' : ''}`} onClick={() => setViewMode(v)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {!parsed && !error && (
              <div className="tfp-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.25">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
                <p>Paste your terraform.tfstate to analyze</p>
              </div>
            )}

            {/* ── List View ── */}
            {parsed && viewMode === 'list' && (
              <div className="tfp-list-scroll">
                {filteredResources.map(r => {
                  const cat = getCategory(r);
                  const isSelected = selectedResource === r.address;
                  return (
                    <div
                      key={r.address}
                      className={`tfp-resource-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedResource(isSelected ? null : r.address)}
                    >
                      <div className="tfp-res-header">
                        <span className="tfp-res-dot" style={{ background: cat.color }} />
                        <span className="tfp-res-address">{r.address}</span>
                        <span className="tfp-res-cat" style={{ color: cat.color }}>{cat.label}</span>
                        {r.mode === 'data' && <span className="tfp-res-mode">data</span>}
                      </div>
                      {r.id && <div className="tfp-res-id">ID: {r.id}</div>}
                      {Object.keys(r.tags).length > 0 && (
                        <div className="tfp-res-tags">
                          {Object.entries(r.tags).map(([k, v]) => (
                            <span key={k} className="tfp-tag">{k}: {v}</span>
                          ))}
                        </div>
                      )}
                      {r.dependencies.length > 0 && (
                        <div className="tfp-res-deps">
                          <span className="tfp-deps-label">depends on:</span>
                          {r.dependencies.map((d, i) => (
                            <button key={i} className="tfp-dep-link" onClick={(e) => { e.stopPropagation(); setSelectedResource(d); }}>
                              {d}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Expanded attributes */}
                      {isSelected && (
                        <div className="tfp-res-attrs">
                          <div className="tfp-attrs-toolbar">
                            <span className="tfp-attrs-label">Attributes</span>
                            <button className={`tfp-btn-sm ${copied ? 'copied' : ''}`} onClick={(e) => { e.stopPropagation(); handleCopy(JSON.stringify(r.attributes, null, 2)); }}>
                              {copied ? '✓ Copied' : 'Copy JSON'}
                            </button>
                          </div>
                          <pre className="tfp-attrs-json">{JSON.stringify(r.attributes, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  );
                })}
                {filteredResources.length === 0 && (
                  <div className="tfp-empty-list">No resources match the filter</div>
                )}
              </div>
            )}

            {/* ── Graph View ── */}
            {parsed && viewMode === 'graph' && graphData && (
              <div className="tfp-graph-scroll">
                <svg
                  className="tfp-graph-svg"
                  width={Math.max(600, (Object.keys(layerMap).length > 0 ? (Math.max(...Object.values(layerMap)) + 1) : 1) * 260 + 80)}
                  height={Math.max(300, graphData.nodes.length * 44 + 80)}
                >
                  <defs>
                    <marker id="tf-arrow" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="7" markerHeight="5" orient="auto-start-reverse">
                      <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" opacity="0.5" />
                    </marker>
                  </defs>

                  {/* Group by layer, sort within */}
                  {(() => {
                    const maxLayer = Math.max(0, ...Object.values(layerMap));
                    const layers = [];
                    for (let l = 0; l <= maxLayer; l++) {
                      layers.push(graphData.nodes.filter(n => layerMap[n.id] === l));
                    }
                    const nodePos = {};
                    const NODE_W = 200;
                    const NODE_H = 36;
                    const LG = 240;
                    const NG = 12;

                    const maxInLayer = Math.max(1, ...layers.map(l => l.length));
                    layers.forEach((layer, li) => {
                      const startY = 40;
                      layer.forEach((n, ni) => {
                        nodePos[n.id] = {
                          x: li * LG + 30,
                          y: startY + ni * (NODE_H + NG),
                          w: NODE_W,
                          h: NODE_H,
                        };
                      });
                    });

                    const svgW = (maxLayer + 1) * LG + 80;
                    const svgH = maxInLayer * (NODE_H + NG) + 80;

                    return (
                      <g>
                        {/* Edges */}
                        {graphData.edges.map((e, i) => {
                          const from = nodePos[e.from];
                          const to = nodePos[e.to];
                          if (!from || !to) return null;
                          const x1 = from.x;
                          const y1 = from.y + from.h / 2;
                          const x2 = to.x + to.w;
                          const y2 = to.y + to.h / 2;
                          const mx = (x1 + x2) / 2;
                          return (
                            <path
                              key={i}
                              d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                              fill="none"
                              stroke="#6366f1"
                              strokeWidth="1.2"
                              opacity="0.3"
                              markerEnd="url(#tf-arrow)"
                            />
                          );
                        })}
                        {/* Nodes */}
                        {graphData.nodes.map(n => {
                          const pos = nodePos[n.id];
                          if (!pos) return null;
                          const cat = n.cat;
                          return (
                            <g
                              key={n.id}
                              className="tfp-graph-node"
                              onClick={() => setSelectedResource(n.id === selectedResource ? null : n.id)}
                              style={{ cursor: 'pointer' }}
                            >
                              <rect
                                x={pos.x} y={pos.y}
                                width={pos.w} height={pos.h}
                                rx="8"
                                fill={selectedResource === n.id ? `${cat.color}20` : '#12122a'}
                                stroke={selectedResource === n.id ? cat.color : `${cat.color}50`}
                                strokeWidth={selectedResource === n.id ? 1.5 : 0.8}
                              />
                              <rect x={pos.x} y={pos.y} width="3" height={pos.h} rx="1.5" fill={cat.color} opacity="0.7" />
                              <text x={pos.x + 12} y={pos.y + 22} fill="#e2e8f0" fontSize="11" fontFamily="'SF Mono', monospace" fontWeight="500">
                                {n.id.length > 26 ? n.id.slice(0, 25) + '…' : n.id}
                              </text>
                            </g>
                          );
                        })}
                      </g>
                    );
                  })()}
                </svg>
              </div>
            )}

            {/* ── Table View ── */}
            {parsed && viewMode === 'table' && (
              <div className="tfp-table-scroll">
                <table className="tfp-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Address</th>
                      <th>ID</th>
                      <th>Provider</th>
                      <th>Deps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResources.map(r => {
                      const cat = getCategory(r);
                      return (
                        <tr
                          key={r.address}
                          className={selectedResource === r.address ? 'selected' : ''}
                          onClick={() => setSelectedResource(r.address === selectedResource ? null : r.address)}
                        >
                          <td>
                            <span className="tfp-table-cat" style={{ color: cat.color }}>
                              <span className="tfp-cat-dot" style={{ background: cat.color }} />
                              {cat.label}
                            </span>
                          </td>
                          <td className="tfp-table-addr">{r.address}</td>
                          <td className="tfp-table-id">{r.id || '—'}</td>
                          <td className="tfp-table-prov">{r.provider}</td>
                          <td className="tfp-table-deps">{r.dependencies.length || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Legend */}
            {parsed && (
              <div className="tfp-legend">
                {Object.values(TYPE_CATEGORIES).map(cat => (
                  <div key={cat.label} className="tfp-legend-item">
                    <span className="tfp-legend-dot" style={{ background: cat.color }} />
                    <span>{cat.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
