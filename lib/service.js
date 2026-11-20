/**
 * The central Host service for dsh-personal-workspace.
 *
 * Design rule (dsh-doc user-actions.md): "one operation, two callers". Every
 * mutation lives here so both the agent tools and the HTTP/UI routes go through
 * the same path — that is what guarantees the dirty flags are never missed.
 *
 * Halo is authoritative; the local SQLite mirror is a working copy. Reads are
 * served from the mirror (fast, offline-friendly). Writes mark rows dirty and
 * are pushed to Halo by sync(); deletes are tombstones until pushed.
 */
import { HaloClient } from './halo-client.js';
import {
  getCursor, setCursor, applyRemoteChange, getRow, listRows, putLocal,
  deleteLocal, insertLocal, listDirty, markPushed, pruneRow, parsePayload,
} from './db.js';

const KINDS = ['todo', 'project', 'note'];
const TOKEN_KEY = 'dsh-workspace-bridge/halo';

function assertKind(kind) {
  if (!KINDS.includes(kind))
    throw new Error(`unknown kind "${kind}" (expected todo/project/note)`);
}

/** View (mirror payload) -> Halo *UpsertRequest body. */
function toUpsert(kind, payload) {
  const p = payload ?? {};
  if (kind === 'todo') {
    const body = {
      title: p.title ?? '',
      detail: p.detail ?? '',
      priority: ['HIGH', 'MEDIUM', 'LOW'].includes(p.priority) ? p.priority : 'MEDIUM',
      project: p.project ?? null,
      module: p.module ?? null,
      reporter: p.reporter ?? null,
      dueDate: p.dueDate ?? null,
      completed: Boolean(p.completed),
      dismissed: Boolean(p.dismissed),
      pinned: Boolean(p.pinned),
    };
    if (p.createdAt) body.createdAt = p.createdAt;
    return body;
  }
  if (kind === 'project') {
    return {
      title: p.title ?? '',
      modules: Array.isArray(p.modules) ? p.modules : [],
      status: ['NOT_STARTED', 'DEV', 'TEST', 'RELEASED', 'ACCEPTED'].includes(p.status) ? p.status : 'DEV',
      note: p.note ?? '',
      links: Array.isArray(p.links) ? p.links : [],
      tags: Array.isArray(p.tags) ? p.tags : [],
    };
  }
  return {
    title: p.title ?? '',
    content: p.content ?? '',
    summary: p.summary ?? '',
    tags: Array.isArray(p.tags) ? p.tags : [],
    project: p.project ?? null,
    module: p.module ?? null,
    todos: Array.isArray(p.todos) ? p.todos : [],
  };
}

export class WorkspaceBridgeService {
  constructor({ db, ctx, config = {} }) {
    this.db = db;
    this.ctx = ctx;
    this.config = config;
    this.lastSync = undefined;
    this.syncing = false;
    // 'incremental' once /changes worked; 'snapshot' when we fell back to the
    // all-version full-list endpoints (site still on personal-workspace <0.6.146).
    this.pullMode = undefined;
  }

  get haloOrigin() {
    const origin = this.config.haloOrigin;
    return typeof origin === 'string' && /^https?:\/\//i.test(origin)
      ? origin.replace(/\/+$/, '')
      : undefined;
  }

  get boundOrigin() {
    return this.boundClient?.origin;
  }

  _credentials() {
    // Soft-probe: a Headless profile may mount no credentials service at all.
    return this.ctx?.get?.('credentials') ?? this.ctx?.credentials;
  }

  async client() {
    // Origin lives with the PAT in one credential record: binding is a single
    // atomic operation and never needs to rewrite cordis.patch.yml or config.
    const record = await this._credentials()?.readRecord?.(TOKEN_KEY);
    const payload = record?.kind === 'grant' ? record.payload
      : record?.kind === 'api-key' ? { token: record.key } : undefined;
    const origin = (typeof payload?.origin === 'string' && /^https?:\/\//i.test(payload.origin)
      ? payload.origin
      : this.haloOrigin)?.replace(/\/+$/, '');
    const token = payload?.token;
    if (!origin)
      throw new Error('未配置 Halo 站点地址：请先用 bridge_bind 工具绑定站点');
    if (!token)
      throw new Error('未配置 Halo 访问令牌：请先用 bridge_bind 工具绑定 PAT');
    return new HaloClient({ origin, token });
  }

  // ---------------------------------------------------------------- reads
  list(kind, { includeTombstones = false } = {}) {
    assertKind(kind);
    return listRows(this.db, kind, { includeTombstones }).map((row) => ({
      name: row.name,
      dirty: Boolean(row.dirty),
      tombstone: Boolean(row.tombstone),
      rev: row.rev,
      updatedAt: row.updated_at,
      ...parsePayload(row),
    }));
  }

  get(kind, name) {
    assertKind(kind);
    const row = getRow(this.db, kind, name);
    if (!row)
      return undefined;
    return {
      name: row.name, dirty: Boolean(row.dirty), rev: row.rev,
      updatedAt: row.updated_at, ...parsePayload(row),
    };
  }

  // ---------------------------------------------------------------- writes
  create(kind, payload) {
    assertKind(kind);
    const name = insertLocal(this.db, kind, toUpsert(kind, payload));
    return { name, dirty: true, ...parsePayload(getRow(this.db, kind, name)) };
  }

  update(kind, name, patch) {
    assertKind(kind);
    const current = this.get(kind, name);
    if (!current)
      throw new Error(`${kind} ${name} 不在本地镜像中`);
    const merged = { ...current, ...(patch ?? {}) };
    delete merged.name; delete merged.dirty; delete merged.rev; delete merged.updatedAt; delete merged.tombstone;
    putLocal(this.db, kind, name, toUpsert(kind, merged));
    return this.get(kind, name);
  }

  remove(kind, name) {
    assertKind(kind);
    if (!getRow(this.db, kind, name))
      throw new Error(`${kind} ${name} 不在本地镜像中`);
    deleteLocal(this.db, kind, name);
    return { name, deleted: true, pending: true };
  }

  // ---------------------------------------------------------------- binding
  /** Store site origin and PAT together in one credential record. */
  async bind(origin, token) {
    const parsed = this.setOrigin(origin);
    if (typeof token !== 'string' || token.trim() === '')
      throw new Error('token 不能为空');
    const credentials = this._credentials();
    if (!credentials?.modifyRecord)
      throw new Error('当前 DSH 宿主未提供凭据服务，无法安全保存 PAT');
    await credentials.modifyRecord(TOKEN_KEY, async () => ({
      kind: 'grant',
      payload: { token: token.trim(), origin: parsed.origin },
    }));
    // Refresh the in-memory client so the service is immediately usable.
    this.boundClient = await this.client();
    return { ok: true, origin: parsed.origin, stored: true };
  }

  async storeToken(token) {
    return this.bind(this._credentials()?.readRecord ? (await this._credentials().readRecord(TOKEN_KEY))?.payload?.origin ?? this.config.haloOrigin ?? '' : this.config.haloOrigin ?? '', token);
  }

  async clearToken() {
    await this._credentials()?.deleteRecord?.(TOKEN_KEY);
    this.boundClient = undefined;
    return { cleared: true };
  }

  async tokenInfo() {
    return (await this._credentials()?.describeRecord?.(TOKEN_KEY)) ?? { configured: false };
  }

  setOrigin(origin) {
    if (typeof origin !== 'string' || !/^https?:\/\//i.test(origin))
      throw new Error('Halo 站点地址必须是 http(s) 绝对地址');
    return { origin: origin.replace(/\/+$/, '') };
  }

  // ---------------------------------------------------------------- sync
  /** Pull remote changes since the cursor, then push local dirty rows. */
  async sync({ limit = 200 } = {}) {
    if (this.syncing)
      return { skipped: true, reason: 'sync already running' };
    this.syncing = true;
    this._conflicts = [];
    this._errors = [];
    try {
      const client = await this.client();
      const result = { pulled: 0, pushed: 0, conflicts: [], cursor: getCursor(this.db), errors: [] };
      try {
        if (this._isColdStart()) {
          // First sync with an empty mirror: bootstrap from the full lists.
          // /changes only logs writes made after the plugin was upgraded, so
          // historical records produce no feed entries even when the endpoint
          // is healthy — an incremental-only pull would leave the mirror empty
          // forever (observed on a freshly upgraded site: /changes 200 but 0
          // changes while the full lists hold 41 records).
          //
          // Probe the feed once to choose the mode: a healthy feed means a
          // normal bootstrap; a 403/404 means an old site, so we also surface
          // the "upgrade personal-workspace" hint (same as the snapshot path).
          let feedHealthy = false;
          try {
            const feed = await client.changes(0, 1);
            feedHealthy = true;
            const fc = Number(feed?.cursor);
            if (Number.isFinite(fc)) setCursor(this.db, fc);
          } catch (error) {
            if (!this._isChangesUnavailable(error)) throw error;
          }
          this.pullMode = feedHealthy ? 'bootstrap' : 'snapshot';
          result.pulled = await this.pullSnapshot(client);
          if (!feedHealthy) {
            this._errors.push({
              kind: 'sync',
              name: 'changes',
              message: '站点尚未启用 /changes 增量端点（需 personal-workspace ≥0.6.146），本次以全量快照同步；请在 Halo 升级插件以启用增量同步。',
            });
          }
        } else {
          result.pulled = await this.pull(client, limit);
          this.pullMode = 'incremental';
        }
      } catch (error) {
        // A 403/404 on /changes means the deployed personal-workspace predates
        // the endpoint (or its RBAC was not refreshed). Fall back to the
        // all-version full lists so the bridge keeps working; report the mode.
        if (!this._isChangesUnavailable(error)) throw error;
        this.pullMode = 'snapshot';
        result.pulled = await this.pullSnapshot(client);
        this._errors.push({
          kind: 'sync',
          name: 'changes',
          message: '站点尚未启用 /changes 增量端点（需 personal-workspace ≥0.6.146），本次以全量快照同步；请在 Halo 升级插件以启用增量同步。',
        });
      }
      result.pushed = await this.push(client);
      result.conflicts = this._conflicts ?? [];
      result.errors = this._errors ?? [];
      result.cursor = getCursor(this.db);
      result.pullMode = this.pullMode;
      this.lastSync = { at: new Date().toISOString(), ...result };
      return this.lastSync;
    } finally {
      this.syncing = false;
    }
  }

  async pull(client, limit) {
    let since = getCursor(this.db);
    let pulledTotal = 0;
    let maxSeq = since;
    for (let page = 0; page < 20; page += 1) {
      const feed = await client.changes(since, limit);
      const changes = Array.isArray(feed?.changes) ? feed.changes : [];
      if (changes.length === 0)
        break;
      for (const change of changes) {
        const seq = Number(change.seq);
        if (!Number.isFinite(seq) || seq <= since)
          continue;
        const { kind, name } = change;
        if (!KINDS.includes(kind) || typeof name !== 'string' || name === '')
          continue;
        const local = this.db.prepare('SELECT dirty FROM mirror WHERE kind = ? AND name = ?;').get(kind, name);
        if (local?.dirty) {
          this.lastConflict(kind, name, seq);
          continue;
        }
        applyRemoteChange(this.db, {
          kind, name,
          deleted: Boolean(change.deleted),
          updatedAt: change.updatedAt ?? undefined,
          payload: change.payload ?? undefined,
          rev: seq,
        });
        maxSeq = Math.max(maxSeq, seq);
        pulledTotal += 1;
      }
      const hasMore = Boolean(feed?.hasMore);
      if (!hasMore) {
        // Advance to the feed cursor when we consumed everything returned.
        const fc = Number(feed?.cursor);
        if (Number.isFinite(fc) && fc > maxSeq)
          maxSeq = fc;
        break;
      }
      since = Number(changes[changes.length - 1]?.seq) || since;
      if (since >= maxSeq)
        break;
    }
    if (maxSeq > getCursor(this.db))
      setCursor(this.db, maxSeq);
    return pulledTotal;
  }

  /** True when /changes is missing (403 insufficient_scope on old sites). */
  _isChangesUnavailable(error) {
    const msg = error instanceof Error ? error.message : String(error);
    return /\/changes\b/.test(msg) && /\b(403|404)\b/.test(msg);
  }

  /**
   * Fallback for sites whose personal-workspace predates /changes: read the
   * full lists (available in every version) and reconcile the mirror.
   * Local dirty rows are never overwritten (same keepLocal rule as pull()).
   */
  async pullSnapshot(client) {
    let pulled = 0;
    const lists = {
      todo: async () => {
        const out = [];
        for (let page = 1; page <= 20; page += 1) {
          const res = await client.listTodos({ page, size: 500 });
          const items = Array.isArray(res?.items) ? res.items : [];
          out.push(...items);
          if (items.length < 500 || !res || res.page * res.size >= res.total)
            break;
        }
        return out;
      },
      project: () => client.listProjects(),
      note: () => client.listNotes(),
    };
    for (const kind of KINDS) {
      const raw = await lists[kind]();
      const items = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : []);
      const seen = new Set();
      for (const item of items) {
        if (!item || typeof item.name !== 'string' || item.name === '')
          continue;
        seen.add(item.name);
        const local = this.db.prepare('SELECT dirty FROM mirror WHERE kind = ? AND name = ?;').get(kind, item.name);
        if (local?.dirty) {
          this.lastConflict(kind, item.name, 0);
          continue;
        }
        applyRemoteChange(this.db, {
          kind, name: item.name, deleted: false,
          updatedAt: item.updatedAt ?? undefined, payload: item, rev: 0,
        });
        pulled += 1;
      }
      // Drop clean local rows that no longer exist remotely (remote deletes).
      for (const row of listRows(this.db, kind, { includeTombstones: true })) {
        if (row.dirty || row.tombstone || seen.has(row.name))
          continue;
        pruneRow(this.db, kind, row.name);
      }
    }
    return pulled;
  }

  lastConflict(kind, name, seq) {
    if (!this._conflicts)
      this._conflicts = [];
    this._conflicts.push({ kind, name, remoteSeq: seq, resolution: 'keepLocal' });
  }

  async push(client) {
    let pushed = 0;
    for (const row of listDirty(this.db)) {
      const { kind, name } = row;
      try {
        if (row.tombstone) {
          if (name.startsWith('local-')) {
            markPushed(this.db, kind, name, { deleted: true });
            pushed += 1;
            continue;
          }
          const del = kind === 'todo' ? client.deleteTodo(name)
            : kind === 'project' ? client.deleteProject(name)
            : client.deleteNote(name);
          await del;
          markPushed(this.db, kind, name, { deleted: true });
          pushed += 1;
          continue;
        }
        const payload = parsePayload(row);
        let created;
        if (name.startsWith('local-')) {
          created = kind === 'todo' ? await client.createTodo(payload)
            : kind === 'project' ? await client.createProject(payload)
            : await client.createNote(payload);
        } else {
          created = kind === 'todo' ? await client.updateTodo(name, payload)
            : kind === 'project' ? await client.updateProject(name, payload)
            : await client.updateNote(name, payload);
        }
        markPushed(this.db, kind, name, { newName: created?.name });
        pushed += 1;
      } catch (error) {
        this._pushError(kind, name, error);
      }
    }
    return pushed;
  }

  _pushError(kind, name, error) {
    if (!this._errors)
      this._errors = [];
    this._errors.push({ kind, name, message: error instanceof Error ? error.message : String(error) });
  }

  /** Counters and connectivity snapshot for the UI / agent. */
  status() {
    const counts = {};
    for (const kind of KINDS) {
      const rows = listRows(this.db, kind, { includeTombstones: true });
      counts[kind] = {
        total: rows.length,
        dirty: rows.filter((r) => r.dirty).length,
        tombstones: rows.filter((r) => r.tombstone).length,
      };
    }
    // Mirror what client() actually uses: a bound record overrides config.
    const configured = (() => {
      const c = this.config.haloOrigin;
      return typeof c === 'string' && /^https?:\/\//i.test(c) ? c.replace(/\/+$/, '') : null;
    })();
    return {
      origin: this.boundOrigin ?? configured,
      cursor: getCursor(this.db),
      pullMode: this.pullMode,
      lastSync: this.lastSync,
      counts,
      pendingConflicts: this._conflicts ?? [],
      pendingErrors: this._errors ?? [],
    };
  }

  /**
   * Cold start = mirror has no records yet. On a freshly upgraded Halo site the
   * /changes log is empty even though the full lists hold historical records,
   * so an incremental-only pull would leave the mirror empty forever. In that
   * state we must bootstrap from the full lists first.
   *
   * A mirror that already holds records but has no cursor is NOT a cold start:
   * those rows arrived via a snapshot fallback (old site) and must be kept.
   */
  _isColdStart() {
    if (getCursor(this.db) > 0)
      return false;
    const row = this.db.prepare('SELECT 1 FROM mirror LIMIT 1;').get();
    return !row;
  }
}
