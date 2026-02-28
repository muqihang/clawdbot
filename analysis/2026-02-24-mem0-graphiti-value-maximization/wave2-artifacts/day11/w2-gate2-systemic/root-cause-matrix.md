# W2 Gate-2 Root-Cause Matrix（5 层系统性排查）

- owner: `Codex CLI`
- generated_at_utc: `2026-02-28T06:05:00Z`
- baseline_gate2_report: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/w2-gate2-report.json`
- baseline_retrieval_artifacts: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/retrieval/`
- constraints: `Gate-2 门槛冻结（不允许降标准）；一次只改一个变量；每次改动后必须 bounded 5 + stability 10 并落盘证据`

## TL;DR（当前阻断）

- Gate-2 结论：**No-Go**
- 阻断项（冻结门槛触发）：
  - `top1_exact_id_proxy(hit@1)=0.6471 < 0.93`（sample_size=34，low_confidence=false）
- 初步归因（按证据优先级）：
  - **CANDIDATE_RECALL / QUERY_CONSTRUCTION**：在 bounded run 中，存在“expected_id 不在 raw payload（Graphiti /search 返回集合）”的样本（hit@3 也失败），属于召回域/容量/索引可见性问题的优先怀疑对象。
  - **RANKING_ORDER（已缓解，但仍可能残留）**：Step2 已把 tie-break 改为保真 remote rank（并 facts 优先），但仍存在“expected_id 在 raw payload 内、却不是 top1”的样本（top3 可命中），说明 remote rank/无 score 的现实约束下仍可能需要 Step4（轻量 lexical scoring）作为最后手段。

> Update@2026-02-28：iter=3（Step2 RANKING_ORDER）后样本量与稳定性已达标，但 top1 仍远低于门槛；详见 day12 报告与检索证据。

> 本文件只做“根因矩阵 + 证据路径”，修复执行计划见 `fix-plan.md`。

## 证据索引（本轮新增）

- dataset/检索不匹配汇总（bounded-05）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/retrieval-mismatch-summary.md`
- Graphiti entity-edge existence probe（用于核对 expected_id 语义）：
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/existence-probe/graphiti-entity-edge-status.md`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/existence-probe/graphiti-entity-edge-status.json`
- Step2（RANKING_ORDER）Gate-2 报告与检索证据：
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day12/w2-step2-ranking-order/w2-gate2-report.json`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day12/w2-step2-ranking-order/retrieval/`

## 5 层排查矩阵（每层固定输出）

### L1：数据集正确性（dataset correctness）

- 现象
  - baseline（day10）dataset 仅 `5` 个样本，触发 `low_confidence_sample_size_lt_30` 强制 Reject。
  - Step1（day11）后 dataset 已扩充到 `34`，并通过 `/entity-edge/{uuid}` 语义核验（ground truth 可审计）。
- 验证方法
  - 读取 dataset：`.openclaw/memory-bridge-p3-retrieval-dataset.json`（Gate-2 同路径落盘副本见 day10 inputs）。
  - 对每个 expected_id 调用 Graphiti OpenAPI 路径 `/entity-edge/{uuid}`，取回 edge 的 `name/fact` 文本做语义对齐核验。
- 结论：**通过（Pass）**
  - dataset 已满足 Gate-2 的 `sample_size>=30` 门槛，且每条 expected_id 可通过 `/entity-edge/{uuid}` 取回验证。
- 证据路径
  - Gate-2 baseline 报告（含 sample_size/hit@1）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/w2-gate2-report.json`
  - Gate-2 Step2 报告（含 sample_size/hit@1）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day12/w2-step2-ranking-order/w2-gate2-report.json`
  - dataset 原文：`.openclaw/memory-bridge-p3-retrieval-dataset.json`
  - dataset 落盘副本（运行时采集）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/inputs/retrieval-dataset.raw.json`
  - expected_id 语义核验（entity-edge probe）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/existence-probe/graphiti-entity-edge-status.md`

### L2：查询构造（query construction）

- 现象
  - Gate-2 评测发往 Graphiti 的 `/search` 请求体仅包含 `{ query }`。
  - Graphiti OpenAPI 的 `SearchQuery` schema 支持 `group_ids` 与 `max_facts`，但当前链路未使用，导致：
    - 召回域（哪些 group）不确定；
    - 召回容量（max_facts）默认 10，可能把目标事实截断在 topK 之外。
- 验证方法
  - 检查 Gate-2 执行脚本中 requestBody 组装逻辑；
  - 对照 Graphiti OpenAPI `SearchQuery` schema。
  - 检查检索证据中记录的 `requestBody`（每次 raw search payload 均落盘）。
- 结论：**失败（Fail）**
  - 在 gate2 语义下，“查询构造”应当显式确定召回域与容量；当前实现未对齐 OpenAPI 可用字段，属于可预期的质量风险源。
- 证据路径
  - Gate-2 执行脚本（写死 `{query}`）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/run-w2-gate2-eval.ts`
  - Graphiti OpenAPI（SearchQuery）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/openapi/graphiti-openapi.json`
  - raw requestBody 证据（示例）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/retrieval/bounded-05/graphiti/search.raw.alias.probe-jarvis-os.00.json`

### L3：候选召回（candidate recall）

- 现象
  - Step2 评测（day12，bounded-01）显示：
    - `hit@3=0.7353`（= 25/34）→ 仍有 `9/34` 样本 expected_id **不在 top3**；
    - 在这 9 个样本里，存在 expected_id **完全不在 raw payload** 的情况（属于“召回/搜索域/容量/索引可见性”问题，而非排序问题）。
  - 仍有少量样本 expected_id 在 raw payload 内，但由于无 score + remote rank 的现实约束，expected_id 未能成为 top1（但 top3 可命中）。
- 验证方法
  - 基于一次 bounded run 的 raw payload，对每个 sample/alias 做 expected_id presence 检查；
  - 同步对 topK 归一化结果检查 hit@1/hit@3（用于定位“召回缺失” vs “排序导致丢失”）。
- 结论：**失败（Fail）**
  - dataset correctness 已通过；当前失败主要体现为“expected_id 不在 raw payload（候选集合）”与“候选截断/域不确定”，因此优先进入 Step3（QUERY_CONSTRUCTION：先加 `max_facts`）。
- 证据路径
  - Step2 Gate-2 报告（hit@1/hit@3/stability）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day12/w2-step2-ranking-order/w2-gate2-report.json`
  - 检索 raw/topK 落盘（示例，bounded-01）：
    - raw（expected_id 缺失示例）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day12/w2-step2-ranking-order/retrieval/bounded-01/graphiti/search.raw.sample.g2v1-has-primary-business-242955ff.json`
    - topK（对应 top3 不包含 expected_id）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day12/w2-step2-ranking-order/retrieval/bounded-01/graphiti/search.topk.sample.g2v1-has-primary-business-242955ff.json`
    - raw（expected_id 在 raw 内但非 top1 示例）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day12/w2-step2-ranking-order/retrieval/bounded-01/graphiti/search.raw.sample.g2v1-asks-about-a4e7e953.json`
    - topK（对应 top1 miss / top3 hit）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day12/w2-step2-ranking-order/retrieval/bounded-01/graphiti/search.topk.sample.g2v1-asks-about-a4e7e953.json`

### L4：重排打分（rerank scoring）

- 现象
  - Graphiti search 返回 items 没有 `score/rank_score` 字段 → 客户端 `score` 解析为 `0`；
  - 归一化后的 topK 证据里，命中项与非命中项的 `score` 全为 `0`，属于典型 tie 场景。
- 验证方法
  - 检查 topK 文件中的 `score` 分布；
  - 检查 `parseSearchHit()` 的 score 来源（`record.score ?? record.rank_score`）。
- 结论：**失败（Fail）**
  - 在全 0 分 tie 场景下，重排只能依赖 tie-break；若 tie-break 不保真原始相关性顺序，将直接损害 top1。
- 证据路径
  - topK 示例（score 全 0）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/retrieval/bounded-05/graphiti/search.topk.alias.probe-thinktank-topology.00.json`
  - score 字段解析逻辑：`extensions/memory-mem0-graphiti-bridge/src/client/mem0-client.ts`

### L5：最终选择（final selection）

- 现象
  - baseline：Graphiti 无 score 时易出现全 0 分 tie；若 tie-break 不保真 remote rank，会导致 top1 近似“按 UUID 选最小”。
  - Step2：tie-break 已改为 `score desc → structure(facts first) → rank asc → remoteId → path`，把“最终选择”从 UUID 排序改为保真 remote rank（并保留 determinism 兜底）。
  - 但在 Step2 结果中，仍存在少量“expected_id 在 raw 内但非 top1”的样本（通常 top3 可命中），说明仅靠保序仍不足以达到 `hit@1>=0.93`。
- 验证方法
  - 对比 raw presence 与 topK 命中（同一条检索，raw 有 expected_id，但 topK.hit@1 仍 false）；
  - 结合代码确认 tie-break 规则：`score desc → structurePriority(facts first) → rank asc → remoteId → path`。
- 结论：**部分通过（Partial）**
  - Step2 已修复“UUID 作为主 tie-break”的确定性缺陷，并通过单测锁定行为；
  - 当前 top1 仍失败的主要贡献来自“召回缺失”（见 L3），其次才是“无 score 下 remote rank 与语义偏差”（可能需要 Step4 处理）。
- 证据路径
  - Step2 Gate-2 报告：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day12/w2-step2-ranking-order/w2-gate2-report.json`
  - 检索 raw/topK（同 L3 示例）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day12/w2-step2-ranking-order/retrieval/bounded-01/graphiti/`
  - tie-break 排序实现：`extensions/memory-mem0-graphiti-bridge/src/client/mem0-client.ts`

## Root-cause 归类（用于修复顺序）

- primary: `QUERY_CONSTRUCTION` + `CANDIDATE_RECALL`
- secondary: `SCORE_SOURCE`（Graphiti 无 score 的现实约束）
- tertiary: `RANKING_ORDER`（已缓解，但仍可能需要 Step4 的 scoring fallback）

下一步执行顺序与单变量策略见：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/fix-plan.md`。
