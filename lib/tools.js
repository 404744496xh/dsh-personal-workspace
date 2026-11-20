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

/** The agent loop passes its Agent in exec.agent; Agent.id === session id. */
function sessionIdOf(exec) {
  return exec?.agent?.id ?? undefined;
}

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

// ------------------------------------------------------------ task execution
// The DSH-native value-add: an agent can plan/execute steps with evidence, but
// it can NEVER mark a task complete — only a human can (via the UI review
// button). Tools below are all agent-safe; `bridge_task_review` is deliberately
// NOT registered as a tool (see index.js loopback route).

export function bridgeTaskTodayTool(service) {
  return defineTool({
    name: 'bridge_task_today',
    description: '查看今日工作台：逾期/今日/稍后/推迟任务分组与统计，以及智能排序的当日计划。',
    parameters: {},
    output: textOutput(),
    async execute() { return call(() => service.taskToday()); },
  });
}

export function bridgeTaskPlanTool(service) {
  return defineTool({
    name: 'bridge_task_plan',
    description: '为待办拆分编号步骤计划（重新规划会重置验收状态）。',
    parameters: {
      name: { type: 'string', required: true, description: '待办名称' },
      goal: { type: 'string', description: '任务目标' },
      steps: { type: 'array', items: { type: 'string' }, required: true, description: '编号步骤文本数组' },
    },
    output: textOutput(),
    async execute(args) { return call(() => service.taskPlan(args.name, args.goal, args.steps)); },
  });
}

export function bridgeTaskStepTool(service) {
  return defineTool({
    name: 'bridge_task_step',
    description: '推进某个步骤的状态并附证据（原话引用或产物引用）。可绑定当前会话 id。',
    parameters: {
      name: { type: 'string', required: true, description: '待办名称' },
      index: { type: 'number', required: true, description: '步骤序号（从 1 开始）' },
      status: { type: 'string', enum: ['todo', 'doing', 'done'], required: true, description: '步骤状态' },
      evidence: { type: 'string', description: '证据：原话引用或产物引用' },
      sessionId: { type: 'string', description: '绑定的会话 id（可选）' },
    },
    output: textOutput(),
    async execute(args, exec) {
      return call(() => service.taskStep(args.name, {
        index: args.index, status: args.status, evidence: args.evidence,
        sessionId: args.sessionId ?? sessionIdOf(exec),
      }));
    },
  });
}

export function bridgeTaskSubmitTool(service) {
  return defineTool({
    name: 'bridge_task_submit',
    description: '所有步骤完成后提交人工验收。提交不等于完成，需用户通过后才算完成。',
    parameters: {
      name: { type: 'string', required: true, description: '待办名称' },
      note: { type: 'string', description: '给验收人的说明' },
    },
    output: textOutput(),
    async execute(args) { return call(() => service.taskSubmit(args.name, args.note)); },
  });
}

export function bridgeTaskFlagsTool(service) {
  return defineTool({
    name: 'bridge_task_flags',
    description: '设置稍后(someday)标记或配额(must/should/could)，影响智能排序。',
    parameters: {
      name: { type: 'string', required: true, description: '待办名称' },
      someday: { type: 'boolean', description: 'true=推迟到稍后' },
      quota: { type: 'string', enum: ['must', 'should', 'could'], description: '配额等级' },
    },
    output: textOutput(),
    async execute(args) { return call(() => service.taskFlags(args.name, { someday: args.someday, quota: args.quota })); },
  });
}

export function bridgeTaskBindTool(service) {
  return defineTool({
    name: 'bridge_task_bind',
    description: '把待办绑定到当前会话并可选保存会话输出 tail，便于回读。',
    parameters: {
      name: { type: 'string', required: true, description: '待办名称' },
      sessionId: { type: 'string', required: true, description: '会话 id' },
      tail: { type: 'string', description: '会话输出摘要（可选）' },
    },
    output: textOutput(),
    async execute(args, exec) {
      const sid = args.sessionId ?? sessionIdOf(exec);
      if (!sid)
        return fail('无法取得会话 id（当前工具调用没有 agent 上下文），请显式传 sessionId');
      return call(() => service.taskBind(args.name, sid, args.tail));
    },
  });
}

export function bridgeTaskTailTool(service) {
  return defineTool({
    name: 'bridge_task_tail',
    description: '回读已绑定会话的输出 tail（需要宿主提供 sessionQuery 服务）。',
    parameters: {
      name: { type: 'string', required: true, description: '待办名称' },
      limit: { type: 'number', description: '回读条数，默认 30，上限 200' },
    },
    output: textOutput(),
    async execute(args) { return call(() => service.taskSessionTail(args.name, args.limit)); },
  });
}

export function bridgeTaskReportTool(service) {
  return defineTool({
    name: 'bridge_task_report',
    description: '生成日报/周报 Markdown，可选存为 Halo 笔记。',
    parameters: {
      type: { type: 'string', enum: ['daily', 'weekly'], description: '日报= daily，周报= weekly' },
      from: { type: 'string', description: '起始日期 yyyy-MM-dd' },
      to: { type: 'string', description: '结束日期 yyyy-MM-dd' },
      saveAsNote: { type: 'boolean', description: 'true=同时存为 Halo 笔记' },
    },
    output: textOutput(),
    async execute(args) {
      return call(() => service.taskReport({
        type: args.type, from: args.from, to: args.to, saveAsNote: args.saveAsNote,
      }));
    },
  });
}

export function bridgeTaskCaptureTool(service) {
  return defineTool({
    name: 'bridge_task_capture',
    description: '快速捕获待办并做近似标题去重（72 小时内相似度≥0.8 会提示重复）。',
    parameters: {
      title: { type: 'string', required: true, description: '待办标题' },
      detail: { type: 'string', description: '详情' },
      priority: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'], description: '优先级' },
      dueDate: { type: 'string', description: '截止日期 yyyy-MM-dd' },
    },
    output: textOutput(),
    async execute(args) {
      return call(() => service.taskCapture(args.title, {
        detail: args.detail, priority: args.priority, dueDate: args.dueDate,
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
    bridgeTaskTodayTool(service),
    bridgeTaskPlanTool(service),
    bridgeTaskStepTool(service),
    bridgeTaskSubmitTool(service),
    bridgeTaskFlagsTool(service),
    bridgeTaskBindTool(service),
    bridgeTaskTailTool(service),
    bridgeTaskReportTool(service),
    bridgeTaskCaptureTool(service),
  ];
}

export const BRIDGE_GUIDANCE = [
  '## 个人工作台（dsh-personal-workspace）',
  '本机已安装个人工作台插件：既与个人 Halo 工作台双向同步待办/项目/笔记，也是你在会话内执行任务的工作台。Halo 是数据权威源，本地 SQLite 是可离线读写的镜像 + 执行状态库。',
  '数据工具：`bridge_bind`（绑定站点与 PAT，令牌只进凭据库）、`bridge_status`、`bridge_sync`（双向 pull+push）、`bridge_auto_sync`（定时自动同步，默认关闭）、`bridge_list`/`bridge_get`（读镜像）、`bridge_create`/`bridge_update`/`bridge_delete`（写镜像并标记待推送）。',
  '执行闭环工具：`bridge_task_today`（今日分组+统计+智能排序）、`bridge_task_plan`（拆编号步骤）、`bridge_task_step`（推进步骤并附 evidence，可绑会话）、`bridge_task_submit`（提交人工验收）、`bridge_task_flags`（稍后/配额）、`bridge_task_bind`/`bridge_task_tail`（绑定并回读会话）、`bridge_task_report`（日报/周报）、`bridge_task_capture`（快速捕获+去重）。',
  '数据约定：',
  '- 需要最新数据先 `bridge_sync`；写入先落本地镜像，用户确认后再同步推送到 Halo（或开启自动同步后定时推送）。',
  '- `kind` 只会是 todo / project / note 之一；优先级用 HIGH/MEDIUM/LOW，项目状态用 NOT_STARTED/DEV/TEST/RELEASED/ACCEPTED。',
  '- 删除是墓碑语义：本地先标记，同步时才真正从 Halo 删除；删除属授权操作，执行前先向用户确认。',
  '- 未绑定站点时任何读写工具都会给出清晰中文提示，先引导用户用 `bridge_bind` 绑定。',
  '- 远端与本地同一条目都被改动时以本地为准（keepLocal），冲突明细见 `bridge_sync` 返回的 conflicts。',
  '执行闭环约定（最重要，务必遵守）：',
  '- 接到任务先用 `bridge_task_today` 看全局，再对具体待办用 `bridge_task_plan` 拆成编号步骤。',
  '- 每完成一步用 `bridge_task_step` 更新状态并附 evidence（用户原话引用或产物引用），不要用 bridge_update 直接改 completed。',
  '- 全部步骤完成后用 `bridge_task_submit` 提交验收。**你永远不能自己把任务标记为完成**——通过/打回只能由用户在面板上人工点，这是硬性安全边界。',
  '- 会话关联：可用 `bridge_task_bind` 把待办绑到会话 id（exec.agent?.id），用 `bridge_task_tail` 回读输出。',
  '- 收尾可问用户是否需要 `bridge_task_report` 生成日报/周报。',
].join('\n');
