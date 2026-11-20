/**
 * Tests for the self-managed auto-sync scheduler:
 *  - preferences persist in sync_state (survive a fresh service = restart);
 *  - interval is validated (>= 30s);
 *  - _autoSyncTick calls sync() only when bound, skips when busy/unbound;
 *  - startAutoTimer/stopAutoTimer manage the timer handle (hot-reload safety);
 *  - status() exposes autoSync without leaking the token.
 *
 *   node test/auto-sync.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openMirrorDb } from '../lib/db.js';
import { WorkspaceBridgeService } from '../lib/service.js';

const ORIGIN = 'https://www.xiahan.asia';

function makeCredentialStore(bound) {
  const store = new Map();
  if (bound) {
    store.set('dsh-workspace-bridge/halo', {
      kind: 'grant', payload: { token: 'test-pat', origin: ORIGIN },
    });
  }
  const api = {
    readRecord: async (k) => store.get(k),
    modifyRecord: async (k, mutate) => { const n = await mutate(store.get(k)); store.set(k, n); return n; },
    describeRecord: async (k) => ({ configured: store.has(k) }),
    deleteRecord: async (k) => { store.delete(k); },
  };
  return api;
}

const tmp = mkdtempSync(join(tmpdir(), 'wsb-autosync-'));
let db;
try {
  db = openMirrorDb({ dbPath: join(tmp, 'mirror.db') });
  const credentials = makeCredentialStore(true);
  const ctx = { get: (n) => (n === 'credentials' ? credentials : undefined) };
  const service = new WorkspaceBridgeService({ db, ctx, config: {} });

  // --- defaults ---
  assert.deepEqual(service.getAutoSync(), { enabled: false, intervalSec: 120 });
  console.log('  [ok] auto-sync defaults: disabled, 120s');

  // --- validation ---
  assert.throws(() => service.setAutoSync({ intervalSec: 10 }), /30/, 'interval below minimum rejected');
  console.log('  [ok] interval below 30s is rejected');

  // --- persist + status exposure ---
  const saved = service.setAutoSync({ enabled: true, intervalSec: 45 });
  assert.deepEqual(saved, { enabled: true, intervalSec: 45 });
  const st = await service.status();
  assert.deepEqual(st.autoSync, { enabled: true, intervalSec: 45 });
  assert.ok(!('token' in st), 'status must not leak token');
  console.log('  [ok] setAutoSync persists + status() exposes settings');

  // --- survives restart (fresh service, same db) ---
  const restarted = new WorkspaceBridgeService({ db, ctx, config: {} });
  assert.deepEqual(restarted.getAutoSync(), { enabled: true, intervalSec: 45 });
  console.log('  [ok] settings survive a service restart (sync_state)');

  // --- _autoSyncTick calls sync when bound ---
  let syncCalls = 0;
  restarted.sync = async () => { syncCalls += 1; return { pulled: 0, pushed: 0 }; };
  const tick = await restarted._autoSyncTick();
  assert.equal(syncCalls, 1, 'tick should call sync once when bound');
  assert.equal(tick.pulled, 0);
  console.log('  [ok] _autoSyncTick() runs a sync cycle when bound');

  // --- skips when a sync is already running ---
  restarted.syncing = true;
  const skipped = await restarted._autoSyncTick();
  assert.equal(skipped.skipped, true);
  assert.equal(syncCalls, 1, 'no extra sync while one is in flight');
  restarted.syncing = false;
  console.log('  [ok] tick skips while another sync is running');

  // --- skips when unbound (no credentials) ---
  const unbound = new WorkspaceBridgeService({ db, ctx: { get: () => undefined }, config: {} });
  unbound.sync = async () => { throw new Error('should not be called'); };
  const unboundTick = await unbound._autoSyncTick();
  assert.equal(unboundTick.skipped, true);
  assert.equal(unboundTick.reason, 'not bound');
  console.log('  [ok] tick skips when binding is missing');

  // --- timer lifecycle ---
  restarted.startAutoTimer();
  assert.ok(restarted._autoTimer !== undefined, 'timer handle should exist when enabled');
  restarted.stopAutoTimer();
  assert.equal(restarted._autoTimer, undefined, 'stopAutoTimer clears the handle');
  const disabled = restarted.setAutoSync({ enabled: false });
  assert.equal(disabled.enabled, false);
  restarted.startAutoTimer();
  assert.equal(restarted._autoTimer, undefined, 'no timer when disabled');
  console.log('  [ok] timer start/stop is idempotent and respects enabled flag');

  console.log('AUTO SYNC TEST PASSED');
} finally {
  db?.close();
  try { rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  catch { /* Windows may hold -wal/-shm briefly */ }
}
