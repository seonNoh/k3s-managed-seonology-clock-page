// 일본 기상청(JMA) bosai 데이터 프록시.
// - /api/jma/forecast?code=016000  단기+주간 예보(10분 캐시)
// - /api/jma/warning?code=016000   특보/경보(단발 조회, r8 보고 목록을 옛 객체 형식으로 정규화)
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

// 2026-05-28 방재기상정보 체계 변경 이후 특보는 r8 경로에만 갱신된다.
// 옛 경로(/warning/data/warning/)는 그 시점에서 멈춘 데이터를 계속 내보내므로 읽지 않는다.
const warningPath = (code) => `/warning/data/r8/${code}.json`;

// 활성 특보가 아닌 상태. 이런 상태만 있는 보고의 headlineText 는 표시하지 않는다.
const INACTIVE_STATUSES = new Set(['', '解除', '発表警報・注意報はなし']);
const WARNING_CLASSES = ['class10Items', 'class20Items'];
const list = (value) => (Array.isArray(value) ? value : []);
const isActiveKind = (kind) => Boolean(kind && kind.code) && !INACTIVE_STATUSES.has(String(kind.status || ''));

function reportTime(report) {
  const t = Date.parse(report && report.reportDatetime);
  return Number.isFinite(t) ? t : -Infinity;
}


// r8 응답은 전문 종류(dataTypeCode: VPWW55 大雨, VPWW56 土砂災害, …, VPWW61 注意報)별 보고 목록이다.
// 종류별로 가장 늦은 보고(같은 시각이면 모두)를 골라 지역 code 별로 kinds 를 합치고,
// 기존 소비자가 읽는 옛 형식(reportDatetime, headlineText, areaTypes[].areas[].warnings)으로 돌려준다.
function normalizeR8Warning(reports) {
  if (!Array.isArray(reports)) throw new Error('unexpected r8 warning payload');

  const latestByType = new Map();
  reports.forEach((report, index) => {
    if (!report || typeof report !== 'object') return;
    const type = String(report.dataTypeCode || '');
    const entry = { at: reportTime(report), index, report };
    const current = latestByType.get(type);
    if (!current || entry.at > current[0].at) latestByType.set(type, [entry]);
    else if (entry.at === current[0].at) current.push(entry);
  });

  // 시각 오름차순으로 병합해, 같은 지역·같은 kind code 는 늦은 보고의 상태가 남게 한다.
  const selected = [...latestByType.values()].flat().sort((a, b) => (a.at - b.at) || (a.index - b.index));

  const classes = WARNING_CLASSES.map(() => new Map());
  const kindSource = new Map(); // kind 객체 -> 그 kind 를 담은 보고
  for (const { report } of selected) {
    const warning = report.warning || {};
    WARNING_CLASSES.forEach((key, classIndex) => {
      const areas = classes[classIndex];
      for (const item of list(warning[key])) {
        const areaCode = String((item && item.areaCode) || '');
        if (!areaCode) continue;
        if (!areas.has(areaCode)) areas.set(areaCode, { coded: new Map(), uncoded: null });
        const area = areas.get(areaCode);
        for (const kind of list(item.kinds)) {
          if (!kind || typeof kind !== 'object') continue;
          kindSource.set(kind, report);
          if (kind.code) area.coded.set(String(kind.code), kind);
          else area.uncoded = kind;
        }
      }
    });
  }

  const areaTypes = classes.map((areas) => ({
    areas: [...areas.entries()].map(([code, area]) => ({
      code,
      warnings: area.coded.size > 0 ? [...area.coded.values()] : (area.uncoded ? [area.uncoded] : []),
    })),
  }));

  // 병합 결과에서 아직 활성인 kind 를 제공한 보고의 문장만 쓴다.
  // 같은 kind 가 더 늦은 보고에서 해제되었다면 앞선 보고의 문장은 남기지 않는다.
  const reportsWithActiveKinds = new Set();
  for (const areas of classes) {
    for (const area of areas.values()) {
      for (const kind of area.coded.values()) {
        if (isActiveKind(kind)) reportsWithActiveKinds.add(kindSource.get(kind));
      }
    }
  }
  const headlines = [];
  for (const { report } of selected) {
    const text = String(report.headlineText || '').trim();
    if (text && reportsWithActiveKinds.has(report) && !headlines.includes(text)) headlines.push(text);
  }

  const latest = selected.length ? selected[selected.length - 1].report : null;
  return {
    reportDatetime: latest ? String(latest.reportDatetime || '') : '',
    publishingOffice: latest ? String(latest.publishingOffice || '') : '',
    headlineText: headlines.join('\n'),
    areaTypes,
    source: 'r8',
    reports: selected.map(({ report }) => ({
      dataTypeCode: String(report.dataTypeCode || ''),
      reportDatetime: String(report.reportDatetime || ''),
    })),
  };
}

async function fetchWarning(get, code) {
  const r = await get(warningPath(code));
  if (r.status !== 200) {
    const error = new Error(`JMA warning status ${r.status}`);
    error.status = r.status;
    throw error;
  }
  return JSON.stringify(normalizeR8Warning(JSON.parse(r.body.toString('utf8'))));
}

const staleBody = (body) => JSON.stringify({ ...JSON.parse(body), stale: true });

function hashText(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function setupJmaRoutes(app, { get = jmaGet } = {}) {
  const fcCache = new Map();     // code -> { at, body }
  const warnClients = new Map(); // code -> Set<res>
  const warnCache = new Map();   // code -> { hash, body } (SSE 변경 감지용, 구독자가 없으면 비운다)
  const lastWarning = new Map(); // code -> 마지막으로 정규화에 성공한 본문(상류 실패 시 stale 응답용)
  let warnTimer = null;

  const loadWarning = async (code) => {
    const body = await fetchWarning(get, code);
    lastWarning.set(code, body);
    return body;
  };

  async function pollWarnings() {
    for (const code of [...warnClients.keys()]) {
      const set = warnClients.get(code);
      if (!set || set.size === 0) { warnClients.delete(code); warnCache.delete(code); continue; }
      try {
        const body = await loadWarning(code);
        const h = hashText(body);
        const prev = warnCache.get(code);
        if (!prev || prev.hash !== h) {
          warnCache.set(code, { hash: h, body });
          const frame = `event: warning\ndata: ${body}\n\n`;
          for (const res of set) { try { res.write(frame); } catch { /* gone */ } }
        }
      } catch { /* 다음 주기 재시도 */ }
    }
    if (warnClients.size === 0 && warnTimer) { clearInterval(warnTimer); warnTimer = null; }
  }

  // 단기+주간 예보 (10분 캐시)
  app.get('/api/jma/forecast', async (req, res) => {
    const code = String(req.query.code || '');
    if (!validCode(code)) return res.status(400).json({ error: 'invalid area code' });
    const c = fcCache.get(code);
    if (c && Date.now() - c.at < FORECAST_TTL) { res.set('Content-Type', 'application/json'); return res.send(c.body); }
    try {
      const r = await get(`/forecast/data/forecast/${code}.json`);
      if (r.status !== 200) return res.status(r.status).json({ error: 'JMA forecast unavailable' });
      fcCache.set(code, { at: Date.now(), body: r.body });
      res.set('Content-Type', 'application/json');
      res.send(r.body);
    } catch (e) { res.status(502).json({ error: 'JMA upstream error', detail: String(e.message || e) }); }
  });

  // 특보/경보 단발 조회. 상류 실패 시 직전 성공값이 있으면 stale: true 를 붙여 돌려준다.
  app.get('/api/jma/warning', async (req, res) => {
    const code = String(req.query.code || '');
    if (!validCode(code)) return res.status(400).json({ error: 'invalid area code' });
    try {
      const body = await loadWarning(code);
      res.set('Content-Type', 'application/json');
      res.send(body);
    } catch (e) {
      const last = lastWarning.get(code);
      if (last) { res.set('Content-Type', 'application/json'); return res.send(staleBody(last)); }
      if (e.status) return res.status(e.status).json({ error: 'JMA warning unavailable' });
      res.status(502).json({ error: 'JMA upstream error', detail: String(e.message || e) });
    }
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
      res.write(`event: warning\ndata: ${cached.body}\n\n`);
    } else {
      loadWarning(code).then((body) => {
        warnCache.set(code, { hash: hashText(body), body });
        try { res.write(`event: warning\ndata: ${body}\n\n`); } catch { /* gone */ }
      }).catch(() => {
        const last = lastWarning.get(code);
        if (last) { try { res.write(`event: warning\ndata: ${staleBody(last)}\n\n`); } catch { /* gone */ } }
      });
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

module.exports = { setupJmaRoutes, normalizeR8Warning };
