/**
 * Regression test for the "binding lost after restart" defect:
 * status() used to read only the in-memory boundClient, so after a DSH restart
 * the UI showed "not bound" and disabled Sync, forcing a PAT re-paste even
 * though the credential was safely persisted.
 *
 * This test simulates a restart: a brand-new WorkspaceBridgeService with the
 * SAME persisted credential store but no in-memory boundClient must still
 * report bound=true + the stored origin, never the token.
 *
 *   node test/persist-binding.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openMirrorDb } from '../lib/db.js';
import { WorkspaceBridgeService } from '../lib/service.js';

const ORIGIN = 'https://www.xiahan.asia';

// One shared credential store stands in for ~/.dsh/.credentials.yaml.
function makeCredentialStore() {
  const store = new Map();
  const api = {
    readRecord: async (k) => store.get(k),
    modifyRecord: async (k, mutate) => { const n = await mutate(store.get(k)); store.set(k, n); return n; },
    describeRecord: async (k) => ({ configured: store.has(k) }),
    deleteRecord: async (k) => { store.delete(k); },
  };
  return { store, api };
}

const tmp = mkdtempSync(join(tmpdir(), 'wsb-persist-'));
let db;
try {
  db = openMirrorDb({ dbPath: join(tmp, 'mirror.db') });
  const { store, api: credentials } = makeCredentialStore();
  const ctx = { get: (n) => (n === 'credentials' ? credentials : undefined) };

  // --- session 1: bind once (as the user does in the UI) ---
  const first = new WorkspaceBridgeService({ db, ctx, config: {} });
  const bound = await first.bind(ORIGIN, 'persisted-test-pat');
  assert.equal(bound.origin, ORIGIN);
  assert.equal(bound.stored, true);
  const rec = store.get('dsh-workspace-bridge/halo');
  assert.equal(rec.kind, 'grant');
  assert.equal(rec.payload.origin, ORIGIN);
  assert.equal(rec.payload.token, 'persisted-test-pat');
  console.log('  [ok] bind() persists grant record (token + origin)');

  const status1 = await first.status();
  assert.equal(status1.bound, true);
  assert.equal(status1.origin, ORIGIN);
  console.log('  [ok] status() reports bound immediately after bind');

  // --- session 2: simulate a DSH restart (fresh service, empty config,
  //     no in-memory boundClient, SAME persisted credential store) ---
  const restarted = new WorkspaceBridgeService({ db, ctx, config: {} });
  assert.equal(restarted.boundClient, undefined, 'restarted service has no in-memory client');

  const status2 = await restarted.status();
  assert.equal(status2.bound, true, 'restarted service must see the persisted binding');
  assert.equal(status2.origin, ORIGIN, 'restarted service must recover the origin');
  assert.ok(!('token' in status2), 'status() must never expose the token');
  console.log('  [ok] status() survives restart via persisted credential, no token leak');

  // client() also reconstructs from the persisted record (as sync() relies on).
  const client = await restarted.client();
  assert.equal(client.origin, ORIGIN);
  console.log('  [ok] client() rebuilds from persisted credential after restart');

  // bindOrigin(): keeping the saved token while changing only the URL.
  const rebound = await restarted.bindOrigin('https://halo.example.org/');
  assert.equal(rebound.origin, 'https://halo.example.org');
  assert.equal(rebound.reusedToken, true);
  assert.equal(store.get('dsh-workspace-bridge/halo').payload.token, 'persisted-test-pat',
    'bindOrigin must keep the existing token');
  console.log('  [ok] bindOrigin() updates URL while reusing persisted token');

  console.log('PERSIST BINDING TEST PASSED');
} finally {
  db?.close();
  try { rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  catch { /* Windows may hold -wal/-shm briefly */ }
}
