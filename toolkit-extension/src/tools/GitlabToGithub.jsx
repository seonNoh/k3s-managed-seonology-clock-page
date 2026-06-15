import { useState, useCallback, useMemo } from 'react';
import './GitlabToGithub.css';

/* ═══════════════════════════════════════════════
   Sample .gitlab-ci.yml
   ═══════════════════════════════════════════════ */
const SAMPLE_GITLAB = `# Sample GitLab CI Configuration
image: node:20-alpine

variables:
  NODE_ENV: production
  CI_DEBUG: "false"

cache:
  key: "\${CI_COMMIT_REF_SLUG}"
  paths:
    - node_modules/
    - .npm/

stages:
  - install
  - lint
  - test
  - build
  - deploy

install_deps:
  stage: install
  script:
    - npm ci --cache .npm
  artifacts:
    paths:
      - node_modules/
    expire_in: 1 hour

lint:
  stage: lint
  needs:
    - install_deps
  script:
    - npm run lint
  allow_failure: true

unit_test:
  stage: test
  needs:
    - install_deps
  script:
    - npm run test -- --coverage
  coverage: '/All files.*?\\|.*?([\\d.]+)%/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml
    paths:
      - coverage/
    expire_in: 7 days

integration_test:
  stage: test
  needs:
    - install_deps
  services:
    - postgres:15
    - redis:7
  variables:
    POSTGRES_DB: testdb
    POSTGRES_USER: test
    POSTGRES_PASSWORD: test
    DATABASE_URL: "postgresql://test:test@postgres:5432/testdb"
  script:
    - npm run test:integration
  only:
    - main
    - develop

build:
  stage: build
  needs:
    - lint
    - unit_test
  script:
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 30 days

deploy_staging:
  stage: deploy
  needs:
    - build
  environment:
    name: staging
    url: https://staging.example.com
  script:
    - echo "Deploying to staging..."
    - npm run deploy:staging
  only:
    - develop
  when: manual

deploy_production:
  stage: deploy
  needs:
    - build
    - integration_test
  environment:
    name: production
    url: https://example.com
  script:
    - echo "Deploying to production..."
    - npm run deploy:production
  only:
    - main
  when: manual
  rules:
    - if: '$CI_COMMIT_TAG'
`;

/* ═══════════════════════════════════════════════
   Minimal YAML parser (subset for CI/CD configs)
   ═══════════════════════════════════════════════ */
function parseYaml(text) {
  const lines = text.split('\n');
  const root = {};
  const stack = [{ indent: -1, obj: root, key: null }];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.replace(/\s+$/, '');
    if (!trimmed || /^\s*#/.test(trimmed)) continue;

    const indent = raw.search(/\S/);
    const line = trimmed.trim();

    // Pop stack to find parent
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];

    // List item
    if (line.startsWith('- ')) {
      const val = line.slice(2).trim();
      const target = parent.key ? parent.obj[parent.key] : parent.obj;
      if (Array.isArray(target)) {
        // Check if it's a key-value inside list item
        const kvMatch = val.match(/^([^:]+):\s*(.+)$/);
        if (kvMatch) {
          const listObj = { [kvMatch[1].trim()]: parseValue(kvMatch[2].trim()) };
          target.push(listObj);
          stack.push({ indent, obj: listObj, key: null });
        } else {
          target.push(parseValue(val));
        }
      } else if (parent.key && !Array.isArray(parent.obj[parent.key])) {
        parent.obj[parent.key] = [parseValue(val)];
      }
      continue;
    }

    // Key-value
    const kvMatch = line.match(/^([^:]+):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const val = kvMatch[2].trim();

      const target = parent.key && typeof parent.obj[parent.key] === 'object' && !Array.isArray(parent.obj[parent.key])
        ? parent.obj[parent.key]
        : parent.obj;

      if (val === '' || val === '|' || val === '>') {
        // Check if next line is a list
        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
        const nextTrimmed = nextLine.trim();
        if (nextTrimmed.startsWith('- ')) {
          target[key] = [];
        } else {
          target[key] = {};
        }
        stack.push({ indent, obj: target, key: key });
      } else {
        target[key] = parseValue(val);
        stack.push({ indent, obj: target, key: key });
      }
    }
  }
  return root;
}

function parseValue(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  return v.replace(/^["']|["']$/g, '');
}

/* ═══════════════════════════════════════════════
   GitLab CI → GitHub Actions converter
   ═══════════════════════════════════════════════ */
function convertGitlabToGithub(yamlText) {
  const gl = parseYaml(yamlText);
  const warnings = [];
  const info = [];

  // Extract global config
  const globalImage = gl.image || null;
  const stages = gl.stages || [];
  const globalVariables = gl.variables || {};
  const globalCache = gl.cache || null;

  // Known non-job keys
  const nonJobKeys = new Set([
    'image', 'stages', 'variables', 'cache', 'services',
    'before_script', 'after_script', 'default', 'include',
    'workflow', 'pages',
  ]);

  // Extract jobs
  const jobs = {};
  for (const [key, val] of Object.entries(gl)) {
    if (!nonJobKeys.has(key) && typeof val === 'object' && val !== null && !Array.isArray(val)) {
      jobs[key] = val;
    }
  }

  // Build GitHub Actions YAML
  const lines = [];
  const ind = (n) => '  '.repeat(n);

  // Header
  lines.push('name: CI/CD Pipeline');
  lines.push('');
  lines.push('on:');
  lines.push(`${ind(1)}push:`);
  lines.push(`${ind(2)}branches: [main, develop]`);
  lines.push(`${ind(1)}pull_request:`);
  lines.push(`${ind(2)}branches: [main]`);
  lines.push('');

  // Environment variables
  if (Object.keys(globalVariables).length > 0) {
    lines.push('env:');
    for (const [k, v] of Object.entries(globalVariables)) {
      const val = String(v).replace(/\$CI_[A-Z_]+/g, (m) => mapGitlabVar(m));
      lines.push(`${ind(1)}${k}: ${quoteIfNeeded(val)}`);
    }
    lines.push('');
  }

  lines.push('jobs:');

  // Convert each job
  const jobNames = Object.keys(jobs);
  for (const jobName of jobNames) {
    const job = jobs[jobName];
    const ghName = jobName.replace(/[^a-zA-Z0-9_-]/g, '_');

    lines.push(`${ind(1)}${ghName}:`);
    lines.push(`${ind(2)}name: ${jobName.replace(/_/g, ' ')}`);
    lines.push(`${ind(2)}runs-on: ubuntu-latest`);

    // Needs → depends on
    if (job.needs && Array.isArray(job.needs)) {
      const depNames = job.needs.map(n => typeof n === 'string' ? n : n.job || n).map(n => n.replace(/[^a-zA-Z0-9_-]/g, '_'));
      lines.push(`${ind(2)}needs: [${depNames.join(', ')}]`);
    } else if (job.dependencies && Array.isArray(job.dependencies)) {
      const depNames = job.dependencies.map(n => n.replace(/[^a-zA-Z0-9_-]/g, '_'));
      lines.push(`${ind(2)}needs: [${depNames.join(', ')}]`);
    }

    // Container image
    const jobImage = job.image || globalImage;
    if (jobImage) {
      lines.push(`${ind(2)}container:`);
      if (typeof jobImage === 'string') {
        lines.push(`${ind(3)}image: ${jobImage}`);
      } else {
        lines.push(`${ind(3)}image: ${jobImage.name || jobImage}`);
      }
    }

    // Services
    if (job.services && Array.isArray(job.services)) {
      lines.push(`${ind(2)}services:`);
      for (const svc of job.services) {
        const svcName = typeof svc === 'string' ? svc : svc.name || svc;
        const alias = typeof svc === 'string' ? svc.split(':')[0].split('/').pop() : (svc.alias || svc.name?.split(':')[0]);
        lines.push(`${ind(3)}${alias}:`);
        lines.push(`${ind(4)}image: ${svcName}`);
      }
      info.push(`Services 변환: ${job.services.length}개 서비스 컨테이너`);
    }

    // Job-level env vars
    const jobVars = job.variables || {};
    if (Object.keys(jobVars).length > 0) {
      lines.push(`${ind(2)}env:`);
      for (const [k, v] of Object.entries(jobVars)) {
        lines.push(`${ind(3)}${k}: ${quoteIfNeeded(String(v))}`);
      }
    }

    // Environment
    if (job.environment) {
      const envName = typeof job.environment === 'string' ? job.environment : job.environment.name;
      const envUrl = typeof job.environment === 'object' ? job.environment.url : null;
      lines.push(`${ind(2)}environment:`);
      lines.push(`${ind(3)}name: ${envName}`);
      if (envUrl) lines.push(`${ind(3)}url: ${envUrl}`);
    }

    // Branch filtering: only/except → if condition
    const conditions = [];
    if (job.only) {
      const branches = Array.isArray(job.only) ? job.only : [];
      if (branches.length > 0) {
        const branchConds = branches.map(b => `github.ref == 'refs/heads/${b}'`);
        conditions.push(branchConds.join(' || '));
      }
    }
    if (job.rules && Array.isArray(job.rules)) {
      for (const rule of job.rules) {
        if (typeof rule === 'object' && rule.if) {
          const mapped = mapGitlabCondition(rule.if);
          if (mapped) conditions.push(mapped);
        }
      }
    }
    if (conditions.length > 0) {
      lines.push(`${ind(2)}if: ${conditions.join(' && ')}`);
    }

    // Continue on error
    if (job.allow_failure === true) {
      lines.push(`${ind(2)}continue-on-error: true`);
      info.push(`${jobName}: allow_failure → continue-on-error`);
    }

    // Manual trigger
    if (job.when === 'manual') {
      warnings.push(`${jobName}: 'when: manual' → GitHub에서는 workflow_dispatch 또는 environment protection rules 사용 권장`);
      lines.push(`${ind(2)}# NOTE: GitLab 'when: manual' - consider using environment protection rules`);
    }

    // Cache
    const jobCache = job.cache || globalCache;
    if (jobCache) {
      // We'll add cache as a step
    }

    // Steps
    lines.push(`${ind(2)}steps:`);

    // Checkout
    lines.push(`${ind(3)}- uses: actions/checkout@v4`);

    // Cache step
    if (jobCache) {
      const cachePaths = jobCache.paths || [];
      if (cachePaths.length > 0) {
        lines.push(`${ind(3)}- uses: actions/cache@v4`);
        lines.push(`${ind(4)}with:`);
        lines.push(`${ind(5)}path: |`);
        for (const p of cachePaths) {
          lines.push(`${ind(6)}${typeof p === 'string' ? p : p}`);
        }
        const cacheKey = typeof jobCache.key === 'string'
          ? jobCache.key.replace(/\$\{?CI_COMMIT_REF_SLUG\}?/g, "${{ github.ref_name }}")
          : "${{ runner.os }}-${{ hashFiles('**/package-lock.json') }}";
        lines.push(`${ind(5)}key: ${cacheKey}`);
      }
    }

    // Before script
    const beforeScript = job.before_script || gl.before_script;
    if (beforeScript && Array.isArray(beforeScript)) {
      lines.push(`${ind(3)}- name: Before script`);
      lines.push(`${ind(4)}run: |`);
      for (const cmd of beforeScript) {
        lines.push(`${ind(5)}${mapScriptVars(String(cmd))}`);
      }
    }

    // Main script
    if (job.script) {
      const scripts = Array.isArray(job.script) ? job.script : [job.script];
      lines.push(`${ind(3)}- name: ${jobName.replace(/_/g, ' ')}`);
      if (scripts.length === 1) {
        lines.push(`${ind(4)}run: ${mapScriptVars(String(scripts[0]))}`);
      } else {
        lines.push(`${ind(4)}run: |`);
        for (const cmd of scripts) {
          lines.push(`${ind(5)}${mapScriptVars(String(cmd))}`);
        }
      }
    }

    // After script
    const afterScript = job.after_script || gl.after_script;
    if (afterScript && Array.isArray(afterScript)) {
      lines.push(`${ind(3)}- name: After script`);
      lines.push(`${ind(4)}if: always()`);
      lines.push(`${ind(4)}run: |`);
      for (const cmd of afterScript) {
        lines.push(`${ind(5)}${mapScriptVars(String(cmd))}`);
      }
    }

    // Artifacts → upload-artifact
    if (job.artifacts) {
      const artPaths = job.artifacts.paths || [];
      if (artPaths.length > 0) {
        lines.push(`${ind(3)}- uses: actions/upload-artifact@v4`);
        lines.push(`${ind(4)}with:`);
        lines.push(`${ind(5)}name: ${ghName}-artifacts`);
        lines.push(`${ind(5)}path: |`);
        for (const p of artPaths) {
          lines.push(`${ind(6)}${typeof p === 'string' ? p : p}`);
        }
        if (job.artifacts.expire_in) {
          const days = parseDuration(job.artifacts.expire_in);
          if (days) {
            lines.push(`${ind(5)}retention-days: ${days}`);
          }
        }
      }
      // Coverage report
      if (job.artifacts.reports) {
        info.push(`${jobName}: artifacts.reports 변환 — coverage action 추가 권장`);
      }
    }

    // Coverage
    if (job.coverage) {
      info.push(`${jobName}: coverage regex → GitHub에서는 coverage action 사용 권장`);
    }

    lines.push('');
  }

  return {
    output: lines.join('\n'),
    warnings,
    info,
    jobCount: jobNames.length,
    stageCount: stages.length,
  };
}

/* ── Helper: map GitLab CI variables ── */
function mapGitlabVar(v) {
  const map = {
    '$CI_COMMIT_REF_SLUG': "${{ github.ref_name }}",
    '$CI_COMMIT_REF_NAME': "${{ github.ref_name }}",
    '$CI_COMMIT_SHA': "${{ github.sha }}",
    '$CI_COMMIT_SHORT_SHA': "${{ github.sha }}",
    '$CI_COMMIT_BRANCH': "${{ github.ref_name }}",
    '$CI_COMMIT_TAG': "${{ github.ref_name }}",
    '$CI_PIPELINE_ID': "${{ github.run_id }}",
    '$CI_PIPELINE_IID': "${{ github.run_number }}",
    '$CI_PROJECT_NAME': "${{ github.event.repository.name }}",
    '$CI_PROJECT_NAMESPACE': "${{ github.repository_owner }}",
    '$CI_PROJECT_PATH': "${{ github.repository }}",
    '$CI_PROJECT_URL': "${{ github.server_url }}/${{ github.repository }}",
    '$CI_REGISTRY_IMAGE': "ghcr.io/${{ github.repository }}",
    '$CI_JOB_NAME': "${{ github.job }}",
    '$CI_JOB_ID': "${{ github.run_id }}",
    '$CI_ENVIRONMENT_NAME': "staging",
    '$CI_DEFAULT_BRANCH': "${{ github.event.repository.default_branch }}",
    '$GITLAB_USER_EMAIL': "${{ github.actor }}",
    '$GITLAB_USER_LOGIN': "${{ github.actor }}",
  };
  return map[v] || v;
}

function mapScriptVars(cmd) {
  return cmd.replace(/\$\{?CI_[A-Z_]+\}?/g, (m) => {
    const clean = m.replace(/[{}]/g, '');
    return mapGitlabVar('$' + clean.replace(/^\$/, '')).replace(/^\$/, '');
  });
}

function mapGitlabCondition(cond) {
  if (cond.includes('CI_COMMIT_TAG')) return "startsWith(github.ref, 'refs/tags/')";
  if (cond.includes('CI_COMMIT_BRANCH')) return "github.event_name == 'push'";
  if (cond.includes('CI_MERGE_REQUEST')) return "github.event_name == 'pull_request'";
  return null;
}

function quoteIfNeeded(v) {
  if (/[:{}\[\],&*?|>!%@`#]/.test(v) || v === '' || /^\s|\s$/.test(v)) {
    return `"${v.replace(/"/g, '\\"')}"`;
  }
  return v;
}

function parseDuration(str) {
  if (!str) return null;
  const s = String(str).toLowerCase();
  const match = s.match(/(\d+)\s*(day|hour|week|month|minute)/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 'day') return n;
  if (unit === 'hour') return Math.max(1, Math.ceil(n / 24));
  if (unit === 'week') return n * 7;
  if (unit === 'month') return n * 30;
  if (unit === 'minute') return 1;
  return n;
}

/* ═══════════════════════════════════════════════
   Variable Mapping Reference
   ═══════════════════════════════════════════════ */
const VAR_MAPPING = [
  { gitlab: '$CI_COMMIT_REF_NAME', github: "${{ github.ref_name }}", desc: 'Branch or tag name' },
  { gitlab: '$CI_COMMIT_SHA', github: "${{ github.sha }}", desc: 'Full commit SHA' },
  { gitlab: '$CI_COMMIT_BRANCH', github: "${{ github.ref_name }}", desc: 'Branch name' },
  { gitlab: '$CI_COMMIT_TAG', github: "${{ github.ref_name }}", desc: 'Tag name (if tag push)' },
  { gitlab: '$CI_PIPELINE_ID', github: "${{ github.run_id }}", desc: 'Pipeline/run ID' },
  { gitlab: '$CI_PROJECT_NAME', github: "${{ github.event.repository.name }}", desc: 'Repository name' },
  { gitlab: '$CI_PROJECT_PATH', github: "${{ github.repository }}", desc: 'owner/repo' },
  { gitlab: '$CI_REGISTRY_IMAGE', github: "ghcr.io/${{ github.repository }}", desc: 'Container registry' },
  { gitlab: '$CI_JOB_NAME', github: "${{ github.job }}", desc: 'Current job name' },
  { gitlab: '$GITLAB_USER_LOGIN', github: "${{ github.actor }}", desc: 'Triggering user' },
  { gitlab: '$CI_DEFAULT_BRANCH', github: "${{ github.event.repository.default_branch }}", desc: 'Default branch' },
];

const CONCEPT_MAPPING = [
  { gitlab: 'stages', github: 'jobs + needs', desc: '순서 제어' },
  { gitlab: 'image', github: 'container / runs-on', desc: '실행 환경' },
  { gitlab: 'script', github: 'steps[].run', desc: '명령어 실행' },
  { gitlab: 'artifacts', github: 'actions/upload-artifact', desc: '빌드 산출물' },
  { gitlab: 'cache', github: 'actions/cache', desc: '캐시' },
  { gitlab: 'services', github: 'services', desc: '서비스 컨테이너' },
  { gitlab: 'only/except', github: 'on + if', desc: '브랜치/이벤트 필터' },
  { gitlab: 'rules', github: 'if / on', desc: '조건부 실행' },
  { gitlab: 'environment', github: 'environment', desc: '배포 환경' },
  { gitlab: 'variables', github: 'env', desc: '환경 변수' },
  { gitlab: 'allow_failure', github: 'continue-on-error', desc: '실패 허용' },
  { gitlab: 'when: manual', github: 'workflow_dispatch', desc: '수동 트리거' },
  { gitlab: 'needs', github: 'needs', desc: 'Job 의존성' },
  { gitlab: 'before_script', github: 'steps (최상단)', desc: '사전 명령' },
  { gitlab: 'after_script', github: 'steps + if: always()', desc: '사후 명령' },
  { gitlab: 'include', github: 'reusable workflows', desc: '외부 설정 포함' },
];

/* ═══════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════ */

export default function GitlabToGithub({ isOpen, onClose }) {
  const [input, setInput] = useState(SAMPLE_GITLAB);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('output'); // output | varmap | conceptmap

  const result = useMemo(() => {
    try {
      if (!input.trim()) return null;
      return convertGitlabToGithub(input);
    } catch (e) {
      return { output: '', warnings: [`Parse error: ${e.message}`], info: [], jobCount: 0, stageCount: 0 };
    }
  }, [input]);

  const handleCopy = useCallback(() => {
    if (result?.output) {
      navigator.clipboard.writeText(result.output).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  }, [result]);

  const handleReset = useCallback(() => {
    setInput(SAMPLE_GITLAB);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="gl2gh-overlay" onClick={onClose}>
      <div className="gl2gh-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="gl2gh-header">
          <div className="gl2gh-title-row">
            <div className="gl2gh-title-icons">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e2725b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
                <line x1="12" y1="22" x2="12" y2="15.5" />
                <polyline points="22 8.5 12 15.5 2 8.5" />
              </svg>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3">
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z" />
                <path d="M2 12h20" />
              </svg>
            </div>
            <h2>GitLab CI → GitHub Actions</h2>
          </div>
          <button className="gl2gh-close" onClick={onClose}>✕</button>
        </div>

        <div className="gl2gh-body">
          {/* Left – input */}
          <div className="gl2gh-panel gl2gh-input-panel">
            <div className="gl2gh-panel-toolbar">
              <span className="gl2gh-panel-label">
                <span className="gl2gh-dot gitlab" />
                .gitlab-ci.yml
              </span>
              <div className="gl2gh-toolbar-actions">
                <button className="gl2gh-btn-sm" onClick={handleReset}>Reset Sample</button>
                <button className="gl2gh-btn-sm gl2gh-btn-danger" onClick={() => setInput('')}>Clear</button>
              </div>
            </div>
            <textarea
              className="gl2gh-textarea"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Paste your .gitlab-ci.yml here..."
              spellCheck={false}
            />

            {/* Stats */}
            {result && (
              <div className="gl2gh-stats">
                <div className="gl2gh-stat">
                  <span className="gl2gh-stat-val">{result.stageCount}</span>
                  <span className="gl2gh-stat-label">Stages</span>
                </div>
                <div className="gl2gh-stat">
                  <span className="gl2gh-stat-val">{result.jobCount}</span>
                  <span className="gl2gh-stat-label">Jobs</span>
                </div>
                <div className="gl2gh-stat">
                  <span className="gl2gh-stat-val">{result.warnings.length}</span>
                  <span className="gl2gh-stat-label">Warnings</span>
                </div>
                <div className="gl2gh-stat">
                  <span className="gl2gh-stat-val">{result.info.length}</span>
                  <span className="gl2gh-stat-label">Info</span>
                </div>
              </div>
            )}

            {/* Warnings & info */}
            {result && result.warnings.length > 0 && (
              <div className="gl2gh-messages">
                {result.warnings.map((w, i) => (
                  <div key={i} className="gl2gh-msg warn">
                    <span className="gl2gh-msg-icon">⚠</span>
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
            {result && result.info.length > 0 && (
              <div className="gl2gh-messages">
                {result.info.map((m, i) => (
                  <div key={i} className="gl2gh-msg info">
                    <span className="gl2gh-msg-icon">ℹ</span>
                    <span>{m}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right – output / mappings */}
          <div className="gl2gh-panel gl2gh-output-panel">
            <div className="gl2gh-panel-toolbar">
              <div className="gl2gh-tabs">
                {[['output', 'Output'], ['varmap', 'Variables'], ['conceptmap', 'Concepts']].map(([key, label]) => (
                  <button
                    key={key}
                    className={`gl2gh-tab ${activeTab === key ? 'active' : ''}`}
                    onClick={() => setActiveTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {activeTab === 'output' && (
                <button className={`gl2gh-btn-sm ${copied ? 'copied' : ''}`} onClick={handleCopy}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              )}
            </div>

            {/* Output tab */}
            {activeTab === 'output' && (
              <div className="gl2gh-output-wrap">
                <div className="gl2gh-output-label">
                  <span className="gl2gh-dot github" />
                  .github/workflows/ci.yml
                </div>
                <pre className="gl2gh-output-code">
                  {result?.output || '# Paste GitLab CI YAML on the left to convert'}
                </pre>
              </div>
            )}

            {/* Variable mapping tab */}
            {activeTab === 'varmap' && (
              <div className="gl2gh-map-scroll">
                <table className="gl2gh-map-table">
                  <thead>
                    <tr>
                      <th>GitLab CI Variable</th>
                      <th>GitHub Actions</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {VAR_MAPPING.map((v, i) => (
                      <tr key={i}>
                        <td className="gl2gh-map-gitlab">{v.gitlab}</td>
                        <td className="gl2gh-map-github">{v.github}</td>
                        <td className="gl2gh-map-desc">{v.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Concept mapping tab */}
            {activeTab === 'conceptmap' && (
              <div className="gl2gh-map-scroll">
                <table className="gl2gh-map-table">
                  <thead>
                    <tr>
                      <th>GitLab CI</th>
                      <th>GitHub Actions</th>
                      <th>설명</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CONCEPT_MAPPING.map((c, i) => (
                      <tr key={i}>
                        <td className="gl2gh-map-gitlab">{c.gitlab}</td>
                        <td className="gl2gh-map-github">{c.github}</td>
                        <td className="gl2gh-map-desc">{c.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
