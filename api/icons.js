// svg-studio 아이콘 라이브러리 프록시.
// studio.seonology.com(seonology-svg-studio)이 정적 서빙하는 /icons/index.json 카탈로그와
// /icons/{provider}/{name}.svg 파일을 clock-page에서 재노출한다. svg-studio는 같은
// 클러스터(seonology-apps) 내부 ClusterIP 서비스라 인증 없이 접근 가능하다.
const http = require('http');

const ICONS_BASE = (process.env.ICONS_BASE || 'http://seonology-svg-studio').replace(/\/$/, '');
const INDEX_TTL = 10 * 60 * 1000; // 카탈로그 캐시 10분

let indexCache = null;
let indexCachedAt = 0;

// 업스트림 GET을 받아 콜백으로 status/headers/body(buffer)를 넘긴다.
function upstreamGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${ICONS_BASE}${path}`, (up) => {
      const chunks = [];
      up.on('data', (c) => chunks.push(c));
      up.on('end', () => resolve({ status: up.statusCode || 502, headers: up.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('icons upstream timeout')));
  });
}

function setupIconRoutes(app) {
  // 카탈로그: { aws:[{p,l,c}], azure:[...], ... } (10분 캐시)
  app.get('/api/icons/index', async (req, res) => {
    const now = Date.now();
    if (indexCache && now - indexCachedAt < INDEX_TTL) {
      res.set('Content-Type', 'application/json');
      return res.send(indexCache);
    }
    try {
      const r = await upstreamGet('/icons/index.json');
      if (r.status !== 200) return res.status(r.status).json({ error: 'icons index unavailable' });
      indexCache = r.body;
      indexCachedAt = now;
      res.set('Content-Type', 'application/json');
      res.send(r.body);
    } catch (e) {
      res.status(502).json({ error: 'icons upstream error', detail: String(e.message || e) });
    }
  });

  // 개별 SVG: /api/icons/svg?path=aws/networking-....svg
  app.get('/api/icons/svg', async (req, res) => {
    const p = String(req.query.path || '');
    // 경로 검증: 영숫자/-/_/./슬래시 + .svg 로 끝, 상위 경로(..) 금지
    if (!/^[a-zA-Z0-9._\-/]+\.svg$/.test(p) || p.includes('..')) {
      return res.status(400).json({ error: 'invalid icon path' });
    }
    try {
      const r = await upstreamGet(`/icons/${p}`);
      if (r.status !== 200) return res.status(r.status).end();
      res.set('Content-Type', 'image/svg+xml');
      res.set('Cache-Control', 'public, max-age=86400'); // 아이콘은 사실상 불변
      res.send(r.body);
    } catch (e) {
      res.status(502).json({ error: 'icon upstream error', detail: String(e.message || e) });
    }
  });
}

module.exports = { setupIconRoutes };
