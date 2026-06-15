// 일본 기상청(JMA) bosai 데이터 프록시.
// - /api/jma/forecast?code=016000  단기+주간 예보(10분 캐시)
// - /api/jma/warning?code=016000   특보/경보(단발 조회)
// - /api/jma/warning/stream?code=  특보 SSE(서버 1분 폴링 → 변경 시에만 push)
// JMA bosai 는 공개·CORS 허용이지만, 서버 프록시로 캐시·SSE·사양변경 대응을 일원화한다.
// 출처 표기 의무: 기상청(JMA). 라이선스: 공공데이터이용약관(CC-BY 유사).
const https = require('https');

const JMA_BASE = 'https://www.jma.go.jp/bosai';
const FORECAST_TTL = 10 * 60 * 1000; // 단기/주간 예보 캐시 10분
const WARNING_POLL = 60 * 1000;      // 특보 폴링 1분
const validCode = (c) => /^\d{6}$/.test(c);

function jmaGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.get(`${JMA_BASE}${path}`, { family: 4, timeout: 10000 }, (up) => {
      const chunks = [];
      up.on('data', (c) => chunks.push(c));
      up.on('end', () => resolve({ status: up.statusCode || 502, body: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout after 10s')));
    req.on('error', (e) => reject(new Error(`JMA request error [${e.code || e.errno || 'unknown'}]: ${e.message || ''}`)));
  });
}

function hashBuf(buf) {
  const s = buf.toString('utf8');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

const fcCache = new Map();    // code -> { at, body }
const warnClients = new Map(); // code -> Set<res>
const warnCache = new Map();   // code -> { hash, body }
let warnTimer = null;

async function pollWarnings() {
  for (const code of [...warnClients.keys()]) {
    const set = warnClients.get(code);
    if (!set || set.size === 0) { warnClients.delete(code); warnCache.delete(code); continue; }
    try {
      const r = await jmaGet(`/warning/data/warning/${code}.json`);
      if (r.status !== 200) continue;
      const h = hashBuf(r.body);
      const prev = warnCache.get(code);
      if (!prev || prev.hash !== h) {
        warnCache.set(code, { hash: h, body: r.body });
        const frame = `event: warning\ndata: ${r.body.toString('utf8')}\n\n`;
        for (const res of set) { try { res.write(frame); } catch { /* gone */ } }
      }
    } catch { /* 다음 주기 재시도 */ }
  }
  if (warnClients.size === 0 && warnTimer) { clearInterval(warnTimer); warnTimer = null; }
}

function setupJmaRoutes(app) {
  // 단기+주간 예보 (10분 캐시)
  app.get('/api/jma/forecast', async (req, res) => {
    const code = String(req.query.code || '');
    if (!validCode(code)) return res.status(400).json({ error: 'invalid area code' });
    const c = fcCache.get(code);
    if (c && Date.now() - c.at < FORECAST_TTL) { res.set('Content-Type', 'application/json'); return res.send(c.body); }
    try {
      const r = await jmaGet(`/forecast/data/forecast/${code}.json`);
      if (r.status !== 200) return res.status(r.status).json({ error: 'JMA forecast unavailable' });
      fcCache.set(code, { at: Date.now(), body: r.body });
      res.set('Content-Type', 'application/json');
      res.send(r.body);
    } catch (e) { res.status(502).json({ error: 'JMA upstream error', detail: String(e.message || e) }); }
  });

  // 특보/경보 단발 조회
  app.get('/api/jma/warning', async (req, res) => {
    const code = String(req.query.code || '');
    if (!validCode(code)) return res.status(400).json({ error: 'invalid area code' });
    try {
      const r = await jmaGet(`/warning/data/warning/${code}.json`);
      if (r.status !== 200) return res.status(r.status).json({ error: 'JMA warning unavailable' });
      res.set('Content-Type', 'application/json');
      res.send(r.body);
    } catch (e) { res.status(502).json({ error: 'JMA upstream error', detail: String(e.message || e) }); }
  });

  // 특보 SSE: 서버가 1분 폴링 → 변경 시에만 push
  app.get('/api/jma/warning/stream', (req, res) => {
    const code = String(req.query.code || '');
    if (!validCode(code)) return res.status(400).end();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 5000\n\n');

    const cached = warnCache.get(code);
    if (cached) {
      res.write(`event: warning\ndata: ${cached.body.toString('utf8')}\n\n`);
    } else {
      jmaGet(`/warning/data/warning/${code}.json`).then((r) => {
        if (r.status === 200) {
          warnCache.set(code, { hash: hashBuf(r.body), body: r.body });
          try { res.write(`event: warning\ndata: ${r.body.toString('utf8')}\n\n`); } catch { /* gone */ }
        }
      }).catch(() => {});
    }

    if (!warnClients.has(code)) warnClients.set(code, new Set());
    warnClients.get(code).add(res);
    if (!warnTimer) warnTimer = setInterval(pollWarnings, WARNING_POLL);

    const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch { /* gone */ } }, 25000);
    req.on('close', () => {
      clearInterval(hb);
      const s = warnClients.get(code);
      if (s) { s.delete(res); if (s.size === 0) { warnClients.delete(code); warnCache.delete(code); } }
    });
  });
}

module.exports = { setupJmaRoutes };
