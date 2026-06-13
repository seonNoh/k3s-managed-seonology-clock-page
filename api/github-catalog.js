const https = require('https');
const crypto = require('crypto');

// GitHub 레포 토픽별 카탈로그: 주기 폴링으로 스냅샷을 만들고, 변경 시에만 SSE로 푸시한다.
// 토큰: 카탈로그 전용(private read 스코프) 우선, 없으면 기존 GITHUB_TOKEN 폴백(스코프 없으면 public만 보임).
const TOKEN = process.env.GITHUB_CATALOG_TOKEN || process.env.GITHUB_TOKEN || '';
const INTERVAL = parseInt(process.env.CATALOG_INTERVAL_MS || '', 10) || 5 * 60 * 1000;

// 토픽 분류 체계 (seonNoh 레포 용도별 그룹). 레포의 topics 배열을 기준으로 매핑한다.
const GROUPS = [
  { key: 'active', label: '현역', topics: ['sn-infra', 'sn-portal', 'sn-journey', 'sn-seoniverse', 'sn-cms-hub', 'sn-apps', 'sn-mcp', 'sn-tools'] },
  { key: 'devops', label: 'DevOps Daily', topics: ['devops-daily', 'dd-gitops', 'dd-security', 'dd-iac', 'dd-observability', 'dd-scaling'] },
  { key: 'content', label: '콘텐츠', topics: ['content-pub'] },
  { key: 'learning', label: '학습/실험', topics: ['lab', 'study-old'] },
  { key: 'personal', label: '개인', topics: ['proj-persona', 'personal-old'] },
  { key: 'client', label: '클라이언트', topics: ['client-recomot', 'client-mobidays', 'client-komatsu', 'client-zeal', 'client-fuller'] },
  { key: 'fork', label: 'Fork', topics: ['fork'] },
];
const KNOWN_TOPICS = new Set(GROUPS.flatMap(g => g.topics));

let cache = { version: 0, fetchedAt: null, count: 0, stale: true, error: null, groups: [] };
let lastHash = '';
let version = 0;
const clients = new Set();

function githubGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${TOKEN}`,
        'User-Agent': 'seonology-clock-page-catalog',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch { /* non-JSON body */ }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchAllRepos() {
  const all = [];
  // sort=full_name(안정 정렬)으로 페이지를 순회. 새 레포/토픽 변경/삭제 모두 콘텐츠 해시로 감지한다.
  for (let page = 1; page <= 5; page += 1) {
    const { status, data } = await githubGet(`/user/repos?per_page=100&affiliation=owner&sort=full_name&page=${page}`);
    if (status !== 200) {
      const msg = data && data.message ? data.message : `HTTP ${status}`;
      throw new Error(`GitHub API: ${msg}`);
    }
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < 100) break;
  }
  return all;
}

function slim(r) {
  return {
    name: r.name,
    fullName: r.full_name,
    description: r.description || '',
    private: !!r.private,
    fork: !!r.fork,
    language: r.language || null,
    pushedAt: r.pushed_at,
    htmlUrl: r.html_url,
    topics: r.topics || [],
  };
}

function classify(repos) {
  const groupMap = GROUPS.map(g => ({
    key: g.key,
    label: g.label,
    topics: g.topics.map(t => ({ key: t, label: t, repos: [] })),
  }));
  const uncategorized = [];
  for (const r of repos) {
    const s = slim(r);
    const matched = s.topics.filter(t => KNOWN_TOPICS.has(t));
    if (matched.length === 0) { uncategorized.push(s); continue; }
    for (const g of groupMap) {
      for (const t of g.topics) {
        if (matched.includes(t.key)) t.repos.push(s);
      }
    }
  }
  const byPushedDesc = (a, b) => (b.pushedAt || '').localeCompare(a.pushedAt || '');
  const groups = groupMap
    .map(g => ({
      key: g.key,
      label: g.label,
      count: g.topics.reduce((n, t) => n + t.repos.length, 0),
      topics: g.topics.filter(t => t.repos.length).map(t => ({ ...t, repos: t.repos.slice().sort(byPushedDesc) })),
    }))
    .filter(g => g.topics.length);
  if (uncategorized.length) {
    groups.push({
      key: 'uncat',
      label: '미분류',
      count: uncategorized.length,
      topics: [{ key: '_uncat', label: '(토픽 없음)', repos: uncategorized.slice().sort(byPushedDesc) }],
    });
  }
  return groups;
}

function broadcast(snapshot) {
  const frame = `event: catalog\ndata: ${JSON.stringify(snapshot)}\nid: ${snapshot.version}\n\n`;
  for (const res of clients) {
    try { res.write(frame); } catch { /* client gone */ }
  }
}

async function refreshCatalog() {
  if (!TOKEN) {
    cache = { ...cache, stale: true, error: 'GITHUB_CATALOG_TOKEN not configured' };
    return;
  }
  try {
    const repos = await fetchAllRepos();
    const groups = classify(repos);
    const hash = crypto.createHash('sha1').update(JSON.stringify(groups)).digest('hex');
    if (hash !== lastHash) {
      lastHash = hash;
      version += 1;
      cache = { version, fetchedAt: Date.now(), count: repos.length, stale: false, error: null, groups };
      broadcast(cache);
    } else {
      cache = { ...cache, fetchedAt: Date.now(), stale: false, error: null };
    }
  } catch (e) {
    // 폴링 실패 시 직전 스냅샷을 유지하고 stale 표시만 한다.
    cache = { ...cache, stale: true, error: String((e && e.message) || e) };
  }
}

function setupGithubCatalogRoutes(app) {
  // 캐시된 토픽별 스냅샷 (초기 로드/폴백)
  app.get('/api/github/repos', (req, res) => {
    res.json(cache);
  });

  // SSE: 연결 즉시 현재 스냅샷 1회 + 변경 시마다 push
  app.get('/api/github/repos/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 5000\n\n');
    res.write(`event: catalog\ndata: ${JSON.stringify(cache)}\nid: ${cache.version}\n\n`);
    clients.add(res);
    const hb = setInterval(() => {
      try { res.write(': hb\n\n'); } catch { /* client gone */ }
    }, 25000);
    req.on('close', () => { clearInterval(hb); clients.delete(res); });
  });

  // 수동 강제 갱신
  app.post('/api/github/repos/refresh', async (req, res) => {
    await refreshCatalog();
    res.json({ ok: true, version: cache.version, count: cache.count, stale: cache.stale, error: cache.error });
  });

  // 기동 5초 후 1차 수집 → INTERVAL 주기 폴링
  setTimeout(() => {
    refreshCatalog();
    setInterval(refreshCatalog, INTERVAL);
  }, 5000);

  console.log(`GitHub catalog: token=${!!TOKEN}, interval=${INTERVAL}ms`);
}

module.exports = { setupGithubCatalogRoutes };
