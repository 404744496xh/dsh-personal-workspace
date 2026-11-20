/**
 * Service-level tests for the task execution loop:
 * - plan/step/submit/review through WorkspaceBridgeService
 * - HUMAN gate: accept flips the mirrored todo's completed flag (so sync pushes it)
 * - taskToday / taskReport / taskCapture via the service
 * - graceful session tail read when sessionQuery is absent
 * Run: D:/devtool/nodejs/node.exe test/task-service.mjs
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openMirrorDb, listRows, parsePayload, getRow } from '../lib/db.js';
import { WorkspaceBridgeService } from '../lib/service.js';

const db = openMirrorDb(':memory:');

// Reuse the real credential stub shape used by other tests.
const store = new Map();
const credentials = {
  readRecord: async (k) => store.get(k),
  modifyRecord: async (k, mutate) => { const next = await mutate(store.get(k)); store.set(k, next); return next; },
  describeRecord: async (k) => ({ configured: store.has(k) }),
  deleteRecord: async (k) => { store.delete(k); },
};
const ctx = { get: (n) => (n === 'credentials' ? credentials : undefined) };
const service = new WorkspaceBridgeService({ db, ctx, config: {} });

// Seed a local todo (dirty, like a freshly captured task).
const todo = service.create('todo', { title: '重构登录模块', priority: 'HIGH' });
assert.equal(todo.dirty, true);

// --- task plan + steps -------------------------------------------------------
let t = service.taskPlan(todo.name, '完成重构', ['拆分接口', '实现', '回归测试']);
assert.equal(t.steps.length, 3);
assert.equal(t.review, 'draft');

t = service.taskStep(todo.name, { index: 1, status: 'done', evidence: '接口设计评审通过' });
t = service.taskStep(todo.name, { index: 2, status: 'done', evidence: 'PR #88 merged' });
t = service.taskStep(todo.name, { index: 3, status: 'done', evidence: 'ci green' });
assert.equal(t.steps.every((s) => s.status === 'done'), true);
console.log('  [ok] service.taskPlan + taskStep with evidence');

// --- submit needs human review ----------------------------------------------
t = service.taskSubmit(todo.name, '请验收');
assert.equal(t.review, 'pending');
// The mirrored todo is NOT completed just because the agent submitted.
assert.equal(parsePayload(getRow(db, 'todo', todo.name)).completed, false);
console.log('  [ok] submit sets review=pending, does not complete the todo');

// --- HUMAN accept flips the todo completed flag -----------------------------
t = service.taskReview(todo.name, { decision: 'accept', note: '干得漂亮' });
assert.equal(t.review, 'accepted');
const mirrored = parsePayload(getRow(db, 'todo', todo.name));
assert.equal(mirrored.completed, true, 'accept must flip the Halo-bound todo completed flag');
console.log('  [ok] human accept flips mirrored todo.completed (sync will push to Halo)');

// Any step change after acceptance reopens review AND un-completes nothing
// (completed stays true until the human re-reviews; safest is to leave it and
// let the reopened review be visible — verified below).
t = service.taskStep(todo.name, { index: 3, status: 'doing' });
assert.equal(t.review, 'draft');
console.log('  [ok] post-accept step change reopens review');

// --- today view + report -----------------------------------------------------
const today = service.taskToday();
assert.ok(Array.isArray(today.items));
assert.ok(today.groups && typeof today.stats === 'object');
const report = await service.taskReport({ type: 'daily' });
assert.ok(report.markdown.includes('日报'));
const saved = await service.taskReport({ type: 'weekly', saveAsNote: true });
assert.ok(saved.noteName, 'saveAsNote should create a local note');
console.log('  [ok] service.taskToday + taskReport (+ saveAsNote)');

// --- capture dedup -----------------------------------------------------------
const cap = service.taskCapture('重构登录模块');
assert.ok(Array.isArray(cap.duplicates));
assert.ok(cap.duplicates.length >= 1, 'near-duplicate title should be flagged');
console.log('  [ok] service.taskCapture flags near-duplicates');

// --- session tail: graceful when sessionQuery absent ------------------------
service.taskBind(todo.name, 'sess-xyz', 'manual tail');
const tail = await service.taskSessionTail(todo.name, 10);
assert.equal(tail.sessionId, 'sess-xyz');
assert.equal(tail.unavailable, true, 'missing sessionQuery must degrade, not throw');
assert.deepEqual(tail.tail, []);
console.log('  [ok] taskSessionTail degrades gracefully when sessionQuery absent');

console.log('TASK SERVICE TEST PASSED');
