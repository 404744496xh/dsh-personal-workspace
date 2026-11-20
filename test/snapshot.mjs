/**
 * Snapshot-fallback test for dsh-personal-workspace.
 *
 * Simulates a Halo site still on personal-workspace <0.6.146: GET /changes
 * returns 403 insufficient_scope, while the all-version list endpoints work.
 * Verifies the bridge falls back to a full snapshot, keeps local dirty rows,
 * prunes remotely-deleted clean rows, and reports pullMode='snapshot'.
 *
 *   node test/snapshot.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openMirrorDb } from '../lib/db.js';
import { WorkspaceBridgeService } from '../lib/service.js';

const API_BASE = '/apis/api.workspace.halo.run/v1alpha1';
const ORIGIN = 'http://halo.old';

function makeOldHalo() {
  const objects = {
    todo: new Map([
      ['todo-a', { name: 'todo-a', title: '远端待办 A', priority: 'HIGH', completed: false }],
      ['todo-b', { name: 'todo-b', title: '远端待办 B', priority: 'LOW', completed: true }],
    ]),
    project: new Map([
      ['proj-a', { name: 'proj-a', title: '远端项目', status: 'DEV', modules: ['m1'] }],
    ]),
    note: new Map([
      ['note-a', { name: 'note-a', title: '远端笔记', content: 'body', tags: ['x'] }],
    ]),
  };
  const created = [];
  let changesCalls = 0;
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url);
    assert.equal(u.origin, ORIGIN);
    const path = u.pathname.slice(API_BASE.length);
    const method = opts.method || 'GET';
    const json = (obj, status = 200) => ({
      status, ok: status >= 200 && status < 300,
      text: async () => JSON.stringify(obj),
    });

    if (path.startsWith('/changes')) {
      changesCalls += 1;
      return {
        status: 403, ok: false,
        text: async () => '',
      };
    }
    if (path.startsWith('/todos') && method === 'GET') {
      const items = [...objects.todo.values()];
      return json({ items, total: items.length, page: 1, size: 500 });
    }
    if (path === '/projects' && method === 'GET')
      return json([...objects.project.values()]);
    if (path === '/notes' && method === 'GET')
      return json([...objects.note.values()]);
    const m = path.match(/^\/(todo|project|note)s\/([^/]+)$/);
    if (m && method === 'GET') {
      const v = objects[m[1]].get(decodeURIComponent(m[2]));
      return v ? json(v) : json({ error: { message: 'not found' } }, 404);
    }
    const lm = path.match(/^\/(todo|project|note)s$/);
    if (lm && method === 'POST') {
      const kind = lm[1];
      const name = `${kind}-new-${++created.length}`;
      const view = { name, ...JSON.parse(opts.body || '{}') };
      objects[kind].set(name, view);
      return json(view, 201);
    }
    return json({ error: { message: `unexpected ${method} ${path}` } }, 404);
  };
  return { objects, fetchImpl, get changesCalls() { return changesCalls; } };
}

function makeCredentials() {
  const store = new Map();
  return {
    readRecord: async (k) => store.get(k),
    modifyRecord: async (k, mutate) => { const n = await mutate(store.get(k)); store.set(k, n); return n; },
    describeRecord: async () => ({ configured: true }),
    deleteRecord: async (k) => { store.delete(k); },
  };
}

const tmp = mkdtempSync(join(tmpdir(), 'wsb-snapshot-'));
let db;
try {
  db = openMirrorDb({ dbPath: join(tmp, 'mirror.db') });
  const halo = makeOldHalo();
  const credentials = makeCredentials();
  const ctx = { get: (n) => (n === 'credentials' ? credentials : undefined) };
  const service = new WorkspaceBridgeService({ db, ctx, config: { haloOrigin: ORIGIN } });
  await service.bind(ORIGIN, 'old-pat');
  const realClient = service.client.bind(service);
  service.client = async () => { const c = await realClient(); c.fetchImpl = halo.fetchImpl; return c; };

  // 1. /changes 403 -> snapshot fallback pulls all three kinds.
  const first = await service.sync();
  assert.ok(halo.changesCalls >= 1, '/changes should have been attempted');
  assert.equal(first.pullMode, 'snapshot', 'pullMode must report snapshot fallback');
  assert.equal(first.pulled, 4, 'two todos + one project + one note = 4');
  assert.equal(first.pushed, 0);
  assert.ok(first.errors.some((e) => /0\.6\.146/.test(e.message)), 'must tell user to upgrade');
  assert.equal(service.get('todo', 'todo-a').title, '远端待办 A');
  assert.equal(service.get('project', 'proj-a').status, 'DEV');
  assert.equal(service.get('note', 'note-a').content, 'body');
  console.log('  [ok] /changes 403 falls back to full-list snapshot');

  // 2. Local dirty row is not overwritten by the snapshot.
  service.update('todo', 'todo-a', { title: '本地修改' });
  const second = await service.sync();
  assert.equal(second.pullMode, 'snapshot');
  assert.equal(service.get('todo', 'todo-a').title, '本地修改', 'dirty local row must win');
  console.log('  [ok] snapshot pull preserves local dirty rows (keepLocal)');

  // 3. Remote deletion: a clean row absent from the lists gets pruned.
  halo.objects.todo.delete('todo-b');
  const third = await service.sync();
  assert.equal(service.get('todo', 'todo-b'), undefined, 'remotely deleted clean row pruned');
  console.log('  [ok] snapshot reconciles remote deletions');

  // 4. status() surfaces pullMode.
  assert.equal((await service.status()).pullMode, 'snapshot');
  console.log('  [ok] status() reports pullMode=snapshot');
  console.log('SNAPSHOT FALLBACK TEST PASSED');
} finally {
  db?.close();
  try { rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  catch { /* best-effort */ }
}
