import { useState, useCallback, useRef, useEffect } from 'react';
import './CiCdVisualizer.css';

/* ──────────────────────── sample YAML strings ──────────────────────── */
const GITHUB_SAMPLE = `name: CI/CD Pipeline
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install deps
        run: npm ci
      - name: Lint
        run: npm run lint

  test:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - name: Install deps
        run: npm ci
      - name: Unit Tests
        run: npm test

  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: npm run build
      - name: Upload artifact
        uses: actions/upload-artifact@v4

  deploy-staging:
    runs-on: ubuntu-latest
    needs: build
    environment: staging
    steps:
      - name: Deploy to staging
        run: echo "Deploying to staging..."

  deploy-prod:
    runs-on: ubuntu-latest
    needs: deploy-staging
    environment: production
    steps:
      - name: Deploy to production
        run: echo "Deploying to production..."`;

const GITLAB_SAMPLE = `stages:
  - lint
  - test
  - build
  - deploy

variables:
  NODE_ENV: production

lint:
  stage: lint
  image: node:20
  script:
    - npm ci
    - npm run lint
  only:
    - merge_requests
    - main

unit-test:
  stage: test
  image: node:20
  needs: ["lint"]
  script:
    - npm ci
    - npm test
  artifacts:
    reports:
      junit: test-results.xml

integration-test:
  stage: test
  image: node:20
  needs: ["lint"]
  script:
    - npm ci
    - npm run test:integration
  allow_failure: true

build-app:
  stage: build
  image: node:20
  needs: ["unit-test"]
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - dist/

build-docker:
  stage: build
  image: docker:latest
  needs: ["unit-test"]
  services:
    - docker:dind
  script:
    - docker build -t myapp .

deploy-staging:
  stage: deploy
  needs: ["build-app", "build-docker"]
  environment:
    name: staging
  script:
    - echo "Deploy to staging"

deploy-prod:
  stage: deploy
  needs: ["deploy-staging"]
  environment:
    name: production
  when: manual
  script:
    - echo "Deploy to production"`;

/* ──────────────────────── minimal YAML parser ──────────────────────── */

function getIndent(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

function parseGitHubActions(text) {
  const lines = text.split('\n');
  const jobs = {};
  let currentJob = null;
  let inJobs = false;
  let inSteps = false;
  let currentStep = null;
  let jobIndent = 0;
  let stepsIndent = 0;
  let stepIndent = 0;
  let workflowName = '';
  let triggers = [];
  let inOn = false;
  let onIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trimStart();
    const indent = getIndent(raw);

    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Workflow name
    if (trimmed.startsWith('name:')) {
      workflowName = trimmed.replace('name:', '').trim().replace(/['"]/g, '');
      continue;
    }

    // triggers
    if (/^on\s*:/.test(trimmed) || trimmed === 'on:') {
      inOn = true;
      onIndent = indent;
      const inline = trimmed.replace(/^on\s*:\s*/, '').trim();
      if (inline && inline !== '') {
        if (inline.startsWith('[')) {
          triggers = inline.replace(/[[\]]/g, '').split(',').map(s => s.trim());
        } else {
          triggers.push(inline);
        }
        inOn = false;
      }
      continue;
    }
    if (inOn) {
      if (indent <= onIndent && trimmed !== '') { inOn = false; }
      else {
        if (indent === onIndent + 2 && trimmed.includes(':')) {
          triggers.push(trimmed.replace(':', '').trim());
        }
        continue;
      }
    }

    // jobs section
    if (trimmed === 'jobs:' || trimmed.startsWith('jobs:')) {
      inJobs = true;
      jobIndent = indent + 2;
      continue;
    }

    if (inJobs) {
      // detect new job at jobIndent level
      if (indent === jobIndent && trimmed.includes(':') && !trimmed.startsWith('-')) {
        const name = trimmed.replace(':', '').trim();
        currentJob = name;
        jobs[name] = { name, needs: [], steps: [], runsOn: '', environment: '', _if: '' };
        inSteps = false;
        currentStep = null;
        continue;
      }

      if (currentJob) {
        // runs-on
        if (trimmed.startsWith('runs-on:')) {
          jobs[currentJob].runsOn = trimmed.replace('runs-on:', '').trim().replace(/['"]/g, '');
        }
        // environment
        if (trimmed.startsWith('environment:')) {
          jobs[currentJob].environment = trimmed.replace('environment:', '').trim().replace(/['"]/g, '');
        }
        // if
        if (trimmed.startsWith('if:')) {
          jobs[currentJob]._if = trimmed.replace('if:', '').trim();
        }
        // needs
        if (trimmed.startsWith('needs:')) {
          const inline = trimmed.replace('needs:', '').trim();
          if (inline.startsWith('[')) {
            jobs[currentJob].needs = inline.replace(/[[\]'"]/g, '').split(',').map(s => s.trim()).filter(Boolean);
          } else if (inline) {
            jobs[currentJob].needs = [inline.replace(/['"]/g, '')];
          }
        }
        if (trimmed.startsWith('- ') && lines[i - 1] && lines[i - 1].trimStart().startsWith('needs:')) {
          // multiline needs
        }
        // steps
        if (trimmed === 'steps:') {
          inSteps = true;
          stepsIndent = indent;
          continue;
        }
        if (inSteps && indent > stepsIndent) {
          if (trimmed.startsWith('- ')) {
            // stepIndent = indent;
            const content = trimmed.replace(/^-\s*/, '');
            currentStep = { name: '', uses: '', run: '' };
            if (content.startsWith('name:')) {
              currentStep.name = content.replace('name:', '').trim().replace(/['"]/g, '');
            } else if (content.startsWith('uses:')) {
              currentStep.uses = content.replace('uses:', '').trim().replace(/['"]/g, '');
            } else if (content.startsWith('run:')) {
              currentStep.run = content.replace('run:', '').trim().replace(/['"]/g, '');
            }
            jobs[currentJob].steps.push(currentStep);
          } else if (currentStep) {
            if (trimmed.startsWith('name:')) {
              currentStep.name = trimmed.replace('name:', '').trim().replace(/['"]/g, '');
            }
            if (trimmed.startsWith('uses:')) {
              currentStep.uses = trimmed.replace('uses:', '').trim().replace(/['"]/g, '');
            }
            if (trimmed.startsWith('run:')) {
              currentStep.run = trimmed.replace('run:', '').trim().replace(/['"]/g, '');
            }
          }
        }
        if (inSteps && indent <= stepsIndent && trimmed !== '' && !trimmed.startsWith('#')) {
          inSteps = false;
        }
      }
    }
  }

  return { name: workflowName || 'Workflow', triggers, jobs };
}

function parseGitLabCI(text) {
  const lines = text.split('\n');
  const stages = [];
  const jobs = {};
  let inStages = false;
  let currentJob = null;
  let inScript = false;
  let inNeeds = false;
  let inArtifacts = false;

  const topLevelKeys = new Set(['stages', 'variables', 'image', 'services', 'cache', 'before_script', 'after_script', 'include', 'default', 'workflow', 'pages']);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trimStart();
    const indent = getIndent(raw);

    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // stages
    if (trimmed === 'stages:' || trimmed.startsWith('stages:')) {
      inStages = true;
      currentJob = null;
      continue;
    }
    if (inStages) {
      if (indent === 0 && !trimmed.startsWith('-')) {
        inStages = false;
      } else if (trimmed.startsWith('-')) {
        stages.push(trimmed.replace(/^-\s*/, '').replace(/['"]/g, '').trim());
        continue;
      } else {
        continue;
      }
    }

    // top-level job definition (indent 0, has colon, not a known keyword)
    if (indent === 0 && trimmed.includes(':') && !trimmed.startsWith('-') && !trimmed.startsWith('.')) {
      const name = trimmed.replace(':', '').trim();
      if (!topLevelKeys.has(name)) {
        currentJob = name;
        jobs[name] = { name, stage: '', needs: [], script: [], image: '', environment: '', when: '', allowFailure: false, artifacts: [], services: [] };
        inScript = false;
        inNeeds = false;
        inArtifacts = false;
        continue;
      } else {
        currentJob = null;
        inScript = false;
        inNeeds = false;
        continue;
      }
    }

    if (currentJob && indent > 0) {
      const job = jobs[currentJob];
      if (trimmed.startsWith('stage:')) {
        job.stage = trimmed.replace('stage:', '').trim().replace(/['"]/g, '');
        inScript = false; inNeeds = false;
      } else if (trimmed.startsWith('image:')) {
        job.image = trimmed.replace('image:', '').trim().replace(/['"]/g, '');
        inScript = false; inNeeds = false;
      } else if (trimmed.startsWith('when:')) {
        job.when = trimmed.replace('when:', '').trim().replace(/['"]/g, '');
        inScript = false; inNeeds = false;
      } else if (trimmed.startsWith('allow_failure:')) {
        job.allowFailure = trimmed.includes('true');
        inScript = false; inNeeds = false;
      } else if (trimmed.startsWith('environment:')) {
        const val = trimmed.replace('environment:', '').trim().replace(/['"]/g, '');
        job.environment = val;
        inScript = false; inNeeds = false;
      } else if (trimmed === 'environment:') {
        inScript = false; inNeeds = false;
      } else if (trimmed.startsWith('name:') && lines[i - 1]?.trimStart().startsWith('environment')) {
        job.environment = trimmed.replace('name:', '').trim().replace(/['"]/g, '');
      } else if (trimmed.startsWith('needs:')) {
        const inline = trimmed.replace('needs:', '').trim();
        if (inline.startsWith('[')) {
          job.needs = inline.replace(/[[\]'"]/g, '').split(',').map(s => s.trim()).filter(Boolean);
        } else if (inline) {
          job.needs = [inline.replace(/['"]/g, '')];
        }
        inNeeds = !inline;
        inScript = false;
      } else if (inNeeds && trimmed.startsWith('-')) {
        job.needs.push(trimmed.replace(/^-\s*/, '').replace(/['"]/g, '').trim());
      } else if (trimmed === 'script:' || trimmed.startsWith('script:')) {
        inScript = true;
        inNeeds = false;
      } else if (inScript && trimmed.startsWith('-')) {
        job.script.push(trimmed.replace(/^-\s*/, '').replace(/['"]/g, '').trim());
      } else if (trimmed === 'artifacts:' || trimmed.startsWith('artifacts:')) {
        inScript = false; inNeeds = false; // artifacts section
      } else if (trimmed === 'services:' || trimmed.startsWith('services:')) {
        inScript = false; inNeeds = false;
      } else if (!trimmed.startsWith('-')) {
        inScript = false;
        inNeeds = false;
      }
    }
  }

  // Assign stages if not explicit
  if (stages.length === 0) {
    const stageSet = new Set();
    Object.values(jobs).forEach(j => { if (j.stage) stageSet.add(j.stage); });
    if (stageSet.size === 0) stageSet.add('default');
    stages.push(...stageSet);
  }
  Object.values(jobs).forEach(j => {
    if (!j.stage) j.stage = stages[0] || 'default';
  });

  return { stages, jobs };
}

/* ──────────────────────── layout engine ──────────────────────── */

function buildDAG(jobsMap) {
  const nodes = Object.values(jobsMap);
  // topological sort by layers
  const layers = [];
  const placed = new Set();
  const remaining = new Set(nodes.map(n => n.name));

  let safety = 0;
  while (remaining.size > 0 && safety < 50) {
    const layer = [];
    for (const name of remaining) {
      const job = jobsMap[name];
      const deps = job.needs || [];
      if (deps.every(d => placed.has(d))) {
        layer.push(name);
      }
    }
    if (layer.length === 0) {
      // break cycles
      layer.push([...remaining][0]);
    }
    layer.forEach(n => { placed.add(n); remaining.delete(n); });
    layers.push(layer);
    safety++;
  }
  return layers;
}

/* ──────────────────────── component ──────────────────────── */

export default function CiCdVisualizer({ isOpen, onClose }) {
  const [platform, setPlatform] = useState('github');
  const [yaml, setYaml] = useState(GITHUB_SAMPLE);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');
  const [hoveredJob, setHoveredJob] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const svgRef = useRef(null);
  const graphRef = useRef(null);

  const parse = useCallback(() => {
    try {
      setError('');
      setSelectedJob(null);
      if (!yaml.trim()) {
        setParsed(null);
        return;
      }
      if (platform === 'github') {
        const result = parseGitHubActions(yaml);
        if (Object.keys(result.jobs).length === 0) {
          setError('No jobs found. Make sure your YAML has a "jobs:" section.');
          setParsed(null);
          return;
        }
        setParsed({ type: 'github', ...result });
      } else {
        const result = parseGitLabCI(yaml);
        if (Object.keys(result.jobs).length === 0) {
          setError('No jobs found. Make sure you have job definitions.');
          setParsed(null);
          return;
        }
        setParsed({ type: 'gitlab', ...result });
      }
    } catch (e) {
      setError('Parse error: ' + e.message);
      setParsed(null);
    }
  }, [yaml, platform]);

  // auto-parse on changes
  useEffect(() => {
    const t = setTimeout(parse, 400);
    return () => clearTimeout(t);
  }, [parse]);

  const switchPlatform = useCallback((p) => {
    setPlatform(p);
    setYaml(p === 'github' ? GITHUB_SAMPLE : GITLAB_SAMPLE);
    setSelectedJob(null);
    setError('');
  }, []);

  const getJobColor = useCallback((job) => {
    if (!job) return '#64748b';
    if (job.when === 'manual') return '#f59e0b';
    if (job.allowFailure) return '#f97316';
    if (job.environment) return '#10b981';
    return '#6366f1';
  }, []);

  const getStageColor = useCallback((idx) => {
    const colors = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6'];
    return colors[idx % colors.length];
  }, []);

  if (!isOpen) return null;

  // Build layers
  const layers = parsed ? buildDAG(parsed.jobs) : [];

  // SVG arrow drawing
  const nodePositions = {};
  const NODE_W = 180;
  const NODE_H = 60;
  const LAYER_GAP = 100;
  const NODE_GAP = 24;

  layers.forEach((layer, li) => {
    layer.forEach((name, ni) => {
      const x = li * (NODE_W + LAYER_GAP) + 40;
      const y = ni * (NODE_H + NODE_GAP) + 40;
      nodePositions[name] = { x, y, w: NODE_W, h: NODE_H };
    });
  });

  const totalW = layers.length * (NODE_W + LAYER_GAP) + 80;
  const maxPerLayer = Math.max(1, ...layers.map(l => l.length));
  const totalH = maxPerLayer * (NODE_H + NODE_GAP) + 80;

  // build edges
  const edges = [];
  if (parsed) {
    Object.values(parsed.jobs).forEach(job => {
      (job.needs || []).forEach(dep => {
        if (nodePositions[dep] && nodePositions[job.name]) {
          edges.push({ from: dep, to: job.name });
        }
      });
    });
  }

  // stats
  const jobCount = parsed ? Object.keys(parsed.jobs).length : 0;
  const stageCount = parsed?.type === 'gitlab' ? parsed.stages?.length : layers.length;
  const manualCount = parsed ? Object.values(parsed.jobs).filter(j => j.when === 'manual').length : 0;

  return (
    <div className="cicd-overlay" onClick={onClose}>
      <div className="cicd-container" onClick={e => e.stopPropagation()}>
        <div className="cicd-header">
          <div className="cicd-title-row">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
              <path d="M5.636 5.636l4.243 4.243M14.121 14.121l4.243 4.243M5.636 18.364l4.243-4.243M14.121 9.879l4.243-4.243" />
            </svg>
            <h2>CI/CD Pipeline Visualizer</h2>
          </div>
          <button className="cicd-close" onClick={onClose}>✕</button>
        </div>

        <div className="cicd-body">
          {/* Left panel - editor */}
          <div className="cicd-editor-panel">
            {/* Platform tabs */}
            <div className="cicd-platform-tabs">
              <button
                className={`cicd-platform-tab ${platform === 'github' ? 'active' : ''}`}
                onClick={() => switchPlatform('github')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                GitHub Actions
              </button>
              <button
                className={`cicd-platform-tab ${platform === 'gitlab' ? 'active' : ''}`}
                onClick={() => switchPlatform('gitlab')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.955 13.587l-1.342-4.135-2.664-8.189a.455.455 0 00-.867 0L16.418 9.45H7.582L4.918 1.263a.455.455 0 00-.867 0L1.386 9.452.044 13.587a.924.924 0 00.331 1.023L12 23.054l11.625-8.443a.92.92 0 00.33-1.024"/>
                </svg>
                GitLab CI
              </button>
            </div>

            {/* YAML editor */}
            <div className="cicd-editor-wrap">
              <div className="cicd-editor-toolbar">
                <span className="cicd-editor-label">
                  {platform === 'github' ? '.github/workflows/ci.yml' : '.gitlab-ci.yml'}
                </span>
                <button className="cicd-btn-sm" onClick={() => { setYaml(''); setParsed(null); setError(''); }}>
                  Clear
                </button>
                <button className="cicd-btn-sm" onClick={() => switchPlatform(platform)}>
                  Reset Sample
                </button>
              </div>
              <textarea
                className="cicd-textarea"
                value={yaml}
                onChange={e => setYaml(e.target.value)}
                placeholder={`Paste your ${platform === 'github' ? 'GitHub Actions' : 'GitLab CI'} YAML here...`}
                spellCheck={false}
              />
            </div>

            {/* Error */}
            {error && <div className="cicd-error">{error}</div>}

            {/* Stats bar */}
            {parsed && (
              <div className="cicd-stats">
                <div className="cicd-stat">
                  <span className="cicd-stat-val">{jobCount}</span>
                  <span className="cicd-stat-label">Jobs</span>
                </div>
                <div className="cicd-stat">
                  <span className="cicd-stat-val">{stageCount}</span>
                  <span className="cicd-stat-label">{parsed.type === 'gitlab' ? 'Stages' : 'Layers'}</span>
                </div>
                {parsed.type === 'github' && parsed.triggers?.length > 0 && (
                  <div className="cicd-stat">
                    <span className="cicd-stat-val">{parsed.triggers.length}</span>
                    <span className="cicd-stat-label">Triggers</span>
                  </div>
                )}
                {manualCount > 0 && (
                  <div className="cicd-stat">
                    <span className="cicd-stat-val">{manualCount}</span>
                    <span className="cicd-stat-label">Manual</span>
                  </div>
                )}
              </div>
            )}

            {/* Job detail panel */}
            {selectedJob && parsed?.jobs[selectedJob] && (
              <div className="cicd-job-detail">
                <div className="cicd-detail-header">
                  <h3>{selectedJob}</h3>
                  <button className="cicd-btn-sm" onClick={() => setSelectedJob(null)}>✕</button>
                </div>
                <div className="cicd-detail-body">
                  {parsed.type === 'github' && (
                    <>
                      {parsed.jobs[selectedJob].runsOn && (
                        <div className="cicd-detail-row">
                          <span className="cicd-detail-key">runs-on</span>
                          <span className="cicd-detail-value">{parsed.jobs[selectedJob].runsOn}</span>
                        </div>
                      )}
                      {parsed.jobs[selectedJob].environment && (
                        <div className="cicd-detail-row">
                          <span className="cicd-detail-key">environment</span>
                          <span className="cicd-detail-value cicd-env-badge">{parsed.jobs[selectedJob].environment}</span>
                        </div>
                      )}
                      {parsed.jobs[selectedJob].needs?.length > 0 && (
                        <div className="cicd-detail-row">
                          <span className="cicd-detail-key">needs</span>
                          <span className="cicd-detail-value">{parsed.jobs[selectedJob].needs.join(', ')}</span>
                        </div>
                      )}
                      {parsed.jobs[selectedJob].steps?.length > 0 && (
                        <div className="cicd-detail-steps">
                          <span className="cicd-detail-key">Steps ({parsed.jobs[selectedJob].steps.length})</span>
                          <div className="cicd-steps-list">
                            {parsed.jobs[selectedJob].steps.map((s, si) => (
                              <div key={si} className="cicd-step-item">
                                <span className="cicd-step-num">{si + 1}</span>
                                <div className="cicd-step-info">
                                  <span className="cicd-step-name">{s.name || s.uses || s.run || 'Step'}</span>
                                  {s.uses && <span className="cicd-step-uses">{s.uses}</span>}
                                  {s.run && !s.name && !s.uses && null}
                                  {s.run && (s.name || s.uses) && <span className="cicd-step-run">{s.run}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {parsed.type === 'gitlab' && (
                    <>
                      {parsed.jobs[selectedJob].stage && (
                        <div className="cicd-detail-row">
                          <span className="cicd-detail-key">stage</span>
                          <span className="cicd-detail-value">{parsed.jobs[selectedJob].stage}</span>
                        </div>
                      )}
                      {parsed.jobs[selectedJob].image && (
                        <div className="cicd-detail-row">
                          <span className="cicd-detail-key">image</span>
                          <span className="cicd-detail-value">{parsed.jobs[selectedJob].image}</span>
                        </div>
                      )}
                      {parsed.jobs[selectedJob].environment && (
                        <div className="cicd-detail-row">
                          <span className="cicd-detail-key">environment</span>
                          <span className="cicd-detail-value cicd-env-badge">{parsed.jobs[selectedJob].environment}</span>
                        </div>
                      )}
                      {parsed.jobs[selectedJob].when && (
                        <div className="cicd-detail-row">
                          <span className="cicd-detail-key">when</span>
                          <span className="cicd-detail-value cicd-when-badge">{parsed.jobs[selectedJob].when}</span>
                        </div>
                      )}
                      {parsed.jobs[selectedJob].allowFailure && (
                        <div className="cicd-detail-row">
                          <span className="cicd-detail-key">allow_failure</span>
                          <span className="cicd-detail-value cicd-allow-badge">true</span>
                        </div>
                      )}
                      {parsed.jobs[selectedJob].needs?.length > 0 && (
                        <div className="cicd-detail-row">
                          <span className="cicd-detail-key">needs</span>
                          <span className="cicd-detail-value">{parsed.jobs[selectedJob].needs.join(', ')}</span>
                        </div>
                      )}
                      {parsed.jobs[selectedJob].script?.length > 0 && (
                        <div className="cicd-detail-steps">
                          <span className="cicd-detail-key">Script</span>
                          <div className="cicd-steps-list">
                            {parsed.jobs[selectedJob].script.map((s, si) => (
                              <div key={si} className="cicd-step-item">
                                <span className="cicd-step-num">$</span>
                                <span className="cicd-step-name cicd-script-cmd">{s}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right panel - visualization */}
          <div className="cicd-visual-panel">
            {!parsed && !error && (
              <div className="cicd-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
                </svg>
                <p>Paste your CI/CD YAML to visualize the pipeline</p>
              </div>
            )}
            {parsed && (
              <>
                {/* Pipeline title bar */}
                <div className="cicd-pipeline-bar">
                  {parsed.type === 'github' && (
                    <>
                      <span className="cicd-pipeline-name">{parsed.name}</span>
                      {parsed.triggers?.length > 0 && (
                        <div className="cicd-trigger-tags">
                          {parsed.triggers.map((t, i) => (
                            <span key={i} className="cicd-trigger-tag">{t}</span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {parsed.type === 'gitlab' && (
                    <>
                      <span className="cicd-pipeline-name">GitLab Pipeline</span>
                      <div className="cicd-stage-tags">
                        {parsed.stages.map((s, i) => (
                          <span key={i} className="cicd-stage-tag" style={{ borderColor: getStageColor(i) }}>
                            <span className="cicd-stage-dot" style={{ background: getStageColor(i) }} />
                            {s}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Graph */}
                <div className="cicd-graph-scroll" ref={graphRef}>
                  <svg
                    ref={svgRef}
                    className="cicd-graph-svg"
                    width={Math.max(totalW, 400)}
                    height={Math.max(totalH, 200)}
                    viewBox={`0 0 ${Math.max(totalW, 400)} ${Math.max(totalH, 200)}`}
                  >
                    <defs>
                      <marker id="arrow" viewBox="0 0 10 7" refX="10" refY="3.5"
                        markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" opacity="0.7" />
                      </marker>
                      <marker id="arrow-hover" viewBox="0 0 10 7" refX="10" refY="3.5"
                        markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#a5b4fc" />
                      </marker>
                      <filter id="glow">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>

                    {/* Edges */}
                    {edges.map((edge, i) => {
                      const from = nodePositions[edge.from];
                      const to = nodePositions[edge.to];
                      if (!from || !to) return null;
                      const isHighlighted = hoveredJob === edge.from || hoveredJob === edge.to;
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
                          stroke={isHighlighted ? '#a5b4fc' : '#6366f1'}
                          strokeWidth={isHighlighted ? 2.5 : 1.5}
                          strokeDasharray={parsed.jobs[edge.to]?.when === 'manual' ? '6 4' : 'none'}
                          opacity={hoveredJob && !isHighlighted ? 0.2 : isHighlighted ? 1 : 0.5}
                          markerEnd={isHighlighted ? 'url(#arrow-hover)' : 'url(#arrow)'}
                          className="cicd-edge"
                          filter={isHighlighted ? 'url(#glow)' : 'none'}
                        />
                      );
                    })}

                    {/* Nodes */}
                    {layers.map((layer) =>
                      layer.map((name) => {
                        const pos = nodePositions[name];
                        const job = parsed.jobs[name];
                        if (!pos || !job) return null;
                        const isHover = hoveredJob === name;
                        const isSelected = selectedJob === name;
                        const color = parsed.type === 'gitlab'
                          ? getStageColor(parsed.stages.indexOf(job.stage))
                          : getJobColor(job);

                        return (
                          <g
                            key={name}
                            className={`cicd-node ${isHover ? 'hovered' : ''} ${isSelected ? 'selected' : ''}`}
                            onMouseEnter={() => setHoveredJob(name)}
                            onMouseLeave={() => setHoveredJob(null)}
                            onClick={() => setSelectedJob(name === selectedJob ? null : name)}
                            style={{ cursor: 'pointer' }}
                          >
                            <rect
                              x={pos.x}
                              y={pos.y}
                              width={pos.w}
                              height={pos.h}
                              rx="10"
                              fill={isSelected ? `${color}30` : isHover ? `${color}20` : '#1a1a2e'}
                              stroke={isSelected ? color : isHover ? color : `${color}60`}
                              strokeWidth={isSelected ? 2 : isHover ? 1.5 : 1}
                            />
                            {/* Color bar at left */}
                            <rect
                              x={pos.x}
                              y={pos.y}
                              width="4"
                              height={pos.h}
                              rx="2"
                              fill={color}
                              opacity={isHover || isSelected ? 1 : 0.7}
                            />
                            {/* Job name */}
                            <text
                              x={pos.x + 14}
                              y={pos.y + 24}
                              fill={isHover || isSelected ? '#fff' : '#e2e8f0'}
                              fontSize="13"
                              fontWeight="600"
                              fontFamily="'SF Mono', 'Fira Code', monospace"
                            >
                              {name.length > 18 ? name.slice(0, 17) + '…' : name}
                            </text>
                            {/* Sub-label */}
                            <text
                              x={pos.x + 14}
                              y={pos.y + 42}
                              fill="#94a3b8"
                              fontSize="10"
                              fontFamily="sans-serif"
                            >
                              {parsed.type === 'gitlab' ? (job.stage || '') : (job.runsOn || '')}
                              {job.environment ? ` · ${job.environment}` : ''}
                              {job.when === 'manual' ? ' · manual' : ''}
                            </text>
                            {/* Badges */}
                            {job.when === 'manual' && (
                              <g>
                                <rect x={pos.x + pos.w - 52} y={pos.y + 6} width="44" height="16" rx="8" fill="#f59e0b" opacity="0.2" />
                                <text x={pos.x + pos.w - 30} y={pos.y + 17} fill="#f59e0b" fontSize="9" textAnchor="middle" fontWeight="600">manual</text>
                              </g>
                            )}
                            {job.allowFailure && (
                              <g>
                                <rect x={pos.x + pos.w - 76} y={pos.y + 6} width="68" height="16" rx="8" fill="#f97316" opacity="0.2" />
                                <text x={pos.x + pos.w - 42} y={pos.y + 17} fill="#f97316" fontSize="9" textAnchor="middle" fontWeight="600">allow_failure</text>
                              </g>
                            )}
                          </g>
                        );
                      })
                    )}

                    {/* Layer labels */}
                    {layers.map((layer, li) => {
                      const x = li * (NODE_W + LAYER_GAP) + 40 + NODE_W / 2;
                      const label = parsed.type === 'gitlab'
                        ? (parsed.stages[li] || `Stage ${li + 1}`)
                        : `Layer ${li + 1}`;
                      return (
                        <text
                          key={`label-${li}`}
                          x={x}
                          y={20}
                          fill="#64748b"
                          fontSize="11"
                          textAnchor="middle"
                          fontWeight="500"
                        >
                          {label}
                        </text>
                      );
                    })}
                  </svg>
                </div>

                {/* Legend */}
                <div className="cicd-legend">
                  <div className="cicd-legend-item">
                    <span className="cicd-legend-line" />
                    <span>Dependency</span>
                  </div>
                  <div className="cicd-legend-item">
                    <span className="cicd-legend-line dashed" />
                    <span>Manual gate</span>
                  </div>
                  <div className="cicd-legend-item">
                    <span className="cicd-legend-dot" style={{ background: '#10b981' }} />
                    <span>Environment</span>
                  </div>
                  <div className="cicd-legend-item">
                    <span className="cicd-legend-dot" style={{ background: '#f59e0b' }} />
                    <span>Manual</span>
                  </div>
                  {parsed.type === 'gitlab' && (
                    <div className="cicd-legend-item">
                      <span className="cicd-legend-dot" style={{ background: '#f97316' }} />
                      <span>Allow failure</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
