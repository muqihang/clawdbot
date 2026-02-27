# OpenClaw Mem0 + Graphiti 升级落地方案 V1（融合版）

> 版本：V1（由两份研究文档融合）  
> 日期：2026-02-24  
> 融合来源：
>
> - `analysis/2026-02-24-mem0-graphiti-value-maximization/README.md`
> - `analysis/2026-02-24-mem0-graphiti-value-maximization/zep-cloud-gap-copy-playbook.md`

---

## 0. 目标与方法（先定打法）

本方案不是“再加功能”，而是把 OpenClaw 升级为四层记忆系统：

1. 平台语义层（User / Thread / Message）
2. 记忆治理层（Mem0：提炼、更新、去重、过滤）
3. 关系时序层（Graphiti：episode/fact/node/edge + temporal）
4. 融合决策层（router + planner + merge/rerank + context assembly）

执行策略：

- 先补地基（语义层与观测）再做高级检索与融合。
- 先 shadow，后 canary，最后才考虑主路径扩流。
- 所有阶段必须可回滚。

---

## 1. 最佳启动时机（什么时候开始最稳）

建议 **立即启动（T+0）**，原因：

- 当前写链路已回稳（`failed=0`, `dead=0`），适合做结构化升级。
- `commit_require_index_check` 已恢复，可在安全闸门下推进。
- 若延后，现有单路策略会继续放大 Graphiti 结构价值未释放的问题。

启动前 1 小时准备动作：

- 冻结当前运行基线（report + retrieval snapshot + config snapshot）。
- 标记当前 feature flags。
- 建立升级跟踪看板（任务、负责人、Gate 状态）。

---

## 1.1 同步后基线校正（+1159 commits）

本轮上游同步后，必须先承认一个关键事实：

- 上游主干默认记忆插件已是 `memory-core`（并提供 `memory-lancedb`），而 `memory-mem0-graphiti-bridge` 当前是我们分叉内的增强栈，不是上游主干能力。

这带来两条执行约束：

- 约束 A：后续每次上游同步都要做桥接插件兼容回归（避免“被上游重构隐性击穿”）。
- 约束 B：主计划要补一个 D0 决策门：先确定“桥接增强栈如何长期维护”。

D0（必须先过）：

- 方案 D0-A（短期最稳）：维持 `memory-mem0-graphiti-bridge` 作为私有增强层，保持与上游 `memory-core` 并行共存。
- 方案 D0-B（中期更优）：将 bridge 核心能力逐步适配为 `memory-core` 兼容扩展层，降低长期 rebase 成本。

D0 Gate：

- 必须明确 owner、维护策略（rebase 周期 <= 2 周）和回归清单，才能进入 Wave 0。

---

## 2. 北极星结果（90 天）

### 2.1 质量目标

- 精确 ID 桶 Top1 >= 95%
- 决策原因桶 Top1 >= 85%
- 时序关系桶 Top1 >= 82%
- 项目上下文桶 Top1 >= 88%
- 首条可用率（FUR）>= 85%
- 冲突误判率（CFP）<= 5%

### 2.2 稳定与成本目标

- `outbox_failed=0` 且 `outbox_dead=0` 持续稳定
- 检索 p95 <= 1.8s，总体 p95 <= 4.0s
- 每千次请求成本控制在基线 +25% 以内

---

## 3. 分层职责（避免混用）

### 3.1 Mem0（主责）

- 事实提炼与记忆治理
- custom extraction / custom update
- filters + criteria retrieval
- proposal 质量治理输入

### 3.2 Graphiti（主责）

- 关系与时序检索
- episodes/nodes/edges 结构价值
- focal-node / temporal filters / graph rerank

### 3.3 Local（主责）

- 确定性兜底
- 精确键保护（ID/错误码/群号/commit）
- 降级与回滚安全层

---

## 4. 统一执行顺序（融合两份文档后的唯一顺序）

## Wave 0（第 0-3 天）：稳定基线与观测地基

目标：先把评测和观测做成“可决策系统”。

交付：

- 四桶评测集（精确ID/决策原因/时序关系/项目上下文）
- 统一 trace schema（source、route、fallback、latency、cost）
- 周报模板（Top1/FUR/CFP/p95/cost）

Gate-0：没有统一质量报表，不进入 Wave 1。

## Wave 1（第 4-10 天）：平台语义层（抄 Zep 最值钱部分）

目标：补齐 User/Thread/Message 一等语义。

交付：

- `oc_user_id / oc_thread_id / oc_message_id` 稳定映射
- message envelope 标准字段（role/name/created_at/metadata）
- context assembly 最小实现（3 模板：精确ID、时序、决策）

Gate-1：FUR 提升 >= 6pp 且 p95 无显著恶化。

## Wave 2（第 11-20 天）：精确检索保护 + Mem0 提升

目标：先把高风险错答降下来。

交付：

- precision guard lane（ID/错误码/群号先 deterministic）
- Mem0 `filters + criteria` 接入（shadow 先行）
- conflict/pending 细分报表（proposal 与 canonical 分账）

Gate-2：精确ID桶 Top1 >= 93%，CFP 下降，fallback 可控。

## Wave 3（第 21-35 天）：Graphiti 结构价值释放

目标：让 Graphiti 不再只是“另一个 search 后端”。

交付：

- 按 query 类型切 search recipe（edge/node/hybrid）
- focal-node + temporal filters 策略
- ontology v1（Decision/Project/Reason/RejectedOption）

Gate-3：时序关系桶 Top1 提升 >= 10pp，episodes/nodes 非零覆盖显著提升。

## Wave 4（第 36-55 天）：三路融合重排（Local + Mem0 + Graphiti）

目标：从“单路切换”升级到“并行候选 + 统一重排”。

交付：

- 并行召回 + 候选归一 + 约束重排
- source-aware citation（不再全部映射为 `memory`）
- 按 query bucket 的预算与权重策略

Gate-4：全桶 Top1 平均提升 >= 8pp，FUR 提升 >= 10pp，p95 增幅 <= 15%。

## Wave 5（第 56-90 天）：灰度扩流与写模式决策

目标：验证生产稳定性并决定是否扩大 `propose_commit`。

交付：

- 5% -> 20% -> 50% 逐级 canary
- 异步任务状态与 webhook 观测（task/episode）
- 回滚演练（故障注入与 1 分钟回退）

Gate-5：连续 14 天达成质量与稳定阈值，才讨论更大范围 commit 放权。

## 4.1 最佳实践增补映射（Zep + Mem0 -> OpenClaw）

| 外部最佳实践能力                                | 当前 OpenClaw 状态                                   | 增补方式                                                                    | 对应 Wave |
| ----------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------- | --------- |
| User-Thread-Message 全生命周期                  | 会话键/线程隔离已具备，但记忆桥接层不是一等语义模型  | 建立 `oc_user_id/oc_thread_id/oc_message_id` 规范映射 + message envelope    | Wave 1    |
| 自动上下文装配 + Prompt 模板优化                | 当前以检索结果直出为主，缺少统一 assembler           | 新增 `context_assemble` 阶段，先落地 3 套模板（精确ID/时序/决策）           | Wave 1-2  |
| 基于 Graphiti 的时序图谱演进管理                | 已解析 facts/episodes/nodes，但策略化使用不足        | 引入 graph search recipe（edge/node/hybrid）+ focal-node + temporal filters | Wave 3    |
| 异步任务治理 + Webhook 事件流                   | 内部 outbox 状态机已存在，外部事件化不足             | 在 outbox 上补 task/episode 状态视图与 webhook/事件总线消费                 | Wave 5    |
| Mem0 两阶段记忆流水线（ADD/UPDATE/DELETE/NOOP） | proposal/governance 已有雏形，但语义标签与评测不完整 | 统一记忆动作语义、补齐 proposal-canonical 分账与动作级指标                  | Wave 2-3  |
| 用户级高准确召回（filters + criteria）          | 目前以 query 检索为主，filters/criteria 价值未吃满   | 在远端检索层引入 criteria + metadata filters，并按桶评测                    | Wave 2    |
| 轻量灵活 API + 高可定制                         | 客户端抽象已存在，可扩展                             | 保持 adapter-first，先不改 tool 契约，只扩展 payload 与 planner             | Wave 2-4  |

执行规则（必须遵守）：

- 先语义层，后检索策略，最后融合重排；不能反过来。
- 每次只跨一个 Wave，Gate 不通过不进下一波。
- 所有能力先 shadow，再 canary，再扩流。

上游能力复用优先级（避免重复造轮子）：

- 优先复用 `memory-core` 已有能力（hybrid、MMR、temporal decay、multi-language query expansion）。
- 仅在上游能力不足以覆盖 Mem0/Graphiti 目标时，才在 bridge 层补定制逻辑。
- 每个新增能力都要标注“上游复用 / 私有补齐 / 可回迁上游”三种归属。

---

## 5. 责任分工（Jarvis OS 语境）

- Founder：目标与风险阈值拍板，Gate 审批。
- Jarvis（主线程）：架构与执行编排、跨波次依赖管理、门禁裁决。
- Engineering 子代理：每个 Wave 的实现、测试、回归、runbook 更新。
- 质量守门：指标周报产出与异常归因（必须可追溯到 query 桶和 source）。

---

## 6. 决策闸门（Go / No-Go）

### Gate A（允许 shadow -> 5% canary）

- 四桶平均 Top1 提升 >= 6pp
- 精确ID桶 Top1 >= 93%
- FUR >= 80%
- p95_total 劣化 <= 10%

### Gate B（允许 5% -> 20% -> 50% 扩流）

- CFP <= 8%
- pending_review 比例稳定在 8%~25%
- fallback 触发率 < 10%
- 每千次成本不超预算

### Gate C（讨论更高 commit 放权）

- 连续 14 天：CFP <= 5%，`failed=0`，`dead=0`
- 故障回滚演练成功率 100%

---

## 7. 本周立即执行清单（Day 1-3）

1. 完成 D0 决策（bridge 私有增强层 vs memory-core 兼容改造层）并确认 owner
2. 建立同步回归清单（上游更新后 1h 内可完成的 smoke + integration）
3. 产出统一评测数据集 V1（四桶 + 金标规则）
4. 定义并落地 trace schema（最少字段）
5. 建立 User/Thread/Message 映射规范文档
6. 给 context assembly 出 3 个模板草案
7. 形成 Wave 1 的任务拆解与验收脚本

验收标准：

- 能一键跑出“本周基线报告”；
- 每个任务均有 owner、deadline、risk、rollback。

---

## 8. 风险与回滚

Top-5 风险：

1. 指标提升但延迟/成本失控
2. Graphiti 结构信号不升反降
3. 精确键规则过严导致召回不足
4. proposal 评测口径混乱导致误判
5. 多源融合解释性下降（来源不清）

统一回滚原则：

- 任一 Gate 未达标，立即停在当前波次，不进入下一波。
- 保留 outbox 与评测证据，不做破坏性清理。
- feature flag 一键退回 local-first + propose_only 安全态。

---

## 9. V1 版本声明

本 V1 是“方向 + 执行顺序 + 门禁”的统一主计划。  
下一步产出 V1.1（执行版）时，将补：

- 命令级 runbook
- 任务到文件路径级改动清单
- 自动化验收脚本与工时评估
