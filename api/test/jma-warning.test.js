const assert = require('node:assert/strict');
const { once } = require('node:events');
const path = require('node:path');
const test = require('node:test');
const { readFileSync } = require('node:fs');

const express = require('express');

const { normalizeR8Warning, setupJmaRoutes } = require('../jma');

// 2026-10-21 https://www.jma.go.jp/bosai/warning/data/r8/016000.json (札幌管区気象台) 응답 원본.
const FIXTURE = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'jma-r8-016000-20261021.json'), 'utf8'));
const INACTIVE = new Set(['', '解除', '発表警報・注意報はなし']);

function activeKinds(normalized, classIndex = 0) {
  return normalized.areaTypes[classIndex].areas.flatMap((area) => area.warnings
    .filter((kind) => kind.code && !INACTIVE.has(kind.status))
    .map((kind) => ({ area: area.code, code: kind.code, status: kind.status })));
}

function report(dataTypeCode, reportDatetime, headlineText, class10Items, class20Items = []) {
  return { dataTypeCode, reportDatetime, headlineText, publishingOffice: '札幌管区気象台', warning: { class10Items, class20Items } };
}

test('the 2026-10-21 Sapporo response normalizes to one active thunder advisory', () => {
  const normalized = normalizeR8Warning(FIXTURE);

  assert.equal(normalized.source, 'r8');
  assert.equal(normalized.reportDatetime, '2026-10-21T09:18:00+09:00');
  assert.equal(normalized.headlineText, '石狩、空知、後志地方では、急な強い雨や落雷に注意してください。');
  assert.deepEqual(normalized.reports, [
    { dataTypeCode: 'VPWW56', reportDatetime: '2026-09-28T17:17:00+09:00' },
    { dataTypeCode: 'VPWW55', reportDatetime: '2026-10-06T04:01:00+09:00' },
    { dataTypeCode: 'VPWW58', reportDatetime: '2026-10-19T16:08:00+09:00' },
    { dataTypeCode: 'VPWW59', reportDatetime: '2026-10-19T16:08:00+09:00' },
    { dataTypeCode: 'VPWW61', reportDatetime: '2026-10-21T09:18:00+09:00' },
  ]);
  assert.deepEqual(normalized.areaTypes[0].areas.map((area) => area.code), ['016010', '016020', '016030']);
  assert.deepEqual(new Set(activeKinds(normalized).map((kind) => kind.code)), new Set(['14']));
  assert.deepEqual(activeKinds(normalized).map((kind) => kind.status), ['継続', '継続', '継続']);
  assert.equal(normalized.areaTypes[1].areas.length, 52);
  assert.deepEqual(new Set(activeKinds(normalized, 1).map((kind) => kind.code)), new Set(['14']));
});

test('an active warning in an earlier product survives a later advisory report', () => {
  const normalized = normalizeR8Warning([
    report('VPWW55', '2026-10-21T06:00:00+09:00', '大雨に警戒してください。', [
      { areaCode: '016010', kinds: [{ code: '03', status: '発表' }] },
    ]),
    report('VPWW61', '2026-10-21T09:18:00+09:00', '落雷に注意してください。', [
      { areaCode: '016010', kinds: [{ code: '14', status: '発表' }] },
    ]),
  ]);

  assert.deepEqual(activeKinds(normalized), [
    { area: '016010', code: '03', status: '発表' },
    { area: '016010', code: '14', status: '発表' },
  ]);
  assert.equal(normalized.headlineText, '大雨に警戒してください。\n落雷に注意してください。');
  assert.equal(normalized.reportDatetime, '2026-10-21T09:18:00+09:00');
});

test('only the latest report of each product is merged and later statuses win', () => {
  const normalized = normalizeR8Warning([
    report('VPWW61', '2026-10-21T09:18:00+09:00', '落雷に注意してください。', [
      { areaCode: '016010', kinds: [{ code: '14', status: '継続' }] },
    ]),
    report('VPWW61', '2026-10-20T09:00:00+09:00', '濃霧に注意してください。', [
      { areaCode: '016010', kinds: [{ code: '20', status: '発表' }] },
    ]),
  ]);

  assert.deepEqual(activeKinds(normalized), [{ area: '016010', code: '14', status: '継続' }]);
  assert.equal(normalized.headlineText, '落雷に注意してください。');
  assert.equal(normalized.reports.length, 1);
});

test('the same kind in the same area takes the status of the later product report', () => {
  const normalized = normalizeR8Warning([
    report('VPWW61', '2026-10-21T13:00:00+09:00', '注意報を解除します。', [
      { areaCode: '016010', kinds: [{ code: '20', status: '解除' }] },
    ]),
    report('VPWW55', '2026-10-21T08:00:00+09:00', '濃霧に注意してください。', [
      { areaCode: '016010', kinds: [{ code: '20', status: '発表' }] },
    ]),
  ]);

  assert.deepEqual(normalized.areaTypes[0].areas[0].warnings, [{ code: '20', status: '解除' }]);
  assert.equal(normalized.headlineText, '');
});

test('a latest report that only lifts advisories leaves the headline empty', () => {
  const normalized = normalizeR8Warning([
    report('VPWW61', '2026-10-20T09:00:00+09:00', '落雷に注意してください。', [
      { areaCode: '016010', kinds: [{ code: '14', status: '発表' }] },
    ]),
    report('VPWW58', '2026-10-21T12:00:00+09:00', '注意報を解除します。', [
      { areaCode: '016010', kinds: [{ code: '15', status: '解除' }] },
      { areaCode: '016020', kinds: [{ status: '発表警報・注意報はなし' }] },
    ]),
    report('VPWW61', '2026-10-21T13:00:00+09:00', '注意報を解除します。', [
      { areaCode: '016010', kinds: [{ code: '14', status: '解除' }] },
    ]),
  ]);

  assert.equal(normalized.headlineText, '');
  assert.deepEqual(activeKinds(normalized), []);
  assert.equal(normalized.reportDatetime, '2026-10-21T13:00:00+09:00');
  assert.deepEqual(normalized.areaTypes[0].areas.find((area) => area.code === '016020').warnings, [{ status: '発表警報・注意報はなし' }]);
});

test('two reports of the same product at the same time are both merged', () => {
  const normalized = normalizeR8Warning([
    report('VPWW61', '2026-10-21T09:18:00+09:00', '落雷に注意してください。', [
      { areaCode: '016010', kinds: [{ code: '14', status: '発表' }] },
    ]),
    report('VPWW61', '2026-10-21T09:18:00+09:00', '濃霧に注意してください。', [
      { areaCode: '016020', kinds: [{ code: '20', status: '発表' }] },
    ]),
  ]);

  assert.deepEqual(activeKinds(normalized), [
    { area: '016010', code: '14', status: '発表' },
    { area: '016020', code: '20', status: '発表' },
  ]);
  assert.equal(normalized.reports.length, 2);
  assert.equal(normalized.headlineText, '落雷に注意してください。\n濃霧に注意してください。');
});

test('a payload that is not a report list is rejected', () => {
  assert.throws(() => normalizeR8Warning({ reportDatetime: '2026-05-28T04:03:00+09:00', areaTypes: [] }));
});

async function listen(get) {
  const app = express();
  setupJmaRoutes(app, { get });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.close();
      await once(server, 'close');
    },
  };
}

test('the warning route reads only the r8 path and serves the legacy object shape', async (t) => {
  const paths = [];
  const runtime = await listen(async (requested) => {
    paths.push(requested);
    return { status: 200, body: Buffer.from(JSON.stringify(FIXTURE)) };
  });
  t.after(() => runtime.close());

  const response = await fetch(`${runtime.origin}/api/jma/warning?code=016000`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(paths, ['/warning/data/r8/016000.json']);
  assert.equal(body.source, 'r8');
  assert.equal(body.stale, undefined);
  assert.equal(body.headlineText, '石狩、空知、後志地方では、急な強い雨や落雷に注意してください。');
  assert.ok(Array.isArray(body.areaTypes[0].areas[0].warnings));
});

test('an upstream failure returns the last good warning marked stale', async (t) => {
  let fail = false;
  const runtime = await listen(async () => {
    if (fail) throw new Error('JMA request error [ETIMEDOUT]: timeout');
    return { status: 200, body: Buffer.from(JSON.stringify(FIXTURE)) };
  });
  t.after(() => runtime.close());

  const fresh = await (await fetch(`${runtime.origin}/api/jma/warning?code=016000`)).json();
  fail = true;
  const response = await fetch(`${runtime.origin}/api/jma/warning?code=016000`);
  const stale = await response.json();

  assert.equal(response.status, 200);
  assert.equal(stale.stale, true);
  assert.equal(stale.reportDatetime, fresh.reportDatetime);
  assert.equal(stale.headlineText, fresh.headlineText);
});

test('an upstream failure without a previous warning keeps the existing error contract', async (t) => {
  const runtime = await listen(async (requested) => (
    requested.endsWith('016000.json')
      ? { status: 404, body: Buffer.from('not found') }
      : Promise.reject(new Error('JMA request error [ECONNRESET]: reset'))
  ));
  t.after(() => runtime.close());

  const missing = await fetch(`${runtime.origin}/api/jma/warning?code=016000`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'JMA warning unavailable' });

  const broken = await fetch(`${runtime.origin}/api/jma/warning?code=130000`);
  assert.equal(broken.status, 502);
  assert.equal((await broken.json()).error, 'JMA upstream error');
});
