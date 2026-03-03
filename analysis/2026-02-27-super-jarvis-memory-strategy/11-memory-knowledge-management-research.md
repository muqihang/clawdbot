# OpenClaw 高级记忆与知识管理方案调研（2024–2026）

> **版本**: V1.0  
> **日期**: 2026-03-02  
> **目标**: 为 OpenClaw（TypeScript/Node.js、多渠道消息、Supabase/Postgres 作为长期存储）寻找“可落地”的高级记忆与知识管理方案，并给出实施路线图、风险评估与完整参考资料。

---

## 0. 结论先行（给决策者）

### 推荐方案（1–2 个）

1. **推荐 A（主推）**：**Mem0 OSS（语义记忆） + Graphiti（时序知识图谱） + Supabase(Postgres) 作为“治理与系统记录”**
   - **理由**：OpenClaw 仓库已存在 `memory-mem0-graphiti-bridge` 扩展与路由策略雏形（语义→Mem0、时序/关系→Graphiti、Local 兜底），属于“在现有方向上补齐治理、审计、权限、可观测性”的路线，**改动最小、收益最大**。
   - **落地点**：把 Supabase/Postgres 变成 **memory governance center**：线程/用户映射、写入审批、审计日志、软删/版本、冲突检测、成本归因与指标。

2. **推荐 B（备选/单栈 Postgres 优先）**：**Memobase（Profile + Timeline，Postgres+Redis） + Supabase(Postgres)**
   - **理由**：更接近“把长期记忆当作用户画像 + 事件时间线”的产品形态，**天然适配 Postgres**，并提供 npm SDK + MCP；可先解决“稳定可控的用户级长期记忆”，再按需补 Graphiti 做多跳关系推理。

---

## 1. OpenClaw 当前基础（代码级观察）

> 本节只总结“可直接复用/扩展”的结构，避免重复 `00-10` 草案内容。

### 1.1 已存在的记忆相关扩展

- `extensions/memory-core/`：本地文件型记忆工具与 `openclaw memory` CLI（最低依赖、可用作兜底与调试基线）。
- `extensions/memory-jarvis-bridge/`：兼容性优先的桥接层，带有“写入审批/commit gate”雏形，适合复用其“准入控制 + 提案提交”机制做 Memory Governance。
- `extensions/memory-lancedb/`：LanceDB 方向探索（偏向向量库方案）。
- `extensions/memory-mem0-graphiti-bridge/`：**已实现 Mem0 + Graphiti 的读写路由与灰度策略**（是本次调研最重要的“落地抓手”）。

### 1.2 已存在的三路路由思想（非常契合“分层记忆”）

在 `extensions/memory-mem0-graphiti-bridge/src/router/read-router.ts` 中已出现意图分类与路由策略（例如：精确 ID、时序关系、实体属性、决策原因、其他），并默认形成如下策略：

- **timeline/关系/事件链** → Graphiti（时序 KG）
- **semantic/偏好/事实召回** → Mem0（向量语义记忆）
- **兜底/热数据** → Local memory

这意味着：OpenClaw 并非从零开始选型，而是在“已有的双后端记忆栈”上补齐治理与生产化能力。

---

## 2. Mem0 深入调研（架构 / 特性 / 集成）

### 2.1 技术架构要点

- **定位**：为 AI Agents 提供“可增量更新”的语义记忆层（ADD/UPDATE/DELETE/NOOP 这类记忆生命周期操作是其核心理念之一）。
- **存储形态**：以向量检索为主（支持多种向量后端），并支持“Graph Memory”把实体与关系映射到图后端（Neo4j/Memgraph/Neptune/Kuzu 等 Bolt 兼容后端）。
- **访问方式**：
  - **Node/TypeScript SDK**：`mem0ai/oss`，面向 TS/JS 应用快速接入。
  - **REST API Server（FastAPI）**：把 OSS 能力暴露成 HTTP；但 **默认镜像不带鉴权**，文档明确建议自行加 auth/HTTPS，再暴露到内网之外。

### 2.2 与 PostgreSQL / Supabase 的集成能力（关键点）

Mem0 对 Postgres/Supabase 的支持非常直接、且“对 TS 友好”：

1. **Supabase 作为向量后端（pgvector）**
   - 文档提供了面向 TypeScript 实现的 SQL migrations：创建 `memories` 表、启用 `vector` 扩展、并提供 `match_vectors()` 的向量相似检索函数（带 `metadata @> filter` 的 JSONB 过滤）。
   - 这与 OpenClaw 想要的“把长期记忆落到 Supabase/Postgres”高度一致：**向量表与过滤逻辑可直接跑在 Supabase**。

2. **Supabase 作为历史/审计型 historyStore**
   - Mem0 Node SDK 支持把 `historyStore` 指向 Supabase，并给出了 `memory_history` 表结构（含 `previous_value/new_value/action/is_deleted` 等字段）。
   - 这对 OpenClaw 非常关键：你可以把“记忆变更历史”落在 Supabase，作为治理与审计的系统记录（System of Record）。

### 2.3 多模态能力

- Mem0 OSS 提供 **文本 + 图片** 的记忆写入形式（`image_url` / base64 data url），支持常见格式（JPEG/PNG/WebP/GIF），并在文档给出错误处理与文件大小建议（例如 20MB 限制等）。
- 对 OpenClaw 的含义：可以先用“图片→（caption/结构化字段）→文本记忆”的方式落地多模态，再逐步引入图像 embedding 或多模态 reranker。

### 2.4 适配 OpenClaw 的“最小接入方式”

建议以“服务分层 + 逐步替换”为原则：

- **短期**：用 Mem0 Node SDK 直接接入（最小工程量），向量后端选 Supabase/pgvector；历史审计也写 Supabase。
- **中期**：把 Mem0 OSS REST API Server 作为 sidecar service 部署（适合多语言或多服务共享记忆；但必须补鉴权与网络隔离）。
- **长期**：以 Supabase 为“治理与真相来源”，Mem0 只做语义抽取与向量检索后端；必要时可替换 embedder/reranker 而不动治理层。

---

## 3. Graphiti（Zep）深入调研（架构 / 特性 / 集成）

### 3.1 技术架构要点

- **定位**：面向 AI agent 的 **时序知识图谱（Temporal Knowledge Graph）** 框架。强调：
  - 图会随时间演化（事实有有效期/无效期）
  - 支持增量更新、历史查询，而不是每次重建整张图
- **MCP Server**：Graphiti 提供实验性的 MCP server，通过 MCP 协议暴露关键能力；同时支持 HTTP transport，默认 MCP endpoint 为 `/mcp/`，对 Cursor/Claude Desktop 等客户端友好。

### 3.2 Graphiti MCP Server 的“生产化特性”（与 OpenClaw 相关）

从 MCP server README 可直接提炼出与 OpenClaw 兼容性强的点：

- **Episode 管理**：支持把文本、messages、JSON 作为 episode 写入/删除/检索（很适合把“多渠道消息”当作 episode 流）。
- **Search 能力**：支持语义与混合检索，能搜 edge（facts）与 node summary。
- **Group 管理**：`group_id` 过滤/隔离能力（对 OpenClaw 多租户/多用户/多项目隔离很关键）。
- **异步队列处理**：queue-based processing + 并发限制（适合把写入成本放到异步 outbox）。
- **后端**：默认 FalkorDB（Redis-based graph DB），也支持 Neo4j。
- **多 LLM/Embedding provider**：OpenAI/Anthropic/Gemini/Groq/Azure OpenAI 等，embedding 也多选项。
- **实体类型**：内置结构化抽取的 entity types（Preference/Requirement/Procedure/Location/Event/Organization/Document…），有利于把 OpenClaw 的“项目/任务/决策”沉淀为可查询的图谱。

### 3.3 与 PostgreSQL 的关系（务实结论）

- Graphiti 目前的核心优势建立在 **图数据库后端**（FalkorDB/Neo4j）。
- 社区存在“用 Apache AGE 在 Postgres 上跑图”的尝试/讨论，但从公开 issue 观察，成熟度与“能否在 Supabase 上用”都不乐观（Supabase 通常不开放安装 AGE 这类扩展）。

因此，**务实路线**是：

- **Graphiti 继续使用独立图后端**（FalkorDB/Neo4j），专注解决时序关系与多跳推理。
- **Supabase/Postgres 负责治理、审计、映射与检索加速辅助索引**（例如把 Graphiti 的 node/edge 的“可检索摘要”冗余到 Postgres 用于快速过滤/列表/管理 UI）。

---

## 4. 替代方案与新兴技术（2024–2026）

本节只保留“对 OpenClaw 可落地、并且能与 Postgres/Supabase 同居”的方向。

### 4.1 Memobase（Profile + Timeline，Postgres 原生）

- **定位**：以“用户画像（profile）+ 事件时间线（event timeline）”为中心的长期记忆系统。
- **技术栈**：README 明确提到以 FastAPI 构建，后端使用 **Postgres + Redis**，并提供 **Node SDK（npm 包 `@memobase/memobase`）** 与 MCP。
- **亮点**：
  - 把“长期记忆”产品化成可控的 profile schema（更适合做“用户偏好、背景、习惯”这类长期事实）
  - timeline/event 支持时序问题（对“最近发生了什么”类问题更自然）
  - Postgres-first：更符合“把 Supabase 当系统记录”的路线
- **短板**：相比 Graphiti 的多跳关系/实体网络，Memobase 更偏“以用户为中心的结构化画像”，对复杂实体关系网络能力弱一些（但可通过后续引入图层补齐）。

### 4.2 LangGraph.js + Postgres（状态/线程/检查点持久化）

- **定位**：LangGraph 是“有状态 agent workflow”的编排框架；其 persistence 模块把 **thread/checkpoint** 的状态存到持久化后端。
- **Postgres checkpointer**：`@langchain/langgraph-checkpoint-postgres` 提供 `PostgresSaver`，支持从连接串或连接池初始化，并要求首次使用 `.setup()` 创建表结构。
- **适合 OpenClaw 的点**：
  - 如果 OpenClaw 想把“复杂多步工作流、可恢复的 agent 执行状态”也纳入长期记忆治理，那么 LangGraph 的 thread/checkpoint 是一个**很像“执行记忆/过程记忆”**的抽象。
  - 但它不是开箱即用的“用户长期记忆库”，需要你自己定义“哪些信息写入 store / 怎么检索 / 怎么更新删除”。

### 4.3 LlamaIndex TypeScript + PGVectorStore（知识库/RAG 的 PG 落地）

- **定位**：更偏文档/知识库 RAG 的框架（load → parse → chunk → embed → retrieve → synthesize）。
- **PGVectorStore**：官方 TS API Reference 有 `PGVectorStore` 类，可 `add/query/delete`，与 Postgres 结合紧密。
- **适合 OpenClaw 的点**：
  - 如果 OpenClaw 想做“知识库（docs、代码、工单、会议纪要）”与“对话记忆（偏好、历史决策）”并存，LlamaIndex TS 的 PGVectorStore 适合作为知识库侧的索引层。
  - 但它不解决“记忆治理/更新删除/冲突检测”，需要配套治理层。

### 4.4 其他观察到但不优先的方向（简述）

- **Cognee**：强调“Knowledge Engine + 多模态（对话/文件/图片/音频转写）”，但主要是 **Python** 栈；对 OpenClaw(TS) 来说要么引入额外服务，要么需要较大集成成本。
- **各类 Postgres MCP Memory Server**：如 “memories in postgres” 的 MCP server 项目存在，但规模与成熟度参差，适合参考接口设计，不建议作为核心依赖。

---

## 5. 技术方案对比表（3–5 个候选）

> 说明：这里把“候选”定义为 **OpenClaw 可在 1–4 周内开始集成/试点** 的方案。  
> 评分与难度是“工程视角的定性评估”，不是基准测试结论；性能最终要以 OpenClaw 自己的数据与负载 profile 压测为准。

| 候选方案                                                                 | 核心定位             | 功能覆盖（长期记忆 / 上下文 / KG）                   | PostgreSQL / Supabase 适配                                                        | 多模态（文本/图像/代码/对话）                                                      | 性能与成本（定性）                                                                 | 集成难度（定性）                                      | 适合 OpenClaw 的用法                                                            |
| ------------------------------------------------------------------------ | -------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| **A. Mem0 OSS + Supabase(pgvector) +（可选 Graph Memory）**              | 语义长期记忆层       | 长期记忆: 强 / 上下文装配: 强 / KG: 部分（需图后端） | 原生支持 Supabase 向量表与 TS SQL migrations；Node SDK 支持 Supabase historyStore | 文本: 支持 / 图片: 支持 / 代码: 部分（需 code-embedding 流程） / 对话: 支持        | 在线检索延迟通常可控；成本主要在 embedding/抽取 LLM；infra 成本低（Postgres 为主） | **低-中**（TS SDK 直连；REST server 需补 auth）       | 作为语义记忆主存；把审计/治理写 Supabase；与 Graphiti 互补                      |
| **B. Graphiti MCP + FalkorDB/Neo4j + Supabase(治理/映射)**               | 时序知识图谱层       | 长期记忆: 部分（偏关系）/ 上下文装配: 强 / KG: 强    | Postgres 不作为图存储；但 Supabase 可作为审计/映射/管理 UI 存储                   | 文本: 支持 / 图片: 部分（需先转文本） / 代码: 部分（同上） / 对话: 支持（episode） | 图查询性能取决于后端与图规模；写入涉及 LLM 抽取，需异步化控制成本                  | **中**（需要单独 graph DB + 运行 MCP server）         | 作为“项目/人物/决策/事件链”记忆；回答 Why/When/Who-related 的多跳问题           |
| **C. Memobase + Supabase(Postgres) + Redis**                             | 用户画像 + 时间线    | 长期记忆: 强（用户级）/ 上下文装配: 强 / KG: 弱      | Postgres-first；可把 Postgres 放 Supabase；Redis 可自建/托管                      | 文本: 支持 / 对话: 支持 / 图片: 部分 / 代码: 部分                                  | 强依赖其 profile/timeline 工作流；成本可控但仍有抽取 LLM 成本；Redis 引入额外运维  | **中**（引入 FastAPI 服务/或容器；但数据层更贴近 PG） | 更适合“人格化/偏好/背景/习惯/长期事实”这种稳定记忆产品形态                      |
| **D. LangGraph.js + PostgresSaver + 自建记忆抽取/检索层**                | 执行状态与可恢复线程 | 长期记忆: 需自建 / 上下文装配: 强 / KG: 无           | 线程/检查点能落 PG；与 Supabase 兼容好                                            | 文本: 取决于自建 / 图片-代码-对话: 取决于自建                                      | 性能与成本高度取决于自建策略；但“执行状态持久化”非常清晰                           | **中-高**（要设计 store schema、检索策略、治理策略）  | 适合作为“过程记忆/工作流记忆”底座；与 Mem0/Graphiti 组合更佳                    |
| **E. Supabase-native 自研（pgvector + Hybrid Search + Vector Buckets）** | 最小外部依赖         | 长期记忆: 可做 / 上下文装配: 强 / KG: 弱-部分        | 完全贴合 Supabase；可用 pgvector + FTS + RLS + Edge Functions                     | 文本/对话/代码: 支持（自己定义）/ 图片-音频: 需对象存储 + 转写/描述                | infra 成本最低；但研发成本最高；性能要自行调优（索引/分区/缓存）                   | **高**（需要较多 schema/服务设计）                    | 当你明确要“全部掌控 + 长期治理”且团队愿意承担研发成本时可选；也可作为治理层先行 |

---

## 6. 推荐方案（面向 OpenClaw 的落地设计）

### 6.1 推荐 A：Mem0 + Graphiti + Supabase 治理层（主推）

**一句话**：保持 OpenClaw 现有“双后端记忆”方向，把 Supabase/Postgres 作为“治理与真相”，并把 Mem0/Graphiti 都当作可替换的“检索与抽取引擎”。

#### A-1. 分层职责（与现有草案一致，但更“生产化”）

- **Supabase/Postgres（System of Record）**
  - 线程/用户/渠道映射：`channel_thread_id → openclaw_thread_id → memory_user_id/group_id`
  - 写入审计与版本：memory proposal、审批状态、变更历史（可直接复用 Mem0 historyStore 的思路）
  - 权限与隔离：RLS + service role 写入；多租户的组织/团队/个人隔离
  - 可观测性与成本归因：每次写入/检索的耗时、token、向量查询次数、图查询次数

- **Mem0（语义记忆）**
  - 负责：事实/偏好/总结的抽取、去重、语义检索、可选多模态记忆
  - 向量后端优先：Supabase/pgvector（便于统一治理、备份、权限与成本）

- **Graphiti（关系 + 时序）**
  - 负责：多跳推理、时间线、因果链、关系演化
  - 以 Graph DB 做计算后端，但把最小必要的“可管理元数据”同步回 Supabase

#### A-2. 为什么它最适合 OpenClaw

- **最小改造**：代码里已经存在桥接与路由扩展，说明“接口层”基本具备。
- **符合多渠道场景**：Graphiti 的 episode 与 group_id 隔离很适配“不同渠道同一用户/项目”的汇聚。
- **Supabase 友好**：Mem0 已给出 Supabase/pgvector 的 SQL migrations 与 TS/Node 快速接入路径。

#### A-3. 需要明确的工程决策（避免后期返工）

1. **ID 体系（强约束）**：每条“记忆”必须有 OpenClaw 侧的稳定 ID，映射到 Mem0 memory id / Graphiti entity id。
2. **写入策略（先异步、后强一致）**：对 Graphiti/Mem0 的写入建议先走 outbox 异步，读路径可优先读“最后一致快照”，以避免写入抖动影响对话响应。
3. **冲突与撤销**：必须把“update/delete”设计为第一等公民（否则长期记忆必然漂移、冲突、变脏）。
4. **安全**：Mem0 REST server 默认无 auth；Graphiti 服务也需要网络隔离、token、速率限制与审计。

### 6.2 推荐 B：Memobase（Postgres-first）作为备选

当你更强调“**用户画像与长期偏好**”而不是复杂关系推理时，Memobase 是更干净的选择：

- 你可以把 Memobase 的 Postgres 放在 Supabase，利用 Supabase 做权限、备份与管理。
- Redis 可以用托管（Upstash/Elasticache 等）或自建；如果运维不想引入 Redis，可评估是否能降级到纯 PG（但需验证 Memobase 依赖程度）。
- OpenClaw 接入方式可以走：
  - 直接调用 Memobase API/SDK 取 profile/context
  - 或者把 Memobase 作为 MCP server，让 OpenClaw tool 层直接对接

---

## 7. 实施路线图（分阶段集成到 OpenClaw）

> 目标：每一阶段都能独立交付可见价值，且可灰度/可回滚。

### Phase 0（1–2 周）：把“治理层”先立住（不重构核心）

- 在 Supabase 建立最小 schema：
  - `memory_items`（canonical id、类型、scope、摘要、状态）
  - `memory_sources`（指向消息、文件、图片、音频、代码片段的 source-of-truth）
  - `memory_events`（ADD/UPDATE/DELETE/NOOP，带 actor/channel/thread/时间戳）
  - `memory_audit_log`（管理端操作、RLS 审计、导出/删除请求）
- 在 OpenClaw 扩展层增加“统一 memory id 映射”与“读写指标埋点”（无需改动路由策略）。
- 统一配置与密钥管理（Supabase service role、Mem0 key、Graphiti endpoint），并在日志中去敏。

### Phase 1（2–4 周）：接入 Mem0（语义）到 Supabase pgvector

- 选型落地：
  - Mem0 Node SDK 直连（最快），向量后端用 Supabase/pgvector（按 Mem0 Supabase 文档 migrations 落表）。
  - historyStore 用 Supabase（按 Node quickstart 的 `memory_history` 表结构落地），与 OpenClaw audit log 打通。
- 写路径：
  - 从对话中抽取“可记忆片段”（可先规则/阈值，后上 LLM）
  - 写入 Supabase（events/outbox）→ 异步写 Mem0 → 回写 mem0_id
- 读路径：
  - 先通过 OpenClaw router 判断是否语义问题
  - Mem0 `search()` 返回结果后进行“治理过滤”（软删、冻结、低置信度降权）

### Phase 2（3–6 周）：接入 Graphiti（时序 KG）并做三路融合

- Graphiti MCP server 部署（建议 Docker compose 起 FalkorDB + MCP server；生产可切 Neo4j）
- 以 `group_id` 实现多租户隔离（user/org/project）
- 把 OpenClaw 多渠道消息写入 Graphiti episode（建议 outbox 异步）
- 读路径融合：
  - 并行检索：Local + Mem0 + Graphiti
  - 候选归一化：统一 memory id + source anchors（指向具体消息/文件/episode）
  - 重排策略：Graphiti 的 node distance rerank / focal node 思路用于“以用户/项目为中心”的上下文聚合

### Phase 3（持续迭代）：规模化、质量与成本

- **pgvector 调优**：HNSW/IVFFlat 选择、过滤列索引、迭代扫描避免 overfiltering（pgvector 0.8+）。
- **冷热分层**：热数据留 pgvector；冷数据/海量 embeddings 用 Supabase Vector Buckets（注意：官方文档标注 alpha，需评估风险）。
- **多模态**：图片/音频统一落 Supabase Storage（或外部对象存储），抽取 caption/transcript 后写入记忆；必要时引入专用多模态 embedding。
- **治理完善**：冲突检测（同一实体/属性的相互矛盾）、记忆冻结、用户可编辑 UI、导出与删除（合规）。

---

## 8. PostgreSQL / Supabase 集成最佳实践（面向落地）

### 8.1 表设计：把“治理数据”与“向量索引”解耦

建议拆成两类表：

1. **治理与业务真相表（强一致、可审计、可 RLS）**
   - `memory_items`：canonical id、owner、scope、type、status、confidence、tags
   - `memory_events`：event-sourcing（ADD/UPDATE/DELETE/NOOP），每条包含 `source_ref`（指向消息/文件/episode）
   - `memory_links`：把 memory 关联到项目/任务/用户画像字段（可做轻量关系，不必一上来就图）

2. **检索加速表（可重建、可分区）**
   - `memory_vectors`：`embedding vector(dims)` + metadata jsonb + created_at
   - 需要时再加：`memory_fts`（tsvector）、`memory_trgm`（模糊词）

这样做的好处：向量索引可重建、可迁移到 Vector Buckets；治理表仍然稳定。

### 8.2 pgvector：索引选择与“过滤陷阱”

- **HNSW vs IVFFlat**（简化建议）
  - 数据持续写入、需要较好召回：倾向 **HNSW**
  - 数据相对静态、追求吞吐与可控：可用 **IVFFlat**
  - 真实选择要结合“写入速率、过滤条件、topK、召回要求”做压测。

- **过滤（WHERE + metadata）导致 overfiltering**
  - pgvector 0.8.0 引入 **iterative index scans**，用 `hnsw.iterative_scan` / `ivfflat.iterative_scan` 机制在过滤条件下继续扫描，减少“扫不到足够候选”的问题。
  - 仍然建议：对常用过滤列（tenant_id、user_id、project_id、time bucket）建立 B-tree/partial index，并考虑按 tenant/time 分区，降低向量索引扫描压力。

### 8.3 Supabase：pgvector + Hybrid Search + 自动 embeddings

可直接利用 Supabase 官方文档的实践路径：

- pgvector 扩展启用与向量索引（HNSW/IVF）
- Hybrid Search（FTS + vectors）
- Automatic embeddings（适合“写入触发→异步 embedding”的流水线，但要注意成本与批处理）

### 8.4 Vector Buckets：大规模 embeddings 的冷存储（注意 alpha）

Supabase 推出 Vector Buckets（S3-backed），并支持通过 **FDW（foreign data wrapper）** 在 Postgres 中查询向量索引；官方文档标注该能力处于 alpha，适合做“冷数据层”或“巨量 embeddings”场景的探索，但不要立刻作为强依赖主路径。

### 8.5 pg_embedding / pgvectorscale：务实建议

- `pg_embedding`（Neon）仓库已归档且停止维护：不建议作为 OpenClaw 的核心依赖。
- `pgvectorscale`（Timescale）提供 DiskANN/压缩等能力，适合自建 Postgres 或 Timescale 体系；但在 Supabase 托管环境中未必可用，建议作为“未来扩展/自建路径”的备选。

---

## 9. 风险评估（技术债 / 性能瓶颈 / 兼容性）

### 9.1 关键风险清单

1. **双写一致性与回滚复杂度（Mem0 + Graphiti）**
   - 风险：写入失败、延迟、部分成功会导致“读到不一致上下文”。
   - 缓解：outbox + 幂等写入 + 可重放；读路径以“治理层快照”为准；必要时降级只读 Mem0 或只读 Graphiti。

2. **安全与合规（默认无鉴权的服务 + PII）**
   - Mem0 REST API 默认无 auth，需要额外网关/鉴权/速率限制。
   - Graphiti/MCP 服务同理，需要私网、token、日志去敏、数据最小化策略。

3. **成本失控（抽取/更新频率过高）**
   - 长期记忆系统最大的坑往往不是“能不能存”，而是“存得多、更新得勤、每次都跑 LLM”。
   - 缓解：写前准入（只记高价值）、批处理、延迟合并、对低价值内容 NOOP。

4. **检索噪声与冲突累积（缺少 UPDATE/DELETE）**
   - 必须把 update/delete 与冲突检测作为 P0 能力，否则记忆会漂移并降低可信度。

5. **Supabase 托管限制**
   - 扩展安装、超大向量表、超大索引、长事务等都可能遇到平台限制；Vector Buckets 仍在 alpha。

### 9.2 建议的“上线护栏”（最低可行）

- Feature flag：shadow write、canary、按 tenant 开关
- 预算护栏：按 user/org 设置每日写入与更新配额、embedding 预算
- 数据生命周期：按时间/重要度 TTL、冷存储归档、用户可导出/可删除
- 端到端指标：命中率、冲突率、检索延迟、写入成功率、每次对话的 memory token 节省

---

## 10. 参考资料清单（完整 URL）

> 说明：按“权威程度优先（官方文档/源码/论文）→ 社区讨论（HN）→ 博客/教程（Medium/Dev.to）→ 索引（Awesome lists）”排序。

### 10.1 Mem0（官方/源码）

- https://github.com/mem0ai/mem0
- https://docs.mem0.ai/open-source/overview
- https://docs.mem0.ai/open-source/node-quickstart
- https://docs.mem0.ai/open-source/features/rest-api
- https://docs.mem0.ai/open-source/features/graph-memory
- https://docs.mem0.ai/open-source/features/multimodal-support
- https://docs.mem0.ai/components/vectordbs/dbs/pgvector
- https://docs.mem0.ai/components/vectordbs/dbs/supabase
- https://docs.mem0.ai/openmemory/quickstart
- https://mem0.ai/blog/self-host-mem0-docker

### 10.2 Graphiti（官方/源码）

- https://github.com/getzep/graphiti
- https://help.getzep.com/graphiti/getting-started/quick-start
- https://help.getzep.com/graphiti/working-with-data/searching
- https://raw.githubusercontent.com/getzep/graphiti/main/README.md
- https://raw.githubusercontent.com/getzep/graphiti/main/mcp_server/README.md
- https://github.com/getzep/graphiti/issues/1095

### 10.3 Zep（Cloud 方向与 OSS 策略变化）

- https://github.com/getzep/zep
- https://raw.githubusercontent.com/getzep/zep/main/README.md
- https://getzep.github.io/zep-js/
- https://blog.getzep.com/announcing-a-new-direction-for-zeps-open-source-strategy/

### 10.4 PostgreSQL / pgvector / Supabase（权威文档）

- https://github.com/pgvector/pgvector
- https://www.postgresql.org/about/news/pgvector-080-released-2952/
- https://supabase.com/docs/guides/database/extensions/pgvector
- https://supabase.com/docs/guides/ai/vector-indexes
- https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes
- https://supabase.com/docs/guides/ai/vector-indexes/ivf-indexes
- https://supabase.com/docs/guides/ai/hybrid-search
- https://supabase.com/docs/guides/ai/automatic-embeddings
- https://supabase.com/docs/guides/ai/going-to-prod
- https://supabase.com/blog/vector-buckets
- https://supabase.com/docs/guides/storage/vector/introduction
- https://supabase.com/docs/guides/storage/vector/creating-vector-buckets
- https://supabase.com/docs/guides/storage/vector/querying-vectors
- https://supabase.com/docs/guides/database/extensions/wrappers/s3_vectors
- https://github.com/timescale/pgvectorscale
- https://github.com/neondatabase/pg_embedding

### 10.5 LangGraph / LangChain（TS 生态 + Postgres）

- https://langchain-ai.github.io/langgraphjs/reference/modules/langgraph-checkpoint-postgres.html
- https://docs.langchain.com/oss/javascript/langgraph/persistence
- https://docs.langchain.com/oss/javascript/langchain/long-term-memory
- https://reference.langchain.com/javascript/classes/_langchain_community.stores_message_postgres.PostgresChatMessageHistory.html

### 10.6 LlamaIndex TypeScript（PGVectorStore）

- https://developers.llamaindex.ai/typescript/framework-api-reference/classes/pgvectorstore/

### 10.7 其他候选 / 新兴项目（GitHub）

- https://github.com/memodb-io/memobase
- https://github.com/letta-ai/letta
- https://github.com/topoteretes/cognee
- https://github.com/supavec/supabase-ai
- https://github.com/Aaronontheweb/postg-mem

### 10.8 社区文章与讨论（HN / Medium / Dev.to）

- https://news.ycombinator.com/item?id=41447317
- https://news.ycombinator.com/item?id=41445445
- https://medium.com/@abdibrokhim/integrating-mem0-into-ai-agentic-apps-7e9dd58e9adc
- https://dev.to/deniskisina/building-ai-agents-that-actually-remember-a-deep-dive-into-langgraph-mem0-1nee
- https://dev.to/n3rdh4ck3r/how-to-give-claude-code-persistent-memory-with-a-self-hosted-mem0-mcp-server-h68

### 10.9 学术论文与评测基准（arXiv / OpenReview / 项目主页）

- https://arxiv.org/abs/2504.19413
- https://arxiv.org/abs/2501.13956
- https://arxiv.org/pdf/2502.12110
- https://openreview.net/forum?id=FiM0M8gcct
- https://arxiv.org/abs/2402.17753
- https://snap-research.github.io/locomo/
- https://github.com/snap-research/locomo
- https://arxiv.org/html/2602.11243v1
- https://arxiv.org/html/2602.22769v1

### 10.10 Awesome Lists / Topics（索引入口）

- https://github.com/DEEP-PolyU/Awesome-GraphMemory
- https://github.com/InftyAI/Awesome-LLMOps
- https://github.com/topics/ai-memory
