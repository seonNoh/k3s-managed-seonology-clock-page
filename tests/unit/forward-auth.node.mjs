import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { createForwardAuthFetch, setUnsavedChangesProbe, onForwardAuthRecovered } = await import('../../src/api/forwardAuth.js');
const makeApi = (fetcher,browser) => ({request:createForwardAuthFetch(fetcher,browser),register:setUnsavedChangesProbe,subscribe:onForwardAuthRecovered});
function fixture(response = expired(), ancestors) {
  const navigations = [], messages = [], calls = [], intervals = new Set(), timeouts = new Set();
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.textContent = ''; this.listeners = {}; }
    setAttribute(key, value) { this[key] = value; }
    appendChild(child) { if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child); this.children.push(child); child.parent = this; return child; }
    get parentElement() { return this.parent; }
    get isConnected() { return this.tagName === 'body' || Boolean(this.parent?.isConnected); }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); this.parent = undefined; }
    click() { this.listeners.click(); }
  }
  const body = new Element('body');
  const document = { body, createElement: tag => new Element(tag) };
  const listeners = new Map();
  const location = { href: 'https://cost.seonology.com/history?tab=sync#recent', ancestorOrigins: ancestors, reload: () => navigations.push(location.href) };
  let popup = { closed: false, location: { href: 'about:blank', origin: 'null' }, document: { readyState: 'complete' }, close() { this.closed = true; } };
  const opened = [];
  const browser = { location, document, self: {}, top: null,
    addEventListener: (type,fn) => {listeners.set(type,fn);},
    open: (...args) => { opened.push(args); return popup; },
    setInterval: fn => { intervals.add(fn); return fn; }, clearInterval: fn => intervals.delete(fn),
    setTimeout: fn => { timeouts.add(fn); return fn; }, clearTimeout: fn => timeouts.delete(fn),
  };
  browser.top = ancestors === undefined ? browser.self : { postMessage: (...args) => messages.push(args) };
  const fetcher = async (...args) => { calls.push(args); return typeof response === 'function' ? response(...args) : response; };
  const api = makeApi(fetcher, browser);
  const find = text => { const all = []; const walk = e => { all.push(e); e.children.forEach(walk); }; walk(body); return all.find(e => e.textContent === text) || all.find(e => e.textContent.includes(text)); };
  return { request: api.request, register: api.register, subscribe:api.subscribe, receive:(data,origin,source)=>listeners.get('message')?.({data,origin,source}), browser, body, find, opened,
    navigations, messages, calls, location, tick: () => [...intervals].forEach(fn => fn()),
    timeout: () => [...timeouts].forEach(fn => fn()), popup: () => popup, block: () => { popup = null; } };
}
const expired = () => new Response('Unauthorized', { status: 401, headers: { 'X-Forward-Auth-Required': '1' } });
const reject = request => assert.rejects(request, /Authentication (?:is )?required/);

test('concurrent marked 401 and subsequent calls initiate one clean read recovery', async () => {
  const f = fixture();
  await Promise.allSettled(Array.from({length: 8}, () => f.request('/api/data')));
  await reject(f.request('/api/later'));
  assert.deepEqual(f.navigations, [f.location.href]);
  assert.equal(f.calls.length, 8);
});

test('ordinary errors and responses keep existing handling', async () => {
  for (const response of [new Response('', {status:401}), new Response('', {status:401, headers:{'X-Forward-Auth-Required':'0'}}), new Response('{}', {headers:{'X-Forward-Auth-Required':'1'}})]) {
    const f = fixture(response);
    assert.equal(await f.request('/api/data'), response);
    assert.equal(f.navigations.length, 0);
  }
});

test('external input and redirected response origins cannot initiate recovery', async () => {
  const f = fixture();
  assert.equal((await f.request('https://other.example/api')).status, 401);
  const response = expired();
  Object.defineProperty(response, 'url', {value:'https://other.example/api'});
  assert.equal(await fixture(response).request('/api/data'), response);
  assert.equal(f.navigations.length, 0);
});

test('only a proven Console top ancestor receives a clean read message', async () => {
  const f = fixture(expired(), ['https://nested.example', 'https://www.seonology.com']);
  await Promise.allSettled([f.request('/api/a'), f.request('/api/b')]);
  assert.deepEqual(JSON.parse(JSON.stringify(f.messages)), [[{type:'seonology:forward-auth-required', href:f.location.href}, 'https://www.seonology.com']]);
  assert.equal(f.navigations.length, 0);
});

test('other, unknown and intermediary-only Console ancestors reload this frame', async () => {
  for (const ancestors of [[], ['https://other.example'], ['https://www.seonology.com','https://other.example']]) {
    const f = fixture(expired(), ancestors);
    await reject(f.request('/api/data'));
    assert.deepEqual(f.navigations, [f.location.href]);
    assert.equal(f.messages.length, 0);
  }
});

test('GET HEAD OPTIONS are safe, while every write method keeps the document and payload', async () => {
  for (const method of ['GET','HEAD','OPTIONS']) {
    const f = fixture();
    await reject(f.request('/api/data', {method}));
    assert.equal(f.navigations.length, 1);
  }
  for (const method of ['POST','PUT','PATCH','DELETE','PROPFIND']) {
    const f = fixture();
    const init = {method, body:'payload', headers:{'X-Test':'kept'}};
    await reject(f.request('/api/data', init));
    await reject(f.request('/api/later'));
    assert.equal(f.navigations.length, 0);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0][1], init);
    assert.ok(f.find('다시 로그인'));
    assert.ok(f.find('입력이 사라질 수 있음'));
  }
});

test('Request.method is respected and an explicit init.method takes precedence', async () => {
  const input = new Request('https://cost.seonology.com/api/data', {method:'POST',body:'payload'});
  const f = fixture();
  await reject(f.request(input));
  assert.equal(f.navigations.length, 0);
  assert.equal(f.calls[0][0], input);
  const safe = fixture();
  await reject(safe.request(input,{method:'HEAD'}));
  assert.equal(safe.navigations.length,1);
});

test('all registered dirty probes participate and cleanup removes only its own probe', async () => {
  const f = fixture();
  const unregisterClean = f.register(() => false);
  const unregisterDirty = f.register(() => true);
  unregisterClean();
  await reject(f.request('/api/data'));
  unregisterDirty();
  assert.equal(f.navigations.length, 0);
  assert.ok(f.find('다시 로그인'));
  const clean = fixture();
  const remove = clean.register(() => true);
  remove(); remove();
  await reject(clean.request('/api/data'));
  assert.equal(clean.navigations.length,1);
});

test('a throwing dirty probe conservatively preserves the document', async () => {
  const f = fixture();
  const remove = f.register(() => {throw new Error('unavailable');});
  await reject(f.request('/api/data'));
  remove();
  assert.equal(f.navigations.length,0);
});

test('dirty and write iframe failures keep their own banner without messaging Console', async () => {
  for (const dirty of [false,true]) {
    const f = fixture(expired(), ['https://www.seonology.com']);
    const remove = f.register(() => dirty);
    await reject(f.request('/api/data', {method:dirty?'GET':'POST'}));
    await reject(f.request('/api/later'));
    remove();
    assert.equal(f.messages.length,0);
    assert.equal(f.navigations.length,0);
    assert.equal(f.body.children.length,1);
  }
});

test('popup opens synchronously on click and blank/loading/cross-origin pages never finish login', async () => {
  let response = expired();
  const f = fixture(() => response);
  await reject(f.request('/api/data',{method:'POST'}));
  f.find('다시 로그인').click();
  assert.equal(f.opened.length,1);
  assert.equal(new URL(f.opened[0][0]).origin,'https://cost.seonology.com');
  f.tick();
  assert.equal(f.popup().closed,false);
  assert.equal(f.body.children.length,1);
  f.popup().location = {get href(){throw new Error('cross origin');}};
  f.tick();
  f.popup().location = {href:f.opened[0][0],origin:'https://cost.seonology.com'};
  f.popup().document.readyState='loading';
  f.tick();
  assert.equal(f.popup().closed,false);
  f.popup().document.readyState='complete';
  f.tick();
  assert.equal(f.popup().closed,true);
  assert.equal(f.body.children.length,0);
  assert.equal(f.navigations.length,0);
  response = new Response('manual retry');
  assert.equal(await f.request('/api/data'),response);
  assert.equal(f.calls.length,2);
});

test('repeated login clicks focus the single pending popup', async () => {
  const f=fixture();
  await reject(f.request('/api/data',{method:'POST'}));
  f.find('다시 로그인').click();
  f.find('다시 로그인').click();
  assert.equal(f.opened.length,1);
});

test('popup blocked, closed and timeout keep banner and explain retry/reload', async () => {
  for (const reason of ['blocked','closed','timeout']) {
    const f=fixture();
    await reject(f.request('/api/data',{method:'POST'}));
    if(reason==='blocked') f.block();
    f.find('다시 로그인').click();
    if(reason==='closed'){f.popup().closed=true;f.tick();}
    if(reason==='timeout') f.timeout();
    assert.ok(f.find(reason==='blocked'?'차단':reason==='closed'?'닫혔':'시간'));
    await reject(f.request('/api/later'));
    assert.equal(f.body.children.length,1);
    assert.equal(f.navigations.length,0);
    f.find('새로고침').click();
    assert.equal(f.navigations.length,1);
  }
});

test('concurrent write protects clean read recovery, and later 401 does not duplicate banner', async () => {
  let resolveWrite;
  const f=fixture(input => input==='/api/write'?new Promise(resolve=>{resolveWrite=resolve;}):expired());
  const write=f.request('/api/write',{method:'POST'}).catch(error=>error);
  await reject(f.request('/api/read'));
  resolveWrite(expired());
  await write;
  assert.equal(f.navigations.length,0);
  assert.equal(f.body.children.length,1);
});


test('a browser without ancestorOrigins reloads its own frame', async () => {
  const f = fixture(expired(), []);
  delete f.location.ancestorOrigins;
  await reject(f.request('/api/data'));
  assert.equal(f.messages.length,0);
  assert.equal(f.navigations.length,1);
});

test('separate registrations of the same callback are independently removable', async () => {
  const f=fixture();
  const probe=()=>true;
  const removeOne=f.register(probe), removeTwo=f.register(probe);
  removeOne();
  await reject(f.request('/api/data'));
  removeTwo();
  assert.equal(f.navigations.length,0);
});

test('popup uses the confirmed protected GET path for public-root hosts', async () => {
  for (const [host,path] of [['pedia.seonology.com','/editor.html'],['mcp.seonology.com','/hub/forward-auth.js'],['www.seonology.com','/api/v1/auth/forward']]) {
    const f=fixture();
    f.location.href='https://'+host+'/public';
    await reject(f.request('/api/data',{method:'POST'}));
    f.find('다시 로그인').click();
    const login=new URL(f.opened[0][0]);
    assert.equal(login.host,host);
    assert.equal(login.pathname,path);
    if(host==='www.seonology.com') {
      const landing = new URL(login.searchParams.get('return_to'), login);
      assert.equal(landing.pathname, '/favicon.ico');
      assert.ok(landing.searchParams.get('seonology-reauth'));
    }
  }
});

test('a second expiry after popup success starts a new recovery without replaying the write', async () => {
  const f=fixture();
  await reject(f.request('/api/data',{method:'POST'}));
  f.find('다시 로그인').click();
  f.popup().location={href:f.opened[0][0],origin:'https://cost.seonology.com'};
  f.tick();
  assert.equal(f.body.children.length,0);
  await reject(f.request('/api/data',{method:'POST'}));
  assert.equal(f.body.children.length,1);
  assert.equal(f.calls.length,2);
  assert.equal(f.navigations.length,0);
});


test('manual recovery respects dirty probes and the Console uses its protected bridge', async () => {
  const f=fixture();
  const remove=f.register(()=>true);
  f.request.requestRecovery();
  f.request.requestRecovery();
  remove();
  assert.equal(f.calls.length,0);
  assert.equal(f.navigations.length,0);
  assert.equal(f.body.children.length,1);
  const clean=fixture();
  clean.location.href='https://www.seonology.com/workspace?tab=mail#draft';
  const assigned=[];
  clean.location.assign=url=>assigned.push(url);
  clean.request.requestRecovery();
  const target=new URL(assigned[0]);
  assert.equal(target.origin,'https://www.seonology.com');
  assert.equal(target.pathname,'/api/v1/auth/forward');
  assert.equal(target.searchParams.get('return_to'),'/workspace?tab=mail#draft');
});


test('omitted fetch options stay omitted at the underlying fetch boundary', async () => {
  const response=new Response('read');
  const f=fixture(response);
  await f.request('/api/data');
  assert.equal(f.calls[0].length,1);
});


test('the active native modal owns the banner and its login button stays clickable', async () => {
  const f=fixture();
  const first=f.browser.document.createElement('dialog'),last=f.browser.document.createElement('dialog');
  f.body.appendChild(first);f.body.appendChild(last);
  f.browser.document.querySelectorAll=()=>[first,last];
  f.browser.document.activeElement={closest:selector=>selector==='dialog[open]'?first:null};
  await reject(f.request('/api/data',{method:'POST'}));
  assert.equal(first.children.length,1);
  assert.equal(last.children.length,0);
  f.find('다시 로그인').click();
  assert.equal(f.opened.length,1);
});

test('the most recent open native modal is the fallback banner host', async () => {
  const f=fixture();
  const first=f.browser.document.createElement('dialog'),last=f.browser.document.createElement('dialog');
  f.body.appendChild(first);f.body.appendChild(last);
  f.browser.document.querySelectorAll=()=>[first,last];
  await reject(f.request('/api/data',{method:'POST'}));
  assert.equal(first.children.length,0);
  assert.equal(last.children.length,1);
});


test('only an awaiting Console child accepts a verified auth-restored signal', async () => {
  let response=expired();
  const f=fixture(()=>response,['https://www.seonology.com']);
  await reject(f.request('/api/data'));
  const restored={type:'seonology:forward-auth-restored'};
  f.receive(restored,'https://other.example',f.browser.top);
  f.receive(restored,'https://www.seonology.com',{});
  f.receive({type:'other'},'https://www.seonology.com',f.browser.top);
  await reject(f.request('/api/still-blocked'));
  assert.equal(f.calls.length,1);
  assert.equal(f.navigations.length,0);
  response=new Response('after login');
  f.receive(restored,'https://www.seonology.com',f.browser.top);
  assert.equal(f.navigations.length,1);
  assert.equal(await f.request('/api/data'),response);
  f.receive(restored,'https://www.seonology.com',f.browser.top);
  assert.equal(f.navigations.length,1);
});

test('a child becoming dirty while Console logs in resets its latch without reloading', async () => {
  let response=expired();
  const f=fixture(()=>response,['https://www.seonology.com']);
  await reject(f.request('/api/data'));
  const remove=f.register(()=>true);
  response=new Response('manual save allowed');
  f.receive({type:'seonology:forward-auth-restored'},'https://www.seonology.com',f.browser.top);
  assert.equal(f.navigations.length,0);
  assert.equal(await f.request('/api/save',{method:'POST',body:'still here'}),response);
  remove();
});

test('a dirty child using its own popup ignores Console recovery notifications', async () => {
  const f=fixture(expired(),['https://www.seonology.com']);
  const remove=f.register(()=>true);
  await reject(f.request('/api/data'));
  f.receive({type:'seonology:forward-auth-restored'},'https://www.seonology.com',f.browser.top);
  await reject(f.request('/api/data'));
  assert.equal(f.calls.length,1);
  assert.equal(f.navigations.length,0);
  assert.equal(f.body.children.length,1);
  remove();
});

test('popup success publishes recovery once to all active subscribers', async () => {
  const f=fixture();
  let a=0,b=0,removed=0;
  const removeA=f.subscribe(()=>{a++;});
  const removeB=f.subscribe(()=>{b++;});
  const removeOld=f.subscribe(()=>{removed++;});removeOld();
  const removeThrow=f.subscribe(()=>{throw new Error('subscriber failed');});
  await reject(f.request('/api/data',{method:'POST'}));
  f.find('다시 로그인').click();
  f.tick();
  assert.deepEqual([a,b,removed],[0,0,0]);
  f.popup().location={href:f.opened[0][0],origin:'https://cost.seonology.com'};
  f.tick();f.tick();
  assert.deepEqual([a,b,removed],[1,1,0]);
  removeA();removeB();removeThrow();
});


test('pending parent writes require in-place recovery even without a dirty probe', async () => {
  let resolveWrite;
  const f=fixture(()=>new Promise(resolve=>{resolveWrite=resolve;}));
  assert.equal(f.request.requiresInPlaceRecovery(),false);
  const pending=f.request('/api/write',{method:'POST',body:'payload'});
  assert.equal(f.request.requiresInPlaceRecovery(),true);
  resolveWrite(new Response('saved'));
  await pending;
  assert.equal(f.request.requiresInPlaceRecovery(),false);
  const remove=f.register(()=>true);
  assert.equal(f.request.requiresInPlaceRecovery(),true);
  remove();
});


test('a latched request remounts the banner after its native dialog is removed', async () => {
  const f=fixture();
  const modal=f.browser.document.createElement('dialog');f.body.appendChild(modal);
  f.browser.document.querySelectorAll=()=>[modal];
  await reject(f.request('/api/data',{method:'POST'}));
  modal.remove();f.browser.document.querySelectorAll=()=>[];
  assert.equal(f.find('다시 로그인'),undefined);
  await reject(f.request('/api/another-read'));
  assert.ok(f.find('다시 로그인'));
  f.find('다시 로그인').click();
  assert.equal(f.opened.length,1);
  assert.equal(f.calls.length,1);
  assert.equal(f.navigations.length,0);
});

test('a latched request moves the banner out of a closed but connected native dialog', async () => {
  const f=fixture();
  const modal=f.browser.document.createElement('dialog');f.body.appendChild(modal);
  f.browser.document.querySelectorAll=()=>[modal];
  await reject(f.request('/api/data',{method:'POST'}));
  assert.equal(modal.children.length,1);
  f.browser.document.querySelectorAll=()=>[];
  await reject(f.request('/api/another-read'));
  assert.equal(modal.children.length,0);
  assert.ok(f.body.children.some(child=>child.tagName==='section'));
  assert.equal(f.calls.length,1);
});


test('a clean child reports its state before its first request without starting recovery', () => {
 const f=fixture(new Response('ok'),['https://www.seonology.com']);
 f.receive({type:'seonology:forward-auth-state-request',requestId:1},'https://www.seonology.com',f.browser.top);
 assert.deepEqual(JSON.parse(JSON.stringify(f.messages)),[[{type:'seonology:forward-auth-state',requestId:1,requiresInPlaceRecovery:false},'https://www.seonology.com']]);
 assert.equal(f.calls.length,0);assert.equal(f.navigations.length,0);assert.equal(f.body.children.length,0);
});

test('child state requests reject forged source origin type ids and top-level self', () => {
 const f=fixture(new Response('ok'),['https://www.seonology.com']);
 const valid={type:'seonology:forward-auth-state-request',requestId:2};
 f.receive(valid,'https://other.example',f.browser.top);
 f.receive(valid,'https://www.seonology.com',{});
 f.receive({type:'other',requestId:2},'https://www.seonology.com',f.browser.top);
 for(const requestId of [undefined,null,0,-1,1.5,'1',NaN,Infinity,Number.MAX_SAFE_INTEGER+1])f.receive({...valid,requestId},'https://www.seonology.com',f.browser.top);
 assert.equal(f.messages.length,0);
 const root=fixture();root.receive(valid,'https://www.seonology.com',root.browser.self);
 assert.equal(root.messages.length,0);assert.equal(root.calls.length,0);
});

test('child state includes current dirty probes and preserving latch without changing either', async () => {
 const f=fixture(expired(),['https://www.seonology.com']);let dirty=true;
 const remove=f.register(()=>dirty);
 f.receive({type:'seonology:forward-auth-state-request',requestId:3},'https://www.seonology.com',f.browser.top);
 assert.equal(f.messages.at(-1)[0].requiresInPlaceRecovery,true);
 dirty=false;
 f.receive({type:'seonology:forward-auth-state-request',requestId:4},'https://www.seonology.com',f.browser.top);
 assert.equal(f.messages.at(-1)[0].requiresInPlaceRecovery,false);
 await reject(f.request('/api/save',{method:'POST'}));
 f.receive({type:'seonology:forward-auth-state-request',requestId:5},'https://www.seonology.com',f.browser.top);
 assert.equal(f.messages.at(-1)[0].requiresInPlaceRecovery,true);
 await reject(f.request('/api/still-paused'));
 assert.equal(f.calls.length,1);assert.equal(f.navigations.length,0);remove();
});

test('child state sees a pending write and clears it only when the original request settles', async () => {
 let finish;const f=fixture(()=>new Promise(resolve=>{finish=resolve;}),['https://www.seonology.com']);
 const request=f.request('/api/save',{method:'POST',body:'preserved'});
 f.receive({type:'seonology:forward-auth-state-request',requestId:6},'https://www.seonology.com',f.browser.top);
 assert.equal(f.messages.at(-1)[0].requiresInPlaceRecovery,true);assert.equal(f.calls.length,1);
 finish(new Response('saved'));await request;
 f.receive({type:'seonology:forward-auth-state-request',requestId:7},'https://www.seonology.com',f.browser.top);
 assert.equal(f.messages.at(-1)[0].requiresInPlaceRecovery,false);assert.equal(f.calls.length,1);assert.equal(f.navigations.length,0);
});

test('a clean child awaiting Console recovery responds without resetting its latch', async () => {
 const f=fixture(expired(),['https://www.seonology.com']);await reject(f.request('/api/data'));
 f.receive({type:'seonology:forward-auth-state-request',requestId:8},'https://www.seonology.com',f.browser.top);
 assert.equal(f.messages.at(-1)[0].requiresInPlaceRecovery,false);
 await reject(f.request('/api/still-paused'));
 assert.equal(f.calls.length,1);assert.equal(f.navigations.length,0);assert.equal(f.messages.length,2);
});


test('cached login landings are bypassed on three consecutive authentication attempts', async () => {
  for (const host of ['cost.seonology.com', 'pedia.seonology.com', 'mcp.seonology.com', 'www.seonology.com']) {
    const f = fixture();
    f.location.href = 'https://' + host + '/edit?draft=kept#input';
    const cached = new Set(['/favicon.ico', '/favicon.ico?seonology-reauth=1',
      '/editor.html?seonology-reauth=1', '/hub/forward-auth.js?seonology-reauth=1']);
    const bridges = new Set();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await reject(f.request('/api/data', { method: 'POST', body: 'unsaved input' }));
      f.popup().closed = false;
      f.popup().location = { href: 'about:blank', origin: 'null' };
      f.find('다시 로그인').click();
      const login = new URL(f.opened[attempt][0]);
      const landing = host === 'www.seonology.com'
        ? new URL(login.searchParams.get('return_to'), login) : login;
      assert.equal(landing.host, host);
      assert.ok(landing.searchParams.get('seonology-reauth'));
      assert.equal(cached.has(landing.pathname + landing.search), false,
        'a cached landing would skip the authentication boundary');
      assert.equal(bridges.has(login.href), false);
      cached.add(landing.pathname + landing.search);
      bridges.add(login.href);
      f.popup().location = { href: landing.href, origin: landing.origin };
      f.tick();
      assert.equal(f.body.children.length, 0);
      assert.equal(f.navigations.length, 0);
      assert.equal(f.calls.length, attempt + 1, 'failed writes must never be replayed');
    }
  }
});


test('protected asset loader waits for popup recovery without rejecting a lazy promise', async () => {
  const module = await import('../../src/api/forwardAuth.js');
  assert.equal(typeof module.createProtectedAssetLoader, 'function');
  let recovered, attempts=0, requested=[], dirty=true;
  const browser={location:{href:'https://presenter.seonology.com/edit/draft?tab=code#input'},
    sessionStorage:{getItem:()=>null,setItem:()=>{}}};
  const auth={requiresInPlaceRecovery:()=>dirty,requestRecovery:safe=>requested.push(safe)};
  const load=module.createProtectedAssetLoader(auth,browser,async()=>new Response('',{status:401,headers:{'X-Forward-Auth-Required':'1'}}),fn=>{recovered=fn;return()=>{}});
  const pending=load(async()=>{if(++attempts===1)throw new TypeError('Failed to fetch dynamically imported module');return 'module-ready';});
  await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(requested,[false]);assert.equal(attempts,1);
  recovered();assert.equal(await pending,'module-ready');assert.equal(attempts,2);
});

test('protected asset loader reloads clean reads once and stops a reload loop', async () => {
  const module = await import('../../src/api/forwardAuth.js');
  assert.equal(typeof module.createProtectedAssetLoader, 'function');
  let stored=null, recovered;const requested=[],seen=[];
  const browser={location:{href:'https://presenter.seonology.com/p/read?foo=bar#slide'},
    sessionStorage:{getItem:()=>stored,setItem:(_key,value)=>{stored=value}}};
  const auth={requiresInPlaceRecovery:()=>false,requestRecovery:safe=>requested.push(safe)};
  const fetcher=async(url,init)=>{seen.push({url,init});return new Response('',{status:401,headers:{'X-Forward-Auth-Required':'1'}})};
  const make=()=>module.createProtectedAssetLoader(auth,browser,fetcher,fn=>{recovered=fn;return()=>{}});
  void make()(async()=>{throw new TypeError('Failed to fetch dynamically imported module')});
  await new Promise(r=>setTimeout(r,0));assert.deepEqual(requested,[true]);assert.ok(stored);
  let attempts=0;const second=make()(async()=>{if(++attempts===1)throw new Error('Unable to preload CSS for /assets/a.css');return 'css-ready'});
  await new Promise(r=>setTimeout(r,0));assert.deepEqual(requested,[true,false]);
  assert.equal(seen[0].init.cache,'no-store');assert.equal(new URL(seen[0].url).searchParams.has('seonology-asset-probe'),true);
  recovered();assert.equal(await second,'css-ready');
});

test('protected asset loader preserves non-auth errors and never retries a write', async () => {
  const module = await import('../../src/api/forwardAuth.js');
  assert.equal(typeof module.createProtectedAssetLoader, 'function');
  const error=new TypeError('Failed to fetch dynamically imported module');let recoveries=0,calls=0;
  const loader=module.createProtectedAssetLoader({requiresInPlaceRecovery:()=>true,requestRecovery:()=>recoveries++},
    {location:{href:'https://clock.seonology.com/'}},async()=>{calls++;return new Response('',{status:404})},()=>()=>{});
  await assert.rejects(loader(async()=>{throw error}),e=>e===error);assert.equal(recoveries,0);assert.equal(calls,1);
  const runtime=new Error('application render failed');
  await assert.rejects(loader(async()=>{throw runtime}),e=>e===runtime);assert.equal(calls,1);
});

const { rewritePreloadHelper } = await import('../../build/protected-assets.mjs');
test('unsupported Vite helpers fail closed',()=>assert.throws(()=>rewritePreloadHelper('export const changed = 1','/guard.ts'),/Unsupported/));
test('CSS failure deletes seen entry and failed link before rejection; wrapper covers baseModule and CSS',()=>{
 const code=`const seen={};export const __vitePreload = function preload(baseModule,deps){const dep=deps[0]; const link=document.createElement('link');link.addEventListener('error',()=>reject(new Error('Unable to preload CSS')));return baseModule();}`;
 const result=rewritePreloadHelper(code,'/src/forwardAuth.ts');
 assert.ok(result.indexOf('delete seen[dep]')<result.indexOf("reject(new Error"));
 assert.match(result,/link.remove\(\)/);assert.match(result,/protectedAssetImport\(\s*\(\) => __seonologyRawPreload\(baseModule, deps, importerUrl\)/);
 assert.match(result,/import \{ protectedAssetImport \}/);
});


test('a protected import resumes if a clean child becomes dirty during parent reauthentication', async () => {
  const module = await import('../../src/api/forwardAuth.js');
  let recovered, attempts=0;const requested=[];
  const load=module.createProtectedAssetLoader({requiresInPlaceRecovery:()=>false,requestRecovery:safe=>requested.push(safe)},
    {location:{href:'https://clock.seonology.com/?embed=1'},sessionStorage:{getItem:()=>null,setItem:()=>{}}},
    async()=>new Response('',{status:401,headers:{'X-Forward-Auth-Required':'1'}}),listener=>{recovered=listener;return()=>{}});
  const pending=load(async()=>{if(++attempts===1)throw new TypeError('Failed to fetch dynamically imported module');return 'restored-child';});
  await new Promise(r=>setTimeout(r,0));assert.deepEqual(requested,[true]);assert.equal(typeof recovered,'function');
  recovered();assert.equal(await pending,'restored-child');assert.equal(attempts,2);
});

test('verified Console recovery notifies a newly dirty child without navigation', async () => {
  const f=fixture(expired(),['https://www.seonology.com']);
  let notifications=0;const unsubscribe=f.subscribe(()=>notifications++);
  try {
    await reject(f.request('/api/read'));
    const remove=f.register(()=>true);
    try{f.receive({type:'seonology:forward-auth-restored'},'https://www.seonology.com',f.browser.top);assert.equal(f.navigations.length,0);assert.equal(notifications,1);}
    finally{remove();}
  }finally{unsubscribe();}
});


test('an asset ignores a delayed probe 401 after another authentication recovery', async () => {
  const module=await import('../../src/api/forwardAuth.js');let resolveProbe,generation=0,recoveries=0,attempts=0;
  const load=module.createProtectedAssetLoader({getRecoveryState:()=>({generation,pending:false}),requiresInPlaceRecovery:()=>true,requestRecovery:()=>recoveries++},
    {location:{href:'https://clock.seonology.com/'}},()=>new Promise(resolve=>{resolveProbe=resolve}),()=>()=>{});
  const result=load(async()=>{if(++attempts===1)throw new TypeError('Failed to fetch dynamically imported module');return 'authenticated-module'});
  await new Promise(resolve=>setTimeout(resolve,0));generation++;
  resolveProbe(new Response('',{status:401,headers:{'X-Forward-Auth-Required':'1'}}));
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(recoveries,0);assert.equal(await result,'authenticated-module');assert.equal(attempts,2);
});

test('an asset loading failure arriving after recovery retries before probing again', async () => {
  const module=await import('../../src/api/forwardAuth.js');let rejectLoad,generation=0,probes=0,attempts=0;
  const load=module.createProtectedAssetLoader({getRecoveryState:()=>({generation,pending:false}),requiresInPlaceRecovery:()=>false,requestRecovery:()=>{throw Error('unexpected recovery')}},
    {location:{href:'https://clock.seonology.com/'}},async()=>{probes++;return new Response('ok')},()=>()=>{});
  const result=load(()=>++attempts===1?new Promise((_resolve,reject)=>{rejectLoad=reject}):Promise.resolve('fresh-module'));
  generation++;rejectLoad(new TypeError('Failed to fetch dynamically imported module'));
  assert.equal(await result,'fresh-module');assert.equal(probes,0);assert.equal(attempts,2);
});

test('an asset joins an existing popup before its recovery generation is published', async () => {
  const module=await import('../../src/api/forwardAuth.js');let recovered,pending=true,generation=0,probes=0,attempts=0,recoveries=0;
  const load=module.createProtectedAssetLoader({getRecoveryState:()=>({generation,pending}),requiresInPlaceRecovery:()=>true,requestRecovery:()=>recoveries++},
    {location:{href:'https://clock.seonology.com/'}},async()=>{probes++;return new Response('ok')},listener=>{recovered=listener;return()=>{}});
  const result=load(async()=>{if(++attempts===1)throw new TypeError('Failed to fetch dynamically imported module');return 'popup-module'});
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(probes,0);assert.equal(recoveries,0);assert.equal(typeof recovered,'function');
  pending=false;generation++;recovered();assert.equal(await result,'popup-module');
});
