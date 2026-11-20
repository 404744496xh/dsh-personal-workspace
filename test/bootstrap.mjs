/**
 * Regression test for the cold-start bootstrap defect observed in production:
 * after upgrading personal-workspace to 0.6.146, /changes exists (200) but its
 * log is empty because historical records predate the log. An incremental-only
 * pull therefore returns 0 and leaves the mirror empty forever.
 *
 * This test drives the real WorkspaceBridgeService against a mock Halo whose
 * /changes is empty while the full lists hold historical records, and asserts
 * the first sync bootstraps from the lists and later syncs go incremental.
 *
 *   node test/bootstrap.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openMirrorDb } from '../lib/db.js';
import { WorkspaceBridgeService } from '../lib/service.js';

const API_BASE = '/apis/api.workspace.halo.run/v1alpha1';
const ORIGIN = 'http://halo.test';

function makeMockHalo() {
  const objects = {
    todo: [
      { name: 't1', title: '历史待办 1', priority: 'HIGH', completed: false },
      { name: 't2', title: '历史待办 2', priority: 'LOW', completed: true },
    ],
    project: [{ name: 'p1', title: '历史项目', status: 'DEV', modules: ['m1'] }],
    note: [{ name: 'n1', title: '历史笔记', content: 'body', tags: ['x'] }],
  };
  const calls = { changes: 0, lists: 0 };
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url);
    assert.equal(u.origin, ORIGIN);
    assert.equal(opts.headers?.authorization, 'Bearer test-pat');
    const path = u.pathname.slice(API_BASE.length);
    const method = opts.method || 'GET';
    const json = (obj, status = 200) => ({
      status, ok: status >= 200 && status < 300,
      text: async () => JSON.stringify(obj),
    });
    if (path === '/changes' && method === 'GET') {
      calls.changes += 1;
      // Healthy endpoint, but no change log yet (freshly upgraded site).
      return json({ cursor: null, oldestSeq: null, hasMore: false, changes: [] });
    }
    const listMatch = path.match(/^\/(todo|project|note)s$/);
    if (listMatch && method === 'GET') {
      calls.lists += 1;
      const items = objects[listMatch[1]].map((v) => ({ ...v }));
      if (listMatch[1] === 'todo') {
        const page = Number(u.searchParams.get('page') ?? 1);
        const size = Number(u.searchParams.get('size') ?? 500);
        return json({ items, total: items.length, page, size });
      }
      return json(items);
    }
    return json({ error: { message: `unexpected ${method} ${path}` } }, 404);
  };
  return { objects, calls, fetchImpl };
}

function makeCredentials() {
  const store = new Map();
  return {
    readRecord: async (k) => store.get(k),
    modifyRecord: async (k, mutate) => { const n = await mutate(store.get(k)); store.set(k, n); return n; },
    describeRecord: async (k) => ({ configured: store.has(k) }),
    deleteRecord: async (k) => { store.delete(k); },
  };
}

const tmp = mkdtempSync(join(tmpdir(), 'wsb-bootstrap-'));
let db;
try {
  db = openMirrorDb({ dbPath: join(tmp, 'mirror.db') });
  const halo = makeMockHalo();
  const credentials = makeCredentials();
  const service = new WorkspaceBridgeService({
    db,
    ctx: { get: (n) => (n === 'credentials' ? credentials : undefined) },
    config: { haloOrigin: ORIGIN },
  });
  await service.bind(ORIGIN, 'test-pat');
  const realClient = service.client.bind(service);
  service.client = async () => { const c = await realClient(); c.fetchImpl = halo.fetchImpl; return c; };

  // First sync: mirror empty, /changes empty -> must bootstrap from full lists.
  const first = await service.sync();
  assert.equal(first.errors.length, 0, `errors: ${JSON.stringify(first.errors)}`);
  assert.equal(first.pullMode, 'bootstrap');
  assert.equal(first.pulled, 4, 'all 4 historical records should be bootstrapped');
  assert.equal(service.get('todo', 't1').title, '历史待办 1');
  assert.equal(service.get('project', 'p1').title, '历史项目');
  assert.equal(service.get('note', 'n1').content, 'body');
  console.log('  [ok] empty mirror + empty /changes bootstraps full lists');

  // Local dirty row must survive a second bootstrap-style snapshot (keepLocal).
  service.update('todo', 't1', { title: '本地改动' });
  const second = await service.sync();
  // Mirror is no longer cold, so this goes incremental (empty feed) + push.
  assert.equal(second.pullMode, 'incremental');
  assert.equal(service.get('todo', 't1').title, '本地改动');
  console.log('  [ok] subsequent sync is incremental; local edits preserved');

  const status = service.status();
  console.log(`  status: pullMode=${status.pullMode} counts=${JSON.stringify(status.counts)}`);
  console.log('BOOTSTRAP TEST PASSED');
} finally {
  db?.close();
  try { rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  catch { /* best-effort cleanup */ }
}
