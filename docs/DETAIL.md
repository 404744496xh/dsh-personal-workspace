# DETAIL — dsh-personal-workspace

## 目标

以用户自研的 Halo `personal-workspace` 为权威源，提供一个 DSH 插件，让 agent 把
待办 / 项目 / 笔记当作一等公民操作，并与 Halo 双向同步。这是单纯使用
`@dely0/dsh-personal-workbench`（数据只在本机 `~/.dsh/workbench/workbench.db`，无同步）
所不能覆盖的场景。

## 架构

```
   agent (bridge_* tools) ─┐
                           ├─> WorkspaceBridgeService ──> SQLite mirror (本地)
   UI (shell.overlay panel)┘              │                     │
                                          │ pull / push         │ dirty 标记
                                          v                     v
                              HaloClient ──REST/PAT──> Halo personal-workspace
                                                       (权威源 + /changes 增量)
```

- **Host 半（index.js）**：打开 SQLite，注册 8 个工具、`/api/bridge/*` loopback 路由、
  系统提示段落；所有资源用 `ctx.effect` 管理并返 cleanup。DB 打不开时走 `applyDegraded`
  （只提示，不注册功能）。
- **Client 半（client.js）**：`window.__ModuleLoader__.load` 注册 React 组件，挂到
  `shell.overlay`，通过 loopback 路由调 Host service；文案走 locale 服务。
- **service.js**：唯一的写入口（dsh-doc「一个操作两个调用方」）。`create/update/remove`
  只写镜像并标脏；`sync()` 先 pull 后 push。
- **db.js**：`node:sqlite` 的 `DatabaseSync`，零原生依赖；`user_version` 迁移，
  高于支持版本抛 `SchemaTooNewError` 触发降级。
- **halo-client.js**：`fetch` + PAT，15s 超时，DELETE 带 `?confirm=true`。

## 同步语义

1. **Pull**：按 `since=cursor` 分页取 `/changes`，逐条跳过本地 dirty 行（记
   `keepLocal` 冲突），其余 `applyRemoteChange`（deleted 写墓碑，普通写 payload 并清脏、
   推进 rev=seq），最后推进 cursor。
2. **Push**：遍历 dirty 行；`local-` 前缀走 create（成功后按 Halo 返回的 name 改名），
   墓碑走 DELETE，其余走 update；失败记入 errors 但不中断其余行。
3. **冲突**：远端变更撞上本地 dirty → 保留本地，冲突明细在 `bridge_sync` 返回值。
4. **删除**：本地墓碑 → 同步时 Halo 硬删（Halo 侧墓碑仅由同步日志承担）→ 成功后
   从镜像删除该行。

## 凭据

站点地址与 PAT 一起存在凭据记录 `dsh-workspace-bridge/halo`（grant payload
`{token, origin}`）。这样绑定是一次原子操作，不需要改写 `cordis.patch.yml` 或插件配置；
`status()` 展示的是当前生效的 origin（绑定值优先于 config 默认值）。

## 端到端联调（已完成 2026-11-20）

- `test/apply.mjs`：mock cordis ctx 直接跑 `apply()`，确认 8 工具 + 5 路由 + 系统提示
  段落均注册，空配置不会误入降级模式。曾在此发现并修复：`applyReady` 里用空 origin
  构造 `HaloClient` 会抛错进降级，导致所有工具静默不注册；已改为完全惰性构造。
- `test/integration.mjs`：mock Halo 实现 `/changes` 契约，跑通 pull 三类数据 → 本地
  增改删 → push（local- 改名、墓碑裁剪）→ 冲突 keepLocal → 稳态空转。
- Halo 侧：`personal-workspace-0.6.146.jar` 升级到本地 8093，用 alice 会话跑
  `D:/qt/halo-test/p0-rig/verify-changes-endpoint.mjs` 实测 `/changes`：三类 create、
  update、软删墓碑、分页 hasMore、400 校验全部通过，测试数据已清理。
- 真实端到端：`D:/qt/halo-test/p0-rig/e2e-bridge.mjs` 用真实 `HaloClient` +
  `WorkspaceBridgeService` 打本地 8093（会话 cookie 鉴权），跑通绑定→初始拉取→
  三类新建推送→Halo 侧 GET 验证→更新推送→删除墓碑推送与本地裁剪，测试数据已清理。
- 已发现并修复的真实 bug：
  ① `PRAGMA user_version = ?` 不支持绑定参数，改为内联常量；
  ② 空 config 下 `new HaloClient({origin:''})` 抛错导致 apply 降级；
  ③ `export const inject = []` 未声明核心服务——cordis v4 的 Proxy 对未声明 inject
  的服务访问会抛 `cannot get property "..." without inject`，导致 `applyReady` 与
  `applyDegraded` 的首句 `ctx.systemPrompt.section(...)` 双双抛错，整个 apply 失败，
  0 工具 0 路由（用户重启后「什么都没有」的真正根因）。已改为
  `inject = ['webServer','systemPrompt','tools']`；credentials 仍在 service 内用
  `ctx.get()` 软探测，不进 inject。
   ④ 客户端 UI 只注册到 `shell.overlay` 且无入口/定位/显隐，等于挂上了但看不见。
   改为按官方 slot 契约注册 `sidebar.panellist`（侧栏图标入口，内联 SVG，避免引用
   私有包 `@deepseek-ai/dsh-client-ui-primitives`）+ `main`（keyed slot，key 与入口
   id 均为 `dsh-personal-workspace`），由宿主把点击连到面板。
   ⑤ `wireLocale`/`tr` 原本定义在 `panel(React)` 内部，却被 `apply(ctx)`（侧栏 label）
   调用 → `ReferenceError: wireLocale is not defined`，apply 抛错使整个 client 注册
   失效（`node --check` 抓不到，因为是运行时作用域错误）。已提升到 IIFE 顶层作用域，
   并新增 `test/client.mjs`（mock `__ModuleLoader__` 真正调用 factory + apply）守住。
- 注册验证：`D:/qt/halo/plugins/dsh-personal-workspace/test/apply-real-ctx.mjs` 用真实
  cordis Context 加载插件，断言 8 工具 / 5 路由 / 1 系统提示段均注册成功，
  dispose 后全部清空；`test/client.mjs` 用 mock `__ModuleLoader__` 真正调用 client
  factory + apply，断言 `sidebar.panellist` + `main` 注册且 apply 不抛错；
  `test/apply.mjs`、`test/integration.mjs` 回归全绿。
    ⑥ 冷启动空镜像：生产升级 0.6.146 后 `/changes` 恢复 200，但日志表是新建的，
    41 条历史数据没有变更日志 → `/changes` 返回空；bridge 原本只在 403/404 时回退快照，
    200 空源拉不到任何历史数据 → 镜像永远空「拉取 0 条」。已改为首次同步（镜像为空）主动
    bootstrap 全量列表，并用一次 `/changes` 探测区分模式：健康源报 `bootstrap`、老站点报
    `snapshot`+升级提示；建好 cursor 后转增量。`test/bootstrap.mjs` 守住。
     ⑦ 绑定状态重启即丢：凭据其实已完整持久化在 `~/.dsh/.credentials.yaml` 的
     `dsh-workspace-bridge/halo` grant 记录（token + origin），但 `status()` 只读内存里的
     `boundClient`（`bind()` 时才有，重启即空），而 `config.haloOrigin` 从没设置 → 重启后
     `status().origin=null`，UI 显示「未绑定」并禁用同步，逼用户重粘 PAT，尽管 `sync()`
     走 `client()→_storedCredential()` 本可用持久凭据。已修复：`status()` 改为 async，
     从 `_storedCredential()` 读持久化 origin + `bound:true`（只回布尔，绝不回传 token）；
     UI 的 `connected` 改用 `status.bound`，token 框留空且已绑定时允许只改地址——新增
     `service.bindOrigin()`（沿用已存 token），`/api/bridge/bind` 在 token 留空时走它。
     `test/persist-binding.mjs` 模拟重启（新 service + 同一凭据库 + 无内存 boundClient）
     守住 bound/origin 恢复、token 不泄露、仅改地址复用令牌。

## /changes 403 → 全量快照回退（2026-11-20）

- 用户实测 `Halo GET /changes?since=0&limit=200 failed (403): 403`。只读探测定位：
  生产站点 `/todos /projects /notes` 全 200，唯 `/changes` 403，`WWW-Authenticate:
  Bearer error="insufficient_scope"`——Halo Spring Security RBAC 层拒绝（资源
  `changes` 未被已部署角色模板识别），handler 根本没到。生产插件 `spec.version`
  仍是 **0.6.145**，`/changes` 端点与 RBAC `changes` 资源是 0.6.146 才加的（已构建、
  已 commit、未部署生产）。**根治需上线 personal-workspace 0.6.146**（本次未部署）。
- 为让 bridge 在 0.6.145 上今天就能用，实现全版本可用的**全量快照回退**：
  - `halo-client.js` 新增 `listTodos/listProjects/listNotes`；
  - `service.js` 的 `sync()` 在 pull 抛「/changes + 403/404」时切到
    `pullSnapshot()`：todo 分页拉全量、project/note 整数组，按 kind reconcile，
    dirty 行跳过（keepLocal），远端已删的 clean 行 prune；结果 `status()` / `bridge_sync`
    带 `pullMode='snapshot'` 与一条「需升级 0.6.146」提示；
  - `client.js` 在 snapshot 模式顶部显示醒目提示条。
- 验证：`test/snapshot.mjs`（mock 403 + 全量列表，断言回退/保脏/远端删裁剪/
  pullMode）全绿；并对真实生产站点只读实测——snapshot 拉到 41 条（39 待办/1 项目/
  1 笔记），0 推送（本地无脏行），升级提示正确。
- 仍需用户在**再次重启 DSH Web 并 Ctrl+Shift+R 硬刷新**后，于实际会话中确认：
  左侧栏出现「个人工作台」图标、点开有面板、`bridge_*` 工具出现、`bridge_bind`
  绑定真实站点 PAT（agent 不可代劳：宿主进程 PID 54884 需用户自行重启，inject
  与 client UI 修复的 mtime 均晚于该进程启动时间）。已确认安装 symlink 下
  `index.js` 与 `client.js` 都是修复后的代码，client 模块 id
  `@local/dsh-personal-workspace` 与 boot graph 条目 id 一致（均由 package.json
  name 派生，非 UI 不显示的原因）。

## 已知边界

- 未做自动定时同步（V1 手动 `bridge_sync`）。
- UI 是最简面板（绑定/状态/同步），详细列表与编辑仍以 agent 工具与 Halo 页面为主。
- 每页拉取上限 500，最多 20 页；超出需在后续 `bridge_sync` 继续。
- Halo 侧日志上限 2000 条，超出裁掉最旧 200 条；长期离线后游标落后于最旧日志时需
  全量重新拉取（快照回退机制已实现，见上节）。
- 快照回退是全量 reconcile，不是增量；站点升级 0.6.146 并刷新角色后 `/changes`
  恢复 200，下一轮 `sync()` 自动切回 `pullMode='incremental'`。
- 冷启动 bootstrap（`pullMode='bootstrap'`）：镜像为空时首次同步主动拉全量列表，
  这是为了让升级前就存在的历史记录进入镜像；之后 cursor 建好即转增量。
