# Clawdbot 接入前全量认知基线研究报告（Jarvis KB 适配前）

## 1. 研究范围与方法

- 研究对象：
  - Clawdbot 主仓：`/Users/muqihang/chelingxi_workspace/clawdbot`
  - Jarvis KB 对照仓：`/Users/muqihang/chelingxi_workspace/chelingxi-os`
- 任务边界：仅研究与设计，不做业务功能改造，不 push，不做 destructive git 操作。
- 证据方法：
  - 命令证据（CMD-\*）：见 `/Users/muqihang/chelingxi_workspace/clawdbot/analysis/2026-02-10-clawdbot-study-evidence-index.md`
  - 源码证据（CODE-\*）：同上。
- 核心原则：
  - 事实（可直接由命令/源码证明）
  - 推断（必须显式基于哪些事实）
  - 未知（说明未知原因和后续取证路径）

## 2. 基线环境与版本状态

- 工作目录：`/Users/muqihang/chelingxi_workspace/clawdbot`（CMD-01）
- 分支：`main`（CMD-02）
- HEAD：`53fd26a96086911e0b66ae3597884774d4ec5d92`（CMD-03）
- 工作区：仅存在未跟踪目录 `.opencode/`、`.sisyphus/`（CMD-04）
- worktree：主仓 + 1 个 detached worktree（CMD-05）
- superpowers bootstrap 与技能声明已执行（CMD-17, CMD-18）

## 3. 强制阅读上下文（四份历史深潜文档）

### 3.1 实际读取的四个文件（绝对路径）

1. `/Users/muqihang/chelingxi_workspace/clawdbot/analysis/openclaw-update-delta-2026-02-08.md`（CMD-33）
2. `/Users/muqihang/chelingxi_workspace/clawdbot/analysis/openclaw-codebase-product.md`（CMD-34）
3. `/Users/muqihang/chelingxi_workspace/clawdbot/analysis/openclaw-codebase-tech.md`（CMD-35）
4. `/Users/muqihang/chelingxi_workspace/clawdbot/analysis/openclaw-memory-deep-dive.md`（CMD-36）

### 3.2 逐份核对（每份：>=3 已验证 + >=2 不一致/待确认）

#### A) `openclaw-update-delta-2026-02-08.md`

- 已被源码验证
  1. `agents.create/update/delete` 已在 Gateway 方法清单和 handlers 实装（`/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server-methods-list.ts:35`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server-methods/agents.ts:185`, CODE-084~087, CMD-09/37）。
  2. QMD timeout/scope 配置存在（`/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/backend-config.ts:277`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/qmd-manager.ts:744`, CODE-040/057, CMD-10）。
  3. STATE_DIR 落盘语义存在于 identity/canvas（`/Users/muqihang/chelingxi_workspace/clawdbot/src/infra/device-identity.ts:20`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/canvas-host/server.ts:238`, CODE-090/091）。
- 文档与代码不一致/待确认
  1. 文档写 `main...upstream/main = 1 0`，当前为 `0 4`（`/Users/muqihang/chelingxi_workspace/clawdbot/analysis/openclaw-update-delta-2026-02-08.md:5`, CMD-28/29, CODE-120）。
  2. 文档写“差异 273 commits”，当前上游差异计数为 4（同上，CMD-29）。

#### B) `openclaw-codebase-product.md`

- 已被源码验证
  1. Gateway 作为 WS 控制平面成立（`/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server-runtime-state.ts:166`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server.impl.ts:472`, CODE-003/004, CMD-38）。
  2. Channels 侧存在 allowlist/mention gating（`/Users/muqihang/chelingxi_workspace/clawdbot/src/channels/dock.ts:57`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/channels/plugins/group-mentions.ts:127`, CMD-38 派生命中）。
  3. Agent 工具体系存在（browser/message/nodes/tts 等）（`/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/openclaw-tools.ts:22`, CODE-074）。
- 文档与代码不一致/待确认
  1. 文档第 9 节的增量快照仍写 273 commits（`/Users/muqihang/chelingxi_workspace/clawdbot/analysis/openclaw-codebase-product.md:239`），已被当前仓状态覆盖（CMD-29/32, CODE-123）。
  2. 文档几乎无源码锚点，自动扫描 refs=0，无法直接做“论断-源码”一跳回链（CMD-26）。

#### C) `openclaw-codebase-tech.md`

- 已被源码验证
  1. 核心模块分层（gateway/auto-reply/agents/config/channels）在仓内对应目录均存在（`/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/agents`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply`，CMD-35 + CODE-001~017）。
  2. 入站到回复主链可定位（`/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server-methods/chat.ts:318` -> `/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply/reply/agent-runner.ts:309`，CODE-009~015）。
  3. 记忆机制（session transcript + memory index）在源码完整存在（`/Users/muqihang/chelingxi_workspace/clawdbot/src/config/sessions/transcript.ts:78`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/manager.ts:170`, CODE-035/044）。
- 文档与代码不一致/待确认
  1. 版本快照写 `2026.2.3`，当前是 `2026.2.9`（`/Users/muqihang/chelingxi_workspace/clawdbot/analysis/openclaw-codebase-tech.md:7`, `/Users/muqihang/chelingxi_workspace/clawdbot/package.json:3`, CMD-07, CODE-117/118）。
  2. 文档包含 2 个占位路径（`apps/macos/.../GatewayModels.swift`、`apps/shared/.../GatewayModels.swift`）在当前仓不存在（CMD-26）。

#### D) `openclaw-memory-deep-dive.md`

- 已被源码验证
  1. memory slot 互斥 + 默认 `memory-core` 成立（`/Users/muqihang/chelingxi_workspace/clawdbot/src/plugins/slots.ts:16`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/plugins/slots.ts:37`, CODE-067/068）。
  2. `memory_search/memory_get` + system prompt recall gating 成立（`/Users/muqihang/chelingxi_workspace/clawdbot/extensions/memory-core/index.ts:4`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/system-prompt.ts:48`, CODE-061/064）。
  3. qmd -> builtin fallback 成立（`/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/search-manager.ts:85`, CODE-043, CMD-39）。
- 文档与代码不一致/待确认
  1. 版本写 `2026.2.3`，当前 `2026.2.9`（`/Users/muqihang/chelingxi_workspace/clawdbot/analysis/openclaw-memory-deep-dive.md:7`, `/Users/muqihang/chelingxi_workspace/clawdbot/package.json:3`, CMD-07, CODE-119/117）。
  2. 文档锚点 `qmd-manager.ts:602` 已漂移，当前 scope 判定在 744+（`/Users/muqihang/chelingxi_workspace/clawdbot/analysis/openclaw-memory-deep-dive.md:445`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/qmd-manager.ts:744`, CMD-30, CODE-121/122）。

## 4. 必答研究问题（19 题，固定模板）

### A1

1. 问题编号与原文  
   A1) Clawdbot 的主入口在哪里？初始化顺序是什么？
2. 事实

- CLI 顶层入口是 `/Users/muqihang/chelingxi_workspace/clawdbot/src/entry.ts:146`，先做 argv/profile 预处理，再 `import("./cli/run-main.js")`（CODE-001）。
- `runCli` 顺序是 `loadDotEnv -> normalizeEnv -> runtime guard -> route CLI -> build program -> parse`（`/Users/muqihang/chelingxi_workspace/clawdbot/src/cli/run-main.ts:27`, CODE-002）。
- Gateway 运行期入口链路是 `startGatewayServer` -> `new WebSocketServer` -> `attachGatewayWsHandlers`（`/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server.impl.ts:472`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server-runtime-state.ts:166`, CODE-003/004）。

3. 推断

- Clawdbot 实际采用“双入口模式”：CLI 入口统一初始化，Gateway 是 CLI 子命令触发的长生命周期服务进程。

4. 未知

- 不同子命令（如 `gateway run`、`agent`）的初始化差异细节未在单文件集中定义，需按命令级入口继续追踪。

5. 证据

- CMD-01/38；CODE-001/002/003/004。

### A2

1. 问题编号与原文  
   A2) 请求从进入到响应的完整调用链是什么？
2. 事实

- WS 请求先入 `handleGatewayRequest`，再分发到 `chat.send`（`/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server/ws-connection/message-handler.ts:988`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server-methods/chat.ts:318`, CODE-006/009）。
- `chat.send` 进入 auto-reply：`dispatchInboundMessage` -> `dispatchReplyFromConfig` -> `getReplyFromConfig`（`/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply/dispatch.ts:17`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply/reply/dispatch-from-config.ts:297`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply/reply/get-reply.ts:53`, CODE-010/011/012）。
- 执行阶段：`runPreparedReply` -> `runReplyAgent` -> `runAgentTurnWithFallback` -> `runEmbeddedPiAgent`（`/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply/reply/get-reply-run.ts:324`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply/reply/agent-runner.ts:309`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply/reply/agent-runner-execution.ts:148`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/pi-embedded-runner/run.ts:137`, CODE-013~016）。

3. 推断

- 主链路是“Gateway 控制面 + auto-reply 编排层 + embedded agent 执行层”的三级流水线。

4. 未知

- 各 channel plugin 的入站预处理（如 Telegram/Slack 特定 payload 归一化）有差异，本报告聚焦通用链路。

5. 证据

- CMD-24/38；CODE-006/009/010/011/012/013/014/015/016。

### A3

1. 问题编号与原文  
   A3) Agent/Tool/Planner/Router 的职责边界如何划分？
2. 事实

- Router 负责“channel/account/peer -> agent/sessionKey”的路由解析（`/Users/muqihang/chelingxi_workspace/clawdbot/src/routing/resolve-route.ts:171`, CODE-017）。
- Agent 负责队列、模型选择、fallback、执行与回复拼装（`/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply/reply/get-reply-run.ts:324`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply/reply/agent-runner-execution.ts:148`, CODE-013/015）。
- Tool 由 `createOpenClawTools` + `pi-tools` 组装并按多层策略过滤（`/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/openclaw-tools.ts:22`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/pi-tools.ts:409`, CODE-074/076）。
- Planner 在主链中无独立“全局任务规划器”；当前可定位 planner 语义主要是 reply reference planner（`/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply/reply/reply-reference.ts:12`, CODE-018, CMD-42）。

3. 推断

- “Planner”在 Clawdbot 目前是局部策略组件（reply/reference），并非 LangGraph 风格全局计划器。

4. 未知

- 若后续引入更强的任务规划器，目前代码中尚无统一抽象接口。

5. 证据

- CMD-20/42；CODE-017/018/074/076。

### A4

1. 问题编号与原文  
   A4) 并发模型、会话模型、状态持久化模型是什么？
2. 事实

- 并发采用 lane queue：`main/cron/subagent/nested` + 每 lane 并发上限（`/Users/muqihang/chelingxi_workspace/clawdbot/src/process/lanes.ts:1`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/process/command-queue.ts:92`, CODE-019/020）。
- embedded agent 采用 session lane + global lane 双层排队（`/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/pi-embedded-runner/lanes.ts:3`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/pi-embedded-runner/run.ts:140`, CODE-023/016）。
- 会话状态持久化在 session store（文件）+ transcript（jsonl），写入有文件锁（`/Users/muqihang/chelingxi_workspace/clawdbot/src/config/sessions/store.ts:588`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/config/sessions/transcript.ts:78`, CODE-032/035）。
- 长期记忆持久化在 sqlite/qmd/lancedb（CODE-038~058, 071~073）。

3. 推断

- 当前并发模型是单进程内队列并发控制，不是分布式任务队列。

4. 未知

- 多实例共享同一 session/memory 文件时的竞争策略不在本次范围（需部署级验证）。

5. 证据

- CMD-19/24；CODE-019/020/023/032/035/038。

### B5

1. 问题编号与原文  
   B5) 短期记忆的数据结构、作用域（会话/任务/用户）与生命周期？
2. 事实

- 短期记忆核心结构是 `SessionEntry`（`/Users/muqihang/chelingxi_workspace/clawdbot/src/config/sessions/types.ts:25`, CODE-027）。
- 作用域仅 `per-sender/global`（`/Users/muqihang/chelingxi_workspace/clawdbot/src/config/sessions/types.ts:8`, CODE-026）。
- 生命周期由 session freshness/reset trigger 控制（`/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply/reply/session.ts:170`, CODE-033）。

3. 推断

- 短期记忆边界是“会话级”而不是“租户级”或“组织级”模型。

4. 未知

- 跨租户会话隔离语义当前没有内建抽象（需实施前设计补齐）。

5. 证据

- CMD-19；CODE-026/027/033。

### B6

1. 问题编号与原文  
   B6) 短期记忆如何写入、读取、裁剪、过期？
2. 事实

- 写入与更新走 `updateSessionStore` + 文件锁（`/Users/muqihang/chelingxi_workspace/clawdbot/src/config/sessions/store.ts:588`, CODE-032）。
- 裁剪机制包括 stale prune（`/Users/muqihang/chelingxi_workspace/clawdbot/src/config/sessions/store.ts:279`）和 entry cap（`/Users/muqihang/chelingxi_workspace/clawdbot/src/config/sessions/store.ts:349`），CODE-029/030。
- 过大文件会 rotate（`/Users/muqihang/chelingxi_workspace/clawdbot/src/config/sessions/store.ts:391`, CODE-031）。
- transcript 由 `appendAssistantMessageToSessionTranscript` 写入，并触发索引事件（`/Users/muqihang/chelingxi_workspace/clawdbot/src/config/sessions/transcript.ts:78`, `:149`, CODE-035/036）。

3. 推断

- 短期记忆治理重心在“文件型会话可维护性”（TTL/prune/cap/rotate），而非数据库事务级历史版本。

4. 未知

- 会话级强一致读取语义在跨进程并发场景仍需压测确认。

5. 证据

- CMD-12/19；CODE-029/030/031/032/035/036。

### B7

1. 问题编号与原文  
   B7) 长期记忆存储在哪里（DB/向量库/文件）？
2. 事实

- builtin backend：sqlite 文件，默认 `STATE_DIR/memory/{agentId}.sqlite`（`/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/memory-search.ts:110`, CODE-038）。
- sqlite schema 包含 `files/chunks/embedding_cache/meta/fts`（`/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/memory-schema.ts:10`, CODE-052）。
- qmd backend：index sqlite 在 XDG cache 下（`/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/qmd-manager.ts:112`, CODE-054）。
- lancedb backend：插件 `memory-lancedb` 指定 DB path（`/Users/muqihang/chelingxi_workspace/clawdbot/extensions/memory-lancedb/index.ts:252`, CODE-071）。

3. 推断

- Clawdbot 长期记忆是“多后端可切换”而非单一存储。

4. 未知

- builtin/qmd/lancedb 的线上运维标准（备份恢复 RTO/RPO）在代码层无统一策略。

5. 证据

- CMD-10/40；CODE-038/052/054/071。

### B8

1. 问题编号与原文  
   B8) 长期记忆的摄入触发机制（实时/批处理/事件驱动）？
2. 事实

- builtin 在 session-start/search 触发非阻塞 sync（`/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/manager.ts:251`, `:275`, CODE-047/049 关联）。
- builtin 支持 watch 文件变化触发（`/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/manager.ts:813`, CODE-047）。
- session transcript 事件驱动增量摄入（`/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/manager.ts:849`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/sessions/transcript-events.ts:16`, CODE-048/037）。
- qmd 支持 onBoot + interval update（`/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/qmd-manager.ts:158`, `:170`, CODE-055）。

3. 推断

- 摄入模式是混合型（实时事件 + 定时/批处理 + 查询时触发补同步）。

4. 未知

- 不同 backend 的摄入延迟 SLA 需要运行态监控补证。

5. 证据

- CMD-10/12/39；CODE-047/048/055/037。

### B9

1. 问题编号与原文  
   B9) 长期记忆检索策略（词法/语义/图/混合）？
2. 事实

- builtin 检索是 keyword(FTS) + vector 混合融合（`/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/manager.ts:293`, `:307`, CODE-045）。
- vector extension 失败会降级（`/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/manager.ts:614`, CODE-046）。
- qmd path 有 scope 过滤 + injected chars budget（`/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/qmd-manager.ts:744`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/tools/memory-tool.ts:164`, CODE-057/063）。

3. 推断

- Clawdbot 当前无内建“图检索”后端；图相关能力若需要需接外部系统（如 Jarvis）。

4. 未知

- qmd 实际底层是否启用图拓扑取决于外部 qmd 能力，本仓未内嵌该实现。

5. 证据

- CMD-10/21/39；CODE-045/046/057/063。

### B10

1. 问题编号与原文  
   B10) 记忆冲突与版本（revision/supersede）如何处理？
2. 事实

- builtin 层可见的是 hash 去重与 embedding cache 主键去重（`/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/memory-schema.ts:39`, CODE-052）。
- lancedb 插件用向量相似度阈值避免重复存储（`/Users/muqihang/chelingxi_workspace/clawdbot/extensions/memory-lancedb/index.ts:335`, CODE-071）。
- 代码扫描未发现 Clawdbot memory 级 `supersede/revision/audit` 字段（CMD-31）。

3. 推断

- Clawdbot 原生不提供“知识项版本演进”语义，需要在 Jarvis 适配层补上 idempotency/version contract。

4. 未知

- 若同时启用多 memory backend（理论上 slot 互斥已限制），跨 backend 冲突策略未定义。

5. 证据

- CMD-31/40；CODE-052/071/068。

### B11

1. 问题编号与原文  
   B11) 记忆治理（质量门禁、去重、TTL、可审计性）如何做？
2. 事实

- 短期记忆治理有 prune/cap/rotate/lock（`/Users/muqihang/chelingxi_workspace/clawdbot/src/config/sessions/store.ts:279`, `:349`, `:391`, `:588`, CODE-029~032）。
- memory_search 支持 citation mode + qmd budget clamp（`/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/tools/memory-tool.ts:145`, `:164`, CODE-063）。
- qmd scope/limits/timeout 可配置（`/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/backend-config.ts:277`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/qmd-manager.ts:744`, CODE-040/057）。

3. 推断

- 当前治理强于“运行稳定性与资源约束”，弱于“知识版本审计与跨系统可追责元数据”。

4. 未知

- 系统级 audit trail（谁在何时写入哪条长期记忆）在 Clawdbot 内建路径中不可见。

5. 证据

- CMD-10/19/31；CODE-029/030/031/032/040/057/063。

### C12

1. 问题编号与原文  
   C12) 对外暴露了哪些工具？工具选择机制是什么？
2. 事实

- OpenClaw 工具入口在 `createOpenClawTools`（`/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/openclaw-tools.ts:22`, CODE-074）。
- pi-tools 把 coding tools + openclaw tools + channel tools + plugin tools 组合（`/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/pi-tools.ts:245`, `:325`, CODE-075）。
- 工具选择/过滤顺序是 profile/global/agent/group/sandbox/subagent（`/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/pi-tools.ts:409`, CODE-076）。

3. 推断

- 工具暴露是“声明式组合 + 多层策略裁剪”，不是硬编码单一白名单。

4. 未知

- 各 channel 的 plugin tool 完整集合要按具体安装插件动态决定。

5. 证据

- CMD-20/21；CODE-074/075/076/078/079。

### C13

1. 问题编号与原文  
   C13) 工具失败时如何降级与重试？
2. 事实

- 消息发送动作优先 plugin action，未处理则自动 fallback 到 core send（`/Users/muqihang/chelingxi_workspace/clawdbot/src/infra/outbound/outbound-send-service.ts:79`, CODE-081）。
- 通用重试由 `retryAsync` 提供，channel 有专用 runner（`/Users/muqihang/chelingxi_workspace/clawdbot/src/infra/retry.ts:70`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/infra/retry-policy.ts:45`, CODE-082/083）。
- memory path 在 qmd 失败时会切 builtin（`/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/search-manager.ts:85`, CODE-043）。

3. 推断

- 失败处理是“局部降级优先”（局部路径失败不阻断整条回复链路）。

4. 未知

- 部分工具（尤其外部服务 plugin）是否统一接入 retry policy 取决于插件实现质量。

5. 证据

- CMD-23/39；CODE-081/082/083/043。

### C14

1. 问题编号与原文  
   C14) 是否有“超级入口”编排模式或可扩展点？
2. 事实

- `runMessageAction` 是消息动作统一编排入口（`/Users/muqihang/chelingxi_workspace/clawdbot/src/infra/outbound/message-action-runner.ts:992`, CODE-080）。
- Gateway methods 是统一控制面入口，且可由插件注入（`/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server-methods-list.ts:93`, `/Users/muqihang/chelingxi_workspace/clawdbot/src/plugins/registry.ts:492`, CODE-084/079）。
- 插件扩展点覆盖 tool/hook/http/gateway method/service（`/Users/muqihang/chelingxi_workspace/clawdbot/src/plugins/registry.ts:468`, CODE-079）。

3. 推断

- Clawdbot 已具备“超级入口 + 插件扩展”底座，适合把 Jarvis KB 接口收敛成少量统一入口。

4. 未知

- 是否需要新增独立 `jarvis.*` gateway namespace 取决于实施阶段 API 设计。

5. 证据

- CMD-38；CODE-080/079/084。

### D15

1. 问题编号与原文  
   D15) Jarvis KB 14工具与 Clawdbot 能力如何映射？
2. 事实

- Jarvis 侧明确存在 14 个 KB 工具（`/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/mcp-toolset.ts:44`, CODE-097~098, CMD-25/41）。
- Clawdbot 记忆工具主入口是 `memory_search/memory_get`（CODE-061/062）。
- Clawdbot 缺省无图邻居/符号图谱/工件仓等同构能力（需插件或外部系统补齐，见 CODE-074~079 与 Jarvis 工具定义 CODE-101~116）。

3. 推断

- 映射关系以 1:N 和“能力缺口桥接”为主；不能直接 14:14 同构。

4. 未知

- 若要完全保留 Jarvis envelope（schema_version/request_id/degraded_reasons），Clawdbot 需新增统一响应封装层。

5. 证据

- CMD-25/41；CODE-097~116/061/062/074。

### D16

1. 问题编号与原文  
   D16) 若对外收敛为少量超级入口，Clawdbot 侧应如何调用最稳？
2. 事实

- Clawdbot 现有稳定编排入口是 `runMessageAction` 与 gateway method dispatch（CODE-080/007/008）。
- 插件层支持注册 gateway methods 和 tools，可增量接 Jarvis 适配器（CODE-079）。

3. 推断

- 最稳模式：在 Clawdbot 侧只暴露少量 `jarvis_kb.query` / `jarvis_kb.memory` / `jarvis_kb.artifact` 超级入口，由内部再映射 14 工具。

4. 未知

- 超级入口返回体是否完全沿用 Jarvis envelope 还是做 Clawdbot 风格转换，需要实施前拍板。

5. 证据

- CMD-38；CODE-079/080/007。

### D17

1. 问题编号与原文  
   D17) 双记忆系统（Clawdbot memory + Jarvis KB）如何避免冲突与重复写入？
2. 事实

- Clawdbot memory slot 默认互斥（`memory-core` vs `memory-lancedb`）（CODE-067/068）。
- 当前内建 memory 未体现 revision/supersede 审计字段（CMD-31）。
- Jarvis 记忆写入工具已包含 evidence/confirm policy 门禁（CODE-115/116）。

3. 推断

- 应采用“单写源 + 幂等键 + 双向去重”的策略：
  - Clawdbot 只保留短期会话写；
  - 长期写统一走 Jarvis `kb_memory_propose/commit`。

4. 未知

- 如果保留 Clawdbot builtin 长期记忆做本地离线缓存，需额外定义回写冲突规则。

5. 证据

- CMD-31/40；CODE-067/068/115/116。

### D18

1. 问题编号与原文  
   D18) 推荐的集成边界：谁是系统记录源（SoR），谁是检索增强层？
2. 事实

- Clawdbot 短期会话（sessions/transcript）已与运行态强耦合（CODE-026~037）。
- Jarvis KB 提供完整的 KB tool envelope 与 memory 写入门禁（CODE-099/100/113/114/116）。

3. 推断

- 推荐边界：
  - SoR：Jarvis KB（长期知识、工件、反馈、可审计写入）
  - 检索增强层：Clawdbot runtime（会话上下文 + 临时检索拼装）

4. 未知

- 是否需要 Clawdbot 在离线模式下维持“只读影子索引”作为应急检索层，需要业务侧可用性目标确认。

5. 证据

- CMD-12/25/41；CODE-026~037/099/100/113/114/116。

### D19

1. 问题编号与原文  
   D19) 最小可行接入方案（MVP）与风险缓解方案是什么？
2. 事实

- Clawdbot 已有 memory/tool/plugin/gateway 扩展点（CODE-061~079/084）。
- Jarvis 已有 14 工具和标准 envelope（CODE-097~116）。

3. 推断

- MVP：先读路径打通（搜索/取块/健康/能力）+ 长期写入改为 propose/commit，禁止 Clawdbot 双写长期记忆。
- 增强版：加入 artifact/feedback、统一 request_id 链路、degraded_reasons 监控与治理。

4. 未知

- 生产门禁（延迟预算、成本预算、失败注入测试标准）需实施前确定。

5. 证据

- CMD-25/39/41；CODE-061/062/079/080/097~116。

## 5. Clawdbot 记忆机制全景（短期/长期/治理）

### 5.1 短期记忆（Session Memory）

- 数据结构：`SessionEntry`（模型/策略/队列/usage/skillsSnapshot 等），scope 为 `per-sender/global`（CODE-026/027）。
- 写入读取：通过 session store 文件 + 文件锁；assistant payload 同步镜像到 transcript（CODE-032/035）。
- 生命周期：reset trigger/freshness；治理包括 prune/cap/rotate（CODE-029/030/031/033）。

### 5.2 长期记忆（LTM）

- builtin：SQLite（files/chunks/embedding_cache/meta/fts）+ hybrid 检索 + watch/session-event 增量同步（CODE-045/047/048/052）。
- qmd：外部 qmd CLI 后端，支持 onBoot/interval update、scope、limits、timeout（CODE-040/055/057）。
- lancedb：memory slot 插件路径，具备 auto-recall/auto-capture（CODE-071/072/073）。

### 5.3 治理能力与缺口

- 已有：运行稳定性治理（timeout/retry/fallback/资源预算/去重）
- 缺口：memory 级版本演进与审计字段不完备（CMD-31）

## 6. 风险、前置条件、实施前检查项

1. **文档快照漂移风险**
   - 历史分析文档存在版本/行号/提交差异漂移（CMD-07/28/29/30/32）。
2. **双写冲突风险**
   - Clawdbot 原生 memory 缺少 revision/supersede contract（CMD-31）。
3. **图谱能力缺口风险**
   - Jarvis 图工具（neighbors/discovery/symbol/impact）在 Clawdbot 无等价内核。
4. **实施前前置条件**
   - 明确 SoR（建议 Jarvis）与离线兜底策略；
   - 确定统一 envelope（request_id/degraded_reason/knowledge_cut）；
   - 定义幂等键和写入策略（见适配草案）。

## 7. 事实 / 推断 / 未知 汇总

- 事实：见 19 题“事实”字段与证据索引 CODE-001~123、CMD-01~42。
- 推断：均基于事实链路推导，未使用“无证据推测”。
- 未知：主要集中在跨系统双写治理、生产 SLA 门禁、离线策略边界。
