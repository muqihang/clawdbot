# Zep Cloud 平台层差异与 OpenClaw 可抄实现手册（玩法 + 实现）

> 日期：2026-02-24  
> 目标：回答“Graphiti 不是 Zep Cloud 线程/用户/消息平替”到底是什么意思，并给出在 OpenClaw 里可落地的“抄玩法 + 抄实现”路线。  
> 范围：只产出研究与实施手册，不改代码。  
> 调研方法：本地代码与文档对位 + Exa 发现 + Tavily 深抽取 + 官方文档核验。

---

## 0) 先说结论（TL;DR）

1. **Graphiti 是图记忆引擎，不是完整对话平台**；Zep Cloud 在 Graphiti 之上补了用户/线程/消息/上下文装配/异步任务/运维治理层。
2. 你那句“不要把 Graphiti 当 Zep Cloud 线程管理平替”的意思是：**Graphiti 负责知识图谱，Zep 负责“可运营产品面”**。
3. 对 OpenClaw 当前三大短板最有价值的“可抄”顺序：
   - 先抄 `User + Thread + Message` 语义层；
   - 再抄 `get_user_context + context template` 的上下文装配层；
   - 然后抄 `task/webhook` 的异步可观测层。
4. 真正“抄实现”可分两类：
   - **可直接抄代码**：Graphiti 开源（Apache-2.0）及其公开示例；
   - **可复刻行为**：Zep Cloud 文档公开的 API 语义与工作流（闭源实现本身不能直接拷贝）。
5. 对你当前需求（个人 AI 助理）最有效的不是先上 RBAC，而是先把“线程/上下文/异步状态”做实，立刻提升首条可用率与错误可解释性。

---

## 1) 那句话到底什么意思

原句：

> “不要把 Graphiti 当作 Zep Cloud 的线程管理平替；Graphiti 是图引擎，Zep 还包含线程/用户/消息平台层。”

### 1.1 技术含义

- **Graphiti 的核心职责**：
  - episode/fact/entity/edge 的抽取与存储；
  - 时序关系（关系有效期、失效）；
  - hybrid 检索（语义 + 关键词 + 图算法重排）。
- **Zep Cloud 的额外职责**（Graphiti 之外）：
  - 用户建模（user lifecycle + 隐私删除）；
  - 会话线程（thread lifecycle + message history）；
  - 上下文装配（`thread.get_user_context` + template）；
  - 异步任务状态（task polling）与 webhook 回调；
  - 运营与治理（dashboard 日志、审计、权限）。

### 1.2 在 OpenClaw 当前代码里的对应缺口

- 读路由仅 `timeline | semantic` 两类意图，没有一等公民的 `user/thread/message` 数据平面。  
  证据：`extensions/memory-mem0-graphiti-bridge/src/router/read-router.ts`
- 远端检索客户端仅 `search(query)`，payload 只有 `{ query }`。  
  证据：`extensions/memory-mem0-graphiti-bridge/src/client/mem0-client.ts`
- `shadow` 指标只比 `localCount` vs `remoteCount`，缺少平台级质量信号。  
  证据：`extensions/memory-mem0-graphiti-bridge/src/metrics/shadow-reporter.ts`

---

## 2) Zep Cloud 有、Graphiti 本体不内置（或需你自己补）的能力

> 这里说的“不内置”，是指 Graphiti 作为 OSS 图引擎不会替你把产品平台层都搭好。

### 2.1 用户与线程数据平面

- Zep 文档明确给了 `Users` + `Threads` 模型：一个用户可有多线程；`thread.add_messages` 同时写消息历史并进入用户图谱。
- 删除用户可一键清理该用户关联线程与图谱数据（RTBF 语义）。
- Graphiti 本体提供的是 `group_id` namespacing（隔离能力），不是完整用户/线程 API 产品面。

**可抄点（OpenClaw）**

- 在桥接层建立 `oc_user_id / oc_thread_id / oc_message_id` 规范映射；
- `group_id` 继续做物理隔离，但上层补线程语义。

### 2.2 消息写入治理能力

Zep `thread.add_messages` 公开了很多“产品级”细节：

- `ignore_roles`（例如忽略 assistant 写图但保留线程历史）；
- message metadata（并支持后续更新）；
- `created_at`（RFC3339，影响事实时序/失效）；
- 单次消息数/单条长度上限（30 条、4096 字符）；
- `return_context=True`（写后直接回上下文，少一次往返）。

**可抄点（OpenClaw）**

- 把当前 outbox event payload 拓展成消息语义字段（role/name/created_at/metadata）；
- 在写治理前增加 `ignore_roles` 策略层（例如 tool 输出降权）。

### 2.3 上下文装配层（这是 Zep 最值钱的“平台玩法”）

Zep 提供三层 retrieval 模式：

1. 默认 context block（自动相关性）；
2. context template（自定义格式但自动检索）；
3. advanced（自己 search + 自己拼装）。

而 `thread.get_user_context` 的要点是：

- 用当前线程最近消息做检索种子；
- 返回跨该用户所有线程的相关上下文；
- 文档声明低延迟目标（P95 < 200ms，官方口径）。

**可抄点（OpenClaw）**

- 在 `memory_search` 外加一个 `context_assemble` 阶段，不再把“检索结果列表”直接塞给模型；
- 先做 3 套模板：`精确ID`、`决策原因`、`时序关系`。

### 2.4 异步任务与事件系统

Zep 明确把“数据写入是异步处理”产品化：

- `task.get()` 轮询批任务状态；
- `graph.episode.get()` 轮询单条 episode；
- webhook 事件（如 `episode.processed`, `ingest.batch.completed`）；
- 签名验证、重复投递去重、15 秒内 ack 建议。

**可抄点（OpenClaw）**

- 当前 `propose_only` 观察期最需要这个层：让 proposal 的“可读时机”与“失败原因”可见；
- 可直接复用现有 outbox 状态机，补 task/webhook 适配器。

### 2.5 运营治理层（个人项目可精简）

Zep 平台侧还覆盖：

- API logging（请求时间/端点/状态/延迟/API key）；
- Audit logging（成员动作、资源、IP、request_id）；
- RBAC（账号级/项目级权限）。

**可抄点（OpenClaw）**

- 个人项目不必全量抄 RBAC；
- 先抄“最小审计”与“请求日志结构”，用于质量追踪与回溯。

---

## 3) 你说“我也想抄实现”——可以，怎么抄最实用

## 3.1 可直接抄代码（强建议）

1. **Graphiti 开源能力与示例**（Apache-2.0）：
   - 可直接借用 search recipes / focal-node rerank / ontology 模式；
   - 可参考其 MCP Server 接入做旁路协处理。
2. **公开集成示例（LangGraph/CrewAI/LiveKit/Autogen）**：
   - 抄“结构与流程”最快，不必从零设计 memory adapter。

## 3.2 可复刻行为（不能直接拷闭源代码）

Zep Cloud 闭源平台侧：

- 你可以抄 API 语义与操作流程（例如 `thread.add_messages` + `get_user_context` + `task.get`）；
- 但不能声称/复制其闭源实现代码与品牌资产。

## 3.3 现实边界（即使个人项目也建议遵守）

- 非商用不等于无版权约束；
- 最稳妥路线：**抄接口设计 + 抄状态机 + 抄观测指标 + 抄开源实现**。

---

## 4) OpenClaw 直接落地映射（按你当前代码结构）

| 目标能力          | 当前状态（证据）                                                 | 建议实现点（不改现有行为先）                                                           | 成功判据                                 | 回滚方式                         |
| ----------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------- |
| 用户/线程语义层   | 当前按 query/session 路由，无一等线程层（`read-router.ts`）      | 新增桥接层 `identity map`：channel/user/thread -> stable ids；保留 group_id 做底层隔离 | 项目上下文桶 Top1 提升、跨会话误召回下降 | feature flag 关闭，退回现路由    |
| 消息治理增强      | 写链路已有 outbox/proposal（`p3/worker.ts`）                     | 补 `message envelope` 字段：role/name/created_at/metadata/ignore_roles                 | 冲突误判率下降，pending_review 更稳      | 禁用增强字段，保留现 payload     |
| 上下文装配        | 当前 `memory_search` 直接返回命中列表（`memory-search-tool.ts`） | 增加 `context_assemble` 阶段与模板（精确ID/时序/决策）                                 | 首条可用率提升，答案解释完整率上升       | 关闭 assembler，回退原始结果     |
| 异步可观测        | shadow 只记数量（`shadow-reporter.ts`）                          | 增 task/episode 状态与 webhook 事件日志；把数量指标升级为质量指标                      | stale proposal 降低、失败定位时间缩短    | 停 webhook 消费，退回轮询/原日志 |
| Graphiti 高级检索 | Graphiti 目前基本复用通用 search 客户端（`graphiti-client.ts`）  | 引入 `focal-node`、`group_id`、search recipe 参数层                                    | 时序关系桶 Top1 与 FUR 提升              | 参数层 flag 关闭                 |

---

## 5) 30 天“抄玩法 + 抄实现”执行顺序（先快后稳）

### 第 1 周：补平台语义而非先重排

1. 定义 OpenClaw 的 `user/thread/message` 映射规范（不改业务逻辑）；
2. 给 outbox event 增加消息语义字段（只写 shadow）；
3. 扩展 shadow 指标结构（增加 Top1/FUR/CFP/pending/p95/cost 占位）。

**为什么现在做**：先把“数据面”补齐，后续所有重排与模板才有稳定输入。  
**成功判据**：每周可产出分桶质量报表，且无线上行为变化。

### 第 2 周：抄 Zep 的 context block 思路

1. 在桥接层加 `context_assemble`（三模板）；
2. 采用“最近消息 + 多源检索 + 模板拼装”的最小实现；
3. 与当前直出结果并行 shadow，对比首条可用率。

**为什么现在做**：这是最直接提升“回答可用性”的层。  
**成功判据**：FUR 提升 >= 6pp，p95 增量可控。

### 第 3 周：抄异步状态管理

1. 提供 task polling 视图（绑定 outbox event）；
2. 新增 webhook consumer（先内部事件总线，不对外）；
3. 建立去重（event id）与重试策略。

**为什么现在做**：解决“写了但何时可读、失败在哪里”的盲区。  
**成功判据**：pending 老化下降，失败重试可观测。

### 第 4 周：抄 Graphiti 高级检索实现

1. 引入 focal-node rerank 与 namespace 约束；
2. 把 Graphiti search recipes 作为可选策略；
3. 灰度验证时序桶与项目上下文桶收益。

**为什么现在做**：平台层补齐后，Graphiti 高阶能力才会真实转化为收益。  
**成功判据**：时序桶 Top1 提升 >= 10pp。

---

## 6) 生态高级玩法（Exa + Tavily 二次调研，可借鉴到 OpenClaw）

1. **CrewAI 外部记忆自动读写**：任务开始自动检索、任务结束自动写回（双存储：用户上下文 + 共享图谱）。
   - 借鉴：把 OpenClaw 的 tool 执行结果纳入统一 memory sink。
2. **LangGraph 记忆模式**：线程状态 + 外部长期记忆拆分，避免 state 无限膨胀。
   - 借鉴：把“近 4-6 轮短上下文”与“长期图谱上下文”分层。
3. **LiveKit 房间隔离模式**：按 room/thread 做记忆隔离。
   - 借鉴：OpenClaw 多渠道统一映射到 thread namespace。
4. **Autogen 图记忆注入**：按 facts_limit/entity_limit 控制注入预算。
   - 借鉴：把 token 预算从“检索条数”改成“事实/实体预算”。
5. **Graphiti MCP Sidecar**：先旁路协处理，不直接替换主链路。
   - 借鉴：你当前最适合 shadow/sidecar 方式做验证。

---

## 7) 你现在最该先做的一件事（在“Zep 缺口补齐”语境下）

**优先动作：先做 `User + Thread + Message` 语义层（P0），再做 context assembly。**

理由：

1. 这层是后续“模板、重排、异步状态”全部能力的输入地基；
2. 与当前桥接结构最兼容，改造成本低于直接上全量融合重排；
3. 回滚简单：保留原 query/session 逻辑并加 flag 切换。

---

## 8) 参考来源

## 8.1 本地代码与文档

- `analysis/2026-02-24-mem0-graphiti-value-maximization/README.md`
- `docs/operations/memory-stack-selfhost.md`
- `extensions/memory-mem0-graphiti-bridge/src/router/read-router.ts`
- `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts`
- `extensions/memory-mem0-graphiti-bridge/src/client/mem0-client.ts`
- `extensions/memory-mem0-graphiti-bridge/src/client/graphiti-client.ts`
- `extensions/memory-mem0-graphiti-bridge/src/metrics/shadow-reporter.ts`
- `extensions/memory-mem0-graphiti-bridge/src/p3/worker.ts`
- `src/memory/manager.ts`
- `src/memory/hybrid.ts`

## 8.2 外部资料（官方/源码/生态）

### Zep / Graphiti 官方文档

- https://help.getzep.com/zep-vs-graphiti
- https://help.getzep.com/users-and-user-graphs
- https://help.getzep.com/threads
- https://help.getzep.com/adding-messages
- https://help.getzep.com/retrieving-context
- https://help.getzep.com/sdk-reference/thread/get-user-context
- https://help.getzep.com/context-templates
- https://help.getzep.com/cookbook/check-data-ingestion-status
- https://help.getzep.com/webhooks
- https://help.getzep.com/performance
- https://help.getzep.com/api-logging
- https://help.getzep.com/audit-logging
- https://help.getzep.com/role-based-access-control
- https://help.getzep.com/graphiti/getting-started/overview
- https://help.getzep.com/graphiti/working-with-data/searching
- https://help.getzep.com/graphiti/core-concepts/graph-namespacing
- https://help.getzep.com/graphiti/core-concepts/custom-entity-and-edge-types
- https://help.getzep.com/graphiti/getting-started/mcp-server

### 开源仓库与生态实践

- https://github.com/getzep/graphiti
- https://github.com/getzep/graphiti/blob/main/README.md
- https://help.getzep.com/langgraph-memory
- https://help.getzep.com/crewai-memory
- https://help.getzep.com/autogen-memory
- https://help.getzep.com/livekit-memory
- https://help.getzep.com/elevenlabs
