# Wave 5 Mem0 Graphiti Ontology-Ready Execution Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不破坏 `day33` 获胜口径的前提下，把当前 `OpenClaw builtin local + Mem0 + Graphiti` 体系，从“`W4` 收口成功方案”推进成“读写链路都可治理、并且为后续 `Ontology` 演进做好地基”的 `W5` 执行方案。

**Architecture:** 本方案不把 `W5` 做成完整 `Ontology` 大工程，而是把它定义为 **Ontology-ready 基础阶段**。核心顺序是：冻结 `W4` 基线 → 硬化 bridge 与 upstream 契约 → 正式收口写链路 operating model → 预埋高扩展、低绑定的 Ontology 基础层 → 安全接入图原生能力 → 升级评测与生产化治理。原则是先把不会轻易推翻的骨架做对，再逐步长成“超级贾维斯”系统。

**Tech Stack:** `OpenClaw builtin memory`、`memory-mem0-graphiti-bridge`、`Mem0`、`Graphiti`、`Neo4j Aura`、`Qdrant`、`DashScope text-embedding-v4@1536`、`PostgreSQL/Supabase`（治理层预埋）、`Gate-4` 评测脚本、`memory-stack` 自托管脚本。

---

## 0. 这版 W5 为什么要修订

这次修订有两个新输入，必须影响 `W5`：

1. **当前系统真实状态已经不只是“读链路成功”。**
   - 读链路当前真实配置是 `read_mode=primary`、`cutover_percent=100`，说明 bridge 读主链路已经全量承载。
   - 写链路当前真实配置是 `write_mode=propose_only`、`p3.auto_worker=true`、`admission_enabled=true`、`commit_canary_ratio=0.05`，说明写不是“没做”，而是已经处于“提案优先 + canary commit”的实验性生产态。
   - 关键事实见：`extensions/memory-mem0-graphiti-bridge/index.ts:114`、`extensions/memory-mem0-graphiti-bridge/src/p3/worker.ts:375`。

2. **“超级贾维斯记忆系统升级落地方案”把下一阶段方向抬高了。**
   - 它不再把三路记忆仅仅看作三个检索引擎，而是把它们重新定位为同一个 `Ontology` 的三个投影。
   - 它要求引入 `PostgreSQL` 治理层、记忆事件流、对象注册、关系、动作、审计与记忆管理接口。
   - 关键思路见：`analysis/2026-03-06-super-jarvis-memory-upgrade-plan.md:33`、`analysis/2026-03-06-super-jarvis-memory-upgrade-plan.md:58`、`analysis/2026-03-06-super-jarvis-memory-upgrade-plan.md:249`。

因此，当前 `W5` 不能只是“继续优化读路径”，而必须同时回答两件事：

- 如何把当前已经半落地的写链路正式收口；
- 如何为 `Ontology` 打地基，但不在 `W5` 就把系统做得过重。

---

## 1. W5 总定位

### 1.1 W5 在整体路线里的位置

`W5` 不是“`W4` 后的一点点优化”，也不是“超级贾维斯完整计划”。

更准确的定位是：

- `W4`：证明三路读融合能赢
- `W5`：把读写链路收成可长期演进的基础平台，并为 Ontology 预埋骨架
- `W6-W8`：逐步把“超级贾维斯”中的治理层、上下文层、主动智能层长出来

也就是说：

- **`W5` 是超级贾维斯路线的第一执行阶段**；
- 但 **`W5` 不负责把超级贾维斯一次性做完**。

### 1.2 W5 主目标

`W5` 完成时，应达到以下 6 个状态：

1. `day33` 获胜口径被正式冻结，不会在后续迭代中丢失。
2. bridge 从“能跑通的大工具层”开始转向“能长期演进的平台层”。
3. 写链路从“半落地实验态”转向“可治理、可审计、可决策的正式模式”。
4. `Ontology` 的最小基础层被预埋，但不会锁死未来扩展。
5. `Graphiti` 图原生能力开始被安全接入，而不是永远停留在 generic `/search`。
6. 评测与生产视图足够强，能支撑 `W6+` 的治理型演进。

### 1.3 W5 非目标

`W5` 不负责：

- 完整实现超级贾维斯全部能力；
- 一次性做完完整 `Ontology schema + API + UI + 主动智能`；
- 直接把 canary commit 放大成全量 canonical commit；
- 为了追求更高分而大规模重做融合算法。

---

## 2. 当前真实状态（执行前必须正视）

## 2.1 读链路状态

当前读链路已经不是早期试验态，而是主运行态：

- `read_mode = primary`
- `cutover_percent = 100`

这意味着 bridge 已经正式承接 `memory_search` 主路径，只是在查询内部仍然保留 local、Mem0、Graphiti 的分工和回退。

### 结论

`W5` 不需要再讨论“是否启用读链路”，而是要在此基础上继续做：

- 契约硬化
- 结构拆分
- 图原生能力接入
- 评测升级

## 2.2 写链路状态

当前写链路不是空白，而是 **半落地实验态**：

- `write_mode = propose_only`
- `auto_worker = true`
- `admission_enabled = true`
- `commit_canary_ratio = 0.05`

并且代码逻辑明确表明：

- 只要 `write_mode != off`，就会捕获写事件，见 `extensions/memory-mem0-graphiti-bridge/index.ts:114`
- 只要 `auto_worker` 且有写，就会跑后台 worker，见 `extensions/memory-mem0-graphiti-bridge/index.ts:115`
- 在 `admission_enabled=true` 时，即使是 `propose_only`，也会进入 commit 评估，并按 canary 比例决定是否进入 canonical commit，见 `extensions/memory-mem0-graphiti-bridge/src/p3/worker.ts:375`

### 结论

`W5` 必须把写链路正式纳入主线，而不是继续只谈读。

但方向不是“马上全量打开写 commit”，而是：

- 明确当前写 operating model
- 让 proposal / canary / manual commit 三者可治理、可观测、可回滚
- 为后续 `Ontology` 治理层接入建立统一写事件语义

---

## 3. W5 设计原则

## 3.1 对 Ontology 的原则：高扩展、低绑定

`W5` 只做最小必要的 `Ontology` 地基，不做完整大系统。

### W5 应做的

- canonical memory id
- object registry 最小骨架
- `memory_events`
- 最小 `memory_links`
- management API 契约预留
- 置信度 / 冲突字段预留

### W5 不应做的

- 一次性把对象模型全定死
- 一次性把所有动作目录做完
- 提前做复杂多租户权限系统
- 把所有业务对象都对象化

### 原则解释

`W5` 的 `Ontology` 目标不是“完整”，而是“未来不会推翻”。

## 3.2 对写链路的原则：先正式化，再扩流

`W5` 的写目标是“正式化”，不是“猛放量”。

具体来说：

1. 先让当前 proposal / canary / manual commit 语义清楚；
2. 再让门禁与审计完善；
3. 最后才讨论是否扩大 commit 比例。

## 3.3 对图能力的原则：先安全利用官方能力，再谈复杂图智能

当前优先级最高的图能力不是更复杂的重排器，而是：

- `group_ids` 范围控制
- 焦点节点与图范围控制
- 更明确的 graph-native recipe 使用

但接入必须保守，因为社区已有多 `group_id` 全文检索缺陷风险。

---

## 4. W5 总体结构

`W5` 改成六段执行：

1. **W5-0：基线冻结与运行画像显式化**
2. **W5-A：bridge 结构硬化与 upstream 契约烟雾测试**
3. **W5-B：写链路正式化与 operating model 收口**
4. **W5-C：最小 Ontology 地基预埋**
5. **W5-D：Graphiti 图原生能力安全接入**
6. **W5-E：评测升级与生产化治理预备**

每一段必须单独过 gate，不允许跨段并行偷跑。

---

## 5. W5-0：基线冻结与运行画像显式化

### 目标

把 `day33` 从“赢过一次的结果”变成正式基线，并把当前成功的运行画像写成明确约束。

### 核心任务

1. 冻结 `day33` 为唯一基线
2. 冻结当前获胜参数：
   - `single-primary`
   - `Graphiti max_facts=1`
   - `memory_search` 连字符回归门
3. 显式记录当前运行画像：
   - embeddings = `DashScope text-embedding-v4@1536`
   - 禁用 `18082`
   - local backend = `builtin`
4. 明确术语：
   - local = 基础记忆层
   - fallback = 一种行为，不是层的全部意义
5. 明确 `qmd` 当前地位：
   - 不在主路径
   - 不参与当前 `W5` 主线收口

### Gate

- `day33` 基线证据完整冻结
- 当前运行画像可单点复现
- 术语与主路径口径不再混乱

---

## 6. W5-A：bridge 结构硬化与 upstream 契约烟雾测试

### 目标

把 bridge 从超大工具层推进成可长期维护的平台层。

### 核心任务

#### A1. 拆分核心职责

至少拆成：

- 查询签名 / 分桶
- 路由与回退决策
- provider 执行层
- 候选归一化与融合排序
- 诊断输出
- 上下文装配

#### A2. 建立 upstream 契约 smoke

必须覆盖：

- `Mem0 /search` 的 `user_id / agent_id / run_id`
- `Graphiti /search` 的返回字段与 score 字段
- `Graphiti /entity-edge`
- `Neo4j` 连接画像
- embeddings 服务可用性

#### A3. 保持 typed error 不退化

任何远端异常继续显式暴露：

- route
- fallback
- error code
- latency
- reason

### Gate

- bridge 模块边界清晰
- upstream 契约变化可被 smoke 抓住
- 不再出现“远端炸了但表面像空结果”的退化

---

## 7. W5-B：写链路正式化与 operating model 收口

### 目标

把当前“proposal + canary commit”的半落地写链路，正式收口成一个可治理、可审计、可回滚、可决策的 operating model。

### 当前真实问题

当前写链路已经在运行，但存在三个问题：

1. 团队很容易误以为“写还没做”或“已经全量落地”，两种理解都不准。
2. proposal / canary / manual commit 虽然有分账字段，但还没有被提升成 `W5` 主线决策对象。
3. 后续若要接 Ontology 治理层，当前写事件语义还不够统一。

### 核心任务

#### B1. 冻结当前写模式事实

明确记录：

- 当前不是 `off`
- 当前不是全量 `propose_commit`
- 当前是 `propose_only + admission + canary commit`

#### B2. 建立写链路门禁

要求明确并可验证：

- dual-write 是否成功
- index-check 是否通过
- 非敏感拦截是否触发
- canary commit 比例与结果
- 回滚路径是否可用

#### B3. 定义写 operating model

至少明确三种状态：

- proposal only
- canary commit
- manual commit / explicit commit

并定义：

- 各自适用场景
- 进入条件
- 退出条件
- 审计字段

#### B4. 定义未来与 Ontology 治理层的接口语义

即使 `W5` 不做完整治理层，也要先明确：

- 每次记忆写入在逻辑上对应哪种 event
- canonical memory id 如何与 source_ref 关联
- proposal / commit / rollback 在事件流里如何表达

### Gate

- 写链路当前 operating model 被正式写清
- 门禁、审计、回滚可复验
- 后续进入治理层时不需要推翻写事件语义

---

## 8. W5-C：最小 Ontology 地基预埋

### 目标

为 `W6-W8` 的超级贾维斯路线打基础，但只做不会轻易推翻的最小骨架。

### 核心任务

#### C1. 定义 canonical memory identity

每条记忆应有：

- OpenClaw canonical id
- source
- source_ref
- owner scope
- object_type
- status

#### C2. 设计最小 object registry

当前不要求完整功能，只要求 schema 级别成立。

#### C3. 设计最小 event model

至少支持：

- `ADD`
- `UPDATE`
- `DELETE`
- `FREEZE`
- `UNFREEZE`
- `COMMIT`
- `ROLLBACK`

#### C4. 设计最小 link model

只预留最常见关系：

- `related_to`
- `contradicts`
- `part_of`
- `derived_from`

#### C5. 预留 management API 契约

先定义，不要求全部落 UI：

- list
- get
- edit
- delete
- freeze / unfreeze
- audit log

#### C6. 预留质量治理字段

至少预留：

- confidence
- conflict_status
- review_status
- evidence_pointers

### 原则

这一步的成败不看功能有多少，而看未来 `W6+` 是否可以直接在其上长。

### Gate

- canonical id / registry / event / link / API 契约五件套齐全
- 未来新增对象类型和动作时不需要推翻现有设计
- 还没有把系统锁死成过重的企业级模型

---

## 9. W5-D：Graphiti 图原生能力安全接入

### 目标

让 `Graphiti` 逐步从 generic `/search` 适配器升级成真正图检索子系统。

### 核心任务

#### D1. 安全接入 `group_ids`

顺序必须是：

1. 单组限搜
2. 验证质量与延迟
3. 再评估多组

#### D2. 评估社区已知风险

由于社区已有多 `group_id` 全文检索问题，必须先确认：

- 当前 pinned 版本是否受影响
- 如果受影响，是否先修或规避

#### D3. 更明确地使用图能力

逐步评估：

- focal node
- graph-native recipe
- reranker
- 图范围控制

### Gate

- 单组 `group_ids` 证明安全且有效
- 质量不降、尾延迟改善
- 不因激进图策略重新破坏 `W4` 获胜口径

---

## 10. W5-E：评测升级与生产化治理预备

### 目标

把 `W5` 从“实验成功”推进到“生产前可治理”。

### 核心任务

#### E1. 升级评测体系

补充：

- 更真实的用户风格查询
- 更强的歧义样本
- `p50`
- timeout 计数
- fallback 触发率
- 非 bridge Top1 比例

#### E2. 建立统一生产视图

聚合已有字段：

- route
- fallback
- provider error
- per-source latency
- write event split
- canary commit split
- proposal / pending review / rollback

#### E3. 建立 stack fingerprint

每次跑前都输出：

- `Graphiti` upstream ref
- `Mem0` upstream ref
- embedding model / dim
- `Neo4j URI scheme`
- 当前关键 flags

### Gate

- 新评测能发现比 `W4` 更细的质量问题
- 统一视图可帮助判断是否进入 `W6`
- 生产化前置条件被显式化

---

## 11. W5 结束时应达到的状态

`W5` 完成时，不要求已经成为完整超级贾维斯系统，但必须达到：

1. `W4` 获胜读链路被稳固保存；
2. 写链路从半落地实验态进入正式 operating model；
3. Ontology 的最小地基已预埋；
4. Graphiti 官方能力开始被安全消费；
5. `W6` 不再需要返工 `W5` 的基础结构。

---

## 12. 与 W6-W8 的衔接

### W6

- 正式落第一版治理层
- memory management API
- 置信度与冲突检测真正跑起来

### W7

- 项目 / 任务 / 决策对象化
- 项目上下文层
- 更强的上下文装配

### W8+

- 主动提醒
- 质量监控
- 更接近超级贾维斯的动作层与持续演进层

---

## 13. 最终执行建议

### 建议路线

- 不把 `W5` 做成完整 Ontology 大工程
- 不把写链路继续拖到后面再收口
- 不再只优化读，不处理写

### 推荐结论

**`W5` 应被定义为：`W4` 成功方案的正式平台化阶段，同时也是超级贾维斯 / Ontology 路线的第一地基阶段。**
