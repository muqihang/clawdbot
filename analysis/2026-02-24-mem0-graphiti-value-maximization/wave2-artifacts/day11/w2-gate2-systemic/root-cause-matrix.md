# W2 Gate-2 Root-Cause Matrix（5 层系统性排查）

- owner: `Codex CLI`
- generated_at_utc: `2026-02-28T06:05:00Z`
- baseline_gate2_report: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/w2-gate2-report.json`
- baseline_retrieval_artifacts: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/retrieval/`
- constraints: `Gate-2 门槛冻结（不允许降标准）；一次只改一个变量；每次改动后必须 bounded 5 + stability 10 并落盘证据`

## TL;DR（当前阻断）

- Gate-2 结论：**No-Go**
- 阻断项（冻结门槛触发）：
  - `sample_size=5 < 30` → `low_confidence` 强制 Reject
  - `top1_exact_id_proxy(hit@1)=0 < 0.93`
- 初步归因（按证据优先级）：
  - **DATASET_CORRECTNESS**：当前 dataset 存在明显语义/ID 对不上的样本（不是“召回差”，而是“样本不可信”）
  - **RANKING_ORDER**：Graphiti 返回无 score → 全 0 分 tie；客户端在 tie 下按 `remoteId(uuid)` 排序导致 top1 近似“按 UUID 选最小”，与语义无关
  - **QUERY_CONSTRUCTION（次要）**：Graphiti `/search` OpenAPI 支持 `group_ids/max_facts`，当前请求体仅 `{query}`，无法保证召回域与容量正确

> 本文件只做“根因矩阵 + 证据路径”，修复执行计划见 `fix-plan.md`。

## 证据索引（本轮新增）

- dataset/检索不匹配汇总（bounded-05）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/retrieval-mismatch-summary.md`
- Graphiti entity-edge existence probe（用于核对 expected_id 语义）：
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/existence-probe/graphiti-entity-edge-status.md`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/existence-probe/graphiti-entity-edge-status.json`

## 5 层排查矩阵（每层固定输出）

### L1：数据集正确性（dataset correctness）

- 现象
  - Gate-2 使用的 retrieval dataset 仅 `5` 个样本，触发 `low_confidence_sample_size_lt_30` 强制 Reject。
  - dataset 中存在“query 语义”与“expected_ids 对应事实”明显不一致的情况：例如 `probe-telegram-priority` 的 expected_ids 指向 `PREFERS(sub2api/graphiti)`，与 Telegram 优先级无关。
- 验证方法
  - 读取 dataset：`.openclaw/memory-bridge-p3-retrieval-dataset.json`（Gate-2 同路径落盘副本见 day10 inputs）。
  - 对每个 expected_id 调用 Graphiti OpenAPI 路径 `/entity-edge/{uuid}`，取回 edge 的 `name/fact` 文本做语义对齐核验。
- 结论：**失败（Fail）**
  - dataset 当前不满足“可审计的 ground truth”要求：既不满足 `sample_size>=30`，且存在语义错配样本（不应进入 Gate-2 质量裁决）。
- 证据路径
  - Gate-2 报告（含 sample_size/hit@1）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/w2-gate2-report.json`
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
  - 在部分样本中，expected_id **确实存在于 Graphiti raw payload**（例如 `probe-jarvis-os`），说明“召回能力并非完全失效”；
  - 但在另一些样本中，raw payload 中 **完全找不到 expected_id**（或 expected_id 本身语义不对），导致 hit@K 必然失败；
  - 召回的候选中普遍混入 nodes/episodes，且数量受 `max_facts` 默认值影响。
- 验证方法
  - 基于一次 bounded run 的 raw payload，对每个 sample/alias 做 expected_id presence 检查；
  - 同步对 topK 归一化结果检查 hit@1/hit@3（用于定位“召回缺失” vs “排序导致丢失”）。
- 结论：**失败（Fail）**
  - 当前样本集下，召回与样本的 ground truth 不能稳定对齐；需要先修复 dataset correctness，再评估召回质量本身。
- 证据路径
  - 不匹配汇总（raw presence + topK hit）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/retrieval-mismatch-summary.md`
  - 检索 raw/topK 落盘（示例）：
    - raw：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/retrieval/bounded-05/graphiti/search.raw.alias.probe-jarvis-os.00.json`
    - topK：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/retrieval/bounded-05/graphiti/search.topk.alias.probe-jarvis-os.00.json`

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
  - `normalizeSearchHits()` 在 score tie 下按 `remoteId`（UUID）排序，导致 top1/top3 结果与语义相关性弱相关甚至无关。
  - 直观表现：raw payload 中包含 expected_id，但 topK 被“按 UUID 排序”的结果挤出 top1/top3（或被 nodes/episodes 抢占 top1）。
- 验证方法
  - 对比 raw presence 与 topK 命中（同一条检索，raw 有 expected_id，但 topK.hit@1 仍 false）；
  - 结合代码确认 tie-break 规则：score 相等 → compareRemoteIds → compare path。
- 结论：**失败（Fail）**
  - 这是“可以通过一次变量变更修复”的确定性逻辑缺陷：在 Graphiti 无 score 的前提下，不应使用 UUID 作为主 tie-break（至少应保留 Graphiti 返回顺序作为 rank tie-break）。
- 证据路径
  - raw/topK 对照汇总：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/retrieval-mismatch-summary.md`
  - tie-break 排序实现：`extensions/memory-mem0-graphiti-bridge/src/client/mem0-client.ts`

## Root-cause 归类（用于修复顺序）

- primary: `DATASET_CORRECTNESS`
- secondary: `RANKING_ORDER`
- tertiary: `QUERY_CONSTRUCTION` + `SCORE_SOURCE`（Graphiti 无 score 的现实约束）

下一步执行顺序与单变量策略见：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/fix-plan.md`。
