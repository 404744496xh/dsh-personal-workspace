/**
 * Real-cordis Context test for dsh-personal-workspace.
 *
 * The earlier test/apply.mjs used a hand-rolled mock ctx whose `tools`,
 * `webServer` and `systemPrompt` were plain properties. That hid the exact
 * bug that made the plugin register nothing after a real DSH restart:
 * cordis' context Proxy throws `cannot get property "<name>" without inject`
 * for services not declared in `inject`, so applyReady's very first
 * `ctx.systemPrompt.section(...)` threw, got caught, and applyDegraded threw
 * again on the same call — leaving zero tools and zero routes.
 *
 * This test mounts the plugin on a REAL cordis Context and asserts:
 *   1. with the three core services provided, 8 tools / 5 routes / 1 prompt
 *      section are registered and every disposer runs cleanly;
 *   2. `inject` really lists those core services (regression guard).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const harnessRoot = 'D:/devtool/deepseek-harness';
const fromHarness = createRequire(`${harnessRoot}/package.json`);
const { Context } = await import(pathToFileURL(fromHarness.resolve('@deepseek-ai/cordis')).href);

const bundleRoot = 'D:/qt/halo/plugins/dsh-personal-workspace';
const plugin = await import(pathToFileURL(`${bundleRoot}/index.js`).href);

// --- regression guard on the declaration itself ---------------------------
for (const svc of ['webServer', 'systemPrompt', 'tools']) {
  assert.ok(
    plugin.inject.includes(svc),
    `inject must declare core service "${svc}"; got ${JSON.stringify(plugin.inject)}`,
  );
}

// --- mount on a real Context with the core services provided --------------
const ctx = new Context();
const tools = [];
const routes = [];
const sections = [];

ctx.provide('systemPrompt', {
  section(spec) {
    sections.push(spec);
    return () => {
      const i = sections.indexOf(spec);
      if (i >= 0) sections.splice(i, 1);
    };
  },
});
ctx.provide('tools', {
  register(tool) {
    tools.push(tool);
    return () => {
      const i = tools.indexOf(tool);
      if (i >= 0) tools.splice(i, 1);
    };
  },
});
ctx.provide('webServer', {
  register(route) {
    routes.push(route);
    return () => {
      const i = routes.indexOf(route);
      if (i >= 0) routes.splice(i, 1);
    };
  },
});
// credentials is optional (ctx.get soft-probe in service) — leave absent.

const handle = ctx.plugin(plugin, { dbPath: ':memory:' });
await handle.await();

assert.equal(tools.length, 8, `expected 8 tools, got ${tools.length}: ${tools.map((t) => t.name).join(',')}`);
assert.equal(routes.length, 5, `expected 5 routes, got ${routes.length}`);
assert.equal(sections.length, 1, `expected 1 prompt section, got ${sections.length}`);
assert.deepEqual(
  tools.map((t) => t.name).sort(),
  [
    'bridge_bind', 'bridge_status', 'bridge_sync', 'bridge_list',
    'bridge_get', 'bridge_create', 'bridge_update', 'bridge_delete',
  ].sort(),
);
console.log('REAL CORDIS CONTEXT TEST PASSED: 8 tools, 5 routes, 1 prompt section');

// Disposal must remove every registration (hot-reload safety).
await handle.dispose();
assert.equal(tools.length, 0, 'tools not disposed');
assert.equal(routes.length, 0, 'routes not disposed');
assert.equal(sections.length, 0, 'sections not disposed');
console.log('DISPOSAL OK: all registrations removed');
