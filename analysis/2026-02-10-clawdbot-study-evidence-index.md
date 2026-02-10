# Clawdbot 研究证据索引（2026-02-10）

## 0. 说明

- 研究范围：`/Users/muqihang/chelingxi_workspace/clawdbot`（以及 Jarvis KB 对照仓 ` /Users/muqihang/chelingxi_workspace/chelingxi-os`）。
- 证据类型：
  - 命令证据：`CMD-*`（命令、exit code、关键输出摘要）
  - 代码证据：`CODE-*`（绝对路径 + 行号 + 结论）
- 命令原始日志：`/tmp/clawdbot-study-cmd-20260210-refresh.log`

## 1. 命令证据表

| ID     | 命令                                                                                                 |                                              Exit | 关键输出摘要                                            | 用途                             |
| ------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------: | ------------------------------------------------------- | -------------------------------- | ------------------------------------------------ | ------------------------------------- | ---------------------------------------------- | --------------------- |
| CMD-01 | `pwd`                                                                                                |                                                 0 | `/Users/muqihang/chelingxi_workspace/clawdbot`          | 确认研究工作目录                 |
| CMD-02 | `git branch --show-current`                                                                          |                                                 0 | `main`                                                  | 基线分支                         |
| CMD-03 | `git rev-parse HEAD`                                                                                 |                                                 0 | `53fd26a96086911e0b66ae3597884774d4ec5d92`              | 基线提交                         |
| CMD-04 | `git status --short`                                                                                 |                                                 0 | `?? .opencode/`, `?? .sisyphus/`                        | 基线工作区状态                   |
| CMD-05 | `git worktree list`                                                                                  |                                                 0 | 主仓 + 1 个 detached worktree                           | 基线 worktree 状态               |
| CMD-06 | `ls -1 analysis`                                                                                     |                                                 0 | 四个历史深潜文档                                        | 强制阅读对象确认                 |
| CMD-07 | `rg -n '"version"                                                                                    |                               openclaw@2026\.2\.3 | openclaw@2026\.2\.9' ...`                               | 0                                | `package.json=2026.2.9`；两份文档仍写 `2026.2.3` | 文档版本漂移证据                      |
| CMD-08 | `git rev-list --left-right --count main...upstream/main`                                             |                                                 0 | `0 4`                                                   | upstream 差异现状                |
| CMD-09 | `rg -n 'agents\.create                                                                               |                                    agents\.update | agents\.delete' ...`                                    | 0                                | method list + handlers 均存在                    | 验证 agents RPC                       |
| CMD-10 | `rg -n 'commandTimeoutMs                                                                             |                                   updateTimeoutMs | embedTimeoutMs                                          | scope' ...`                      | 0                                                | backend-config 与 qmd-manager 均命中  | 验证 QMD timeout/scope                         |
| CMD-12 | `rg -n 'appendAssistantMessageToSessionTranscript                                                    |                 emitSessionTranscriptUpdate' ...` | 0                                                       | transcript 写入 + 事件派发       | 短期记忆写入链路                                 |
| CMD-17 | `HOME=$PWD ~/.codex/superpowers/.codex/superpowers-codex bootstrap`                                  |                                                 0 | bootstrap 完成（自动加载 using-superpowers 报 missing） | 强制启动技能流程                 |
| CMD-18 | `superpowers-codex use-skill superpowers:using-superpowers`                                          |                                                 0 | skill 内容输出                                          | 明确使用技能                     |
| CMD-19 | `rg -n '...prune...lock...' src/config/sessions/store.ts`                                            |                                                 0 | prune/lock/cleanup 命中多处                             | 短期记忆治理证据                 |
| CMD-20 | `rg -n '...ToolPolicy...' src/agents/pi-tools.ts src/agents/pi-tools.policy.ts`                      |                                                 0 | 多层策略解析函数命中                                    | 工具策略分层证据                 |
| CMD-21 | `rg -n 'memory_search                                                                                |                                        memory_get | createMemory...' ...`                                   | 0                                | memory-core / memory-tool / system-prompt 命中   | 记忆工具注入证据                      |
| CMD-23 | `rg -n 'retry                                                                                        |                                           backoff | ...' src/infra/retry\*.ts ...`                          | 0                                | retryAsync + telegram/discord runner 命中        | 失败重试证据                          |
| CMD-24 | `rg -n 'chat.send                                                                                    |                                       dispatch... | runReplyAgent                                           | runEmbeddedPiAgent' ...`         | 0                                                | 主调用链关键符号命中                  | 请求到响应链路证据                             |
| CMD-25 | `rg -n 'KB_TOOL_TOKENS                                                                               | Kb[A-Za-z]+Tool' chelingxi-os/.../mcp-toolset.ts` | 0                                                       | KB_TOOL_TOKENS 列出 14 个工具    | Jarvis KB 工具清单                               |
| CMD-26 | `python3 /tmp/check_analysis_refs.py`                                                                |                                                 0 | tech 文档 2 个缺失路径；product 文档 refs=0             | 历史文档质量核对                 |
| CMD-28 | `rg -n 'main...upstream/main = 1 0                                                                   |                  273 commits' openclaw-update...` | 0                                                       | 文档写 `1 0` 与 `273 commits`    | 文档漂移证据                                     |
| CMD-29 | `git rev-list --left-right --count main...upstream/main && git rev-list --count main..upstream/main` |                                                 0 | `0 4` / `4`                                             | 与 CMD-28 对照                   |
| CMD-30 | `rg -n 'qmd-manager.ts:602                                                                           |                          qmd-manager.ts:744' ...` | 0                                                       | 文档仍指 602；源码 scope 在 744+ | 文档锚点漂移                                     |
| CMD-31 | `rg -n 'supersede                                                                                    |                                          revision | idempotency                                             | ttl                              | audit' src/memory ...`                           | 0                                     | 未出现 memory 级 supersede/revision/audit 字段 | 冲突/版本治理缺口证据 |
| CMD-32 | `rg -n '273 commits                                                                                  |                                   origin/main@... | upstream/main@...' openclaw-codebase-product.md`        | 0                                | product 文档也写 273 commits                     | product 文档漂移证据                  |
| CMD-33 | `sed -n '1,80p' analysis/openclaw-update-delta-2026-02-08.md`                                        |                                                 0 | 已读取文档内容                                          | 强制阅读证据                     |
| CMD-34 | `sed -n '1,80p' analysis/openclaw-codebase-product.md`                                               |                                                 0 | 已读取文档内容                                          | 强制阅读证据                     |
| CMD-35 | `sed -n '1,80p' analysis/openclaw-codebase-tech.md`                                                  |                                                 0 | 已读取文档内容                                          | 强制阅读证据                     |
| CMD-36 | `sed -n '1,80p' analysis/openclaw-memory-deep-dive.md`                                               |                                                 0 | 已读取文档内容                                          | 强制阅读证据                     |
| CMD-37 | `rg -n 'validateAgentsCreateParams                                                                   |                                               ... | agents.delete' ...`                                     | 0                                | agents handlers + validator 命中                 | RPC 校验链路证据                      |
| CMD-38 | `rg -n 'new WebSocketServer                                                                          |                           attachGatewayWsHandlers | handleGatewayRequest                                    | chat.send' ...`                  | 0                                                | WebSocket->method->chat.send 链路命中 | 控制面主链路证据                               |
| CMD-39 | `rg -n 'qmd memory ... fallback ...' src/memory/search-manager.ts`                                   |                                                 0 | qmd 失败切 builtin 命中                                 | 记忆降级证据                     |
| CMD-40 | `rg -n 'PluginKind = "memory"                                                                        |                               DEFAULT_SLOT_BY_KEY | applyExclusiveSlotSelection                             | ...' ...`                        | 0                                                | memory slot 互斥证据命中              | memory 插件互斥证据                            |
| CMD-41 | Python 统计 `KB_TOOL_TOKENS`                                                                         |                                                 0 | `count 14` + 全列表                                     | Jarvis 14 工具数量证明           |
| CMD-42 | `rg -n 'ReplyReferencePlanner                                                                        |                       createReplyReferencePlanner | planner' ...`                                           | 0                                | reply planner 仅在 reply-reference               | Planner 边界证据                      |

## 2. 代码证据表

### 2.1 架构与执行流

| ID       | 代码证据                                                                                               | 结论                                                                |
| -------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| CODE-001 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/entry.ts:146`                                        | CLI 入口先规范化 argv，然后动态加载 `run-main`                      |
| CODE-002 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/cli/run-main.ts:27`                                  | `runCli` 负责 dotenv/env/runtime guard/命令注册与解析               |
| CODE-003 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server-runtime-state.ts:166`                 | Gateway WebSocket server 通过 `new WebSocketServer` 建立            |
| CODE-004 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server.impl.ts:472`                          | gateway 启动阶段挂载 WS handlers                                    |
| CODE-005 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server-ws-runtime.ts:8`                      | WS runtime 将连接事件路由给 ws connection handler                   |
| CODE-006 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server/ws-connection/message-handler.ts:988` | WS 消息最终进入 `handleGatewayRequest`                              |
| CODE-007 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server-methods.ts:93`                        | Gateway method 存在角色+scope 授权门禁                              |
| CODE-008 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server-methods.ts:193`                       | Gateway method 通过 handler 映射分发                                |
| CODE-009 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server-methods/chat.ts:318`                  | `chat.send` 是消息进入 auto-reply 的核心入口                        |
| CODE-010 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply/dispatch.ts:17`                           | `dispatchInboundMessage` 把入站消息交给 config-based reply pipeline |
| CODE-011 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply/reply/dispatch-from-config.ts:297`        | reply pipeline 在此调用 `getReplyFromConfig`                        |
| CODE-012 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply/reply/get-reply.ts:53`                    | `getReplyFromConfig` 是 reply 生成主逻辑入口                        |
| CODE-013 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply/reply/get-reply-run.ts:324`               | 队列模式（interrupt/steer/followup）与 lane 绑定                    |
| CODE-014 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply/reply/agent-runner.ts:309`                | `runReplyAgent` 调用 `runAgentTurnWithFallback`                     |
| CODE-015 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply/reply/agent-runner-execution.ts:148`      | 执行层使用 `runWithModelFallback` 做 provider/model fallback        |
| CODE-016 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/pi-embedded-runner/run.ts:137`                | 真正模型调用入口是 `runEmbeddedPiAgent`                             |
| CODE-017 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/routing/resolve-route.ts:171`                        | Router 负责 channel/account/peer 到 agent/sessionKey 的解析         |
| CODE-018 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply/reply/reply-reference.ts:12`              | Planner 仅体现为 reply-reference planner（非全局任务规划器）        |

### 2.2 并发、会话、状态持久化

| ID       | 代码证据                                                                                | 结论                                               |
| -------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| CODE-019 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/process/lanes.ts:1`                   | 统一 lane 定义：`main/cron/subagent/nested`        |
| CODE-020 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/process/command-queue.ts:92`          | 支持按 lane 配置并发上限                           |
| CODE-021 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/process/command-queue.ts:99`          | 所有任务经 `enqueueCommandInLane` 排队执行         |
| CODE-022 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server-lanes.ts:6`            | gateway 启动时把 cron/main/subagent 并发绑定到配置 |
| CODE-023 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/pi-embedded-runner/lanes.ts:3` | embedded run 同时使用 session lane + global lane   |
| CODE-024 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/pi-embedded-runner/runs.ts:14` | 活跃 run 注册表与 waiters 机制                     |
| CODE-025 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/pi-embedded-runner/runs.ts:40` | 支持按 session abort 活跃 run                      |

### 2.3 短期记忆（Session）

| ID       | 代码证据                                                                             | 结论                                                              |
| -------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| CODE-026 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/config/sessions/types.ts:8`        | 短期会话 scope 仅 `per-sender/global`                             |
| CODE-027 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/config/sessions/types.ts:25`       | `SessionEntry` 包含模型覆盖、队列模式、usage、memory flush 标记等 |
| CODE-028 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/config/sessions/store.ts:35`       | session store 带内存缓存与 TTL                                    |
| CODE-029 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/config/sessions/store.ts:279`      | 支持基于 `updatedAt` 的 stale prune                               |
| CODE-030 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/config/sessions/store.ts:349`      | 支持按最大条数 cap                                                |
| CODE-031 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/config/sessions/store.ts:391`      | 支持 sessions 文件 rotate 与备份                                  |
| CODE-032 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/config/sessions/store.ts:588`      | 写入采用文件锁 + 超时 + stale lock 回收                           |
| CODE-033 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply/reply/session.ts:170`   | `/new`/`/reset` trigger 触发会话重建                              |
| CODE-034 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/auto-reply/reply/session.ts:196`   | 每次入站都会解析 sessionKey + freshness                           |
| CODE-035 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/config/sessions/transcript.ts:78`  | 助手回复写入 transcript（jsonl）                                  |
| CODE-036 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/config/sessions/transcript.ts:149` | transcript 更新后发事件给订阅方                                   |
| CODE-037 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/sessions/transcript-events.ts:16`  | transcript 事件总线实现                                           |

### 2.4 长期记忆（Memory Backend）

| ID       | 代码证据                                                                        | 结论                                                          |
| -------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| CODE-038 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/memory-search.ts:110`  | builtin memory 默认落盘到 `STATE_DIR/memory/{agentId}.sqlite` |
| CODE-039 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/backend-config.ts:244` | `memory.backend` 解析为 builtin/qmd                           |
| CODE-040 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/backend-config.ts:277` | qmd 配置支持 command/update/embed timeout                     |
| CODE-041 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/search-manager.ts:19`  | manager 选择入口：qmd 优先，失败回 builtin                    |
| CODE-042 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/search-manager.ts:67`  | FallbackMemoryManager 封装 primary/fallback                   |
| CODE-043 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/search-manager.ts:85`  | qmd 查询异常后切 builtin                                      |
| CODE-044 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/manager.ts:170`        | builtin manager 按 agent/workspace/config 缓存实例            |
| CODE-045 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/manager.ts:267`        | builtin search 同时跑 keyword + vector 并融合                 |
| CODE-046 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/manager.ts:614`        | vector extension 加载有超时与失败降级                         |
| CODE-047 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/manager.ts:813`        | memory 文件变更监听（watch）                                  |
| CODE-048 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/manager.ts:849`        | session transcript 事件驱动增量索引                           |
| CODE-049 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/manager.ts:1272`       | runSync 判断 full reindex 条件                                |
| CODE-050 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/manager.ts:1408`       | full reindex 走 temp DB + swap 原子切换                       |
| CODE-051 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/manager.ts:1762`       | embedding cache 按 maxEntries 淘汰                            |
| CODE-052 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/memory-schema.ts:10`   | SQLite schema（meta/files/chunks/embedding_cache/fts）        |
| CODE-053 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/internal.ts:166`       | chunking 为“字符近似 token + overlap”                         |
| CODE-054 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/qmd-manager.ts:52`     | qmd manager 初始化流程                                        |
| CODE-055 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/qmd-manager.ts:158`    | qmd onBoot update + optional waitForBootSync                  |
| CODE-056 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/qmd-manager.ts:596`    | qmd 可导出 session transcript 到 md 集合                      |
| CODE-057 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/qmd-manager.ts:744`    | qmd scope 规则判定                                            |
| CODE-058 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/qmd-manager.ts:948`    | qmd update debounce/skip 逻辑                                 |
| CODE-059 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/manager.ts:97`         | batch 失败阈值常量 `BATCH_FAILURE_LIMIT=2`                    |
| CODE-060 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/manager.ts:2238`       | batch 连续失败后自动禁用 batch                                |

### 2.5 记忆工具与插件互斥

| ID       | 代码证据                                                                              | 结论                                                |
| -------- | ------------------------------------------------------------------------------------- | --------------------------------------------------- |
| CODE-061 | `/Users/muqihang/chelingxi_workspace/clawdbot/extensions/memory-core/index.ts:4`      | `memory-core` 注册 `memory_search/memory_get`       |
| CODE-062 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/tools/memory-tool.ts:25`     | memory_search 工具定义与 manager 调用               |
| CODE-063 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/tools/memory-tool.ts:145`    | citation 注入与 snippet clamp                       |
| CODE-064 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/system-prompt.ts:48`         | system prompt 仅在工具可用时注入 memory recall 规则 |
| CODE-065 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/plugins/types.ts:37`                | `PluginKind` 目前仅有 `memory`                      |
| CODE-066 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/plugins/slots.ts:12`                | memory kind 映射到 memory slot                      |
| CODE-067 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/plugins/slots.ts:16`                | 默认 memory slot 是 `memory-core`                   |
| CODE-068 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/plugins/slots.ts:37`                | 选择 memory slot 会禁用同 kind 其他插件             |
| CODE-069 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/plugins/config-state.ts:197`        | memory slot 选择决策（enabled/disabled reason）     |
| CODE-070 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/plugins/loader.ts:440`              | slot 指定插件缺失会告警                             |
| CODE-071 | `/Users/muqihang/chelingxi_workspace/clawdbot/extensions/memory-lancedb/index.ts:243` | `memory-lancedb` 定义为 `kind: "memory"`            |
| CODE-072 | `/Users/muqihang/chelingxi_workspace/clawdbot/extensions/memory-lancedb/index.ts:490` | lancedb 支持 `before_agent_start` auto-recall       |
| CODE-073 | `/Users/muqihang/chelingxi_workspace/clawdbot/extensions/memory-lancedb/index.ts:520` | lancedb 支持 `agent_end` auto-capture               |

### 2.6 工具编排、策略与降级

| ID       | 代码证据                                                                                       | 结论                                                           |
| -------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| CODE-074 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/openclaw-tools.ts:22`                 | OpenClaw 内置工具集合入口                                      |
| CODE-075 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/pi-tools.ts:245`                      | pi-tools 合并 coding/base/channel/plugin 工具                  |
| CODE-076 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/pi-tools.ts:409`                      | 工具策略过滤顺序：profile→global→agent→group→sandbox→subagent  |
| CODE-077 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/pi-tools.policy.ts:90`                | subagent 默认 deny 包含 `memory_search`/`memory_get`           |
| CODE-078 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/plugins/tools.ts:43`                         | 插件工具注册时做冲突检测与 optional allowlist                  |
| CODE-079 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/plugins/registry.ts:468`                     | 插件 API 可注册 tool/hook/http/channel/provider/gateway method |
| CODE-080 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/infra/outbound/message-action-runner.ts:992` | `runMessageAction` 是消息动作统一编排入口                      |
| CODE-081 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/infra/outbound/outbound-send-service.ts:79`  | 发送动作优先走 plugin action，未处理再走 core send             |
| CODE-082 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/infra/retry.ts:70`                           | 通用 retryAsync 支持指数退避/抖动/retry-after                  |
| CODE-083 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/infra/retry-policy.ts:45`                    | Discord/Telegram 专用 retry runner                             |

### 2.7 2026-02-08 增量文档相关源码锚点

| ID       | 代码证据                                                                                | 结论                                                |
| -------- | --------------------------------------------------------------------------------------- | --------------------------------------------------- |
| CODE-084 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server-methods-list.ts:35`    | `agents.create/update/delete` 在 method list 注册   |
| CODE-085 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server-methods/agents.ts:185` | `agents.create` handler                             |
| CODE-086 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server-methods/agents.ts:257` | `agents.update` handler                             |
| CODE-087 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/server-methods/agents.ts:316` | `agents.delete` handler                             |
| CODE-088 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/call.ts:105`                  | `gateway.bind=lan` 时优先 LAN IPv4 URL              |
| CODE-089 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/gateway/call.ts:70`                   | URL override 场景要求显式凭据                       |
| CODE-090 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/infra/device-identity.ts:20`          | identity 默认目录改为 `STATE_DIR/identity`          |
| CODE-091 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/canvas-host/server.ts:238`            | canvas 默认目录为 `STATE_DIR/canvas`                |
| CODE-092 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/cron/service/timer.ts:29`             | cron 错误 backoff schedule                          |
| CODE-093 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/cron/service/timer.ts:23`             | cron 单 job 超时保护                                |
| CODE-094 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/embeddings-voyage.ts:30`       | Voyage embedding 支持 `input_type` query/document   |
| CODE-095 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/batch-voyage.ts:114`           | Voyage batch request 固定 `input_type: "document"`  |
| CODE-096 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/agents/compaction.ts:5`               | compaction 引入 tool_use/tool_result pairing repair |

### 2.8 Jarvis KB 对照证据（chelingxi-os）

| ID       | 代码证据                                                                                                        | 结论                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| CODE-097 | `/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/mcp-toolset.ts:44`                    | Jarvis KB 工具列表入口 `KB_TOOL_TOKENS`                                     |
| CODE-098 | `/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/mcp-toolset.ts:58`                    | 第 14 个 KB 工具为 `KbMemoryCommitTool`                                     |
| CODE-099 | `/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/tools/kb-envelope.ts:49`              | KB tool schema version 映射                                                 |
| CODE-100 | `/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/tools/kb-envelope.ts:72`              | 响应 envelope 含 `schema_version/request_id/degraded_reasons/knowledge_cut` |
| CODE-101 | `/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/tools/kb-search.tool.ts:68`           | `kb_search` 合约                                                            |
| CODE-102 | `/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/tools/kb-get-chunk.tool.ts:60`        | `kb_get_chunk` 合约                                                         |
| CODE-103 | `/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/tools/kb-get-chunks.tool.ts:73`       | `kb_get_chunks` 合约                                                        |
| CODE-104 | `/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/tools/kb-discovery.tool.ts:22`        | `kb_discovery` 合约                                                         |
| CODE-105 | `/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/tools/kb-symbol-lookup-pg.tool.ts:23` | `kb_symbol_lookup_pg` 合约                                                  |
| CODE-106 | `/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/tools/kb-impact-report-pg.tool.ts:62` | `kb_impact_report_pg` 合约                                                  |
| CODE-107 | `/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/tools/kb-graph-neighbors.tool.ts:26`  | `kb_graph_neighbors` 合约                                                   |
| CODE-108 | `/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/tools/kb-health.tool.ts:18`           | `kb_health` 合约                                                            |
| CODE-109 | `/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/tools/kb-capabilities.tool.ts:15`     | `kb_capabilities` 合约                                                      |
| CODE-110 | `/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/tools/kb-store-artifact.tool.ts:42`   | `kb_store_artifact` 合约                                                    |
| CODE-111 | `/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/tools/kb-get-artifact.tool.ts:28`     | `kb_get_artifact` 合约                                                      |
| CODE-112 | `/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/tools/kb-feedback.tool.ts:32`         | `kb_feedback` 合约                                                          |
| CODE-113 | `/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/tools/kb-memory-propose.tool.ts:44`   | `kb_memory_propose` 合约                                                    |
| CODE-114 | `/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/tools/kb-memory-commit.tool.ts:49`    | `kb_memory_commit` 合约                                                     |
| CODE-115 | `/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/tools/kb-memory.tool.helpers.ts:35`   | memory 写策略解析（allowed/evidence/confirm）                               |
| CODE-116 | `/Users/muqihang/chelingxi_workspace/chelingxi-os/src/nest/interfaces/mcp/tools/kb-memory-commit.tool.ts:183`   | commit 阻断原因：写禁用、缺 evidence、缺 confirm                            |

### 2.9 历史文档漂移/不一致证据

| ID       | 代码证据                                                                                      | 结论                                       |
| -------- | --------------------------------------------------------------------------------------------- | ------------------------------------------ |
| CODE-117 | `/Users/muqihang/chelingxi_workspace/clawdbot/package.json:3`                                 | 当前版本 `2026.2.9`                        |
| CODE-118 | `/Users/muqihang/chelingxi_workspace/clawdbot/analysis/openclaw-codebase-tech.md:7`           | tech 文档版本写 `2026.2.3`                 |
| CODE-119 | `/Users/muqihang/chelingxi_workspace/clawdbot/analysis/openclaw-memory-deep-dive.md:7`        | memory 文档版本写 `2026.2.3`               |
| CODE-120 | `/Users/muqihang/chelingxi_workspace/clawdbot/analysis/openclaw-update-delta-2026-02-08.md:5` | update 文档写 `main...upstream/main = 1 0` |
| CODE-121 | `/Users/muqihang/chelingxi_workspace/clawdbot/analysis/openclaw-memory-deep-dive.md:445`      | 仍锚定 `qmd-manager.ts:602`                |
| CODE-122 | `/Users/muqihang/chelingxi_workspace/clawdbot/src/memory/qmd-manager.ts:744`                  | 当前 scope 函数起始行为在 744              |
| CODE-123 | `/Users/muqihang/chelingxi_workspace/clawdbot/analysis/openclaw-codebase-product.md:239`      | product 文档写“差异规模 273 commits”       |

## 3. 四份历史文档核对矩阵

| 文档                                                                                        | 已验证结论（>=3）                                                                      | 不一致/待确认（>=2）                                           | 证据                                      |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| `/Users/muqihang/chelingxi_workspace/clawdbot/analysis/openclaw-update-delta-2026-02-08.md` | agents RPC 存在；QMD timeout/scope 存在；STATE_DIR 收敛存在                            | `main...upstream/main=1 0` 已漂移；`273 commits` 已漂移        | CMD-09/10/29, CODE-084~091, CODE-120      |
| `/Users/muqihang/chelingxi_workspace/clawdbot/analysis/openclaw-codebase-product.md`        | Gateway 控制面+WS；渠道策略（allow/mention）存在；工具系统存在                         | 增量“273 commits”漂移；文档几乎无源码锚点（refs=0）需人工回链  | CMD-26/32/38, CODE-003/074/123            |
| `/Users/muqihang/chelingxi_workspace/clawdbot/analysis/openclaw-codebase-tech.md`           | 架构分层与主链路可在源码定位；Gateway/Agent/Channels 模块存在；session+memory 机制存在 | 版本写 `2026.2.3` 已漂移；2 个占位路径不存在                   | CMD-07/26, CODE-117/118                   |
| `/Users/muqihang/chelingxi_workspace/clawdbot/analysis/openclaw-memory-deep-dive.md`        | memory slot 互斥；memory_search/get + system prompt gating；qmd->builtin fallback 存在 | 版本写 `2026.2.3` 已漂移；`qmd-manager.ts:602` 锚点漂移到 744+ | CMD-07/30/39/40, CODE-061~069/119/121/122 |

## 4. 覆盖率统计

- 命令证据：42 条（CMD-01 ~ CMD-42，CMD-11 exit=1 但保留用于排障上下文）
- 代码证据：123 条（CODE-001 ~ CODE-123）
- 硬门槛达成：
  - 代码证据 `>=30`：已达成
  - 命令证据 `>=10`：已达成

## 5. 未知项与待补证

1. Clawdbot 内建 memory（builtin/qmd）未见“语义 revision/supersede 审计链”字段；当前去重主要是 hash/vector 相似度层面，若要跨系统双写需外加幂等键与版本策略（CMD-31, CODE-052, CODE-060）。
2. `analysis/openclaw-codebase-product.md` 以产品叙述为主，源码锚点极少（CMD-26），在实施前应补成“结论-源码”双向链接文档。
3. `main...upstream/main` 属时效性事实，文档快照内容已漂移（CMD-28/29/32），后续增量文档应加“生成时间+仓库 HEAD”元数据防混淆。
