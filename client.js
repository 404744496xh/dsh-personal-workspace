/**
 * Client half of dsh-personal-workspace — a polished status / bind / sync panel.
 *
 * Conventions (dsh-doc ui-plugin.md): the factory is side-effect free, the
 * component registers through ctx.slots, all visible copy comes from the
 * locale service, and every action calls the Host's loopback routes (the same
 * service the agent tools use). No iframe, no document.body appendChild.
 *
 * IMPORTANT: tr / wireLocale / ACTIVE_LANG must stay at module scope. apply()
 * calls tr() for the sidebar label; if they live inside panel() the client
 * registration throws `ReferenceError: wireLocale is not defined` (history).
 */
(function () {
  const NS = 'dsh-personal-workspace';
  const L = {
    zh: {
      title: '个人工作台',
      subtitle: '与 Halo 个人工作台双向同步',
      connected: '已连接',
      disconnected: '未绑定',
      connection: '连接设置',
      connectionHint: '绑定站点地址与访问令牌（PAT），令牌只保存在本机凭据库。',
      origin: '站点地址',
      originPlaceholder: 'https://www.xiahan.asia',
      token: '访问令牌（PAT）',
      tokenPlaceholder: '粘贴 Halo 个人访问令牌',
      tokenKeepHint: '留空则沿用已保存的令牌',
      bind: '绑定站点',
      binding: '绑定中…',
      sync: '立即同步',
      syncing: '同步中…',
      refresh: '刷新',
      mirror: '本地镜像',
      mirrorHint: '读取走本地镜像，写入先落镜像，再由同步推送到 Halo。',
      todo: '待办',
      project: '项目',
      note: '笔记',
      dirty: '待推送 {n}',
      tombstone: '待删除 {n}',
      cursor: '同步游标',
      lastSync: '上次同步',
      never: '尚未同步',
      empty: '暂无数据，点「立即同步」拉取。',
      snapshot: '当前站点使用全量快照同步',
      snapshotHint: 'Halo 插件需升级到 0.6.146 才能启用增量端点（/changes）。升级后将自动切换为增量同步。',
      conflicts: '{n} 条冲突已保留本地版本',
      errors: '{n} 条错误，请查看下方详情',
      errDetail: '错误详情',
      bindOk: '站点绑定成功。',
      syncOk: '同步完成：拉取 {pulled} 条，推送 {pushed} 条。',
      needBind: '请先在上方绑定站点地址与令牌。',
      inputRequired: '请填写站点地址与令牌。',
    },
    en: {
      title: 'Personal Workspace',
      subtitle: 'Two-way sync with Halo personal-workspace',
      connected: 'Connected',
      disconnected: 'Not bound',
      connection: 'Connection',
      connectionHint: 'Bind the site URL and access token (PAT). The token is stored only in the local credential store.',
      origin: 'Site URL',
      originPlaceholder: 'https://www.xiahan.asia',
      token: 'Access token (PAT)',
      tokenPlaceholder: 'Paste your Halo personal access token',
      tokenKeepHint: 'Leave blank to keep the saved token',
      bind: 'Bind site',
      binding: 'Binding…',
      sync: 'Sync now',
      syncing: 'Syncing…',
      refresh: 'Refresh',
      mirror: 'Local mirror',
      mirrorHint: 'Reads come from the local mirror; writes land there first and are pushed to Halo on sync.',
      todo: 'Todos',
      project: 'Projects',
      note: 'Notes',
      dirty: '{n} pending',
      tombstone: '{n} to delete',
      cursor: 'Cursor',
      lastSync: 'Last sync',
      never: 'Never synced',
      empty: 'No data yet — hit "Sync now" to pull.',
      snapshot: 'Using full-snapshot sync for this site',
      snapshotHint: 'Upgrade the Halo plugin to 0.6.146 to enable the incremental /changes endpoint. The bridge will switch automatically.',
      conflicts: '{n} conflict(s), kept the local version',
      errors: '{n} error(s) — see details below',
      errDetail: 'Error details',
      bindOk: 'Site bound successfully.',
      syncOk: 'Sync done: pulled {pulled}, pushed {pushed}.',
      needBind: 'Bind the site URL and token above first.',
      inputRequired: 'Enter both the site URL and token.',
    },
  };
  for (const key of Object.keys(L.zh)) if (!(key in L.en)) L.en[key] = L.zh[key];

  // Module-scope translator + locale wiring (see header note — do not move).
  let ACTIVE_LANG = (typeof navigator !== 'undefined' && /^zh\b/i.test(navigator.language || '')) ? 'zh' : 'en';
  let tr = (key, vars) => {
    let text = (L[ACTIVE_LANG] ?? L.en)[key] ?? L.zh[key] ?? key;
    if (vars) text = String(text).replace(/\{(\w+)\}/g, (m, p) => (p in vars ? String(vars[p]) : m));
    return text;
  };

  function wireLocale(ctx) {
    try {
      const locale = ctx?.get?.('locale');
      if (!locale || typeof locale.register !== 'function') return;
      const dispose = locale.register(NS, { zh: L.zh, en: L.en });
      const bound = locale.bind(NS);
      tr = (key, vars) => {
        let text = bound(key, vars);
        if (text === key) {
          text = (L[ACTIVE_LANG] ?? L.en)[key] ?? L.zh[key] ?? key;
          if (vars) text = String(text).replace(/\{(\w+)\}/g, (m, p) => (p in vars ? String(vars[p]) : m));
        }
        return text;
      };
      ctx.effect?.(() => dispose, 'bridge.locale');
    } catch { /* keep local dictionary fallback */ }
  }

  // Sidebar launcher icon (inline SVG so we don't depend on the host's
  // private icon package). Clicking a sidebar.panellist entry selects the
  // `main` keyed panel whose key equals this entry's id (host-owned wiring).
  function SidebarIcon(React) {
    const h = React.createElement;
    return function BridgeLauncherIcon({ size }) {
      const s = typeof size === 'number' ? size : 18;
      return h('svg', {
        width: s, height: s, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round',
        strokeLinejoin: 'round', 'aria-hidden': 'true',
      },
        h('path', { d: 'M3 9.5 12 3l9 6.5' }),
        h('path', { d: 'M5 10v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9' }),
        h('path', { d: 'M9.5 21v-6.5h5V21' }),
        h('circle', { cx: 12, cy: 9, r: 1.15, fill: 'currentColor', stroke: 'none' }),
      );
    };
  }

  // Self-contained stylesheet, scoped under .wsb-panel. Values fall back to
  // neutral colors when a host token is absent, so the panel stays legible in
  // both light and dark profiles. Uses the host's --dsw-alias-* tokens when
  // available so it inherits the active theme.
  const STYLE = `
.wsb-panel{--wsb-surface:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));--wsb-surface-2:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.10));--wsb-surface-3:var(--dsw-alias-bg-layer-3,rgba(128,128,128,.15));--wsb-line:var(--dsw-alias-border-l2,rgba(128,128,128,.22));--wsb-text:var(--dsw-alias-label-primary,#e6e8eb);--wsb-dim:var(--dsw-alias-label-tertiary,#969ca6);--wsb-brand:var(--dsw-alias-brand-primary,#5b8cff);--wsb-brand-fill:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#5b8cff));--wsb-ok:var(--dsw-alias-state-success-primary,#3fb950);--wsb-warn:var(--dsw-alias-state-warn-primary,#e8a33d);--wsb-err:var(--dsw-alias-state-error-primary,#f0616d);--wsb-r:var(--dsw-alias-radius-l,12px);--wsb-rs:var(--dsw-alias-radius-s,7px);box-sizing:border-box;max-width:560px;padding:22px 22px 26px;color:var(--wsb-text);font-size:13px;line-height:1.55}
.wsb-panel *{box-sizing:border-box}
.wsb-panel button,.wsb-panel input{font:inherit;color:inherit}
.wsb-head{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.wsb-mark{width:38px;height:38px;flex:0 0 auto;display:grid;place-items:center;border-radius:11px;background:linear-gradient(135deg,var(--wsb-brand),transparent 220%);border:1px solid var(--wsb-line);color:var(--wsb-brand)}
.wsb-head h2{margin:0;font-size:16px;font-weight:650;letter-spacing:.2px}
.wsb-head p{margin:2px 0 0;font-size:11.5px;color:var(--wsb-dim)}
.wsb-pill{margin-left:auto;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;border:1px solid var(--wsb-line);background:var(--wsb-surface-2);white-space:nowrap}
.wsb-pill i{width:7px;height:7px;border-radius:50%;background:var(--wsb-dim)}
.wsb-pill[data-on="1"] i{background:var(--wsb-ok);box-shadow:0 0 0 3px color-mix(in srgb,var(--wsb-ok) 22%,transparent)}
.wsb-card{background:var(--wsb-surface);border:1px solid var(--wsb-line);border-radius:var(--wsb-r);padding:16px;margin-bottom:16px}
.wsb-card-h{display:flex;align-items:baseline;gap:8px;margin-bottom:4px}
.wsb-card-h b{font-size:13.5px}
.wsb-card-h span{font-size:11px;color:var(--wsb-dim)}
.wsb-hint{margin:0 0 14px;font-size:11.5px;color:var(--wsb-dim)}
.wsb-field{display:block;margin-bottom:11px}
.wsb-field>span{display:block;font-size:11px;font-weight:600;color:var(--wsb-dim);margin-bottom:5px}
.wsb-sub{font-style:normal;font-weight:400;opacity:.75}
.wsb-input{width:100%;padding:9px 11px;border-radius:var(--wsb-rs);border:1px solid var(--wsb-line);background:var(--wsb-surface-2);outline:none;transition:border-color .15s,box-shadow .15s}
.wsb-input::placeholder{color:var(--wsb-dim);opacity:.7}
.wsb-input:focus{border-color:var(--wsb-brand);box-shadow:0 0 0 3px color-mix(in srgb,var(--wsb-brand) 18%,transparent)}
.wsb-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.wsb-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:8px 14px;min-height:34px;border-radius:var(--wsb-rs);border:1px solid var(--wsb-line);background:var(--wsb-surface-2);cursor:pointer;font-size:12px;font-weight:600;transition:background .15s,border-color .15s,transform .08s,opacity .15s}
.wsb-btn:hover:not(:disabled){background:var(--wsb-surface-3);border-color:var(--wsb-brand)}
.wsb-btn:active:not(:disabled){transform:translateY(1px)}
.wsb-btn:disabled{opacity:.45;cursor:not-allowed}
.wsb-btn[data-primary="1"]{background:var(--wsb-brand-fill);border-color:transparent;color:#fff}
.wsb-btn[data-primary="1"]:hover:not(:disabled){filter:brightness(1.08)}
.wsb-spin{width:12px;height:12px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:wsb-spin .7s linear infinite}
@keyframes wsb-spin{to{transform:rotate(360deg)}}
.wsb-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.wsb-stat{background:var(--wsb-surface);border:1px solid var(--wsb-line);border-radius:var(--wsb-r);padding:13px 14px;position:relative;overflow:hidden}
.wsb-stat:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:var(--wsb-accent,var(--wsb-brand));opacity:.85}
.wsb-stat .k{font-size:11px;color:var(--wsb-dim);font-weight:600}
.wsb-stat .v{font-size:25px;font-weight:700;line-height:1.2;margin:5px 0 2px;font-variant-numeric:tabular-nums}
.wsb-stat .chips{display:flex;gap:5px;flex-wrap:wrap;min-height:18px}
.wsb-chip{font-size:10px;font-weight:600;padding:1px 7px;border-radius:999px;border:1px solid var(--wsb-line);color:var(--wsb-dim)}
.wsb-chip[data-tone="dirty"]{color:var(--wsb-warn);border-color:color-mix(in srgb,var(--wsb-warn) 45%,transparent);background:color-mix(in srgb,var(--wsb-warn) 12%,transparent)}
.wsb-chip[data-tone="tomb"]{color:var(--wsb-err);border-color:color-mix(in srgb,var(--wsb-err) 45%,transparent);background:color-mix(in srgb,var(--wsb-err) 12%,transparent)}
.wsb-meta{display:flex;gap:18px;flex-wrap:wrap;margin-top:12px;font-size:11px;color:var(--wsb-dim)}
.wsb-meta b{color:var(--wsb-text);font-weight:600;font-variant-numeric:tabular-nums}
.wsb-empty{margin-top:12px;padding:14px;border:1px dashed var(--wsb-line);border-radius:var(--wsb-rs);text-align:center;font-size:11.5px;color:var(--wsb-dim)}
.wsb-note{display:flex;gap:9px;align-items:flex-start;margin-bottom:14px;padding:11px 13px;border-radius:var(--wsb-rs);font-size:11.5px;line-height:1.5;border:1px solid;background:transparent}
.wsb-note[data-tone="warn"]{color:var(--wsb-warn);border-color:color-mix(in srgb,var(--wsb-warn) 40%,transparent);background:color-mix(in srgb,var(--wsb-warn) 8%,transparent)}
.wsb-note[data-tone="err"]{color:var(--wsb-err);border-color:color-mix(in srgb,var(--wsb-err) 40%,transparent);background:color-mix(in srgb,var(--wsb-err) 8%,transparent)}
.wsb-note[data-tone="ok"]{color:var(--wsb-ok);border-color:color-mix(in srgb,var(--wsb-ok) 40%,transparent);background:color-mix(in srgb,var(--wsb-ok) 8%,transparent)}
.wsb-note b{font-weight:700}
.wsb-note .wsb-nbody{min-width:0}
.wsb-note .wsb-nbody span{display:block;color:var(--wsb-dim);margin-top:2px}
.wsb-errlist{margin:8px 0 0;padding-left:16px;font-size:10.5px;color:var(--wsb-dim);max-height:120px;overflow:auto}
.wsb-toast{position:sticky;bottom:0;margin-top:16px;padding:10px 13px;border-radius:var(--wsb-rs);font-size:11.5px;font-weight:600;border:1px solid var(--wsb-line);background:var(--wsb-surface-3);box-shadow:var(--dsw-elevation-panel,0 6px 20px rgba(0,0,0,.25))}
.wsb-toast[data-tone="err"]{color:var(--wsb-err)}
.wsb-toast[data-tone="ok"]{color:var(--wsb-ok)}
`;

  function panel(React) {
    const h = React.createElement;
    const { useState, useEffect, useCallback } = React;

    function fmtTime(t) {
      if (!t) return tr('never');
      try {
        const d = new Date(t);
        return Number.isNaN(d.getTime()) ? String(t) : d.toLocaleString();
      } catch { return String(t); }
    }

    function Icon({ d, size = 14 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round',
        strokeLinejoin: 'round', 'aria-hidden': 'true',
      }, h('path', { d }));
    }
    const ICONS = {
      link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7',
      sync: 'M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6',
      refresh: 'M20 11a8 8 0 1 0-2.3 6M20 4v7h-7',
      warn: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
      err: 'M12 8v5M12 17h.01M12 3 2 20h20L12 3z',
      ok: 'M20 6 9 17l-5-5',
    };

    function Note({ tone, title, detail, children }) {
      return h('div', { className: 'wsb-note', 'data-tone': tone },
        h(Icon, { d: tone === 'ok' ? ICONS.ok : tone === 'err' ? ICONS.err : ICONS.warn }),
        h('div', { className: 'wsb-nbody' },
          h('b', null, title),
          detail ? h('span', null, detail) : null,
          children,
        ),
      );
    }

    function Stat({ kind, data }) {
      const label = tr(kind);
      const accent = kind === 'todo' ? 'var(--wsb-brand)'
        : kind === 'project' ? 'var(--wsb-ok)' : 'var(--wsb-warn)';
      const total = data?.total ?? 0;
      const dirty = data?.dirty ?? 0;
      const tombs = data?.tombstones ?? 0;
      return h('div', { className: 'wsb-stat', style: { '--wsb-accent': accent } },
        h('div', { className: 'k' }, label),
        h('div', { className: 'v' }, String(total)),
        h('div', { className: 'chips' },
          dirty ? h('span', { className: 'wsb-chip', 'data-tone': 'dirty' }, tr('dirty', { n: dirty })) : null,
          tombs ? h('span', { className: 'wsb-chip', 'data-tone': 'tomb' }, tr('tombstone', { n: tombs })) : null,
        ),
      );
    }

    return function WorkspaceBridgePanel() {
      const [status, setStatus] = useState(null);
      const [origin, setOrigin] = useState('');
      const [token, setToken] = useState('');
      const [busy, setBusy] = useState(false);
      const [bindBusy, setBindBusy] = useState(false);
      const [toast, setToast] = useState(null);

      const refresh = useCallback(async () => {
        try {
          const res = await fetch('/api/bridge/status');
          const json = await res.json();
          setStatus(json);
          if (json?.origin && !origin) setOrigin(json.origin);
          return json;
        } catch (error) {
          setToast({ tone: 'err', text: error.message });
          return null;
        }
      }, [origin]);

      useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

      const bind = useCallback(async () => {
        // When already bound, an empty token means "keep the saved PAT and only
        // update the site URL". Otherwise both fields are required.
        const keepToken = Boolean(status?.bound) && !token.trim();
        if (!origin.trim() || (!token.trim() && !keepToken)) {
          setToast({ tone: 'err', text: tr('inputRequired') });
          return;
        }
        setBindBusy(true); setToast(null);
        try {
          const res = await fetch('/api/bridge/bind', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ origin: origin.trim(), token: token.trim() }),
          });
          const json = await res.json();
          if (!res.ok || json.ok === false) throw new Error(json.error ?? 'bind failed');
          setToken('');
          setToast({ tone: 'ok', text: tr('bindOk') });
          await refresh();
        } catch (error) { setToast({ tone: 'err', text: error.message }); }
        finally { setBindBusy(false); }
      }, [origin, token, status, refresh]);

      const sync = useCallback(async () => {
        if (!status?.bound) {
          setToast({ tone: 'err', text: tr('needBind') });
          return;
        }
        setBusy(true); setToast(null);
        try {
          const res = await fetch('/api/bridge/sync', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
          });
          const json = await res.json();
          if (json.ok === false || json.error) throw new Error(json.error ?? 'sync failed');
          setToast({ tone: 'ok', text: tr('syncOk', { pulled: json.pulled ?? 0, pushed: json.pushed ?? 0 }) });
          await refresh();
        } catch (error) { setToast({ tone: 'err', text: error.message }); }
        finally { setBusy(false); }
      }, [status, refresh]);

      const counts = status?.counts ?? {};
      const connected = Boolean(status?.bound);
      const anyData = ['todo', 'project', 'note'].some((k) => (counts[k]?.total ?? 0) > 0);
      const conflicts = status?.pendingConflicts ?? [];
      const errors = status?.pendingErrors ?? [];

      return h('div', { className: 'wsb-panel' },
        h('style', null, STYLE),

        // ---- header ----
        h('header', { className: 'wsb-head' },
          h('span', { className: 'wsb-mark' }, h(Icon, { d: ICONS.link, size: 19 })),
          h('div', null,
            h('h2', null, tr('title')),
            h('p', null, tr('subtitle')),
          ),
          h('span', { className: 'wsb-pill', 'data-on': connected ? '1' : '0' },
            h('i'), connected ? tr('connected') : tr('disconnected')),
        ),

        // ---- snapshot-mode notice (site < 0.6.146) ----
        status?.pullMode === 'snapshot'
          ? h(Note, { tone: 'warn', title: tr('snapshot'), detail: tr('snapshotHint') })
          : null,

        // ---- connection card ----
        h('section', { className: 'wsb-card' },
          h('div', { className: 'wsb-card-h' },
            h('b', null, tr('connection')),
            h('span', null, connected ? status.origin : ''),
          ),
          h('p', { className: 'wsb-hint' }, tr('connectionHint')),
          h('label', { className: 'wsb-field' },
            h('span', null, tr('origin')),
            h('input', {
              className: 'wsb-input', value: origin,
              onChange: (e) => setOrigin(e.target.value),
              placeholder: tr('originPlaceholder'), spellCheck: false,
            }),
          ),
          h('label', { className: 'wsb-field' },
            h('span', null, tr('token'), connected ? h('em', { className: 'wsb-sub' }, ' · ' + tr('tokenKeepHint')) : null),
            h('input', {
              className: 'wsb-input', type: 'password', value: token,
              onChange: (e) => setToken(e.target.value),
              placeholder: tr('tokenPlaceholder'), autoComplete: 'off', spellCheck: false,
            }),
          ),
          h('div', { className: 'wsb-actions' },
            h('button', {
              className: 'wsb-btn', 'data-primary': '1',
              disabled: bindBusy || busy || !origin.trim() || (!token.trim() && !connected), onClick: bind,
            }, bindBusy ? h('span', { className: 'wsb-spin' }) : h(Icon, { d: ICONS.link }),
              bindBusy ? tr('binding') : tr('bind')),
            h('button', {
              className: 'wsb-btn', disabled: busy || bindBusy || !connected, onClick: sync,
            }, busy ? h('span', { className: 'wsb-spin' }) : h(Icon, { d: ICONS.sync }),
              busy ? tr('syncing') : tr('sync')),
            h('button', {
              className: 'wsb-btn', disabled: busy || bindBusy, onClick: refresh,
              title: tr('refresh'),
            }, h(Icon, { d: ICONS.refresh, size: 13 }), tr('refresh')),
          ),
        ),

        // ---- mirror stats ----
        h('section', null,
          h('div', { className: 'wsb-card-h' },
            h('b', null, tr('mirror')),
          ),
          h('p', { className: 'wsb-hint' }, tr('mirrorHint')),
          anyData
            ? h('div', { className: 'wsb-grid' },
                h(Stat, { kind: 'todo', data: counts.todo }),
                h(Stat, { kind: 'project', data: counts.project }),
                h(Stat, { kind: 'note', data: counts.note }),
              )
            : h('div', { className: 'wsb-empty' }, tr('empty')),
          h('div', { className: 'wsb-meta' },
            h('span', null, tr('cursor'), ': ', h('b', null, String(status?.cursor ?? 0))),
            h('span', null, tr('lastSync'), ': ', h('b', null, fmtTime(status?.lastSync?.at))),
          ),
        ),

        // ---- conflicts / errors ----
        conflicts.length
          ? h('div', { style: { marginTop: 16 } },
              h(Note, { tone: 'warn', title: tr('conflicts', { n: conflicts.length }) }))
          : null,
        errors.length
          ? h('div', { style: { marginTop: 12 } },
              h(Note, { tone: 'err', title: tr('errors', { n: errors.length }) },
                h('ul', { className: 'wsb-errlist' },
                  errors.slice(0, 8).map((e, i) => h('li', { key: i },
                    `${e.kind ?? ''}/${e.name ?? ''}: ${e.message ?? ''}`))),
              ))
          : null,

        // ---- toast ----
        toast ? h('div', { className: 'wsb-toast', 'data-tone': toast.tone }, toast.text) : null,
      );
    };
  }

  const PANEL_ID = 'dsh-personal-workspace';

  window.__ModuleLoader__.load({
    id: '@local/dsh-personal-workspace',
    factory(require) {
      const React = require('react');
      const Panel = panel(React);
      const Icon = SidebarIcon(React);
      return {
        // 'slots' provides the sidebar/main panel registry; 'locale' feeds
        // the sidebar launcher label. Both are injected by the host.
        inject: ['slots', 'locale'],
        apply(ctx) {
          wireLocale(ctx);
          const disposers = [];
          const offIcon = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: 40, locale: NS, label: tr('title') },
            Icon,
          ));
          if (typeof offIcon === 'function') disposers.push(offIcon);
          const offPanel = ctx.slots.inject('main', () => ctx.slots.register(
            { name: 'main', key: PANEL_ID },
            Panel,
          ));
          if (typeof offPanel === 'function') disposers.push(offPanel);
          ctx.effect(() => () => { for (const off of disposers) off(); }, 'bridge.slots');
        },
      };
    },
  });
})();
