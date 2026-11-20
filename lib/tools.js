/**
 * Agent tools for dsh-personal-workspace.
 *
 * Every tool delegates to WorkspaceBridgeService — the same Host methods the
 * UI routes call — so a write can never skip dirty-marking. Tool descriptions
 * stay short (dsh-doc tool-design.md); the full convention lives in the
 * system-prompt section, not in parameter descriptions.
 */
import { defineTool } from '@deepseek-ai/dsh-tools';

const KIND_ENUM = ['todo', 'project', 'note'];

function ok(value) {
  return { ok: true, result: value };
}
function fail(message) {
  return { ok: false, error: String(message) };
}

/** Safely run a service call, turning throws into readable Chinese errors. */
async function call(fn) {
  try {
    return ok(await fn());
  } catch (error) {
    return fail(error instanceof Error ? error.message : error);
  }
}

function textOutput() {
  return {
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        // Author DSL: `type: 'json'` = annotation-only, unconstrained value.
        result: { type: 'json' },
        error: { type: 'string' },
      },
      additionalProperties: false,
    },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };
}

const kindParam = {
  type: 'string', enum: KIND_ENUM, required: true,
  description: '数据类型：todo=待办，project=项目，note=笔记',
};

export function bridgeBindTool(service) {
  return defineTool({
    name: 'bridge_bind',
    description: '绑定 Halo 个人工作台站点地址与访问令牌（PAT）。令牌只存凭据库，不写入配置或日志。',
    parameters: {
      origin: { type: 'string', required: true, description: 'Halo 站点根地址，如 https://www.xiahan.asia' },
      token: { type: 'string', required: true, description: 'Halo 个人访问令牌 PAT（Bearer）' },
    },
    output: textOutput(),
    async execute(args) {
      const bound = await service.bind(args.origin, args.token);
      return call(() => service.tokenInfo().then((info) => ({ ...bound, ...info })));
    },
  });
}

export function bridgeStatusTool(service) {
  return defineTool({
    name: 'bridge_status',
    description: '查看桥接状态：站点地址、同步游标、各类型条数与待推送/冲突数量。',
    parameters: {},
    output: textOutput(),
    async execute() { return call(() => service.status()); },
  });
}

export function bridgeSyncTool(service) {
  return defineTool({
    name: 'bridge_sync',
    description: '与 Halo 双向同步：先拉取远端增量，再推送本地改动。返回拉取数、推送数、冲突与错误。',
    parameters: {
      limit: { type: 'number', description: '每页拉取条数，默认 200，上限 500' },
    },
    output: textOutput(),
    async execute(args) {
      const limit = Math.min(500, Math.max(1, Number(args.limit) || 200));
      return call(() => service.sync({ limit }));
    },
  });
}

export function bridgeListTool(service) {
  return defineTool({
    name: 'bridge_list',
    description: '列出本地镜像中的待办/项目/笔记（来自最近一次同步）。需要最新数据请先 bridge_sync。',
    parameters: {
      kind: kindParam,
    },
    output: textOutput(),
    async execute(args) { return call(() => service.list(args.kind)); },
  });
}

export function bridgeGetTool(service) {
  return defineTool({
    name: 'bridge_get',
    description: '按名称读取单条待办/项目/笔记的镜像内容。',
    parameters: {
      kind: kindParam,
      name: { type: 'string', required: true, description: '条目名称（Halo metadata.name）' },
    },
    output: textOutput(),
    async execute(args) {
      return call(() => {
        const row = service.get(args.kind, args.name);
        if (!row)
          throw new Error(`未找到 ${args.kind} ${args.name}`);
        return row;
      });
    },
  });
}

export function bridgeCreateTool(service) {
  return defineTool({
    name: 'bridge_create',
    description: '新建待办/项目/笔记到本地镜像并标记待推送，同步后写入 Halo。字段按类型填写。',
    parameters: {
      kind: kindParam,
      payload: { type: 'object', additionalProperties: true, required: true, description: '条目内容对象，字段同 Halo（title/detail/priority 等）' },
    },
    output: textOutput(),
    async execute(args) { return call(() => service.create(args.kind, args.payload)); },
  });
}

export function bridgeUpdateTool(service) {
  return defineTool({
    name: 'bridge_update',
    description: '更新本地镜像中的待办/项目/笔记（仅覆盖传入字段），标记待推送。',
    parameters: {
      kind: kindParam,
      name: { type: 'string', required: true, description: '条目名称' },
      patch: { type: 'object', additionalProperties: true, required: true, description: '要更新的字段对象' },
    },
    output: textOutput(),
    async execute(args) { return call(() => service.update(args.kind, args.name, args.patch)); },
  });
}

export function bridgeDeleteTool(service) {
  return defineTool({
    name: 'bridge_delete',
    description: '删除本地镜像中的待办/项目/笔记（墓碑），下次同步时从 Halo 删除。',
    parameters: {
      kind: kindParam,
      name: { type: 'string', required: true, description: '条目名称' },
    },
    output: textOutput(),
    async execute(args) { return call(() => service.remove(args.kind, args.name)); },
  });
}

export function bridgeAutoSyncTool(service) {
  return defineTool({
    name: 'bridge_auto_sync',
    description: '配置定时自动双向同步（默认关闭）。开启后按间隔自动 pull+push，配置持久化，重启后继续生效。',
    parameters: {
      enabled: { type: 'boolean', description: 'true=开启自动同步，false=关闭' },
      intervalSec: { type: 'number', description: '同步间隔秒数，最小 30，默认 120' },
    },
    output: textOutput(),
    async execute(args) {
      return call(() => service.setAutoSync({
        enabled: args.enabled,
        intervalSec: args.intervalSec,
      }));
    },
  });
}

export function allBridgeTools(service) {
  return [
    bridgeBindTool(service),
    bridgeStatusTool(service),
    bridgeSyncTool(service),
    bridgeAutoSyncTool(service),
    bridgeListTool(service),
    bridgeGetTool(service),
    bridgeCreateTool(service),
    bridgeUpdateTool(service),
    bridgeDeleteTool(service),
  ];
}

export const BRIDGE_GUIDANCE = [
  '## 个人工作台（dsh-personal-workspace）',
  '本机已安装个人工作台插件，把待办/项目/笔记与个人 Halo 工作台双向同步。Halo 是权威数据源，本地 SQLite 是可离线读写的镜像。',
  '可用工具：`bridge_bind`（绑定站点与 PAT，令牌只进凭据库）、`bridge_status`（同步状态）、`bridge_sync`（双向同步）、`bridge_auto_sync`（开启/关闭定时自动同步并设置间隔，默认关闭）、`bridge_list`/`bridge_get`（读镜像）、`bridge_create`/`bridge_update`/`bridge_delete`（写镜像并标记待推送）。',
  '使用约定：',
  '- 需要最新数据先 `bridge_sync`；写入先落本地镜像，用户确认后再同步推送到 Halo（或开启自动同步后定时推送）。',
  '- `kind` 只会是 todo / project / note 之一；优先级用 HIGH/MEDIUM/LOW，项目状态用 NOT_STARTED/DEV/TEST/RELEASED/ACCEPTED。',
  '- 删除是墓碑语义：本地先标记，同步时才真正从 Halo 删除；删除属授权操作，执行前先向用户确认。',
  '- 未绑定站点时任何读写工具都会给出清晰中文提示，先引导用户用 `bridge_bind` 绑定。',
  '- 远端与本地同一条目都被改动时以本地为准（keepLocal），冲突明细见 `bridge_sync` 返回的 conflicts。',
].join('\n');
