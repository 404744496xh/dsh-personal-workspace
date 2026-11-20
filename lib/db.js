/**
 * SQLite mirror for dsh-personal-workspace.
 *
 * Halo personal-workspace is the authoritative source. This database is a local
 * mirror that the agent reads/writes through Host service methods; every local
 * write marks the row dirty so the sync engine can push it back. Deletions are
 * soft (tombstone) until pushed; tombstones are pruned after a successful push.
 *
 * Uses Node's built-in node:sqlite DatabaseSync (Node >=22.5). No native deps.
 */
import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

export const SCHEMA_VERSION = 1;

const KINDS = ['todo', 'project', 'note'];

export class SchemaTooNewError extends Error {
  constructor(dbVersion, supportedVersion) {
    super(`mirror schema ${dbVersion} is newer than supported ${supportedVersion}`);
    this.dbVersion = dbVersion;
    this.supportedVersion = supportedVersion;
  }
}

export function defaultDbPath() {
  return join(homedir(), '.dsh', 'workspace-bridge', 'mirror.db');
}

export function openMirrorDb(config = {}) {
  const path = typeof config.dbPath === 'string' && config.dbPath.trim() !== ''
    ? config.dbPath
    : defaultDbPath();
  mkdirSync(join(path, '..'), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

function userVersion(db) {
  const row = db.prepare('PRAGMA user_version;').get();
  return Number(row?.user_version ?? 0);
}

function migrate(db) {
  const current = userVersion(db);
  if (current > SCHEMA_VERSION)
    throw new SchemaTooNewError(current, SCHEMA_VERSION);
  if (current === SCHEMA_VERSION)
    return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS mirror (
      kind        TEXT NOT NULL,
      name        TEXT NOT NULL,
      payload     TEXT NOT NULL,
      updated_at  TEXT,
      rev         INTEGER NOT NULL DEFAULT 0,
      dirty       INTEGER NOT NULL DEFAULT 0,
      tombstone   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (kind, name)
    );
    CREATE INDEX IF NOT EXISTS idx_mirror_dirty ON mirror(dirty, tombstone);
    CREATE INDEX IF NOT EXISTS idx_mirror_kind ON mirror(kind);

    CREATE TABLE IF NOT EXISTS sync_state (
      key         TEXT PRIMARY KEY,
      value       TEXT
    );
  `);
  // SQLite does not accept bound parameters in PRAGMA statements; inline the
  // validated integer constant.
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
}

/** cursor = last Halo seq successfully pulled. */
export function getCursor(db) {
  const row = db.prepare("SELECT value FROM sync_state WHERE key = 'cursor';").get();
  if (!row || row.value == null || row.value === '')
    return 0;
  const n = Number(row.value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function setCursor(db, value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0)
    throw new Error(`invalid cursor: ${value}`);
  db.prepare("INSERT INTO sync_state(key, value) VALUES('cursor', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;").run(String(n));
}

function assertKind(kind) {
  if (!KINDS.includes(kind))
    throw new Error(`unknown kind: ${kind}`);
}

/** Upsert a row from a remote /changes payload and advance its rev. */
export function applyRemoteChange(db, { kind, name, deleted, updatedAt, payload, rev }) {
  assertKind(kind);
  if (typeof name !== 'string' || name === '')
    throw new Error('name is required');
  if (deleted) {
    db.prepare(`
      INSERT INTO mirror(kind, name, payload, updated_at, rev, dirty, tombstone)
      VALUES(?, ?, '{}', ?, ?, 0, 1)
      ON CONFLICT(kind, name) DO UPDATE SET
        updated_at = excluded.updated_at,
        rev = excluded.rev,
        dirty = 0,
        tombstone = 1
    `).run(kind, name, updatedAt ?? null, rev ?? 0);
    return;
  }
  const payloadJson = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
  db.prepare(`
    INSERT INTO mirror(kind, name, payload, updated_at, rev, dirty, tombstone)
    VALUES(?, ?, ?, ?, ?, 0, 0)
    ON CONFLICT(kind, name) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at,
      rev = excluded.rev,
      dirty = 0,
      tombstone = 0
  `).run(kind, name, payloadJson, updatedAt ?? null, rev ?? 0);
}

/** Look up one mirror row (excluding tombstone unless asked). */
export function getRow(db, kind, name) {
  assertKind(kind);
  const row = db.prepare('SELECT * FROM mirror WHERE kind = ? AND name = ?;').get(kind, name);
  if (!row || (row.tombstone && !row.dirty))
    return undefined;
  return row;
}

/** List rows of a kind; by default hides both remote and pushed tombstones. */
export function listRows(db, kind, { includeTombstones = false } = {}) {
  assertKind(kind);
  const sql = includeTombstones
    ? 'SELECT * FROM mirror WHERE kind = ? ORDER BY name;'
    : 'SELECT * FROM mirror WHERE kind = ? AND tombstone = 0 ORDER BY name;';
  return db.prepare(sql).all(kind);
}

/** Insert or update a row locally; marks dirty so the sync engine pushes it. */
export function putLocal(db, kind, name, payload) {
  assertKind(kind);
  if (typeof name !== 'string' || name === '')
    throw new Error('name is required for update; use insertLocal for new items');
  const existing = db.prepare('SELECT rev FROM mirror WHERE kind = ? AND name = ?;').get(kind, name);
  const rev = existing?.rev ?? 0;
  const payloadJson = JSON.stringify(payload ?? {});
  const updatedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO mirror(kind, name, payload, updated_at, rev, dirty, tombstone)
    VALUES(?, ?, ?, ?, ?, 1, 0)
    ON CONFLICT(kind, name) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at,
      dirty = 1,
      tombstone = 0
  `).run(kind, name, payloadJson, updatedAt, rev);
}

/** Soft-delete locally; the sync engine issues DELETE then prunes the row. */
export function deleteLocal(db, kind, name) {
  assertKind(kind);
  const updatedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO mirror(kind, name, payload, updated_at, rev, dirty, tombstone)
    VALUES(?, ?, '{}', ?, 0, 1, 1)
    ON CONFLICT(kind, name) DO UPDATE SET
      dirty = 1,
      tombstone = 1,
      updated_at = excluded.updated_at
  `).run(kind, name, updatedAt);
}

/** Locally-created row with a generated placeholder name; pushed to Halo on sync. */
export function insertLocal(db, kind, payload) {
  assertKind(kind);
  const name = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  putLocal(db, kind, name, payload);
  return name;
}

/** Rows that need pushing (dirty, includes local tombstones). */
export function listDirty(db) {
  return db.prepare('SELECT * FROM mirror WHERE dirty = 1 ORDER BY kind, name;').all();
}

/** After a successful push, clear dirty. For deletes, prune the tombstone row. */
export function markPushed(db, kind, name, { deleted = false, newName } = {}) {
  assertKind(kind);
  if (deleted) {
    db.prepare('DELETE FROM mirror WHERE kind = ? AND name = ?;').run(kind, name);
    return;
  }
  if (newName && newName !== name) {
    const row = db.prepare('SELECT * FROM mirror WHERE kind = ? AND name = ?;').get(kind, name);
    if (row) {
      db.prepare('DELETE FROM mirror WHERE kind = ? AND name = ?;').run(kind, name);
      db.prepare(`
        INSERT INTO mirror(kind, name, payload, updated_at, rev, dirty, tombstone)
        VALUES(?, ?, ?, ?, ?, 0, 0)
      `).run(kind, newName, row.payload, row.updated_at, row.rev);
    }
    return;
  }
  db.prepare('UPDATE mirror SET dirty = 0 WHERE kind = ? AND name = ?;').run(kind, name);
}

/** Hard-delete a clean mirrored row (used when a remote tombstone is pulled). */
export function pruneRow(db, kind, name) {
  assertKind(kind);
  db.prepare('DELETE FROM mirror WHERE kind = ? AND name = ?;').run(kind, name);
}

export function parsePayload(row) {
  if (!row)
    return undefined;
  try {
    return JSON.parse(row.payload);
  } catch {
    return {};
  }
}
