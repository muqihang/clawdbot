# Mem0 + Graphiti 在 OpenClaw 的价值压榨研究与升级路线（可执行版）

> 日期：2026-02-24  
> 研究目标：围绕 OpenClaw 当前 `Mem0 + Graphiti + 本地索引` 架构，针对三大短板给出可落地、可验证、可回滚的 90 天升级路线。  
> 结论口径：**Mem0 继续做“记忆提炼与治理”，Graphiti 真正吃到“关系 + 时序”，本地索引守住“确定性与兜底”；三路融合从“单路切换”升级为“并行候选 + 约束重排”。**

---

## 1) 现状快照（我们当前做到哪一步、短板在哪）

### 1.1 已落地状态（基于本地代码 + 配置）

- 记忆插件已由 `memory-mem0-graphiti-bridge` 接管 memory slot，且本机当前配置为：`read_mode=primary`、`cutover_percent=100`、`write_mode=propose_only`。
  - 证据：`~/.openclaw/openclaw.json`
- 读链路已具备 local / shadow / primary / remote 路由框架，但路由仍是“单候选优先”的切换思路。
  - 证据：`extensions/memory-mem0-graphiti-bridge/src/router/read-router.ts`、`extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts`
- 写链路已具备 outbox、幂等、重试、敏感拦截、proposal state 等治理基础；`propose_commit` 才会触发 canonical 合并与冲突处理。
  - 证据：`extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts`、`extensions/memory-mem0-graphiti-bridge/src/p3/worker.ts`
- 自托管基础设施（Mem0 + Graphiti + backfill + verify）已形成 runbook，包含 pinned refs、backfill 与验证标准。
  - 证据：`docs/operations/memory-stack-selfhost.md`

### 1.2 当前三大短板（与你给出的优先级一致）

1. **精确检索保护层不足（ID/错误码/群号类）**  
   现状更多是语义/关键词检索；缺少“精确键模式”的硬约束检索通道。

2. **Graphiti 的关系与时序价值未被吃满**  
   现有桥接主要调用通用 `/search`，没把 Graphiti 的时序过滤、边/点检索策略、节点距离重排等能力转化为稳定收益。

3. **三路融合重排不够优**（本地 + Mem0 + Graphiti）  
   现在更像“选一路（或 shadow 对比）”，不是“并行候选 + 统一归一 + 约束重排 + 解释性输出”。

### 1.3 关键技术证据（短板与代码对位）

- 路由意图分类当前仅 `timeline | semantic`，且时间意图靠 regex 词表判定，未识别 ID/错误码等高精度模式。
  - 证据：`extensions/memory-mem0-graphiti-bridge/src/router/read-router.ts`
- 远端检索 payload 目前仅 `{"query": "..."}`，未传 filters / criteria / temporal constraints。
  - 证据：`extensions/memory-mem0-graphiti-bridge/src/client/mem0-client.ts`
- Graphiti client 仅复用通用 remote client（`/search`, `/items/:id`），没有 graph-native 参数层。
  - 证据：`extensions/memory-mem0-graphiti-bridge/src/client/graphiti-client.ts`
- `memory_search` 远端命中被统一映射为 `source: "memory"`，降低了跨源可解释性与重排特征利用。
  - 证据：`extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts`
- 本地侧已具备 hybrid（vector+keyword）+ MMR + temporal decay，但仅在本地语料内重排。
  - 证据：`src/memory/manager.ts`、`src/memory/hybrid.ts`

---

## 2) 能力地图（Mem0 vs Graphiti：最擅长/不擅长/最佳分工）

### 2.1 结论先行

- **Mem0 最该做：写入治理与记忆提炼**（抽取、更新、去重、过滤、criteria 检索）。
- **Graphiti 最该做：关系-时序推理检索**（episodes→entities/edges、时间有效性、graph-aware search/rerank）。
- **OpenClaw 本地层最该做：确定性兜底 + 精确键保护 + 成本守门。**

### 2.2 能力对照表

| 维度                   | Mem0（更强）                                                                                   | Graphiti（更强）                                                                    | 最佳放置                         |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------- |
| 记忆抽取/更新治理      | 内置 add/update/delete 流程，支持 custom fact extraction、custom update prompt、ingestion 控制 | 有抽取能力但核心定位不是“偏好/事实治理”                                             | Mem0 主导                        |
| 元数据过滤与目标检索   | 支持 filters（含 AND/OR、metadata 等）与 criteria retrieval（语义+关键词+boost）               | 支持 graph search filters，但实践门槛更高                                           | Mem0 主导                        |
| 关系网络与时序生命周期 | 提供 graph memory，但在复杂时序关系推理上不是主优势                                            | 原生 episode/fact/edge，支持 temporal validity（如 valid_at/invalid_at/expired_at） | Graphiti 主导                    |
| 检索策略               | 更偏“记忆条目召回+过滤”                                                                        | edge/node/hybrid、多策略与图结构重排（含 node-distance / RRF）                      | Graphiti 主导                    |
| 实时写入与冲突表示     | 适合做写前治理与持久化入口                                                                     | 适合承载关系演进与历史态查询                                                        | Mem0 先提炼，Graphiti 承接关系层 |

### 2.3 能力边界（要避免混用）

- 不要把 Graphiti 当作 Zep Cloud 的“线程管理平替”；Graphiti 是图引擎，Zep 还包含线程/用户/消息平台层。
- 不要把 Mem0 当纯向量库；它的价值在“提炼 + 更新策略 + 记忆治理”，而不是只做 top-k 召回。

---

## 3) 反模式清单（常见错误用法 + 我们当前可能踩到的）

1. **反模式：把 ID/错误码/群号问题当普通语义检索。**
   - 为什么错：精确键问题需要 deterministic 匹配优先。
   - 我们当前风险：路由只分 timeline/semantic，未设“exact-key lane”。

2. **反模式：Graphiti 只走通用 `/search`，不使用时序/图策略。**
   - 为什么错：会把 Graphiti 降级成“又一个语义检索后端”。
   - 我们当前风险：client 层无 strategy / temporal filter 参数结构。

3. **反模式：三路只切一路，不做并行候选融合。**
   - 为什么错：无法在同一 query 内同时利用 Local 的确定性、Mem0 的提炼、Graphiti 的关系时序。
   - 我们当前风险：`memory_search` 是 route-based 单路返回（shadow 仅做计数对比）。

4. **反模式：把 shadow 对比的“数量”当质量。**
   - 为什么错：remoteCount > localCount 不等于答案更对。
   - 我们当前风险：`shadow-reporter` 仅记录 localCount/remoteCount。

5. **反模式：直接导入/回放数据却期待自动去重和冲突推理。**
   - 为什么错：Mem0 官方 direct import 明确不会触发推理、去重、图关系等。
   - 我们当前风险：批量补偿流程若误用 direct import，会污染质量基线。

6. **反模式：`propose_only` 阶段就把写入结果当“最终事实”。**
   - 为什么错：`propose_only` 的目标是观察与治理，不是 commit。
   - 我们当前风险：若评测口径不区分 proposal 与 canonical，会误判质量。

---

## 4) 价值压榨策略（分层：检索 / 提炼 / 写入治理 / 评测）

### 4.1 检索层（Retrieval）

**策略 R1：新增“精确键保护层”优先于语义层**

- 做法：query 进入先做 `query_signature`（如 `ERR_[A-Z0-9]+`、`[A-Z]{2,}-\d+`、群号/工单号/commit hash 等）。
- 命中后直接走 deterministic lane：
  - Local：exact phrase + path whitelist；
  - Mem0：filters + keywords/metadata；
  - Graphiti：带 temporal / group / node filters 的定向查询。
- 为什么现在做：这是你三大短板中“错误代价最高”的一项（ID类答错最伤可信度）。
- 成功判断：`Top1(精确ID桶)` 从基线提升并稳定 >= 95%。

**策略 R2：从“选路由”升级到“并行候选 + 统一重排”**

- 做法：Local/Mem0/Graphiti 并行取候选（各自 budget），统一归一后重排；不再只依赖 candidateRoute。
- 为什么现在做：当前 primary=100 下单路策略会放大单后端波动。
- 成功判断：首条可用率与 Top1 同时上涨，且 p95 可控。

### 4.2 提炼层（Extraction/Refinement）

**策略 E1：Mem0 custom_fact_extraction_prompt 聚焦“决策原因 + 结构化键值”**

- 做法：把 `decision_key / reason / rejected_alternatives / evidence_ref` 纳入固定 schema；用 custom update prompt 约束冲突更新。
- 为什么现在做：现有在线提取规则偏简单正则，治理质量容易天花板。
- 成功判断：决策原因桶 Top1 与冲突误判率同步改善。

**策略 E2：Graphiti 自定义 ontology 对齐业务关系**

- 做法：定义 entity/edge 类型（如 `Decision`, `Project`, `Incident`, `RejectedOption`）及约束，减少关系提取漂移。
- 为什么现在做：无 schema 时图谱关系会“长得快但乱”。
- 成功判断：时序关系桶 Top1 提升，且人工抽样关系错误率下降。

### 4.3 写入治理层（Write Governance）

**策略 W1：`propose_only` 保持，但把 proposal 质量评测做实**

- 做法：proposal_state 与 canonical 分离计量；pending_review 和 conflict false positive 按桶统计。
- 为什么现在做：你已在 propose_only，最该做的是“把观察期变成证据期”。
- 成功判断：pending_review 比例在可控区间，冲突误判持续下降。

**策略 W2：严格禁用“未治理直写”路径**

- 做法：批量回补必须走可审计链路；direct import 仅允许“离线导入场景+明确标注”。
- 为什么现在做：数据污染一次会拖慢整个评测周期。
- 成功判断：审计中无未知来源写入，质量回归可复现。

### 4.4 评测层（Evaluation）

**策略 V1：离线金标 + 在线 shadow 双轨**

- 离线：固定 validation set，按四桶评 Top1。
- 在线：每次检索输出 trace（query bucket、候选源、top1源、降级原因、耗时、成本）。
- 为什么现在做：现在 `shadow compare` 只有计数，无法驱动下一阶段闸门。
- 成功判断：每周可产出“可比较、可回归”的趋势图与门禁结论。

---

## 5) 三大短板专项方案（方案 / 实现点 / 风险 / 回滚）

### 5.1 短板 A：精确检索保护层不足（ID/错误码/群号）

**方案**

- 新增 `Precision Guard Lane`：在 read-router 前置 query signature 识别；命中后执行“精确检索优先”。

**实现点（贴近现有代码）**

1. 在桥接侧新增 `src/router/query-signature.ts`（不改 tool 契约）。
2. 扩展 `createRemoteClient.search` 入参：支持 `filters`、`criteria`（Mem0）与 `strategy/filters`（Graphiti）。
3. 新增精确键字典：`error_code`, `ticket_id`, `group_id`, `commit_sha`, `endpoint_path`。
4. 重排硬规则：`exact_match=true` 候选直接提升；只有在证据不足时才回落语义候选。

**为什么现在做**

- 当前 primary=100，且路由无精确键保护，误答代价高且影响可信度。

**成功判断**

- `Top1(精确ID桶) >= 95%` 且连续两周不回落；
- `首条可用率(精确ID桶) >= 90%`；
- 误答样本中“精确键未触发 guard”占比 < 5%。

**风险**

- 过严规则导致召回不足；
- 键模式漏识别导致 false negative。

**回滚**

- feature flag：`retrieval.precision_guard.enabled=false`；
- 立即回退为现有路由策略，不影响主链路可用性。

---

### 5.2 短板 B：Graphiti 关系与时序价值未充分发挥

**方案**

- 把 Graphiti 从“通用 query 后端”升级为“关系/时序专用引擎”：按问题类型切 `edge/node/hybrid`，并使用时间过滤与图重排。

**实现点（贴近现有代码）**

1. 为 Graphiti client 增加结构化查询层（strategy、center node、temporal filters）。
2. 写入时保证 `event_time` 与 `ingest_time` 分离（你当前已保留字段，继续强化消费侧使用）。
3. 按问题模板启用图策略：
   - “什么时候/前后变化” → edge + temporal filter；
   - “某人/某项目关联决策” → hybrid + node-distance reranker。
4. 引入 Graphiti ontology，显式建模 `Decision↔Project↔Reason↔RejectedOption`。

**为什么现在做**

- 现有 read-router 已有 timeline route 概念，但数据面没充分使用 temporal graph 检索能力。

**成功判断**

- `Top1(时序关系桶)` 相比当前基线提升 >= 12pp；
- 时序类 query 中 Graphiti 贡献的首条可用率 >= 80%；
- 冲突案例中“时间错位回答”周环比下降。

**风险**

- 图查询参数过多导致复杂度和调参成本上升；
- 过度依赖 Graphiti 可能拉高尾延迟。

**回滚**

- 将时序模板回退到 Mem0+Local；
- 保留 Graphiti 仅作 shadow 证据收集。

---

### 5.3 短板 C：三路融合重排未形成最优策略

**方案**

- 建立 `Fusion Reranker`：Local / Mem0 / Graphiti 并发候选池 + 统一评分 + 约束重排 + 可解释产出。

**实现点（贴近现有代码）**

1. 在 `memory_search` 桥接层引入并发召回与候选归一：
   - `score_norm_local`, `score_norm_mem0`, `score_norm_graphiti`。
2. 设计重排特征：
   - `exact_match_bonus`、`temporal_alignment`、`decision_reason_coverage`、`source_reliability`。
3. 输出 `source` 不再统一为 `memory`，保留真实来源用于调参与解释。
4. 预算策略：
   - Local 600ms、Mem0 800ms、Graphiti 1200ms、aggregate 1800ms（先沿用当前建议值）。

**为什么现在做**

- 你当前已经在 primary=100，单路切换比融合策略更容易受单后端抖动影响。

**成功判断**

- 全桶 `Top1` 提升 >= 8pp；
- 首条可用率提升 >= 10pp；
- p95 延迟增加不超过 15%。

**风险**

- 并行召回导致成本上升；
- 归一与权重不当会出现“表面融合、实际降质”。

**回滚**

- fusion flag 关闭，退回 current route policy；
- 保留 tracing 数据供二次调参，不丢观察证据。

---

## 6) 90 天路线图（按周拆分：先快后稳）

### Week 1（基线与仪表）

- 动作：建立四桶评测集（精确ID/决策原因/时序关系/项目上下文）+ 在线 trace schema。
- 为什么现在做：没有统一数据集，后续优化无法闭环。
- 成功判断：可稳定产出周报（Top1/首条可用率/冲突误判/p95/成本）。

### Week 2（精确键保护层 v1）

- 动作：上线 query signature + exact lane（仅 shadow）。
- 为什么现在做：最快降低高风险误答。
- 成功判断：精确ID桶 Top1 提升且无显著延迟劣化。

### Week 3（Mem0 过滤与 criteria 接入）

- 动作：桥接客户端支持 filters/criteria payload，接入元数据过滤。
- 为什么现在做：为“精确键”和“决策原因”提供可控召回。
- 成功判断：误召回率下降，首条可用率上升。

### Week 4（Graphiti 结构化检索 v1）

- 动作：按 query 类型切 edge/node/hybrid，接入 temporal filters。
- 为什么现在做：把时序价值从“概念”变“可测收益”。
- 成功判断：时序桶 Top1 明显改善。

### Week 5（三路融合重排 v1，shadow）

- 动作：并发候选 + 统一归一 + 约束重排；仍不影响线上主回复。
- 为什么现在做：先拿质量证据再切流。
- 成功判断：全桶 Top1 与首条可用率双提升。

### Week 6（5% canary）

- 动作：`primary` 小流量启用融合重排（5%）。
- 为什么现在做：验证真实流量稳定性。
- 成功判断：p95、错误率、fallback 都在阈值内。

### Week 7（10%→20% canary + 调权）

- 动作：分桶调权（精确键桶/时序桶权重不同）。
- 为什么现在做：统一权重通常对多类型 query 不最优。
- 成功判断：分桶 Top1 同比提升，波动收敛。

### Week 8（Graphiti ontology + 决策关系）

- 动作：落地决策关系 ontology，强化 rejected-alternative 关系。
- 为什么现在做：提升“为什么不是 B”可回答性。
- 成功判断：决策原因桶 Top1 与解释完整率上升。

### Week 9（写链路评测强化）

- 动作：proposal/canonical 双账本报表，监控 pending_review 与 conflict FP。
- 为什么现在做：为 propose_commit 闸门准备硬证据。
- 成功判断：冲突误判持续下降，pending_review 稳定。

### Week 10（故障演练 + 回滚验证）

- 动作：注入 Mem0 超时、Graphiti 故障、partial success、outbox 堆积场景。
- 为什么现在做：防止“指标好看但不可运维”。
- 成功判断：回滚开关与降级路径在演练中 100% 生效。

### Week 11（25%→50% cutover）

- 动作：扩大融合重排流量，继续观测成本与延迟。
- 为什么现在做：验证扩展性与成本曲线。
- 成功判断：每千条成本与 p95 仍在预算。

### Week 12（是否开启 propose_commit 评审）

- 动作：按闸门决定是否从 propose_only 进入 propose_commit（先小样本）。
- 为什么现在做：写治理证据成熟后才值得切。
- 成功判断：pending_review 与 conflict FP 达标。

### Week 13（发布决策周）

- 动作：形成 go/no-go 报告与长期运行参数基线。
- 为什么现在做：收敛为可长期维护的生产策略。
- 成功判断：决策闸门全通过，并有回滚演练证明。

---

## 7) 指标体系（必须量化）

> 下列指标全部要求“按桶统计 + 总体统计”。

### 7.1 Top1 正确率（四桶）

- 桶定义：
  1. 精确 ID（ID/错误码/群号）
  2. 决策原因（why A not B）
  3. 时序关系（before/after/at time T）
  4. 项目上下文（project/module ownership）
- 公式：`Top1 = top1命中金标数 / 样本总数`。
- 目标（90天）：
  - 精确ID >= 95%
  - 决策原因 >= 85%
  - 时序关系 >= 82%
  - 项目上下文 >= 88%

### 7.2 首条可用率（First Usable Rate）

- 定义：第一条返回片段是否足够支持正确回答（人工或规则判定）。
- 公式：`FUR = 首条可用样本数 / 总样本数`。
- 目标：总体 >= 85%，精确ID桶 >= 90%。

### 7.3 冲突误判率（Conflict False Positive Rate）

- 定义：系统判冲突，但金标为非冲突。
- 公式：`CFP = 误判冲突数 / 金标非冲突数`。
- 目标：<= 5%。

### 7.4 pending_review 比例

- 公式：`pending_review_ratio = pending_review proposals / total proposals`。
- 目标：稳定在 `8%~20%`（过低可能漏拦截，过高说明提炼或冲突策略过敏）。

### 7.5 p95 延迟

- 拆分：`p95_total`, `p95_local`, `p95_mem0`, `p95_graphiti`。
- 目标：`p95_total <= 4.0s`，检索子链路 `<= 1.8s`。

### 7.6 每千条成本（USD / 1k queries）

- 公式：`(LLM抽取成本 + Embedding + Mem0/Graphiti 调用成本 + 失败重试成本) / query_count * 1000`。
- 目标：分阶段受控增长（融合阶段不高于基线 +25%）。

---

## 8) 决策闸门（达到阈值才允许下一阶段）

### Gate A：允许从 shadow 进入 5% primary（融合读）

- 条件（连续 7 天）：
  - Top1 四桶平均提升 >= 6pp；
  - 精确ID桶 Top1 >= 93%；
  - 首条可用率 >= 80%；
  - p95_total 不劣于基线超过 10%。

### Gate B：允许 5% → 20% → 50% 扩流

- 条件（每次扩流前连续 3 天）：
  - 冲突误判率 <= 8%；
  - pending_review 比例在 `8%~25%`；
  - fallback 触发率 < 10%；
  - 每千条成本不超过预算上限。

### Gate C：允许 propose_only → propose_commit

- 条件（连续 14 天）：
  - 冲突误判率 <= 5%；
  - pending_review 比例 <= 20%；
  - `dead_letter` 比例 <= 0.5%；
  - 故障演练回滚成功率 100%。

### Gate D：稳定运营门槛（90天收官）

- 条件：
  - 四桶 Top1 达到目标值；
  - p95 与成本双达标；
  - 无 P0 级错误注入事故。

---

## 9) 优先级任务清单（P0 / P1 / P2）

### P0（本周必须开始）

1. **P0-1：精确键保护层（shadow）**
   - 为什么现在做：直接对应最高风险短板。
   - 成功判断：精确ID桶 Top1 提升且误答样本明显下降。

2. **P0-2：扩展 shadow 指标为“质量指标”**
   - 为什么现在做：现有只有 local/remote 数量，不足以做闸门。
   - 成功判断：可周更四桶 Top1 + FUR + CFP + pending_review + p95 + cost。

3. **P0-3：Graphiti 结构化查询参数层（先不切流）**
   - 为什么现在做：不给 Graphiti 参数层，就无法压榨其时序价值。
   - 成功判断：时序桶 shadow 指标优于当前基线。

### P1（两到六周）

1. 三路并发候选 + 融合重排 v1。
2. Mem0 criteria retrieval 与 metadata filters 组合策略。
3. Graphiti ontology（决策/原因/替代项）建模与检索模板。

### P2（六到十三周）

1. propose_commit 小样本闸门试运行。
2. 扩流与成本优化（按桶调权 + 超时预算细化）。
3. 自动化回归（每周固定评测 + 故障演练）。

### 9.1 本轮追加任务（Exa + Tavily 社区/生态玩法映射）

> 说明：以下条目来自 Exa 发现 + Tavily 深抽取后，按“与当前 OpenClaw 架构兼容度”筛选。优先选可直接落地、可回滚的模式。

1. **P0-4：Mem0 Criteria Retrieval + Metadata Filters 联动（shadow 先行）**
   - 做法：在精确键和决策类 query 上，组合 `filters + criteria`；保留 `use_criteria` 开关用于 A/B。
   - 为什么现在做：你们当前 remote search payload 还停留在 `{"query": ...}`，这一步是“低改动高收益”的精排增强。
   - 成功判断：精确ID桶 Top1 与决策原因桶 Top1 同时上升，且 p95 不明显恶化。
   - 回滚：关闭 criteria 与复杂 filters，退回纯语义 search。

2. **P0-5：Graphiti focal-node 重排（先在 shadow）**
   - 做法：按 `session/user/project` 绑定 focal node，使用 node-distance rerank 提升“与当前主体相关”的事实优先级。
   - 为什么现在做：最直接放大 Graphiti 的图结构价值，且不影响本地兜底。
   - 成功判断：时序关系桶与项目上下文桶首条可用率上升。
   - 回滚：去掉 focal-node 参数，恢复常规 hybrid search。

3. **P1-4：Graphiti MCP Server 作为旁路协处理器（非主链路）**
   - 做法：先以 `add_episode/search_facts/search_nodes` 做观测与补偿，不直接替换现有主读写链路。
   - 为什么现在做：快速验证 episode/json ingestion + group_id 隔离玩法，降低重构风险。
   - 成功判断：旁路输出可稳定改善某些桶（尤其关系/时序）并可量化复现。
   - 回滚：停用 MCP 旁路，不影响主链路运行。

4. **P1-5：写链路引入“线程去重回滚窗口”**
   - 做法：借鉴 langgraph-memory 的 thread-process dedup + rollback window 思路，避免短时间重复触发 proposal。
   - 为什么现在做：当前 outbox 虽有幂等键，但连续回合/并发边界仍可能导致治理噪音升高。
   - 成功判断：重复 proposal 比例与冲突误判率下降，pending_review 更稳定。
   - 回滚：关闭窗口机制，退回现有 outbox 状态机。

5. **P2-4：分层记忆编排（vector + graph）成本曲线优化**
   - 做法：为不同 query bucket 设不同策略（精确键更偏 filters，时序更偏 graph，通用问答更偏 local/mem0）。
   - 为什么现在做：扩流阶段最容易出现“质量提升但成本飙升”。
   - 成功判断：保持质量门槛的同时，每千条成本受控在预算带宽内。
   - 回滚：回到统一策略与固定预算。

---

## 10) 参考来源（本地文件路径 + 外部 URL）

### 10.1 本地资料（优先依据）

- `analysis/2026-02-22-openclaw-mem0-graphiti-selfhost-plan/README.md`
- `analysis/2026-02-22-openclaw-mem0-graphiti-selfhost-plan/priority-embedding-plan.md`
- `analysis/2026-02-22-openclaw-mem0-graphiti-selfhost-plan/phase0-rollout-note.md`
- `analysis/2026-02-22-openclaw-mem0-graphiti-selfhost-plan/phase1-rollout-note.md`
- `docs/operations/memory-stack-selfhost.md`
- `extensions/memory-mem0-graphiti-bridge/index.ts`
- `extensions/memory-mem0-graphiti-bridge/src/router/read-router.ts`
- `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts`
- `extensions/memory-mem0-graphiti-bridge/src/client/mem0-client.ts`
- `extensions/memory-mem0-graphiti-bridge/src/client/graphiti-client.ts`
- `extensions/memory-mem0-graphiti-bridge/src/p3/worker.ts`
- `extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts`
- `extensions/memory-mem0-graphiti-bridge/src/p3/ab-eval.ts`
- `src/memory/manager.ts`
- `src/memory/hybrid.ts`
- `~/.openclaw/openclaw.json`

### 10.2 外部资料（官方/源码/高质量实践）

#### Mem0（官方与源码）

- https://github.com/mem0ai/mem0
- https://docs.mem0.ai/components/memory/operations/search
- https://docs.mem0.ai/components/memory/advanced-memory-operations
- https://docs.mem0.ai/components/memory/custom-fact-extraction
- https://docs.mem0.ai/components/memory/custom-update-memory-prompt
- https://docs.mem0.ai/components/memory/graph-memory
- https://docs.mem0.ai/open-source/graph-memory/overview
- https://docs.mem0.ai/platform/features/direct-import
- https://docs.mem0.ai/platform/features/v2-memory-filters
- https://docs.mem0.ai/platform/features/criteria-retrieval
- https://docs.mem0.ai/platform/features/advanced-retrieval
- https://docs.mem0.ai/open-source/features/metadata-filtering
- https://docs.mem0.ai/open-source/features/reranker-search
- https://docs.mem0.ai/cookbooks/essentials/controlling-memory-ingestion
- https://github.com/mem0ai/mem0/issues/3245
- https://arxiv.org/abs/2504.19413

#### Graphiti（官方与源码）

- https://github.com/getzep/graphiti
- https://help.getzep.com/graphiti/getting-started/welcome
- https://help.getzep.com/graphiti/getting-started/overview
- https://help.getzep.com/graphiti/working-with-data/adding-episodes
- https://help.getzep.com/graphiti/working-with-data/searching
- https://help.getzep.com/graphiti/working-with-data/ontology
- https://help.getzep.com/graphiti/reference/python/search-methods/search
- https://help.getzep.com/graphiti/reference/python/retrieve-edges
- https://help.getzep.com/graphiti/reference/python/retrieve-nodes
- https://github.com/getzep/graphiti/blob/main/mcp_server/README.md
- https://help.getzep.com/graphiti/getting-started/mcp-server
- https://github.com/getzep/graphiti/blob/main/examples/quickstart/README.md
- https://blog.getzep.com/how-do-you-search-a-knowledge-graph/
- https://neo4j.com/blog/developer/graphiti-knowledge-graph-memory/

#### 社区/生态实践（用于玩法参考，需结合本地评测裁剪）

- https://github.com/langchain-ai/langgraph-memory
- https://www.npmjs.com/package/@mem0/openclaw-mem0?activeTab=readme
- https://mem0.ai/blog/add-persistent-memory-openclaw
- https://mem0.ai/blog/agentic-rag-chatbot-with-memory
- https://aws.amazon.com/blogs/database/build-persistent-memory-for-agentic-ai-applications-with-mem0-open-source-amazon-elasticache-for-valkey-and-amazon-neptune-analytics/

---

## 11) 生态高级玩法补充（Exa + Tavily 二次调研结论）

### 11.1 高价值玩法清单（可直接借鉴）

1. **Criteria-aware Retrieval（Mem0）**：按业务目标定义检索标准，而非只看语义相似。
2. **Operator-rich Metadata Filtering（Mem0）**：通过过滤树做精准召回和风险隔离。
3. **Reranker-Enhanced Search（Mem0 OSS）**：在不改业务接口前提下提高 Top1。
4. **Focal-node Graph Reranking（Graphiti）**：用中心节点距离强化“与当前主体相关”的召回。
5. **Search Recipes（Graphiti）**：按 edge/node/community 分治检索策略。
6. **MCP Sidecar Pattern（Graphiti）**：把图谱能力作为旁路协处理器先验证价值。
7. **Thread Dedup + Rollback Window（LangGraph Memory）**：减少并发/连续轮次下的重复记忆写入。

### 11.2 与当前 OpenClaw 的适配结论

- **最先落地**：`Criteria + Filters` 与 `Focal-node rerank`。这两项对现有代码侵入小、收益快、可灰度。
- **中期落地**：`MCP sidecar` + `Search recipes`，用于放大 Graphiti 时序关系价值并增强实验可控性。
- **治理增强**：`thread dedup rollback window` 与你们现有 outbox 幂等互补，重点解决 proposal 噪音。

### 11.3 风险提示（避免被“生态热度”带偏）

- 社区案例常给“提升百分比”，但口径与数据集不同；一律以本地四桶评测为准。
- 厂商博客可用于“模式发现”，不能替代你们的生产门禁阈值。
- 任意新增玩法都必须先 shadow，再进入 canary，最后才考虑主路径替换。

---

## 附：如果马上进入实施，建议第一刀

**优先第一刀：先做「精确键保护层（shadow）」而不是先做三路融合。**

- 理由 1：这是当前错误代价最高的痛点（ID/错误码/群号错答）。
- 理由 2：改动范围可控，回滚简单（flag 关闭即可）。
- 理由 3：它会直接提升后续融合重排的“高置信锚点”，让融合策略更稳。
