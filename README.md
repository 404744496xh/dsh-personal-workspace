# dsh-personal-workspace

一个 agent 优先的 DeepSeek Harness 插件：把待办 / 项目 / 笔记与个人 Halo 站点上的
`personal-workspace` 插件双向同步。

- **权威源**：Halo 个人工作台（远程）。
- **本地**：DSH 里的 SQLite 镜像（`~/.dsh/workspace-bridge/mirror.db`），可离线读写。
- **Agent 一等公民**：8 个 `bridge_*` 工具，读写都走同一个 Host service，与 UI 共用入口。
- **同步协议**：Halo 侧 `/changes?since=&limit=` 增量拉取（软删墓碑）；本地脏行推送回
  Halo REST；远端与本地同时改动时保留本地并记录冲突。

## 安装

在工作区编辑好本包后，通过 DSH 插件管理安装（需 `danger-full-access` 权限）：

```
plugin_manager(action="install_bundle", target="D:/qt/halo/plugins/dsh-personal-workspace")
```

安装后重启 DSH Web 并硬刷新页面（Ctrl+Shift+R）。

## 使用

1. 在 Halo 个人工作台创建 PAT（Bearer 令牌）。
2. 对 agent 说「用 bridge_bind 绑定站点 https://… 和令牌 …」，或在桥接面板里填写。
   站点地址与 PAT 一起存在 DSH 凭据库（`dsh-workspace-bridge/halo`），不会写入配置或日志。
3. `bridge_sync` 拉取远端增量并推送本地改动。日常读写可直接用：
   - 读：`bridge_status` / `bridge_list` / `bridge_get`
   - 写：`bridge_create` / `bridge_update` / `bridge_delete`
4. 删除是墓碑语义：本地先标记，下次 `bridge_sync` 才真正从 Halo 删除，执行前先向用户确认。

## 数据结构

镜像表 `mirror(kind, name, payload, updated_at, rev, dirty, tombstone)`，
`kind` 为 `todo` / `project` / `note`；`sync_state` 保存拉取游标。
`payload` 为 Halo View DTO 的 JSON（TodoView / ProjectView / NoteView）。

## 契约

- Halo 侧增量端点：`GET /apis/api.workspace.halo.run/v1alpha1/changes?since=<long>&limit=<int>`
  返回 `{ cursor, oldestSeq, hasMore, changes: [{ seq, kind, name, deleted, updatedAt, payload }] }`。
- 本地占位名：`local-<时间戳36>-<随机>`，推送成功后由 Halo 返回的 `name` 替换。

## 开发约定

- 所有写操作只在 `lib/service.js`，UI 路由与 agent 工具都委托它（一个操作两个调用方）。
- 凭据只走 `ctx.credentials`，不放配置、不进日志。
- 数据库打不开（如由更新版本创建）时只注册系统提示告警，不注册路由/工具，避免拖死宿主。

详见 `docs/DETAIL.md`。
