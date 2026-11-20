/**
 * Exercise Host apply() with a mock cordis ctx — verifies tool/route/prompt
 * registration without needing a DSH restart. Uses a temp mirror DB.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { apply, name } = await import('../index.js');
assert.equal(name, 'dsh-personal-workspace');

function makeCtx() {
  const reg = { tools: [], routes: [], sections: [], cleanups: [] };
  const ctx = {
    reg,
    effect(fn) {
      const d = fn();
      if (typeof d === 'function') reg.cleanups.push(d);
    },
    systemPrompt: {
      section(spec) { reg.sections.push(spec); return () => {}; },
    },
    tools: {
      register(tool) { reg.tools.push(tool); return () => {}; },
    },
    webServer: {
      register(route) { reg.routes.push(route); return () => {}; },
    },
    get() { return undefined; },
  };
  return ctx;
}

const tmp = mkdtempSync(join(tmpdir(), 'wsb-apply-'));
try {
  const dbPath = join(tmp, 'mirror.db');
  const ctx = makeCtx();

  // Default config: no haloOrigin (the normal case — origin comes from
  // bridge_bind credentials). This must NOT fall into degraded mode.
  apply(ctx, { dbPath });

  const toolNames = ctx.reg.tools.map((t) => t.name);
  const expected = [
    'bridge_bind', 'bridge_status', 'bridge_sync', 'bridge_auto_sync', 'bridge_list',
    'bridge_get', 'bridge_create', 'bridge_update', 'bridge_delete',
    'bridge_task_today', 'bridge_task_plan', 'bridge_task_step', 'bridge_task_submit',
    'bridge_task_flags', 'bridge_task_bind', 'bridge_task_tail', 'bridge_task_report',
    'bridge_task_capture',
  ];
  for (const n of expected) {
    assert.ok(toolNames.includes(n), `tool ${n} was not registered; got ${JSON.stringify(toolNames)}`);
  }
  assert.equal(toolNames.length, 18, 'expected 18 tools');
  assert.equal(ctx.reg.routes.length, 10, 'expected 10 loopback routes');
  assert.ok(ctx.reg.sections.some((s) => s.name === 'plugin:dsh-personal-workspace'), 'system prompt section missing');
  assert.ok(!ctx.reg.sections.some((s) => s.name.includes('degraded')), 'must not be degraded with empty config');
  assert.equal(ctx.reg.cleanups.length, 5, 'expected 5 effect cleanups (incl. auto-sync timer)');
  // Dispose everything (db close included) to confirm cleanups are callable.
  for (const dispose of ctx.reg.cleanups) dispose?.();
  console.log('APPLY TEST PASSED:', toolNames.length, 'tools,', ctx.reg.routes.length, 'routes,', ctx.reg.sections.length, 'prompt sections');
} finally {
  try { rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* temp */ }
}
