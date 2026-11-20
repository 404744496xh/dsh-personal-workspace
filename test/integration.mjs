/**
 * Self-contained integration test for dsh-personal-workspace.
 *
 * No live Halo, no PAT, no production data. A mock Halo implements the exact
 * /changes contract plus todo/project/note CRUD, then we drive the real
 * WorkspaceBridgeService against a temporary SQLite mirror.
 *
 *   node test/integration.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { openMirrorDb } from '../lib/db.js';
import { WorkspaceBridgeService } from '../lib/service.js';

const API_BASE = '/apis/api.workspace.halo.run/v1alpha1';
const ORIGIN = 'http://halo.test';
const KINDS = ['todo', 'project', 'note'];
const plural = { todo: 'todos', project: 'projects', note: 'notes' };

// ---------------------------------------------------------------- mock Halo
function makeMockHalo() {
  const state = {
    seq: 0,
    changes: [],
    objects: { todo: new Map(), project: new Map(), note: new Map() },
    created: [],
    updated: [],
    deleted: [],
  };
  const append = (kind, name, deleted, payload) => {
    const seq = ++state.seq; // monotonic, like Halo nextSyncSeq()
    state.changes.push({
      seq, kind, name, deleted,
      updatedAt: new Date().toISOString(),
      payload: deleted ? null : { ...payload, name },
    });
    return seq;
  };
  const put = (kind, name, payload) => {
    const view = { ...payload, name };
    state.objects[kind].set(name, view);
    append(kind, name, false, view);
    return view;
  };
  // Seed data as if it had been created in Halo (remote authoritative records).
  const seed = (kind, name, payload) => put(kind, name, payload);
  // Simulate a change made in Halo while DSH was offline.
  const remoteUpdate = (kind, name, patch) => {
    const next = { ...(state.objects[kind].get(name) ?? {}), ...patch, name };
    return put(kind, name, next);
  };
  const remoteDelete = (kind, name) => {
    state.objects[kind].delete(name);
    append(kind, name, true, null);
  };
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url);
    assert.equal(u.origin, ORIGIN, 'client must use the bound origin');
    assert.equal(opts.headers?.authorization, 'Bearer test-pat', 'client must send the PAT');
    const path = u.pathname.slice(API_BASE.length);
    const method = opts.method || 'GET';
    let body;
    try { body = opts.body ? JSON.parse(opts.body) : undefined; } catch { /* ignored */ }
    const json = (obj, status = 200) => ({
      status, ok: status >= 200 && status < 300,
      text: async () => JSON.stringify(obj),
    });
    const noContent = () => ({ status: 204, ok: true, text: async () => '' });

    if (path === '/changes' && method === 'GET') {
      const since = Number(u.searchParams.get('since') ?? 0);
      const limit = Number(u.searchParams.get('limit') ?? 200);
      const matching = state.changes.filter((c) => c.seq >= since).sort((a, b) => a.seq - b.seq);
      return json({
        cursor: state.changes.length ? Math.max(...state.changes.map((c) => c.seq)) : null,
        oldestSeq: state.changes.length ? Math.min(...state.changes.map((c) => c.seq)) : null,
        hasMore: matching.length > limit,
        changes: matching.slice(0, limit).map((c) => ({ ...c })),
      });
    }

    const m = path.match(/^\/(todo|project|note)s\/([^/]+)$/);
    if (!m) {
      const listMatch = path.match(/^\/(todo|project|note)s$/);
      if (listMatch && method === 'POST') {
        const kind = listMatch[1];
        const name = `${plural[kind]}-${++state.seq}`;
        const view = put(kind, name, body ?? {});
        state.created.push({ kind, name });
        return json(view, 201);
      }
      if (listMatch && method === 'GET') {
        // Full-list endpoints used by the cold-start bootstrap fallback.
        const kind = listMatch[1];
        const items = [...state.objects[kind].values()].map((v) => ({ ...v }));
        if (kind === 'todo') {
          const page = Number(u.searchParams.get('page') ?? 1);
          const size = Number(u.searchParams.get('size') ?? 500);
          return json({ items, total: items.length, page, size });
        }
        return json(items);
      }
      return json({ error: { message: `unexpected ${method} ${path}` } }, 404);
    }
    const kind = m[1];
    const name = decodeURIComponent(m[2]);
    if (method === 'GET') {
      const view = state.objects[kind].get(name);
      return view ? json(view) : json({ error: { message: 'not found' } }, 404);
    }
    if (method === 'PUT') {
      state.updated.push({ kind, name });
      return json(put(kind, name, body ?? {}));
    }
    if (method === 'DELETE') {
      assert.ok(u.searchParams.get('confirm') === 'true', 'deletes must require confirm=true');
      state.deleted.push({ kind, name, tombstone: append(kind, name, true, null) });
      return noContent();
    }
    return json({ error: { message: `unexpected ${method} ${path}` } }, 405);
  };
  return { state, seed, remoteUpdate, remoteDelete, fetchImpl };
}

function makeCredentials() {
  const store = new Map();
  return {
    readRecord: async (k) => store.get(k),
    modifyRecord: async (k, mutate) => {
      const next = await mutate(store.get(k));
      store.set(k, next);
      return next;
    },
    describeRecord: async (k) => (store.has(k) ? { configured: true } : { configured: false }),
    deleteRecord: async (k) => { store.delete(k); },
    _store: store,
  };
}

// ---------------------------------------------------------------- test flow
const tmp = mkdtempSync(join(tmpdir(), 'wsb-integration-'));
const dbPath = join(tmp, 'mirror.db');
let db;
try {
  db = openMirrorDb({ dbPath });
  const halo = makeMockHalo();
  const credentials = makeCredentials();
  const ctx = { get: (name) => (name === 'credentials' ? credentials : undefined) };
  const service = new WorkspaceBridgeService({ db, ctx, config: { haloOrigin: ORIGIN } });
  // Route the client through the mock fetch without touching credentials:
  // bind stores origin + PAT, then we wrap client() to inject fetchImpl.
  await service.bind(ORIGIN, 'test-pat');
  const realClient = service.client.bind(service);
  service.client = async () => {
    const c = await realClient();
    c.fetchImpl = halo.fetchImpl;
    return c;
  };

  // --- 1. remote seed -> pull ------------------------------------------------
  halo.seed('todo', 'todo-1', { title: '远程待办 1', priority: 'HIGH', completed: false });
  halo.seed('project', 'proj-1', { title: '远程项目 1', status: 'DEV', modules: ['m1'] });
  halo.seed('note', 'note-1', { title: '远程笔记 1', content: 'hello', tags: ['a'] });
  const first = await service.sync();
  assert.equal(first.errors.length, 0);
  assert.equal(first.pulled, 3, 'all three seeded changes should be pulled');
  assert.equal(first.pushed, 0);
  assert.equal(service.get('todo', 'todo-1').title, '远程待办 1');
  assert.equal(service.get('project', 'proj-1').status, 'DEV');
  assert.equal(service.get('note', 'note-1').content, 'hello');
  assert.ok(first.cursor >= 3);
  console.log('  [ok] pull todo/project/note from /changes');

  // --- 2. local create / update / delete -> push -----------------------------
  const created = service.create('todo', { title: '本地新建待办', priority: 'LOW' });
  assert.ok(created.name.startsWith('local-'));
  service.update('todo', 'todo-1', { title: '本地改过的标题' });
  service.remove('note', 'note-1');
  assert.equal(service.status().counts.todo.dirty, 2);
  assert.equal(service.status().counts.note.tombstones, 1);
  const second = await service.sync();
  assert.equal(second.errors.length, 0, `push errors: ${JSON.stringify(second.errors)}`);
  assert.equal(second.pushed, 3, 'create + update + delete should all be pushed');
  assert.equal(halo.state.created.length, 1, 'one todo should be created in Halo');
  assert.equal(halo.state.updated.length, 1, 'one todo should be updated in Halo');
  assert.equal(halo.state.deleted.length, 1, 'one note should be deleted in Halo');
  assert.equal(halo.state.deleted[0].name, 'note-1');
  assert.deepEqual(
    Object.keys(stateOf(halo, 'todo', halo.state.created[0].name)).filter((k) => k !== 'name').sort(),
    ['completed', 'dismissed', 'detail', 'dueDate', 'pinned', 'priority', 'project', 'module', 'reporter', 'title'].sort(),
  );
  assert.equal(service.get('todo', created.name), undefined, 'local- name should be renamed away');
  assert.ok(service.get('todo', halo.state.created[0].name), 'renamed row should appear under Halo name');
  assert.equal(service.get('todo', halo.state.created[0].name).title, '本地新建待办');
  assert.equal(service.get('note', 'note-1'), undefined, 'pushed tombstone should be pruned');
  console.log('  [ok] push create/update/delete with local- rename and tombstone prune');

  // --- 3. conflict: remote wins in Halo, but local dirty is preserved --------
  service.update('todo', 'todo-1', { title: '本地第二次修改' });
  halo.remoteUpdate('todo', 'todo-1', { title: '远端同时修改' });
  const third = await service.sync();
  assert.equal(third.errors.length, 0);
  assert.ok(third.conflicts.some((c) => c.kind === 'todo' && c.name === 'todo-1' && c.resolution === 'keepLocal'));
  assert.equal(service.get('todo', 'todo-1').title, '本地第二次修改', 'dirty local row must not be overwritten');
  console.log('  [ok] keepLocal conflict when remote change hits a dirty row');

  // The next drain cycle converges: both changes are replayed in seq order.
  const fourth = await service.sync();
  assert.equal(fourth.errors.length, 0);
  assert.equal(service.get('todo', 'todo-1').title, '本地第二次修改');
  console.log('  [ok] conflicted change converges on the next sync cycle');

  // --- 4. snapshot isolation: second sync is a no-op -------------------------
  const fifth = await service.sync();
  assert.equal(fifth.pulled, 0, 'no new remote changes to pull');
  assert.equal(fifth.pushed, 0, 'no dirty rows left to push');
  console.log('  [ok] steady-state sync pulls and pushes nothing');

  const status = service.status();
  console.log(`  status: cursor=${status.cursor} counts=${JSON.stringify(status.counts)}`);
  console.log('INTEGRATION TEST PASSED');
} finally {
  db?.close();
  // Windows may keep a handle on the -wal/-shm files briefly after close().
  try { rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  catch { /* best-effort cleanup of a temp dir */ }
}

function stateOf(halo, kind, name) {
  return halo.state.objects[kind].get(name) ?? {};
}
