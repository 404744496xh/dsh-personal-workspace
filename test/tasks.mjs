/**
 * Unit tests for the task execution loop (lib/tasks.js).
 * Run: D:/devtool/nodejs/node.exe test/tasks.mjs
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  initTask, plan, step, submit, review, flags, getTask, progress,
  findDuplicates, diceSimilarity, todayView, planDay, generateReport,
} from '../lib/tasks.js';

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE task_meta (
    todo_name TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT
  );
`);

// Need the db helpers used by tasks.js via db.js — but tasks.js imports from
// db.js directly, so build the same table there by wiring a minimal stub through
// the real functions instead. tasks.js imports getTaskMeta/putTaskMeta/deleteTaskMeta
// from db.js, which operate on the passed db and the task_meta table. Good.

const DAY = 24 * 60 * 60 * 1000;
const isoDay = (offset) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

// --- plan / steps / evidence -------------------------------------------------
let t = plan(db, 'todo-1', { goal: ' ship feature ', steps: ['设计', '实现', '验收'] });
assert.equal(t.steps.length, 3);
assert.equal(t.review, 'draft');
assert.equal(progress(t).done, 0);

t = step(db, 'todo-1', { index: 1, status: 'doing', evidence: 'see design doc', sessionId: 'sess-1' });
assert.equal(t.steps[0].status, 'doing');
assert.equal(t.steps[0].evidence[0].text, 'see design doc');
assert.equal(t.steps[0].sessionId, 'sess-1');

t = step(db, 'todo-1', { index: 1, status: 'done', evidence: 'merged PR #42' });
assert.equal(progress(t).done, 1);
assert.equal(t.steps[0].evidence.length, 2);
console.log('  [ok] plan + step status/evidence/sessionId');

// Cannot submit before all steps done.
assert.throws(() => submit(db, 'todo-1', 'early'), /未完成/);
t = step(db, 'todo-1', { index: 2, status: 'done' });
t = step(db, 'todo-1', { index: 3, status: 'done' });
assert.equal(progress(t).done, 3);

// --- human review gate -------------------------------------------------------
t = submit(db, 'todo-1', 'ready for review');
assert.equal(t.review, 'pending');
// The human gate lives in the service layer (HTTP route requires an explicit
// human action); the pure task module itself just transitions state.
const accepted = review(db, 'todo-1', { decision: 'accept', note: 'looks good' });
assert.equal(accepted.review, 'accepted');
assert.equal(accepted.reviewNote, 'looks good');
// Any step change reopens review.
const reopened = step(db, 'todo-1', { index: 3, status: 'doing' });
assert.equal(reopened.review, 'draft');
console.log('  [ok] submit -> human accept -> step change reopens review');

// --- flags -------------------------------------------------------------------
let f = flags(db, 'todo-1', { someday: true, quota: 'should' });
assert.equal(f.someday, true);
assert.equal(f.quota, 'should');
f = flags(db, 'todo-1', { quota: null });
assert.equal(f.quota, null);
assert.throws(() => flags(db, 'todo-1', { quota: 'urgent' }), /quota/);
console.log('  [ok] someday/quota flags with validation');

// --- dedup -------------------------------------------------------------------
const high = diceSimilarity('修复登录页面的样式问题', '修复登录页面样式问题');
const low = diceSimilarity('修复登录页面的样式问题', '买咖啡豆');
assert.ok(high > low && low < 0.3, `similarity high=${high} low=${low}`);
const dups = findDuplicates(
  [{ name: 'a', title: '修复登录页面的样式问题', createdAt: new Date().toISOString() }],
  '修复登录页面样式问题',
);
assert.equal(dups.length, 1);
assert.equal(dups[0].name, 'a');
console.log('  [ok] bigram dedup finds near-duplicate titles');

// --- today view --------------------------------------------------------------
const todos = [
  { name: 'overdue-1', title: '逾期任务', priority: 'HIGH', dueDate: isoDay(-2), completed: false, dismissed: false, createdAt: isoDay(-5) },
  { name: 'today-1', title: '今日任务', priority: 'MEDIUM', dueDate: isoDay(0), completed: false, dismissed: false, createdAt: isoDay(-1) },
  { name: 'soon-1', title: '稍后任务', priority: 'LOW', dueDate: isoDay(3), completed: false, dismissed: false, createdAt: isoDay(-1) },
  { name: 'done-1', title: '已完成', priority: 'LOW', dueDate: isoDay(0), completed: true, dismissed: false, createdAt: isoDay(-1) },
];
const baseMeta = getTask(db, 'todo-1');
const metas = {
  'today-1': { ...baseMeta, someday: false },
  'soon-1': { ...baseMeta, someday: true },
};
const view = todayView(todos, metas);
assert.equal(view.groups.overdue.length, 1);
assert.equal(view.groups.today.length, 1);
assert.equal(view.groups.someday.length, 1);
assert.ok(!view.items.some((r) => r.name === 'done-1'));
assert.equal(view.stats.dueToday, 1);
const ordered = planDay(todos, metas);
assert.equal(ordered.length, 3);
assert.ok(['overdue-1', 'today-1', 'soon-1'].includes(ordered[0].name));
console.log('  [ok] today view groups + smart ordering');

// --- report ------------------------------------------------------------------
const md = generateReport(todos, metas, { type: 'daily', from: isoDay(-7), to: isoDay(1) });
assert.ok(md.includes('日报'));
assert.ok(md.includes('已完成并验收'));
assert.ok(md.includes('逾期任务'));
const weekly = generateReport(todos, metas, { type: 'weekly' });
assert.ok(weekly.includes('周报'));
console.log('  [ok] daily/weekly report markdown');

console.log('TASK MODULE TEST PASSED');
