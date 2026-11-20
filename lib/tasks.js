/**
 * Task execution loop — the DSH-native layer of dsh-personal-workspace.
 *
 * Halo is authoritative for todo/project/note *data*. The execution loop
 * (numbered steps, evidence, human review, session binding, someday/quota)
 * is DSH-local state stored in SQLite: Halo's data model has no fields for it,
 * and both reference plugins (@dely0/dsh-personal-workbench, dsh-global-todo)
 * keep this kind of state locally as well.
 *
 * Design rules (shared with both reference plugins):
 * - an agent NEVER marks a task complete. It submits for review; a human must
 *   accept. Only on acceptance do we flip the Halo todo's `completed` flag,
 *   which then flows to Halo through the existing sync engine.
 * - every step change can carry `evidence` (a verbatim quote or artifact ref).
 * - "done" means every numbered step is done AND the review was accepted.
 */
import {
  getTaskMeta, putTaskMeta, deleteTaskMeta,
} from './db.js';

export const STEP_STATUS = ['todo', 'doing', 'done'];
export const REVIEW = ['draft', 'pending', 'accepted', 'rejected'];
export const QUOTA = ['must', 'should', 'could'];

const DAY_MS = 24 * 60 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function emptyMeta(todoName) {
  return {
    todoName,
    goal: '',
    steps: [],
    review: 'draft',
    reviewNote: '',
    someday: false,
    quota: null,
    sessionId: null,
    sessionTail: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function getTask(db, todoName) {
  return getTaskMeta(db, todoName) ?? emptyMeta(todoName);
}

function save(db, meta) {
  const next = { ...meta, updatedAt: nowIso() };
  putTaskMeta(db, next.todoName, next);
  return next;
}

function assertTodoName(todoName) {
  if (typeof todoName !== 'string' || todoName.trim() === '')
    throw new Error('todoName 不能为空');
}

function normalizeSteps(input) {
  if (!Array.isArray(input))
    throw new Error('steps 必须是字符串数组');
  const steps = input
    .map((s) => (typeof s === 'string' ? s.trim() : String(s ?? '').trim()))
    .filter(Boolean)
    .slice(0, 50)
    .map((text, i) => ({
      index: i + 1,
      text,
      status: 'todo',
      evidence: [],
      sessionId: null,
      updatedAt: nowIso(),
    }));
  if (steps.length === 0)
    throw new Error('至少需要一个步骤');
  return steps;
}

/** Create/initialise the execution record for a todo. */
export function initTask(db, todoName, options = {}) {
  assertTodoName(todoName);
  const current = getTask(db, todoName);
  const steps = options.steps ? normalizeSteps(options.steps) : current.steps;
  return save(db, {
    ...current,
    goal: typeof options.goal === 'string' ? options.goal : current.goal,
    steps,
    quota: QUOTA.includes(options.quota) ? options.quota : current.quota,
    someday: typeof options.someday === 'boolean' ? options.someday : current.someday,
    sessionId: typeof options.sessionId === 'string' ? options.sessionId : current.sessionId,
  });
}

/** Replace the numbered plan. Replanning resets review to draft. */
export function plan(db, todoName, { goal, steps } = {}) {
  assertTodoName(todoName);
  const current = getTask(db, todoName);
  return save(db, {
    ...current,
    goal: typeof goal === 'string' ? goal : current.goal,
    steps: normalizeSteps(steps),
    review: 'draft',
    reviewNote: '',
  });
}

/** Advance one step; evidence is a verbatim quote or artifact reference. */
export function step(db, todoName, { index, status, evidence, sessionId } = {}) {
  assertTodoName(todoName);
  const current = getTask(db, todoName);
  const n = Number(index);
  const target = current.steps.find((s) => s.index === n);
  if (!target)
    throw new Error(`步骤 ${index} 不存在（共 ${current.steps.length} 步）`);
  if (!STEP_STATUS.includes(status))
    throw new Error(`status 必须是 ${STEP_STATUS.join(' / ')}`);
  const evidenceList = Array.isArray(target.evidence) ? [...target.evidence] : [];
  if (typeof evidence === 'string' && evidence.trim() !== '')
    evidenceList.push({ text: evidence.trim(), at: nowIso() });
  const steps = current.steps.map((s) => (s.index === n ? {
    ...s,
    status,
    evidence: evidenceList.slice(-20),
    sessionId: typeof sessionId === 'string' ? sessionId : s.sessionId,
    updatedAt: nowIso(),
  } : s));
  // Any change after acceptance reopens the review.
  const review = current.review === 'accepted' ? 'draft' : current.review;
  return save(db, { ...current, steps, review });
}

export function progress(task) {
  const steps = Array.isArray(task?.steps) ? task.steps : [];
  return { done: steps.filter((s) => s.status === 'done').length, total: steps.length };
}

/** Agent submits the finished work. A human must still accept it. */
export function submit(db, todoName, note) {
  assertTodoName(todoName);
  const current = getTask(db, todoName);
  const p = progress(current);
  if (p.total === 0)
    throw new Error('还没有步骤计划：请先用 plan 拆分步骤');
  if (p.done !== p.total)
    throw new Error(`还有 ${p.total - p.done} 步未完成，不能提交验收`);
  return save(db, {
    ...current,
    review: 'pending',
    reviewNote: typeof note === 'string' ? note.slice(0, 2000) : '',
  });
}

/**
 * Human-only decision. The service layer flips the Halo todo's `completed`
 * flag on accept, so acceptance is the single gate between the two worlds.
 */
export function review(db, todoName, { decision, note } = {}) {
  assertTodoName(todoName);
  if (!['accept', 'reject'].includes(decision))
    throw new Error('decision 必须是 accept 或 reject');
  const current = getTask(db, todoName);
  if (current.review !== 'pending')
    throw new Error('该任务尚未提交验收');
  return save(db, {
    ...current,
    review: decision === 'accept' ? 'accepted' : 'rejected',
    reviewNote: typeof note === 'string' ? note.slice(0, 2000) : '',
  });
}

export function flags(db, todoName, { someday, quota } = {}) {
  assertTodoName(todoName);
  const current = getTask(db, todoName);
  if (quota !== undefined && quota !== null && !QUOTA.includes(quota))
    throw new Error(`quota 必须是 ${QUOTA.join(' / ')} 或 null`);
  return save(db, {
    ...current,
    someday: typeof someday === 'boolean' ? someday : current.someday,
    quota: quota === null ? null : (QUOTA.includes(quota) ? quota : current.quota),
  });
}

export function bindSession(db, todoName, sessionId, tail) {
  assertTodoName(todoName);
  const current = getTask(db, todoName);
  return save(db, {
    ...current,
    sessionId: typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : current.sessionId,
    sessionTail: typeof tail === 'string' ? tail.slice(-4000) : current.sessionTail,
  });
}

export function removeTask(db, todoName) {
  deleteTaskMeta(db, todoName);
}

// ------------------------------------------------------------------ capture

export function normalizeTitle(text) {
  return String(text ?? '').toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim();
}

export function bigrams(text) {
  const s = normalizeTitle(text).replace(/\s+/g, '');
  const out = new Set();
  for (let i = 0; i < s.length - 1; i += 1) out.add(s.slice(i, i + 2));
  if (s.length === 1) out.add(s);
  return out;
}

export function diceSimilarity(a, b) {
  const A = bigrams(a); const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const g of A) if (B.has(g)) shared += 1;
  return (2 * shared) / (A.size + B.size);
}

/** Find near-duplicate todos captured in the last 72 hours. */
export function findDuplicates(todos, title, { threshold = 0.8, windowMs = 72 * DAY_MS, limit = 3 } = {}) {
  const cutoff = Date.now() - windowMs;
  return (todos || [])
    .filter((t) => {
      const ts = Date.parse(t.createdAt ?? t.updatedAt ?? '');
      return Number.isFinite(ts) ? ts >= cutoff : true;
    })
    .map((t) => ({ todo: t, score: diceSimilarity(title, t.title ?? '') }))
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => ({ name: x.todo.name, title: x.todo.title, score: Number(x.score.toFixed(2)) }));
}

// ------------------------------------------------------------------ views

const PRIORITY_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const QUOTA_RANK = { must: 0, should: 1, could: 2 };

function dueDay(todo) {
  if (!todo?.dueDate) return null;
  const d = new Date(`${String(todo.dueDate).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfLocalDay(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function viewRow(todo, meta) {
  const task = meta;
  return {
    name: todo.name,
    title: todo.title,
    priority: todo.priority ?? 'MEDIUM',
    dueDate: todo.dueDate ?? null,
    project: todo.project ?? null,
    completed: Boolean(todo.completed),
    dismissed: Boolean(todo.dismissed),
    pinned: Boolean(todo.pinned),
    review: task?.review ?? 'draft',
    progress: progress(task),
    someday: Boolean(task?.someday),
    quota: task?.quota ?? null,
    sessionId: task?.sessionId ?? null,
    goal: task?.goal ?? '',
  };
}

/** Today / overdue / soon / someday groups for the UI. */
export function todayView(todos, metas, now = new Date()) {
  const today = startOfLocalDay(now);
  const soonLimit = new Date(today.getTime() + 7 * DAY_MS);
  const groups = { overdue: [], today: [], soon: [], someday: [] };
  const items = [];
  for (const todo of todos || []) {
    if (todo.completed || todo.dismissed || todo.name?.startsWith?.('local-')) continue;
    const meta = metas?.[todo.name];
    const row = viewRow(todo, meta);
    items.push(row);
    if (row.someday) { groups.someday.push(row); continue; }
    const due = dueDay(todo);
    if (!due) continue;
    if (due < today) groups.overdue.push(row);
    else if (due.getTime() === today.getTime()) groups.today.push(row);
    else if (due <= soonLimit) groups.soon.push(row);
  }
  const stats = {
    pending: items.filter((r) => r.review !== 'accepted').length,
    dueToday: groups.today.length,
    overdue: groups.overdue.length,
    inReview: items.filter((r) => r.review === 'pending').length,
  };
  return { groups, items, stats };
}

/** Deterministic "smart order": quota first, then priority, then due date. */
export function planDay(todos, metas, { limit = 12 } = {}) {
  const today = startOfLocalDay();
  return (todos || [])
    .filter((t) => !t.completed && !t.dismissed && !t.name?.startsWith?.('local-'))
    .map((t) => {
      const meta = metas?.[t.name];
      const due = dueDay(t);
      const overdueDays = due && due < today ? Math.round((today - due) / DAY_MS) : 0;
      const score = 100
        - (QUOTA_RANK[meta?.quota] ?? 3) * 30
        - (PRIORITY_RANK[t.priority] ?? 3) * 12
        - Math.min(overdueDays, 14) * 4
        + (meta?.review === 'pending' ? 20 : 0)
        + (due && due.getTime() === today.getTime() ? 15 : 0);
      return { ...viewRow(t, meta), score };
    })
    .sort((a, b) => b.score - a.score || String(a.dueDate ?? '').localeCompare(String(b.dueDate ?? '')))
    .slice(0, Math.max(1, Math.min(Number(limit) || 12, 50)));
}

function fmtDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

/** Build a daily/weekly Markdown report from mirrored todos + task state. */
export function generateReport(todos, metas, { type = 'daily', from, to, now = new Date() } = {}) {
  const end = to ? new Date(`${String(to).slice(0, 10)}T23:59:59`) : new Date(now);
  const start = from
    ? new Date(`${String(from).slice(0, 10)}T00:00:00`)
    : new Date(end.getTime() - (type === 'weekly' ? 7 : 1) * DAY_MS);
  const inRange = (t) => {
    const ts = Date.parse(t.updatedAt ?? t.createdAt ?? '');
    return Number.isFinite(ts) ? ts >= start.getTime() && ts <= end.getTime() : true;
  };
  const rows = (todos || []).filter(inRange).map((t) => ({ t, m: metas?.[t.name] }));
  const done = rows.filter(({ m }) => m?.review === 'accepted');
  const inReview = rows.filter(({ m }) => m?.review === 'pending');
  const active = rows.filter(({ m }) => !m || m.review === 'draft' || m.review === 'rejected');
  const lines = [
    `# ${type === 'weekly' ? '周报' : '日报'} ${fmtDate(start)} — ${fmtDate(end)}`,
    '',
    `- 已完成并验收：${done.length} 项`,
    `- 待验收：${inReview.length} 项`,
    `- 进行中：${active.length} 项`,
    '',
    '## 已完成',
    ...(done.length ? done.map(({ t, m }) => {
      const p = progress(m);
      return `- ${t.title}（${p.done}/${p.total} 步）${m?.reviewNote ? `— ${m.reviewNote}` : ''}`;
    }) : ['- 无']),
    '',
    '## 待验收',
    ...(inReview.length ? inReview.map(({ t, m }) => `- ${t.title}${m?.reviewNote ? `— ${m.reviewNote}` : ''}`) : ['- 无']),
    '',
    '## 进行中',
    ...(active.length ? active.map(({ t, m }) => {
      const p = progress(m);
      const current = (m?.steps ?? []).find((s) => s.status === 'doing');
      return `- ${t.title}（${p.done}/${p.total}）${current ? `— 正在：${current.text}` : ''}`;
    }) : ['- 无']),
    '',
  ];
  return lines.join('\n');
}
