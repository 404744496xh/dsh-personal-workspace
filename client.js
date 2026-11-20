/**
 * Client half of dsh-personal-workspace — a real personal-workbench panel.
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

      // settings — connection
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
      needBind: '请先在设置中绑定站点地址与令牌。',
      inputRequired: '请填写站点地址与令牌。',
      bindOk: '站点绑定成功。',
      syncOk: '同步完成：拉取 {pulled} 条，推送 {pushed} 条。',

      // settings — auto sync
      autoSync: '自动同步',
      autoSyncHint: '开启后按间隔自动双向同步（拉取 Halo 变更 + 推送本地改动），配置会持久保存。',
      autoInterval: '同步间隔（秒）',
      autoOn: '已开启',
      autoOff: '已关闭',
      autoSaved: '自动同步设置已保存。',
      autoMinHint: '间隔最小 30 秒',

      // settings — mirror
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

      // navigation + view headers
      navToday: '今日',
      navTasks: '任务',
      navReports: '报告',
      navSettings: '设置',
      todayTitle: '今日工作台',
      todaySubtitle: '按截止日期组织待办与执行进度',
      tasksTitle: '全部任务',
      tasksSubtitle: '查看步骤、验收状态与执行会话',
      reportsTitle: '工作报告',
      reportsSubtitle: '生成日报 / 周报，可存为 Halo 笔记',
      settingsTitle: '设置',
      settingsSubtitle: '连接绑定、自动同步与本地镜像',

      // common states
      loading: '加载中…',
      loadError: '加载失败：{msg}',
      retry: '重试',
      emptyToday: '今天没有到期任务，稍后与将来任务见下方分组。',
      emptyTasks: '还没有任务，先同步一次，或在下方快速录入。',
      orCapture: '或者快速录入新任务',
      capturePlaceholder: '任务标题，例如：修复登录页样式',
      capturePriority: '优先级',
      captureDue: '截止日期',
      captureBtn: '快速录入',
      captureOk: '已录入（保存后随下次同步进入 Halo）',
      captureDupTip: '发现相似待办：',
      emptyGroup: '这个分组暂时是空的。',
      emptySteps: '还没有步骤，点「拆步骤」让 agent 规划。',
      noGoal: '未设置目标',
      noEvidence: '无证据',
      noSession: '未绑定会话',
      untitled: '未命名任务',
      badResponse: '响应格式错误。',
      requestFailed: '请求失败。',
      actionFail: '操作失败：{msg}',

      // today stats + groups
      statPending: '待处理',
      statDueToday: '今日到期',
      statOverdue: '逾期',
      statInReview: '待验收',
      groupOverdue: '逾期',
      groupToday: '今日',
      groupSoon: '稍后',
      groupSomeday: '将来 / Someday',

      // badges
      reviewDraft: '草稿',
      reviewPending: '待验收',
      reviewAccepted: '已验收',
      reviewRejected: '被打回',
      statusTodo: '待办',
      statusDoing: '执行中',
      statusDone: '已完成',
      somedayTag: '稍后',
      quotaMust: '必做',
      quotaShould: '应做',
      quotaCould: '可做',
      quotaNone: '无配额',
      priorityHigh: '高优先级',
      priorityMedium: '中优先级',
      priorityLow: '低优先级',
      progress: '进度 {done}/{total}',
      due: '截止 {date}',

      // tasks filters
      filterAll: '全部',
      filterReview: '验收状态',
      filterPriority: '优先级',
      allReviews: '全部状态',
      allPriorities: '全部优先级',
      searchPlaceholder: '搜索标题…',

      // task detail
      detailTitle: '任务详情',
      close: '收起',
      goal: '目标',
      steps: '步骤',
      evidence: '证据',
      session: '会话',
      stepNo: '第 {n} 步',
      stepDoing: '标记执行中',
      stepDone: '标记完成',
      evidencePlaceholder: '填写执行证据（可选）',
      btnPlan: '拆步骤',
      btnSubmit: '提交验收',
      btnAccept: '通过',
      btnReject: '打回',
      btnFlags: '稍后 / 配额',
      btnBindSession: '绑定会话',
      planGoal: '目标（可选）',
      planGoalPlaceholder: '一句话描述这个任务要达成的目标',
      planSteps: '步骤（每行一步）',
      planStepsPlaceholder: '步骤一\n步骤二',
      submitNote: '验收说明（可选）',
      submitNotePlaceholder: '给验收人的补充说明',
      reviewNote: '验收意见（可选）',
      reviewNotePlaceholder: '通过或打回的理由',
      somedayLabel: '稍后处理',
      quotaLabel: '配额',
      bindSession: '会话 ID',
      bindSessionPlaceholder: '粘贴执行会话 ID',
      sessionTail: '会话输出（tail）',
      flagsHint: '标记为稍后任务或调整配额后保存。',
      planHint: '每行一步，agent 会据此生成执行步骤。',
      rejectHint: '打回时请写下原因，便于重新执行。',
      pendingReviewTitle: '这个任务已提交验收',
      pendingReviewHint: '请人工确认通过或打回，验收通过后才算完成。',
      acceptedTitle: '已验收通过',
      rejectedTitle: '被打回，请查看原因',
      rejectedReason: '打回原因：{note}',
      needSteps: '请至少填写一个步骤。',
      needSession: '请填写会话 ID。',
      planOk: '步骤已生成。',
      stepOk: '步骤状态已更新。',
      submitOk: '已提交验收，等待人工确认。',
      reviewAcceptOk: '已通过验收。',
      reviewRejectOk: '已打回任务。',
      flagsOk: '标记已保存。',
      bindSessionOk: '会话已绑定。',

      // reports
      reportType: '报告类型',
      reportDaily: '日报',
      reportWeekly: '周报',
      reportFrom: '开始日期',
      reportTo: '结束日期',
      reportGenerate: '生成报告',
      reportGenerating: '生成中…',
      reportSaveToNote: '存为 Halo 笔记',
      reportPreview: '报告预览',
      reportEmpty: '点「生成报告」后在这里预览 Markdown。',
      reportOk: '报告已生成。',
      reportSaved: '报告已存为 Halo 笔记：{name}',
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
      needBind: 'Bind the site URL and token in Settings first.',
      inputRequired: 'Enter both the site URL and token.',
      bindOk: 'Site bound successfully.',
      syncOk: 'Sync done: pulled {pulled}, pushed {pushed}.',

      autoSync: 'Auto-sync',
      autoSyncHint: 'When enabled, syncs both ways on an interval (pull Halo changes + push local edits). Settings persist across restarts.',
      autoInterval: 'Interval (seconds)',
      autoOn: 'On',
      autoOff: 'Off',
      autoSaved: 'Auto-sync settings saved.',
      autoMinHint: 'Minimum 30 seconds',

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

      navToday: 'Today',
      navTasks: 'Tasks',
      navReports: 'Reports',
      navSettings: 'Settings',
      todayTitle: 'Today',
      todaySubtitle: 'Todos and execution progress grouped by due date',
      tasksTitle: 'All tasks',
      tasksSubtitle: 'Steps, review state and execution sessions',
      reportsTitle: 'Reports',
      reportsSubtitle: 'Generate daily / weekly reports, optionally save to Halo',
      settingsTitle: 'Settings',
      settingsSubtitle: 'Binding, auto-sync and the local mirror',

      loading: 'Loading…',
      loadError: 'Failed to load: {msg}',
      retry: 'Retry',
      emptyToday: 'Nothing due today — see Soon and Someday below.',
      emptyTasks: 'No tasks yet — sync first, or capture one below.',
      orCapture: 'Or capture a new task',
      capturePlaceholder: 'Task title, e.g. fix the login page styles',
      capturePriority: 'Priority',
      captureDue: 'Due date',
      captureBtn: 'Capture',
      captureOk: 'Captured (pushes to Halo on the next sync)',
      captureDupTip: 'Similar todos found: ',
      emptyGroup: 'This group is empty.',
      emptySteps: 'No steps yet — use "Plan steps" to let the agent draft them.',
      noGoal: 'No goal set',
      noEvidence: 'No evidence',
      noSession: 'No session bound',
      untitled: 'Untitled task',
      badResponse: 'Malformed response.',
      requestFailed: 'Request failed.',
      actionFail: 'Action failed: {msg}',

      statPending: 'Pending',
      statDueToday: 'Due today',
      statOverdue: 'Overdue',
      statInReview: 'In review',
      groupOverdue: 'Overdue',
      groupToday: 'Today',
      groupSoon: 'Soon',
      groupSomeday: 'Someday',

      reviewDraft: 'Draft',
      reviewPending: 'In review',
      reviewAccepted: 'Accepted',
      reviewRejected: 'Rejected',
      statusTodo: 'Todo',
      statusDoing: 'Doing',
      statusDone: 'Done',
      somedayTag: 'Someday',
      quotaMust: 'Must',
      quotaShould: 'Should',
      quotaCould: 'Could',
      quotaNone: 'No quota',
      priorityHigh: 'High priority',
      priorityMedium: 'Medium priority',
      priorityLow: 'Low priority',
      progress: 'Progress {done}/{total}',
      due: 'Due {date}',

      filterAll: 'All',
      filterReview: 'Review',
      filterPriority: 'Priority',
      allReviews: 'All reviews',
      allPriorities: 'All priorities',
      searchPlaceholder: 'Search title…',

      detailTitle: 'Task detail',
      close: 'Collapse',
      goal: 'Goal',
      steps: 'Steps',
      evidence: 'Evidence',
      session: 'Session',
      stepNo: 'Step {n}',
      stepDoing: 'Mark doing',
      stepDone: 'Mark done',
      evidencePlaceholder: 'Add execution evidence (optional)',
      btnPlan: 'Plan steps',
      btnSubmit: 'Submit for review',
      btnAccept: 'Accept',
      btnReject: 'Reject',
      btnFlags: 'Someday / quota',
      btnBindSession: 'Bind session',
      planGoal: 'Goal (optional)',
      planGoalPlaceholder: 'One sentence describing the desired outcome',
      planSteps: 'Steps (one per line)',
      planStepsPlaceholder: 'Step one\nStep two',
      submitNote: 'Review note (optional)',
      submitNotePlaceholder: 'Notes for the reviewer',
      reviewNote: 'Decision note (optional)',
      reviewNotePlaceholder: 'Why accept or reject',
      somedayLabel: 'Someday',
      quotaLabel: 'Quota',
      bindSession: 'Session ID',
      bindSessionPlaceholder: 'Paste the execution session ID',
      sessionTail: 'Session output (tail)',
      flagsHint: 'Mark as someday or adjust the quota, then save.',
      planHint: 'One step per line; the agent will turn them into execution steps.',
      rejectHint: 'Write a reason when rejecting so the task can be reworked.',
      pendingReviewTitle: 'This task was submitted for review',
      pendingReviewHint: 'A human must accept or reject it; only acceptance counts as done.',
      acceptedTitle: 'Accepted',
      rejectedTitle: 'Rejected — see the reason',
      rejectedReason: 'Reason: {note}',
      needSteps: 'Enter at least one step.',
      needSession: 'Enter a session ID.',
      planOk: 'Steps generated.',
      stepOk: 'Step status updated.',
      submitOk: 'Submitted for review, awaiting human confirmation.',
      reviewAcceptOk: 'Review accepted.',
      reviewRejectOk: 'Task rejected.',
      flagsOk: 'Flags saved.',
      bindSessionOk: 'Session bound.',

      reportType: 'Report type',
      reportDaily: 'Daily',
      reportWeekly: 'Weekly',
      reportFrom: 'From',
      reportTo: 'To',
      reportGenerate: 'Generate report',
      reportGenerating: 'Generating…',
      reportSaveToNote: 'Save as Halo note',
      reportPreview: 'Report preview',
      reportEmpty: 'Click "Generate report" to preview Markdown here.',
      reportOk: 'Report generated.',
      reportSaved: 'Report saved as Halo note: {name}',
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

  // Loopback API helper: JSON headers, {ok:false} -> thrown error, no UI logic.
  async function api(path, { method = 'GET', body } = {}) {
    const init = { method, headers: { accept: 'application/json' } };
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res;
    try { res = await fetch(path, init); }
    catch (error) { throw new Error(error?.message || tr('requestFailed')); }
    let json;
    try { json = await res.json(); }
    catch { throw new Error(tr('badResponse')); }
    if (json && json.ok === false) throw new Error(json.error || json.message || tr('requestFailed'));
    return json;
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
.wsb-panel{--wsb-bg:var(--dsw-alias-bg-body,var(--dsw-alias-bg-layer-0,transparent));--wsb-surface:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));--wsb-surface-2:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.10));--wsb-surface-3:var(--dsw-alias-bg-layer-3,rgba(128,128,128,.15));--wsb-line:var(--dsw-alias-border-l2,rgba(128,128,128,.22));--wsb-text:var(--dsw-alias-label-primary,#e6e8eb);--wsb-dim:var(--dsw-alias-label-tertiary,#969ca6);--wsb-brand:var(--dsw-alias-brand-primary,#5b8cff);--wsb-brand-fill:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#5b8cff));--wsb-ok:var(--dsw-alias-state-success-primary,#3fb950);--wsb-warn:var(--dsw-alias-state-warn-primary,#e8a33d);--wsb-err:var(--dsw-alias-state-error-primary,#f0616d);--wsb-r:var(--dsw-alias-radius-l,14px);--wsb-rs:var(--dsw-alias-radius-s,8px);box-sizing:border-box;width:100%;max-width:1180px;min-height:70vh;padding:18px 20px 30px;color:var(--wsb-text);font-size:13px;line-height:1.55}
.wsb-panel *{box-sizing:border-box}
.wsb-panel button,.wsb-panel input,.wsb-panel select,.wsb-panel textarea{font:inherit;color:inherit}
.wsb-shell{display:flex;gap:16px;align-items:flex-start;min-height:64vh}
.wsb-rail{flex:0 0 136px;position:sticky;top:8px;display:flex;flex-direction:column;gap:3px;padding:7px;background:var(--wsb-surface);border:1px solid var(--wsb-line);border-radius:var(--wsb-r)}
.wsb-nav{display:flex;align-items:center;gap:9px;width:100%;padding:9px 10px;border-radius:var(--wsb-rs);border:1px solid transparent;background:transparent;color:var(--wsb-dim);cursor:pointer;font-size:12.5px;font-weight:650;text-align:left;transition:background .15s,color .15s,border-color .15s}
.wsb-nav:hover:not([data-active="1"]){background:var(--wsb-surface-2);color:var(--wsb-text)}
.wsb-nav[data-active="1"]{background:color-mix(in srgb,var(--wsb-brand) 14%,transparent);color:var(--wsb-brand);border-color:color-mix(in srgb,var(--wsb-brand) 35%,transparent)}
.wsb-main{flex:1;min-width:0;min-height:64vh;max-height:calc(100vh - 110px);overflow-y:auto;padding-right:4px}
.wsb-mainhead{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.wsb-mark{width:36px;height:36px;flex:0 0 auto;display:grid;place-items:center;border-radius:11px;background:linear-gradient(135deg,var(--wsb-brand),transparent 220%);border:1px solid var(--wsb-line);color:var(--wsb-brand)}
.wsb-mainhead h2{margin:0;font-size:17px;font-weight:680;letter-spacing:.2px}
.wsb-mainhead p{margin:2px 0 0;font-size:11.5px;color:var(--wsb-dim)}
.wsb-pill{margin-left:auto;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;border:1px solid var(--wsb-line);background:var(--wsb-surface-2);white-space:nowrap}
.wsb-pill i{width:7px;height:7px;border-radius:50%;background:var(--wsb-dim)}
.wsb-pill[data-on="1"] i{background:var(--wsb-ok);box-shadow:0 0 0 3px color-mix(in srgb,var(--wsb-ok) 22%,transparent)}
.wsb-iconbtn{display:inline-grid;place-items:center;width:30px;height:30px;flex:0 0 auto;border-radius:var(--wsb-rs);border:1px solid var(--wsb-line);background:var(--wsb-surface-2);cursor:pointer}
.wsb-iconbtn:hover:not(:disabled){border-color:var(--wsb-brand)}
.wsb-iconbtn:disabled{opacity:.45;cursor:not-allowed}
.wsb-stats{position:sticky;top:0;z-index:3;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px;padding:9px;background:var(--wsb-surface);border:1px solid var(--wsb-line);border-radius:var(--wsb-r);box-shadow:0 6px 18px color-mix(in srgb,var(--dsw-alias-bg-body,#000) 14%,transparent)}
.wsb-statp{padding:7px 10px;border-radius:var(--wsb-rs);background:var(--wsb-surface-2)}
.wsb-statp .k{font-size:10.5px;color:var(--wsb-dim);font-weight:650}
.wsb-statp .v{font-size:22px;font-weight:740;line-height:1.25;font-variant-numeric:tabular-nums}
.wsb-statp[data-tone="warn"] .v{color:var(--wsb-warn)}
.wsb-statp[data-tone="err"] .v{color:var(--wsb-err)}
.wsb-statp[data-tone="brand"] .v{color:var(--wsb-brand)}
.wsb-card{background:var(--wsb-surface);border:1px solid var(--wsb-line);border-radius:var(--wsb-r);padding:15px 16px;margin-bottom:13px}
.wsb-card-h{display:flex;align-items:center;gap:8px;margin-bottom:5px}
.wsb-card-h b{font-size:13px}
.wsb-card-h span{font-size:11px;color:var(--wsb-dim)}
.wsb-hint{margin:0 0 12px;font-size:11.5px;color:var(--wsb-dim)}
.wsb-group{margin-bottom:13px;background:var(--wsb-surface);border:1px solid var(--wsb-line);border-radius:var(--wsb-r);overflow:hidden}
.wsb-grouph{display:flex;align-items:center;gap:7px;margin:0;padding:9px 12px;font-size:11.5px;font-weight:700;color:var(--wsb-dim);background:var(--wsb-surface-2);border-bottom:1px solid var(--wsb-line)}
.wsb-grouph:before{content:"";width:3px;height:12px;border-radius:2px;background:var(--wsb-brand)}
.wsb-grouph[data-tone="err"]:before{background:var(--wsb-err)}
.wsb-grouph[data-tone="warn"]:before{background:var(--wsb-warn)}
.wsb-grouph em{font-style:normal;font-weight:600;color:var(--wsb-text)}
.wsb-row{display:flex;align-items:flex-start;gap:10px;width:100%;padding:10px 12px;border:0;border-bottom:1px solid var(--wsb-line);background:transparent;text-align:left;cursor:pointer;transition:background .12s}
.wsb-row:last-child{border-bottom:0}
.wsb-row:hover{background:var(--wsb-surface-2)}
.wsb-row[data-open="1"]{background:color-mix(in srgb,var(--wsb-brand) 9%,transparent)}
.wsb-dot{width:8px;height:8px;flex:0 0 auto;margin-top:5px;border-radius:50%;background:var(--wsb-dim)}
.wsb-dot[data-p="HIGH"]{background:var(--wsb-err);box-shadow:0 0 0 3px color-mix(in srgb,var(--wsb-err) 18%,transparent)}
.wsb-dot[data-p="MEDIUM"]{background:var(--wsb-warn)}
.wsb-dot[data-p="LOW"]{background:var(--wsb-brand)}
.wsb-rowmain{flex:1;min-width:0}
.wsb-rowtitle{font-size:12.5px;font-weight:620;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wsb-rowmeta{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:4px;font-size:10.5px;color:var(--wsb-dim)}
.wsb-prog{height:4px;margin-top:6px;border-radius:999px;background:var(--wsb-surface-3);overflow:hidden}
.wsb-prog i{display:block;height:100%;background:var(--wsb-brand)}
.wsb-badge{display:inline-flex;align-items:center;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:700;border:1px solid var(--wsb-line);color:var(--wsb-dim);white-space:nowrap}
.wsb-badge[data-tone="ok"]{color:var(--wsb-ok);border-color:color-mix(in srgb,var(--wsb-ok) 45%,transparent);background:color-mix(in srgb,var(--wsb-ok) 12%,transparent)}
.wsb-badge[data-tone="warn"]{color:var(--wsb-warn);border-color:color-mix(in srgb,var(--wsb-warn) 45%,transparent);background:color-mix(in srgb,var(--wsb-warn) 12%,transparent)}
.wsb-badge[data-tone="err"]{color:var(--wsb-err);border-color:color-mix(in srgb,var(--wsb-err) 45%,transparent);background:color-mix(in srgb,var(--wsb-err) 12%,transparent)}
.wsb-badge[data-tone="brand"]{color:var(--wsb-brand);border-color:color-mix(in srgb,var(--wsb-brand) 45%,transparent);background:color-mix(in srgb,var(--wsb-brand) 12%,transparent)}
.wsb-detail{margin:0;padding:14px;border-top:1px solid var(--wsb-line);background:var(--wsb-surface-2)}
.wsb-detail-h{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.wsb-detail-h b{font-size:12.5px}
.wsb-kv{display:flex;gap:8px;margin-bottom:8px;font-size:11.5px}
.wsb-kv span{color:var(--wsb-dim);flex:0 0 auto}
.wsb-kv div{min-width:0;word-break:break-word}
.wsb-step{padding:9px 10px;margin-bottom:7px;border:1px solid var(--wsb-line);border-radius:var(--wsb-rs);background:var(--wsb-surface)}
.wsb-stephead{display:flex;align-items:center;gap:8px}
.wsb-stepno{font-size:10.5px;font-weight:700;color:var(--wsb-brand);font-variant-numeric:tabular-nums}
.wsb-steptext{flex:1;min-width:0;font-size:12px;font-weight:560;word-break:break-word}
.wsb-evidence{margin-top:6px;padding:4px 0 4px 9px;border-left:2px solid var(--wsb-brand);font-size:10.5px;color:var(--wsb-dim);word-break:break-word}
.wsb-formrow{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:10px}
.wsb-field{display:block;margin-bottom:10px;min-width:0}
.wsb-field>span{display:block;font-size:10.5px;font-weight:650;color:var(--wsb-dim);margin-bottom:4px}
.wsb-field.wide{flex:1 1 100%}
.wsb-sub{font-style:normal;font-weight:400;opacity:.75}
.wsb-input,.wsb-ta,.wsb-sel{width:100%;padding:8px 10px;border-radius:var(--wsb-rs);border:1px solid var(--wsb-line);background:var(--wsb-surface);outline:none;transition:border-color .15s,box-shadow .15s}
.wsb-input::placeholder,.wsb-ta::placeholder{color:var(--wsb-dim);opacity:.7}
.wsb-input:focus,.wsb-ta:focus,.wsb-sel:focus{border-color:var(--wsb-brand);box-shadow:0 0 0 3px color-mix(in srgb,var(--wsb-brand) 16%,transparent)}
.wsb-ta{min-height:70px;resize:vertical;font-size:11.5px;line-height:1.5}
.wsb-sel{width:auto;min-width:110px;cursor:pointer}
.wsb-check{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;cursor:pointer;user-select:none}
.wsb-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}
.wsb-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:7px 12px;min-height:32px;border-radius:var(--wsb-rs);border:1px solid var(--wsb-line);background:var(--wsb-surface-2);cursor:pointer;font-size:11.5px;font-weight:620;transition:background .15s,border-color .15s,transform .08s,opacity .15s}
.wsb-btn:hover:not(:disabled){background:var(--wsb-surface-3);border-color:var(--wsb-brand)}
.wsb-btn:active:not(:disabled){transform:translateY(1px)}
.wsb-btn:disabled{opacity:.45;cursor:not-allowed}
.wsb-btn[data-primary="1"]{background:var(--wsb-brand-fill);border-color:transparent;color:#fff}
.wsb-btn[data-primary="1"]:hover:not(:disabled){filter:brightness(1.08)}
.wsb-btn[data-tone="err"]{color:var(--wsb-err)}
.wsb-btn[data-tone="ok"]{color:var(--wsb-ok)}
.wsb-spin{width:12px;height:12px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:wsb-spin .7s linear infinite}
@keyframes wsb-spin{to{transform:rotate(360deg)}}
.wsb-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
.wsb-stat{background:var(--wsb-surface-2);border:1px solid var(--wsb-line);border-radius:var(--wsb-r);padding:12px 13px;position:relative;overflow:hidden}
.wsb-stat:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:var(--wsb-accent,var(--wsb-brand));opacity:.85}
.wsb-stat .k{font-size:11px;color:var(--wsb-dim);font-weight:600}
.wsb-stat .v{font-size:25px;font-weight:700;line-height:1.2;margin:5px 0 2px;font-variant-numeric:tabular-nums}
.wsb-stat .chips{display:flex;gap:5px;flex-wrap:wrap;min-height:18px}
.wsb-chip{font-size:10px;font-weight:600;padding:1px 7px;border-radius:999px;border:1px solid var(--wsb-line);color:var(--wsb-dim)}
.wsb-chip[data-tone="dirty"]{color:var(--wsb-warn);border-color:color-mix(in srgb,var(--wsb-warn) 45%,transparent);background:color-mix(in srgb,var(--wsb-warn) 12%,transparent)}
.wsb-chip[data-tone="tomb"]{color:var(--wsb-err);border-color:color-mix(in srgb,var(--wsb-err) 45%,transparent);background:color-mix(in srgb,var(--wsb-err) 12%,transparent)}
.wsb-meta{display:flex;gap:18px;flex-wrap:wrap;margin-top:12px;font-size:11px;color:var(--wsb-dim)}
.wsb-meta b{color:var(--wsb-text);font-weight:600;font-variant-numeric:tabular-nums}
.wsb-empty{margin-top:10px;padding:22px 14px;border:1px dashed var(--wsb-line);border-radius:var(--wsb-r);text-align:center;font-size:11.5px;color:var(--wsb-dim)}
.wsb-note{display:flex;gap:9px;align-items:flex-start;margin-bottom:12px;padding:11px 13px;border-radius:var(--wsb-rs);font-size:11.5px;line-height:1.5;border:1px solid;background:transparent}
.wsb-note[data-tone="warn"]{color:var(--wsb-warn);border-color:color-mix(in srgb,var(--wsb-warn) 40%,transparent);background:color-mix(in srgb,var(--wsb-warn) 8%,transparent)}
.wsb-note[data-tone="err"]{color:var(--wsb-err);border-color:color-mix(in srgb,var(--wsb-err) 40%,transparent);background:color-mix(in srgb,var(--wsb-err) 8%,transparent)}
.wsb-note[data-tone="ok"]{color:var(--wsb-ok);border-color:color-mix(in srgb,var(--wsb-ok) 40%,transparent);background:color-mix(in srgb,var(--wsb-ok) 8%,transparent)}
.wsb-note b{font-weight:700}
.wsb-note .wsb-nbody{min-width:0}
.wsb-note .wsb-nbody span{display:block;color:var(--wsb-dim);margin-top:2px}
.wsb-errlist{margin:8px 0 0;padding-left:16px;font-size:10.5px;color:var(--wsb-dim);max-height:120px;overflow:auto}
.wsb-md{white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:1.6;max-height:460px;overflow:auto;padding:12px;margin:0;border:1px solid var(--wsb-line);border-radius:var(--wsb-rs);background:var(--wsb-surface)}
.wsb-tail{margin-top:12px}
.wsb-tail .wsb-lbl{font-size:10.5px;font-weight:700;color:var(--wsb-dim);margin-bottom:5px}
.wsb-toast{position:sticky;bottom:8px;z-index:9;margin-top:14px;padding:10px 13px;border-radius:var(--wsb-rs);font-size:11.5px;font-weight:600;border:1px solid var(--wsb-line);background:var(--wsb-surface-3);box-shadow:var(--dsw-elevation-panel,0 6px 20px rgba(0,0,0,.25))}
.wsb-toast[data-tone="err"]{color:var(--wsb-err)}
.wsb-toast[data-tone="ok"]{color:var(--wsb-ok)}
@media (max-width:720px){
  .wsb-panel{padding:12px}
  .wsb-shell{flex-direction:column;gap:10px}
  .wsb-rail{position:static;flex:0 0 auto;width:100%;flex-direction:row;overflow-x:auto;padding:5px}
  .wsb-nav{flex:0 0 auto;width:auto;white-space:nowrap;padding:7px 10px}
  .wsb-main{max-height:none;min-height:0;overflow:visible;padding-right:0}
  .wsb-stats{grid-template-columns:repeat(2,minmax(0,1fr));position:static}
  .wsb-grid{grid-template-columns:1fr}
}
`;

  function fmtTime(t) {
    if (!t) return tr('never');
    try {
      const d = new Date(t);
      return Number.isNaN(d.getTime()) ? String(t) : d.toLocaleString();
    } catch { return String(t); }
  }

  function fmtDate(v) {
    if (!v) return '';
    const s = String(v);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
  }

  function panel(React) {
    const h = React.createElement;
    const { useState, useEffect, useCallback } = React;

    function Icon({ d, size = 14 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round',
        strokeLinejoin: 'round', 'aria-hidden': 'true',
      }, h('path', { d }));
    }
    const ICONS = {
      today: 'M7 3v3M17 3v3M3.5 9h17M5 5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
      tasks: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
      reports: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5M9 13h6M9 17h6',
      settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.54 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9.1A1.7 1.7 0 0 0 10.14 3V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9.1a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z',
      link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
      sync: 'M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6',
      refresh: 'M20 11a8 8 0 1 0-2.3 6M20 4v7h-7',
      warn: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
      err: 'M12 8v5M12 17h.01M12 3 2 20h20L12 3z',
      ok: 'M20 6 9 17l-5-5',
      down: 'm6 9 6 6 6-6',
      up: 'm18 15-6-6-6 6',
    };

    function Badge({ tone, children }) {
      return h('span', { className: 'wsb-badge', 'data-tone': tone || 'dim' }, children);
    }

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

    function reviewInfo(r) {
      if (r === 'pending') return { tone: 'warn', label: tr('reviewPending') };
      if (r === 'accepted') return { tone: 'ok', label: tr('reviewAccepted') };
      if (r === 'rejected') return { tone: 'err', label: tr('reviewRejected') };
      return { tone: 'dim', label: tr('reviewDraft') };
    }

    function statusInfo(s) {
      if (s === 'doing') return { tone: 'brand', label: tr('statusDoing') };
      if (s === 'done') return { tone: 'ok', label: tr('statusDone') };
      return { tone: 'dim', label: tr('statusTodo') };
    }

    function quotaLabel(q) {
      if (q === 'must') return tr('quotaMust');
      if (q === 'should') return tr('quotaShould');
      if (q === 'could') return tr('quotaCould');
      return tr('quotaNone');
    }

    function TaskDetail({ item, onAction, onNotice, busyOp, bindTail }) {
      const task = item?.task || null;
      const todoName = item?.name || task?.todoName || '';
      const steps = Array.isArray(task?.steps) ? task.steps : [];
      const review = task?.review || 'draft';
      const [goal, setGoal] = useState(task?.goal || '');
      const [stepsText, setStepsText] = useState('');
      const [evidences, setEvidences] = useState({});
      const [note, setNote] = useState('');
      const [reviewNote, setReviewNote] = useState('');
      const [sessionId, setSessionId] = useState(task?.sessionId || '');
      const [someday, setSomeday] = useState(Boolean(task?.someday));
      const [quota, setQuota] = useState(task?.quota || '');

      useEffect(() => {
        setGoal(task?.goal || '');
        setSessionId(task?.sessionId || '');
        setSomeday(Boolean(task?.someday));
        setQuota(task?.quota || '');
      }, [todoName, task?.sessionId, task?.review]); // eslint-disable-line react-hooks/exhaustive-deps

      const done = steps.filter((s) => s?.status === 'done').length;
      const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
      const busy = Boolean(busyOp);

      const run = (payload, okKey) => onAction(payload, okKey);

      const onPlan = () => {
        const lines = stepsText.split('\n').map((x) => x.trim()).filter(Boolean);
        if (!lines.length) { onNotice('err', tr('needSteps')); return; }
        run({ op: 'plan', todoName, goal: goal.trim(), steps: lines }, 'planOk');
      };

      const tail = bindTail && bindTail.name === todoName ? bindTail.tail : '';

      return h('div', { className: 'wsb-detail' },
        h('div', { className: 'wsb-detail-h' },
          h(Icon, { d: ICONS.tasks, size: 14 }),
          h('b', null, tr('detailTitle')),
          h(Badge, { tone: reviewInfo(review).tone }, reviewInfo(review).label),
        ),

        review === 'pending'
          ? h(Note, { tone: 'warn', title: tr('pendingReviewTitle'), detail: tr('pendingReviewHint') })
          : review === 'accepted'
            ? h(Note, { tone: 'ok', title: tr('acceptedTitle') })
            : review === 'rejected'
              ? h(Note, {
                tone: 'err', title: tr('rejectedTitle'),
                detail: task?.reviewNote ? tr('rejectedReason', { note: task.reviewNote }) : null,
              })
              : null,

        h('div', { className: 'wsb-kv' },
          h('span', null, tr('goal')),
          h('div', null, task?.goal || tr('noGoal')),
        ),

        steps.length
          ? h('div', null,
              h('div', { className: 'wsb-formrow', style: { marginTop: 0, justifyContent: 'space-between' } },
                h('span', { style: { fontSize: 11, color: 'var(--wsb-dim)' } }, tr('progress', { done, total: steps.length })),
              ),
              h('div', { className: 'wsb-prog' }, h('i', { style: { width: pct + '%' } })),
            )
          : null,

        h('div', { className: 'wsb-formrow', style: { marginTop: 10, justifyContent: 'space-between' } },
          h('b', { style: { fontSize: 11.5 } }, tr('steps')),
        ),

        steps.length
          ? steps.map((s) => {
              const idx = s?.index;
              const info = statusInfo(s?.status);
              const ev = Array.isArray(s?.evidence)
                ? s.evidence.filter(Boolean).join(' · ')
                : (s?.evidence || '');
              return h('div', { className: 'wsb-step', key: idx },
                h('div', { className: 'wsb-stephead' },
                  h('span', { className: 'wsb-stepno' }, tr('stepNo', { n: Number(idx) + 1 })),
                  h('span', { className: 'wsb-steptext' }, s?.text || ''),
                  h(Badge, { tone: info.tone }, info.label),
                ),
                s?.sessionId
                  ? h('div', { className: 'wsb-rowmeta' }, h('span', null, tr('session') + ': ' + s.sessionId))
                  : null,
                ev ? h('div', { className: 'wsb-evidence' }, tr('evidence') + ': ' + ev) : null,
                h('div', { className: 'wsb-formrow' },
                  h('input', {
                    className: 'wsb-input', style: { flex: '1 1 160px' },
                    value: evidences[idx] || '', placeholder: tr('evidencePlaceholder'),
                    onChange: (e) => setEvidences((prev) => Object.assign({}, prev, { [idx]: e.target.value })),
                  }),
                  h('button', {
                    className: 'wsb-btn', disabled: busy || busyOp === 'step',
                    onClick: () => run({ op: 'step', todoName, index: idx, status: 'doing', evidence: (evidences[idx] || '').trim() }, 'stepOk'),
                  }, tr('stepDoing')),
                  h('button', {
                    className: 'wsb-btn', 'data-primary': '1', disabled: busy || busyOp === 'step',
                    onClick: () => run({ op: 'step', todoName, index: idx, status: 'done', evidence: (evidences[idx] || '').trim() }, 'stepOk'),
                  }, tr('stepDone')),
                ),
              );
            })
          : h('div', { className: 'wsb-empty' }, tr('emptySteps')),

        h('div', { className: 'wsb-field wide', style: { marginTop: 12 } },
          h('span', null, tr('planGoal')),
          h('input', {
            className: 'wsb-input', value: goal, placeholder: tr('planGoalPlaceholder'),
            onChange: (e) => setGoal(e.target.value),
          }),
        ),
        h('div', { className: 'wsb-field wide' },
          h('span', null, tr('planSteps')),
          h('textarea', {
            className: 'wsb-ta', value: stepsText, placeholder: tr('planStepsPlaceholder'),
            onChange: (e) => setStepsText(e.target.value),
          }),
        ),
        h('p', { className: 'wsb-hint', style: { margin: '-4px 0 0' } }, tr('planHint')),
        h('div', { className: 'wsb-actions' },
          h('button', {
            className: 'wsb-btn', disabled: busy || busyOp === 'plan', onClick: onPlan,
          }, busyOp === 'plan' ? h('span', { className: 'wsb-spin' }) : h(Icon, { d: ICONS.tasks, size: 13 }), tr('btnPlan')),
        ),

        h('div', { className: 'wsb-formrow' },
          h('div', { className: 'wsb-field', style: { flex: '1 1 220px' } },
            h('span', null, tr('submitNote')),
            h('input', {
              className: 'wsb-input', value: note, placeholder: tr('submitNotePlaceholder'),
              onChange: (e) => setNote(e.target.value),
            }),
          ),
          h('button', {
            className: 'wsb-btn', disabled: busy || busyOp === 'submit',
            onClick: () => run({ op: 'submit', todoName, note: note.trim() }, 'submitOk'),
          }, busyOp === 'submit' ? h('span', { className: 'wsb-spin' }) : null, tr('btnSubmit')),
        ),

        h('div', { className: 'wsb-formrow' },
          h('div', { className: 'wsb-field', style: { flex: '1 1 220px' } },
            h('span', null, tr('reviewNote')),
            h('input', {
              className: 'wsb-input', value: reviewNote, placeholder: tr('reviewNotePlaceholder'),
              onChange: (e) => setReviewNote(e.target.value),
            }),
          ),
          h('button', {
            className: 'wsb-btn', 'data-tone': 'ok', disabled: busy || review === 'accepted',
            onClick: () => run({ op: 'review', todoName, decision: 'accept', note: reviewNote.trim() }, 'reviewAcceptOk'),
          }, busyOp === 'review' ? h('span', { className: 'wsb-spin' }) : null, tr('btnAccept')),
          h('button', {
            className: 'wsb-btn', 'data-tone': 'err', disabled: busy,
            onClick: () => run({ op: 'review', todoName, decision: 'reject', note: reviewNote.trim() }, 'reviewRejectOk'),
          }, tr('btnReject')),
        ),
        h('p', { className: 'wsb-hint', style: { margin: '-4px 0 0' } }, tr('rejectHint')),

        h('div', { className: 'wsb-formrow' },
          h('label', { className: 'wsb-check' },
            h('input', { type: 'checkbox', checked: someday, onChange: (e) => setSomeday(e.target.checked) }),
            tr('somedayLabel'),
          ),
          h('label', { className: 'wsb-field', style: { marginBottom: 0 } },
            h('span', null, tr('quotaLabel')),
            h('select', { className: 'wsb-sel', value: quota, onChange: (e) => setQuota(e.target.value) },
              h('option', { value: '' }, tr('quotaNone')),
              h('option', { value: 'must' }, tr('quotaMust')),
              h('option', { value: 'should' }, tr('quotaShould')),
              h('option', { value: 'could' }, tr('quotaCould')),
            ),
          ),
          h('button', {
            className: 'wsb-btn', disabled: busy || busyOp === 'flags',
            onClick: () => run({ op: 'flags', todoName, someday, quota: quota || null }, 'flagsOk'),
          }, busyOp === 'flags' ? h('span', { className: 'wsb-spin' }) : null, tr('btnFlags')),
        ),
        h('p', { className: 'wsb-hint', style: { margin: '-2px 0 0' } }, tr('flagsHint')),

        h('div', { className: 'wsb-formrow' },
          h('div', { className: 'wsb-field', style: { flex: '1 1 220px' } },
            h('span', null, tr('bindSession')),
            h('input', {
              className: 'wsb-input', value: sessionId, placeholder: tr('bindSessionPlaceholder'),
              onChange: (e) => setSessionId(e.target.value),
            }),
          ),
          h('button', {
            className: 'wsb-btn', disabled: busy || busyOp === 'bind',
            onClick: () => {
              if (!sessionId.trim()) { onNotice('err', tr('needSession')); return; }
              run({ op: 'bind', todoName, sessionId: sessionId.trim() }, 'bindSessionOk');
            },
          }, busyOp === 'bind' ? h('span', { className: 'wsb-spin' }) : null, tr('btnBindSession')),
        ),

        tail ? h('div', { className: 'wsb-tail' },
          h('div', { className: 'wsb-lbl' }, tr('sessionTail')),
          h('pre', { className: 'wsb-md' }, tail),
        ) : null,
      );
    }

    function TaskRow({ row, full, open, onToggle, onAction, onNotice, busyOp, bindTail }) {
      const task = full?.task || row.task || null;
      const detailItem = full || Object.assign({}, row, { task });
      const title = row.title || full?.title || tr('untitled');
      const priority = row.priority || full?.priority || '';
      const review = row.review || task?.review || 'draft';
      const due = row.dueDate || full?.dueDate || '';
      const prog = row.progress || (task?.steps && task.steps.length
        ? { done: task.steps.filter((s) => s?.status === 'done').length, total: task.steps.length }
        : null);
      const rev = reviewInfo(review);
      const someday = Boolean(row.someday ?? task?.someday);
      const quota = row.quota || task?.quota || '';
      return h('div', null,
        h('div', {
          className: 'wsb-row', 'data-open': open ? '1' : '0',
          role: 'button', tabIndex: 0, onClick: onToggle,
        },
          h('span', { className: 'wsb-dot', 'data-p': String(priority).toUpperCase() }),
          h('div', { className: 'wsb-rowmain' },
            h('div', { className: 'wsb-rowtitle', title }, title),
            h('div', { className: 'wsb-rowmeta' },
              due ? h('span', null, tr('due', { date: fmtDate(due) })) : null,
              prog && prog.total ? h('span', null, tr('progress', { done: prog.done ?? 0, total: prog.total })) : null,
              h(Badge, { tone: rev.tone }, rev.label),
              someday ? h(Badge, { tone: 'dim' }, tr('somedayTag')) : null,
              quota ? h(Badge, { tone: 'brand' }, quotaLabel(quota)) : null,
            ),
            prog && prog.total
              ? h('div', { className: 'wsb-prog' },
                  h('i', { style: { width: Math.round(((prog.done ?? 0) / prog.total) * 100) + '%' } }))
              : null,
          ),
          h(Icon, { d: open ? ICONS.up : ICONS.down, size: 14 }),
        ),
        open ? h(TaskDetail, { item: detailItem, onAction, onNotice, busyOp, bindTail }) : null,
      );
    }

    function StatPill({ label, value, tone }) {
      return h('div', { className: 'wsb-statp', 'data-tone': tone || '' },
        h('div', { className: 'k' }, label),
        h('div', { className: 'v' }, String(value ?? 0)),
      );
    }

    function Stat({ kind, data }) {
      const accent = kind === 'todo' ? 'var(--wsb-brand)'
        : kind === 'project' ? 'var(--wsb-ok)' : 'var(--wsb-warn)';
      const total = data?.total ?? 0;
      const dirty = data?.dirty ?? 0;
      const tombs = data?.tombstones ?? 0;
      return h('div', { className: 'wsb-stat', style: { '--wsb-accent': accent } },
        h('div', { className: 'k' }, tr(kind)),
        h('div', { className: 'v' }, String(total)),
        h('div', { className: 'chips' },
          dirty ? h('span', { className: 'wsb-chip', 'data-tone': 'dirty' }, tr('dirty', { n: dirty })) : null,
          tombs ? h('span', { className: 'wsb-chip', 'data-tone': 'tomb' }, tr('tombstone', { n: tombs })) : null,
        ),
      );
    }

    return function WorkspaceBridgePanel() {
      const [view, setView] = useState('today');
      const [status, setStatus] = useState(null);
      const [origin, setOrigin] = useState('');
      const [token, setToken] = useState('');
      const [bindBusy, setBindBusy] = useState(false);
      const [syncBusy, setSyncBusy] = useState(false);
      const [autoEnabled, setAutoEnabled] = useState(false);
      const [autoInterval, setAutoInterval] = useState(120);
      const [autoBusy, setAutoBusy] = useState(false);
      const [today, setToday] = useState(null);
      const [todos, setTodos] = useState([]);
      const [loading, setLoading] = useState(false);
      const [loadError, setLoadError] = useState('');
      const [toast, setToast] = useState(null);
      const [expanded, setExpanded] = useState(null);
      const [filterReview, setFilterReview] = useState('');
      const [filterPriority, setFilterPriority] = useState('');
      const [query, setQuery] = useState('');
      const [reportType, setReportType] = useState('daily');
      const [reportFrom, setReportFrom] = useState('');
      const [reportTo, setReportTo] = useState('');
      const [saveToNote, setSaveToNote] = useState(false);
      const [reportMd, setReportMd] = useState('');
      const [reportName, setReportName] = useState('');
      const [reportBusy, setReportBusy] = useState(false);
      const [captureTitle, setCaptureTitle] = useState('');
      const [capturePriority, setCapturePriority] = useState('MEDIUM');
      const [captureDue, setCaptureDue] = useState('');
      const [captureBusy, setCaptureBusy] = useState(false);
      const [captureDup, setCaptureDup] = useState(null);
      const [busyOp, setBusyOp] = useState(null);
      const [bindTail, setBindTail] = useState(null);

      const showToast = useCallback((tone, text) => setToast({ tone, text }), []);

      useEffect(() => {
        if (!toast) return undefined;
        const id = setTimeout(() => setToast(null), 3800);
        return () => clearTimeout(id);
      }, [toast]);

      const loadStatus = useCallback(async () => {
        try {
          const json = await api('/api/bridge/status');
          setStatus(json);
          if (json?.autoSync) {
            setAutoEnabled(Boolean(json.autoSync.enabled));
            setAutoInterval(Number(json.autoSync.intervalSec) || 120);
          }
          setOrigin((prev) => prev || json?.origin || '');
          return json;
        } catch (error) {
          showToast('err', error.message || tr('loadError', { msg: '' }));
          return null;
        }
      }, [showToast]);

      const loadView = useCallback(async (target) => {
        setLoading(true);
        setLoadError('');
        try {
          if (target === 'today') {
            const [t, list] = await Promise.all([
              api('/api/bridge/task/today'),
              api('/api/bridge/list?kind=todo'),
            ]);
            setToday(t);
            setTodos(Array.isArray(list?.items) ? list.items : []);
          } else if (target === 'tasks') {
            const list = await api('/api/bridge/list?kind=todo');
            setTodos(Array.isArray(list?.items) ? list.items : []);
          } else if (target === 'settings') {
            await loadStatus();
          }
        } catch (error) {
          setLoadError(error.message || tr('requestFailed'));
        } finally {
          setLoading(false);
        }
      }, [loadStatus]);

      useEffect(() => { loadStatus(); }, [loadStatus]); // eslint-disable-line react-hooks/exhaustive-deps
      useEffect(() => { loadView(view); setExpanded(null); }, [view, loadView]); // eslint-disable-line react-hooks/exhaustive-deps

      const refreshAll = useCallback(async () => {
        await Promise.all([loadStatus(), loadView(view)]);
      }, [loadStatus, loadView, view]);

      const runAction = useCallback(async (payload, okKey) => {
        setBusyOp(payload?.op || 'action');
        try {
          const json = await api('/api/bridge/task', { method: 'POST', body: payload });
          if (payload?.op === 'bind' && json?.tail !== undefined) {
            setBindTail({ name: payload.todoName, tail: String(json.tail) });
          }
          showToast('ok', tr(okKey));
          await loadView(view);
        } catch (error) {
          showToast('err', error.message || tr('actionFail', { msg: '' }));
        } finally {
          setBusyOp(null);
        }
      }, [view, loadView, showToast]);

      const doBind = useCallback(async () => {
        const keepToken = Boolean(status?.bound) && !token.trim();
        if (!origin.trim() || (!token.trim() && !keepToken)) {
          showToast('err', tr('inputRequired'));
          return;
        }
        setBindBusy(true);
        try {
          await api('/api/bridge/bind', {
            method: 'POST', body: { origin: origin.trim(), token: token.trim() },
          });
          setToken('');
          showToast('ok', tr('bindOk'));
          await loadStatus();
        } catch (error) {
          showToast('err', error.message || tr('actionFail', { msg: '' }));
        } finally { setBindBusy(false); }
      }, [origin, token, status, loadStatus, showToast]);

      const doSync = useCallback(async () => {
        if (!status?.bound) { showToast('err', tr('needBind')); return; }
        setSyncBusy(true);
        try {
          const json = await api('/api/bridge/sync', { method: 'POST', body: {} });
          showToast('ok', tr('syncOk', { pulled: json?.pulled ?? 0, pushed: json?.pushed ?? 0 }));
          await refreshAll();
        } catch (error) {
          showToast('err', error.message || tr('actionFail', { msg: '' }));
        } finally { setSyncBusy(false); }
      }, [status, refreshAll, showToast]);

      const saveAuto = useCallback(async (nextEnabled, nextInterval) => {
        setAutoBusy(true);
        try {
          const json = await api('/api/bridge/auto-sync', {
            method: 'POST',
            body: { enabled: nextEnabled, intervalSec: Number(nextInterval) || 120 },
          });
          setAutoEnabled(Boolean(json?.enabled ?? nextEnabled));
          setAutoInterval(Number(json?.intervalSec ?? nextInterval) || 120);
          showToast('ok', tr('autoSaved'));
        } catch (error) {
          showToast('err', error.message || tr('actionFail', { msg: '' }));
        } finally { setAutoBusy(false); }
      }, [showToast]);

      const doCapture = useCallback(async () => {
        const title = captureTitle.trim();
        if (!title) { showToast('err', tr('inputRequired')); return; }
        setCaptureBusy(true);
        setCaptureDup(null);
        try {
          const json = await api('/api/bridge/capture', {
            method: 'POST',
            body: {
              title,
              priority: capturePriority,
              dueDate: captureDue || undefined,
            },
          });
          setCaptureTitle('');
          setCaptureDue('');
          const dups = Array.isArray(json?.duplicates) ? json.duplicates : [];
          if (dups.length) setCaptureDup(dups);
          showToast('ok', tr('captureOk'));
          await loadView(view);
        } catch (error) {
          showToast('err', error.message || tr('actionFail', { msg: '' }));
        } finally { setCaptureBusy(false); }
      }, [captureTitle, capturePriority, captureDue, view, loadView, showToast]);

      const doReport = useCallback(async () => {
        setReportBusy(true);
        try {
          const json = await api('/api/bridge/report', {
            method: 'POST',
            body: {
              type: reportType,
              from: reportFrom || undefined,
              to: reportTo || undefined,
              saveToNote,
            },
          });
          setReportMd(String(json?.markdown ?? ''));
          setReportName(json?.noteName || '');
          showToast('ok', json?.noteName
            ? tr('reportSaved', { name: json.noteName }) : tr('reportOk'));
        } catch (error) {
          showToast('err', error.message || tr('actionFail', { msg: '' }));
        } finally { setReportBusy(false); }
      }, [reportType, reportFrom, reportTo, saveToNote, showToast]);

      const navItems = [
        { key: 'today', icon: ICONS.today, label: tr('navToday') },
        { key: 'tasks', icon: ICONS.tasks, label: tr('navTasks') },
        { key: 'reports', icon: ICONS.reports, label: tr('navReports') },
        { key: 'settings', icon: ICONS.settings, label: tr('navSettings') },
      ];
      const head = {
        today: [tr('todayTitle'), tr('todaySubtitle')],
        tasks: [tr('tasksTitle'), tr('tasksSubtitle')],
        reports: [tr('reportsTitle'), tr('reportsSubtitle')],
        settings: [tr('settingsTitle'), tr('settingsSubtitle')],
      }[view] || [tr('title'), tr('subtitle')];
      const connected = Boolean(status?.bound);
      const rowProps = { onAction: runAction, onNotice: showToast, busyOp, bindTail };
      const renderRow = (row, key) => {
        const full = todos.find((t) => t?.name === row?.name
          || t?.name === row?.todoName
          || t?.task?.todoName === row?.name) || null;
        const name = row?.name || full?.name || String(key);
        return h(TaskRow, Object.assign({ key: name, row, full, open: expanded === name, onToggle: () => setExpanded((p) => (p === name ? null : name)) }, rowProps));
      };

      let content;
      if (view === 'today') {
        const stats = today?.stats || {};
        const groups = today?.groups || {};
        const keys = [
          ['overdue', 'groupOverdue', 'err'],
          ['today', 'groupToday', 'brand'],
          ['soon', 'groupSoon', 'warn'],
          ['someday', 'groupSomeday', ''],
        ];
        const allEmpty = keys.every(([k]) => !(groups[k] || []).length);
        content = h('div', null,
          h('div', { className: 'wsb-stats' },
            h(StatPill, { label: tr('statPending'), value: stats.pending, tone: 'brand' }),
            h(StatPill, { label: tr('statDueToday'), value: stats.dueToday }),
            h(StatPill, { label: tr('statOverdue'), value: stats.overdue, tone: 'err' }),
            h(StatPill, { label: tr('statInReview'), value: stats.inReview, tone: 'warn' }),
          ),
          loading ? h('div', { className: 'wsb-empty' }, tr('loading')) : null,
          loadError ? h(Note, { tone: 'err', title: tr('loadError', { msg: loadError }) }) : null,
          !loading && !loadError && allEmpty
            ? h('div', { className: 'wsb-empty' }, tr('emptyToday'))
            : null,
          keys.map(([k, labelKey, tone]) => {
            const rows = groups[k] || [];
            if (!rows.length) return null;
            return h('section', { className: 'wsb-group', key: k },
              h('h3', { className: 'wsb-grouph', 'data-tone': tone },
                tr(labelKey), h('em', null, String(rows.length))),
              rows.map(renderRow),
            );
          }),
        );
      } else if (view === 'tasks') {
        const q = query.trim().toLowerCase();
        const filtered = todos.filter((t) => {
          const r = t?.task?.review || 'draft';
          const p = String(t?.priority || '').toUpperCase();
          if (filterReview && r !== filterReview) return false;
          if (filterPriority && p !== filterPriority) return false;
          if (q && !((t?.title || '') + ' ' + (t?.detail || '')).toLowerCase().includes(q)) return false;
          return true;
        });
        content = h('div', null,
          h('div', { className: 'wsb-card' },
            h('div', { className: 'wsb-formrow', style: { marginTop: 0 } },
              h('label', { className: 'wsb-field', style: { marginBottom: 0, flex: '1 1 140px' } },
                h('span', null, tr('searchPlaceholder')),
                h('input', {
                  className: 'wsb-input', value: query,
                  placeholder: tr('searchPlaceholder'),
                  onChange: (e) => setQuery(e.target.value),
                }),
              ),
              h('label', { className: 'wsb-field', style: { marginBottom: 0 } },
                h('span', null, tr('filterReview')),
                h('select', { className: 'wsb-sel', value: filterReview, onChange: (e) => setFilterReview(e.target.value) },
                  h('option', { value: '' }, tr('allReviews')),
                  h('option', { value: 'draft' }, tr('reviewDraft')),
                  h('option', { value: 'pending' }, tr('reviewPending')),
                  h('option', { value: 'accepted' }, tr('reviewAccepted')),
                  h('option', { value: 'rejected' }, tr('reviewRejected')),
                ),
              ),
              h('label', { className: 'wsb-field', style: { marginBottom: 0 } },
                h('span', null, tr('filterPriority')),
                h('select', { className: 'wsb-sel', value: filterPriority, onChange: (e) => setFilterPriority(e.target.value) },
                  h('option', { value: '' }, tr('allPriorities')),
                  h('option', { value: 'HIGH' }, tr('priorityHigh')),
                  h('option', { value: 'MEDIUM' }, tr('priorityMedium')),
                  h('option', { value: 'LOW' }, tr('priorityLow')),
                ),
              ),
            ),
          ),
          loading ? h('div', { className: 'wsb-empty' }, tr('loading')) : null,
          loadError ? h(Note, { tone: 'err', title: tr('loadError', { msg: loadError }) }) : null,
          !loading && !loadError && !filtered.length
            ? h('div', { className: 'wsb-empty' }, tr('emptyTasks'))
            : null,
          h('div', { className: 'wsb-group' },
            filtered.map((t) => renderRow(t, t?.name))),
          h('section', { className: 'wsb-card', style: { marginTop: 12 } },
            h('div', { className: 'wsb-card-h' }, h('b', null, tr('orCapture'))),
            h('div', { className: 'wsb-formrow' },
              h('label', { className: 'wsb-field', style: { flex: '2 1 240px' } },
                h('span', null, tr('capturePlaceholder')),
                h('input', {
                  className: 'wsb-input', value: captureTitle,
                  placeholder: tr('capturePlaceholder'),
                  onChange: (e) => setCaptureTitle(e.target.value),
                }),
              ),
              h('label', { className: 'wsb-field', style: { flex: '0 1 120px' } },
                h('span', null, tr('capturePriority')),
                h('select', {
                  className: 'wsb-sel', value: capturePriority,
                  onChange: (e) => setCapturePriority(e.target.value),
                },
                  h('option', { value: 'HIGH' }, tr('priorityHigh')),
                  h('option', { value: 'MEDIUM' }, tr('priorityMedium')),
                  h('option', { value: 'LOW' }, tr('priorityLow')),
                ),
              ),
              h('label', { className: 'wsb-field', style: { flex: '0 1 150px' } },
                h('span', null, tr('captureDue')),
                h('input', {
                  className: 'wsb-input', type: 'date', value: captureDue,
                  onChange: (e) => setCaptureDue(e.target.value),
                }),
              ),
              h('div', { className: 'wsb-field', style: { flex: '0 0 auto', justifyContent: 'flex-end' } },
                h('span', null, '\u00a0'),
                h('button', {
                  className: 'wsb-btn', 'data-primary': '1',
                  disabled: captureBusy || !captureTitle.trim(),
                  onClick: doCapture,
                }, captureBusy ? h('span', { className: 'wsb-spin' }) : null, tr('captureBtn')),
              ),
            ),
            captureDup ? h('p', { className: 'wsb-hint' },
              tr('captureDupTip'), captureDup.map((d) => `「${d.title}」`).join(' ')) : null,
          ),
        );
      } else if (view === 'reports') {
        content = h('div', null,
          h('section', { className: 'wsb-card' },
            h('div', { className: 'wsb-card-h' }, h('b', null, tr('reportType'))),
            h('div', { className: 'wsb-actions', style: { marginTop: 4 } },
              h('button', {
                className: 'wsb-btn', 'data-primary': reportType === 'daily' ? '1' : '0',
                onClick: () => setReportType('daily'),
              }, tr('reportDaily')),
              h('button', {
                className: 'wsb-btn', 'data-primary': reportType === 'weekly' ? '1' : '0',
                onClick: () => setReportType('weekly'),
              }, tr('reportWeekly')),
            ),
            h('div', { className: 'wsb-formrow' },
              h('label', { className: 'wsb-field', style: { flex: '1 1 140px' } },
                h('span', null, tr('reportFrom')),
                h('input', { className: 'wsb-input', type: 'date', value: reportFrom, onChange: (e) => setReportFrom(e.target.value) }),
              ),
              h('label', { className: 'wsb-field', style: { flex: '1 1 140px' } },
                h('span', null, tr('reportTo')),
                h('input', { className: 'wsb-input', type: 'date', value: reportTo, onChange: (e) => setReportTo(e.target.value) }),
              ),
            ),
            h('label', { className: 'wsb-check' },
              h('input', {
                type: 'checkbox', checked: saveToNote,
                onChange: (e) => setSaveToNote(e.target.checked),
              }),
              tr('reportSaveToNote'),
            ),
            h('div', { className: 'wsb-actions' },
              h('button', {
                className: 'wsb-btn', 'data-primary': '1',
                disabled: reportBusy || !connected, onClick: doReport,
              }, reportBusy ? h('span', { className: 'wsb-spin' }) : h(Icon, { d: ICONS.reports, size: 13 }),
                reportBusy ? tr('reportGenerating') : tr('reportGenerate')),
            ),
            !connected ? h('p', { className: 'wsb-hint', style: { marginTop: 8 } }, tr('needBind')) : null,
          ),
          h('section', { className: 'wsb-card' },
            h('div', { className: 'wsb-card-h' }, h('b', null, tr('reportPreview'))),
            reportMd
              ? h('pre', { className: 'wsb-md' }, reportMd)
              : h('div', { className: 'wsb-empty' }, tr('reportEmpty')),
          ),
        );
      } else {
        const counts = status?.counts || {};
        const anyData = ['todo', 'project', 'note'].some((k) => (counts[k]?.total ?? 0) > 0);
        const conflicts = status?.pendingConflicts || [];
        const errors = status?.pendingErrors || [];
        content = h('div', null,
          status?.pullMode === 'snapshot'
            ? h(Note, { tone: 'warn', title: tr('snapshot'), detail: tr('snapshotHint') })
            : null,
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
                disabled: bindBusy || syncBusy || !origin.trim() || (!token.trim() && !connected), onClick: doBind,
              }, bindBusy ? h('span', { className: 'wsb-spin' }) : h(Icon, { d: ICONS.link }),
                bindBusy ? tr('binding') : tr('bind')),
              h('button', {
                className: 'wsb-btn', disabled: syncBusy || bindBusy || !connected, onClick: doSync,
              }, syncBusy ? h('span', { className: 'wsb-spin' }) : h(Icon, { d: ICONS.sync }),
                syncBusy ? tr('syncing') : tr('sync')),
              h('button', {
                className: 'wsb-btn', disabled: syncBusy || bindBusy, onClick: refreshAll,
                title: tr('refresh'),
              }, h(Icon, { d: ICONS.refresh, size: 13 }), tr('refresh')),
            ),
          ),
          h('section', { className: 'wsb-card' },
            h('div', { className: 'wsb-card-h' },
              h('b', null, tr('autoSync')),
              h('span', { className: 'wsb-pill', 'data-on': autoEnabled ? '1' : '0' },
                h('i'), autoEnabled ? tr('autoOn') : tr('autoOff')),
            ),
            h('p', { className: 'wsb-hint' }, tr('autoSyncHint')),
            h('div', { className: 'wsb-actions' },
              h('button', {
                className: 'wsb-btn', 'data-primary': autoEnabled ? '0' : '1',
                disabled: autoBusy,
                onClick: () => saveAuto(!autoEnabled, autoInterval),
              }, autoEnabled ? tr('autoOff') : tr('autoOn')),
              h('label', { className: 'wsb-field', style: { flex: 1, maxWidth: 170, marginBottom: 0 } },
                h('span', null, tr('autoInterval')),
                h('input', {
                  className: 'wsb-input', type: 'number', min: 30,
                  value: autoInterval,
                  onChange: (e) => setAutoInterval(e.target.value),
                  disabled: autoBusy,
                }),
              ),
              h('button', {
                className: 'wsb-btn', disabled: autoBusy, onClick: () => saveAuto(autoEnabled, autoInterval),
              }, tr('refresh')),
            ),
            h('p', { className: 'wsb-hint', style: { marginTop: 8 } }, tr('autoMinHint')),
          ),
          h('section', null,
            h('div', { className: 'wsb-card-h' }, h('b', null, tr('mirror'))),
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
          conflicts.length
            ? h('div', { style: { marginTop: 12 } },
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
        );
      }

      return h('div', { className: 'wsb-panel' },
        h('style', null, STYLE),
        h('div', { className: 'wsb-shell' },
          h('nav', { className: 'wsb-rail', 'aria-label': tr('title') },
            navItems.map((n) => h('button', {
              key: n.key, className: 'wsb-nav', 'data-active': view === n.key ? '1' : '0',
              onClick: () => setView(n.key),
            },
              h(Icon, { d: n.icon, size: 15 }), n.label,
            )),
          ),
          h('main', { className: 'wsb-main' },
            h('header', { className: 'wsb-mainhead' },
              h('span', { className: 'wsb-mark' }, h(Icon, { d: ICONS.link, size: 19 })),
              h('div', null,
                h('h2', null, head[0]),
                h('p', null, head[1]),
              ),
              h('span', { className: 'wsb-pill', 'data-on': connected ? '1' : '0' },
                h('i'), connected ? tr('connected') : tr('disconnected')),
              h('button', {
                className: 'wsb-iconbtn', onClick: refreshAll,
                title: tr('refresh'), 'aria-label': tr('refresh'),
              }, h(Icon, { d: ICONS.refresh, size: 14 })),
            ),
            content,
          ),
        ),
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
        inject: ['slots', 'locale'],
        apply(ctx) {
          wireLocale(ctx);
          const disposers = [];
          const offIcon = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 40, locale: NS, label: tr('title') }, Icon));
          if (typeof offIcon === 'function') disposers.push(offIcon);
          const offPanel = ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel));
          if (typeof offPanel === 'function') disposers.push(offPanel);
          ctx.effect(() => () => { for (const off of disposers) off(); }, 'bridge.slots');
        },
      };
    },
  });
})();
