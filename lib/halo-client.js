/**
 * Halo personal-workspace REST client.
 *
 * Every call uses the site PAT from ctx.credentials; no credential is stored
 * in config, the mirror, or logs. The API base and site origin come from the
 * plugin config. Fetch is the global one in Node 22+.
 */
const API_BASE = '/apis/api.workspace.halo.run/v1alpha1';

export class HaloClient {
  constructor({ origin, token, fetchImpl = globalThis.fetch }) {
    if (typeof origin !== 'string' || !/^https?:\/\//i.test(origin))
      throw new Error('haloOrigin must be an absolute http(s) URL');
    this.origin = origin.replace(/\/+$/, '');
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  get headers() {
    return {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${this.token}`,
      accept: 'application/json',
    };
  }

  async _request(method, path, body) {
    const url = `${this.origin}${API_BASE}${path}`;
    const res = await this.fetchImpl(url, {
      method,
      headers: this.headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 204)
      return undefined;
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : undefined; }
    catch { json = undefined; }
    if (!res.ok) {
      const message = json?.error?.message || json?.message || String(res.status);
      throw new Error(`Halo ${method} ${path} failed (${res.status}): ${message}`);
    }
    return json;
  }

  /** GET /changes?since=&limit= — the authoritative incremental feed. */
  changes(since = 0, limit = 200) {
    const q = new URLSearchParams({ since: String(since), limit: String(limit) });
    return this._request('GET', `/changes?${q}`);
  }

  // Full-list endpoints exist in every personal-workspace version. They are
  // the fallback when /changes is not deployed yet (site < 0.6.146) or RBAC
  // has not been refreshed — see WorkspaceBridgeService.pullSnapshot().
  listTodos({ page = 1, size = 500 } = {}) {
    const q = new URLSearchParams({ page: String(page), size: String(size) });
    return this._request('GET', `/todos?${q}`);
  }

  listProjects() { return this._request('GET', '/projects'); }

  listNotes() { return this._request('GET', '/notes'); }

  getTodo(name) { return this._request('GET', `/todos/${encodeURIComponent(name)}`); }
  getProject(name) { return this._request('GET', `/projects/${encodeURIComponent(name)}`); }
  getNote(name) { return this._request('GET', `/notes/${encodeURIComponent(name)}`); }

  createTodo(body) { return this._request('POST', '/todos', body); }
  updateTodo(name, body) { return this._request('PUT', `/todos/${encodeURIComponent(name)}`, body); }
  deleteTodo(name) { return this._request('DELETE', `/todos/${encodeURIComponent(name)}?confirm=true`); }

  createProject(body) { return this._request('POST', '/projects', body); }
  updateProject(name, body) { return this._request('PUT', `/projects/${encodeURIComponent(name)}`, body); }
  deleteProject(name) { return this._request('DELETE', `/projects/${encodeURIComponent(name)}?confirm=true`); }

  createNote(body) { return this._request('POST', '/notes', body); }
  updateNote(name, body) { return this._request('PUT', `/notes/${encodeURIComponent(name)}`, body); }
  deleteNote(name) { return this._request('DELETE', `/notes/${encodeURIComponent(name)}?confirm=true`); }
}
