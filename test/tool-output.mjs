/**
 * Every registered tool must return lossless JSON.
 *
 * The host rejects a tool result carrying `undefined` fields
 * ("value is not lossless JSON"). status() legitimately has undefined
 * lastSync/pullMode before the first sync, which is exactly the shape that
 * broke bridge_status in the live profile.
 * Run: D:/devtool/nodejs/node.exe test/tool-output.mjs
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { openMirrorDb } from '../lib/db.js';
import { WorkspaceBridgeService } from '../lib/service.js';
import { allBridgeTools } from '../lib/tools.js';

const tmp = mkdtempSync(join(tmpdir(), 'wsb-toolout-'));
const db = openMirrorDb({ dbPath: join(tmp, 'mirror.db') });
const service = new WorkspaceBridgeService({ db, ctx: { get: () => undefined }, config: {} });
const tools = allBridgeTools(service);

/** Walk a value and collect any key whose value is undefined / non-JSON. */
function nonJsonPaths(value, path = '$', out = []) {
  if (value === undefined) { out.push(`${path} = undefined`); return out; }
  if (typeof value === 'function' || typeof value === 'symbol') { out.push(`${path} = ${typeof value}`); return out; }
  if (typeof value === 'bigint') { out.push(`${path} = bigint`); return out; }
  if (value === null || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    value.forEach((v, i) => nonJsonPaths(v, `${path}[${i}]`, out));
    return out;
  }
  for (const [k, v] of Object.entries(value)) nonJsonPaths(v, `${path}.${k}`, out);
  return out;
}

// Exercise the tools that need no network: status / list / task_today.
const cases = [
  ['bridge_status', {}],
  ['bridge_list', { kind: 'todo' }],
  ['bridge_task_today', {}],
];

for (const [name, args] of cases) {
  const tool = tools.find((t) => t.name === name);
  assert.ok(tool, `tool ${name} missing`);
  const out = await tool.execute(args, {});
  const bad = nonJsonPaths(out);
  assert.deepEqual(bad, [], `${name} returned non-JSON values: ${bad.join(', ')}`);
  // Round-trip must be identity (no silent loss).
  assert.deepEqual(JSON.parse(JSON.stringify(out)), out, `${name} output is not JSON-stable`);
  console.log(`  [ok] ${name} returns lossless JSON`);
}

// The exact regression: status() before any sync has undefined lastSync/pullMode.
{
  const st = await service.status();
  assert.equal(st.lastSync, undefined, 'precondition: lastSync is undefined before first sync');
  const tool = tools.find((t) => t.name === 'bridge_status');
  const out = await tool.execute({}, {});
  assert.equal('lastSync' in out.result, false, 'undefined lastSync must be dropped, not emitted');
  assert.equal(nonJsonPaths(out).length, 0);
  console.log('  [ok] bridge_status with undefined lastSync/pullMode is still lossless');
}

db.close();
try { rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* windows locks */ }
console.log('TOOL OUTPUT TEST PASSED');
