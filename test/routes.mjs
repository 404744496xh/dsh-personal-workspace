/**
 * Route-level smoke test: drive the real apply() with a fake webServer and
 * invoke every loopback handler the way the UI does. Catches contract drift
 * between client.js and index.js (e.g. json.tail vs json.result.tail).
 * Run: D:/devtool/nodejs/node.exe test/routes.mjs
 */
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

const routes = new Map();
const tools = [];
const sections = [];
const cleanups = [];
let db;

const credentials = {
  readRecord: async () => undefined,
  modifyRecord: async () => undefined,
  describeRecord: async () => ({ configured: false }),
  deleteRecord: async () => {},
};

// A tiny cordis-context stand-in that satisfies index.js apply().
const ctx = {
  get: (n) => (n === 'credentials' ? credentials : undefined),
  effect(fn) {
    const dispose = fn();
    const d = typeof dispose === 'function' ? dispose : () => {};
    cleanups.push(d);
    return d;
  },
  systemPrompt: { section: (s) => { sections.push(s); return () => {}; } },
  tools: { register: (t) => { tools.push(t); return () => {}; } },
  webServer: {
    register(route) {
      routes.set(`${route.spec?.path ?? route.path}`, route);
      return () => routes.delete(route.spec?.path ?? route.path);
    },
  },
};

const plugin = await import('../index.js');
plugin.apply(ctx, { dbPath: ':memory:' });

assert.equal(tools.length, 18, 'expected 18 tools registered');
console.log(`  [ok] apply registered ${tools.length} tools, ${routes.size} routes`);

/** Build a fake req/res for a route handler and await the JSON reply. */
function invoke(path, { method = 'GET', body, url = path } = {}) {
  const route = routes.get(path);
  assert.ok(route, `route ${path} not registered; got ${[...routes.keys()].join(', ')}`);
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.url = url;
  req.socket = { remoteAddress: '127.0.0.1' };
  req.headers = { host: '127.0.0.1:3080' };
  let status = 200;
  let payload;
  const res = {
    set statusCode(v) { status = v; },
    get statusCode() { return status; },
    setHeader() {},
    end(text) { payload = text; },
  };
  return Promise.resolve(route.handler(req, res)).then(() => ({
    status, body: payload ? JSON.parse(payload) : undefined,
  }));
}

// --- health ------------------------------------------------------------------
let r = await invoke('/api/bridge/health');
assert.equal(r.status, 200);
assert.equal(r.body.ok, true);
console.log('  [ok] GET /api/bridge/health');

// --- status ------------------------------------------------------------------
r = await invoke('/api/bridge/status');
assert.equal(r.status, 200);
assert.equal(typeof r.body.bound, 'boolean');
assert.equal(r.body.bound, false, 'fresh profile must report unbound');
assert.ok(!('token' in r.body), 'status must never leak the token');
console.log('  [ok] GET /api/bridge/status (no token leak)');

// --- today view --------------------------------------------------------------
r = await invoke('/api/bridge/task/today');
assert.equal(r.status, 200);
assert.ok(r.body.groups, 'today view must expose groups at top level');
assert.ok(r.body.stats, 'today view must expose stats');
console.log('  [ok] GET /api/bridge/task/today (groups/stats top-level)');

// --- create a local todo, then plan/step/submit ------------------------------
const service = { db };
r = await invoke('/api/bridge/list', { url: '/api/bridge/list?kind=todo' });
assert.equal(r.status, 200);
assert.ok(Array.isArray(r.body.items));
console.log('  [ok] GET /api/bridge/list?kind=todo');

r = await invoke('/api/bridge/task', {
  method: 'POST',
  body: { op: 'plan', todoName: 'nope-404', steps: ['a'] },
});
assert.equal(r.status, 400, 'plan on a missing todo must 400');
console.log('  [ok] POST /api/bridge/task plan rejects unknown todo');

// --- report ------------------------------------------------------------------
r = await invoke('/api/bridge/report', { method: 'POST', body: { type: 'daily' } });
assert.equal(r.status, 200);
assert.ok(String(r.body.markdown).includes('日报'));
console.log('  [ok] POST /api/bridge/report returns markdown at top level');

// --- capture with dedup ------------------------------------------------------
r = await invoke('/api/bridge/capture', { method: 'POST', body: { title: '测试录入待办' } });
assert.equal(r.status, 200);
assert.ok(r.body.name, 'capture must return the new todo name');
assert.ok(Array.isArray(r.body.duplicates));
console.log('  [ok] POST /api/bridge/capture returns name + duplicates');

// --- task loop end-to-end through routes -------------------------------------
const todoName = r.body.name;
r = await invoke('/api/bridge/task', { method: 'POST', body: { op: 'plan', todoName, goal: '目标', steps: ['第一步', '第二步'] } });
assert.equal(r.status, 200);
assert.equal(r.body.result.steps.length, 2);
for (const index of [1, 2]) {
  r = await invoke('/api/bridge/task', { method: 'POST', body: { op: 'step', todoName, index, status: 'done', evidence: `第${index}步证据` } });
  assert.equal(r.status, 200);
}
r = await invoke('/api/bridge/task', { method: 'POST', body: { op: 'submit', todoName, note: '请验收' } });
assert.equal(r.body.result.review, 'pending');
r = await invoke('/api/bridge/task', { method: 'POST', body: { op: 'review', todoName, decision: 'accept', note: '通过' } });
assert.equal(r.body.result.review, 'accepted');
// The human accept flips the mirrored todo completed flag.
r = await invoke('/api/bridge/list', { url: '/api/bridge/list?kind=todo' });
const accepted = r.body.items.find((i) => i.name === todoName);
assert.equal(accepted.completed, true, 'accept must set todo.completed');
console.log('  [ok] full task loop via routes: plan -> 2x step -> submit -> human accept -> completed');

// --- auto-sync ---------------------------------------------------------------
r = await invoke('/api/bridge/auto-sync', { method: 'POST', body: { enabled: true, intervalSec: 60 } });
assert.equal(r.status, 200);
assert.equal(r.body.enabled, true);
assert.equal(r.body.intervalSec, 60);
r = await invoke('/api/bridge/auto-sync', { method: 'POST', body: { enabled: true, intervalSec: 5 } });
assert.equal(r.status, 400, 'interval below 30 must 400');
console.log('  [ok] POST /api/bridge/auto-sync validates interval');

// --- loopback fence + method guard -------------------------------------------
{
  const route = routes.get('/api/bridge/status');
  const req = Readable.from([]);
  req.method = 'GET';
  req.url = '/api/bridge/status';
  req.socket = { remoteAddress: '10.0.0.5' }; // non-loopback
  req.headers = { host: '127.0.0.1:3080' };
  let status = 0;
  const res = {
    set statusCode(v) { status = v; }, get statusCode() { return status; },
    setHeader() {}, end() {},
  };
  await route.handler(req, res);
  assert.equal(status, 403, 'non-loopback must be refused');
}
{
  const route = routes.get('/api/bridge/status');
  const req = Readable.from([]);
  req.method = 'POST'; // wrong method
  req.url = '/api/bridge/status';
  req.socket = { remoteAddress: '127.0.0.1' };
  req.headers = { host: '127.0.0.1:3080' };
  let status = 0;
  const res = {
    set statusCode(v) { status = v; }, get statusCode() { return status; },
    setHeader() {}, end() {},
  };
  await route.handler(req, res);
  assert.equal(status, 405, 'wrong method must be 405');
}
console.log('  [ok] loopback fence 403 + method guard 405');

for (const d of cleanups) d?.();
console.log('ROUTE TEST PASSED');
