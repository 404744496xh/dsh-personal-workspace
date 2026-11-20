/**
 * Host half of dsh-personal-workspace.
 *
 * Local SQLite is a mirror of the authoritative Halo personal-workspace data.
 * Agent tools and loopback HTTP routes both delegate to the same service, so
 * writes can never skip dirty-marking (dsh-doc "one operation, two callers").
 *
 * Hard-won conventions borrowed from @dely0/dsh-personal-workbench:
 * - if the mirror DB can't be opened (e.g. built by a newer version), register
 *   only a system-prompt warning and defer EVERYTHING else — never crash the
 *   host with a half-loaded plugin;
 * - resource disposers are registered inside ctx.effect and returned as
 *   cleanup so a hot reload leaves no dangling registrations.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openMirrorDb, SchemaTooNewError } from './lib/db.js';
import { WorkspaceBridgeService } from './lib/service.js';
import { allBridgeTools, BRIDGE_GUIDANCE } from './lib/tools.js';

export const name = 'dsh-personal-workspace';
// webServer / systemPrompt / tools are CORE services: without them declared,
// cordis' context Proxy throws `cannot get property "<name>" without inject`
// at the FIRST `ctx.systemPrompt.section(...)` in applyReady/applyDegraded,
// which aborts the whole apply and silently registers nothing. The reference
// @dely0/dsh-personal-workbench declares the same set. `credentials` is
// probed with ctx.get() inside the service (optional; never in inject, so a
// host without it cannot push this plugin into pending).
export const inject = ['webServer', 'systemPrompt', 'tools'];

const here = dirname(fileURLToPath(import.meta.url));

function packageVersion() {
  try {
    return JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(body));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        reject(new Error('请求体超过 2MB 限制'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Loopback-only trust fence, copied from @dely0/dsh-personal-workbench.
 * The PAT is read by the Host from credentials; these routes must never be
 * callable from a remote origin.
 */
function isLoopbackRequest(req) {
  const address = req.socket?.remoteAddress;
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1')
    return false;
  const host = req.headers?.host;
  if (typeof host !== 'string') return false;
  let url;
  try { url = new URL(`http://${host}`); } catch { return false; }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return false;
  if (req.headers?.['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers?.origin;
  if (origin === undefined) return true;
  try { return new URL(origin).host === url.host; } catch { return false; }
}

/** Wrap a handler with the loopback fence and an optional method check. */
function guard(method, handler) {
  return (req, res) => {
    if (!isLoopbackRequest(req))
      return json(res, 403, { ok: false, error: 'forbidden: loopback-only' });
    if ((req.method ?? 'GET') !== method)
      return json(res, 405, { ok: false, error: 'method not allowed' });
    return handler(req, res);
  };
}

/** All bridge routes are loopback-only; the PAT never crosses a browser origin. */
function makeRoutes(service) {
  const routes = [
    {
      kind: 'exact',
      path: '/api/bridge/health',
      handler: guard('GET', (_req, res) => json(res, 200, { ok: true, service: name, version: packageVersion() })),
    },
    {
      kind: 'exact',
      path: '/api/bridge/status',
      handler: guard('GET', async (_req, res) => {
        try { json(res, 200, await service.status()); }
        catch (error) { json(res, 500, { ok: false, error: error.message }); }
      }),
    },
    {
      kind: 'exact',
      path: '/api/bridge/sync',
      handler: guard('POST', async (req, res) => {
        try {
          const body = await parseJsonBody(req);
          const limit = Math.min(500, Math.max(1, Number(body.limit) || 200));
          json(res, 200, await service.sync({ limit }));
        } catch (error) { json(res, 400, { ok: false, error: error.message }); }
      }),
    },
    {
      kind: 'exact',
      path: '/api/bridge/bind',
      handler: guard('POST', async (req, res) => {
        try {
          const body = await parseJsonBody(req);
          if (!body.origin) throw new Error('origin 必填');
          // Empty token means "keep the already-persisted PAT, only update URL".
          const bound = (typeof body.token === 'string' && body.token.trim())
            ? await service.bind(body.origin, body.token)
            : await service.bindOrigin(body.origin);
          json(res, 200, { ok: true, ...bound, ...(await service.tokenInfo()) });
        } catch (error) { json(res, 400, { ok: false, error: error.message }); }
      }),
    },
    {
      kind: 'exact',
      path: '/api/bridge/list',
      handler: guard('GET', async (req, res) => {
        try {
          const url = new URL(req.url, 'http://localhost');
          const kind = url.searchParams.get('kind');
          if (!['todo', 'project', 'note'].includes(kind)) throw new Error('kind 必须是 todo/project/note');
          json(res, 200, { ok: true, items: await service.list(kind) });
        } catch (error) { json(res, 400, { ok: false, error: error.message }); }
      }),
    },
  ];
  return routes;
}

function applyDegraded(ctx, reason) {
  const hint = reason instanceof SchemaTooNewError
    ? '本地镜像库由更新版本的桥接插件创建，请升级插件后再用；为避免损坏数据，桥接功能暂时停用。'
    : `本地镜像库无法打开：${reason instanceof Error ? reason.message : String(reason)}`;
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'plugin:dsh-personal-workspace:degraded',
    order: 150,
    text: `## 个人工作台（不可用）\n${hint} 请先修复本地镜像库再使用 bridge_* 工具。`,
    interpolate: false,
  }), 'bridge: degraded notice');
}

function applyReady(ctx, config, db) {
  // The service builds HaloClient lazily from the credential record (site
  // origin + PAT stored by bridge_bind). Never construct one here with an
  // empty config origin: HaloClient rejects a non-absolute URL, which would
  // throw into applyDegraded and silently register no tools/routes at all.
  const service = new WorkspaceBridgeService({ db, ctx, config });

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'plugin:dsh-personal-workspace',
    order: 150,
    text: BRIDGE_GUIDANCE,
    interpolate: false,
  }), 'bridge: system prompt');

  const tools = allBridgeTools(service);
  ctx.effect(() => {
    const disposers = tools.map((tool) => ctx.tools.register(tool));
    return () => disposers.forEach((dispose) => dispose?.());
  }, 'bridge: tools');

  ctx.effect(() => {
    const disposers = makeRoutes(service).map((route) => ctx.webServer.register(route));
    return () => disposers.forEach((dispose) => dispose?.());
  }, 'bridge: routes');

  ctx.effect(() => () => { db.close(); }, 'bridge: db close');
}

export function apply(ctx, config = {}) {
  try {
    const db = openMirrorDb(config.dbPath);
    applyReady(ctx, config, db);
  } catch (error) {
    applyDegraded(ctx, error);
  }
}
