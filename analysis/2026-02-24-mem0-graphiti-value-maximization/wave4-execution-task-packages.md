# Wave4 执行任务包（仅计划冻结；未开工实施）

> **状态：Frozen（文档冻结）**  
> 本文件在进入 Wave4 代码实施（W4-A）前，用于冻结范围/口径/证据目录/Stop points。  
> **本文件不包含任何代码变更**，也不授权直接进入 W4-A；必须等待人工确认。

## 1) Wave4 范围与目标（来自 V1 / 指标字典的统一口径）

Wave4（第 36-55 天）目标：**三路融合重排（Local + Mem0 + Graphiti）**，从“单路切换”升级到“并行候选 + 统一归一 + 约束重排”。

- 权威输入（不要改口径，只引用）：
  - Wave4 定义与交付项：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:159`
  - Gate-4 文案（冻结，不改）：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:169`
  - 指标字典（Top1/FUR/p95 等）：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:189`（第 4 章）
  - 指标字典落盘快照：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:1`

## 2) 硬约束（必须遵守）

1. **不降低 Gate-4 门槛**：Gate-4 公式/阈值/baseline 不改；计算公式冻结见第 6 节。
2. **不允许回退既有质量**：
   - Wave2 Gate-2 精确 ID 桶必须保持 pass（任何回退视为阻断项，需先修复再继续 W4）。
   - Wave3 Gate-3 的结构覆盖收益不得被破坏（回归需记录并归因；Gate-4 仍以全桶为准）。
3. **证据落盘规则**：
   - Wave4 所有证据必须落盘到：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day*/`
   - 禁止以 `/tmp` 作为最终证据锚点（允许运行时临时文件，但最终证据必须复制/重放到 `analysis/...`）。
4. **单变量纪律**：
   - 一次只改一个变量（例：只加并行召回、只改归一化、只改重排预算、只改 citation 映射等）。
   - 每次改动后立刻跑：bounded 5 + stability 10 + W2 Gate-2 minimal regression，并落盘。
5. **Shadow → Canary → Expand**：
   - 默认关闭；先 shadow 产出对比证据，再进入 primary/canary；开关与采样规则必须可审计。
6. **不破坏 tool 契约**：
   - `memory_search` 入参保持向后兼容；新增参数必须可选且有默认值；不得改名/改类型导致旧调用失败。
7. **可审计提交粒度**：
   - 每个 Iter 推荐拆成 2 个 commit：`代码+tests` 与 `证据落盘`。
   - 任何 No-Go 证据不得删除，只能通过 `master-closure` 标记 superseded 指向新的单点事实。

## 3) 证据目录约定（Wave4）

- Day1（入口冻结 + 执行计划）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day1/`
- Day2+（实施与回执）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day2/` …（按实际迭代追加）
- Gate-4（最终评审）：建议统一落盘到 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/`（或 `day20/`；目录策略需在 Day1 冻结）。

## 4) 任务包拆分（W4-A ~ W4-D）

### 4.1 W4-A：并行召回骨架（Local + Mem0 + Graphiti）【shadow-only】

**目标**：在不改变用户最终 Top1 的前提下，完成三路并行召回的骨架接入：

- 并行取候选（local 仍由现有 localTool 提供；mem0/graphiti 通过 `RemoteMemoryClient`）。
- 候选统一归一化（结构对齐、`source` 标注、`remoteId` 解析）。
- 观测字段齐全：per-source latency、count、error/fallback 原因。
- 默认只做 shadow 记录，不切主输出。

交付（计划）：

1. flags：新增 `read.fusion.shadow_enabled`（默认 false）；新增 per-source timeouts/budgets（默认与现状一致）。
2. shadow evidence：每个 sample 落盘 raw payload + normalized topK（按 `source` 分目录）。
3. unit tests：确保不开启时行为不变；开启 shadow 时不影响输出，仅增加 trace/metrics。

关键验收（计划）：

- W2 Gate-2 minimal regression：pass（硬阻断）。
- p95 预警：shadow 运行不引入额外同步等待（并行 + 超时上限），p95_total 不出现明显暴涨（最终以 Gate-4 为准）。
- 稳定性：10 次稳定性抽样中 Top1 结果不抖动（shadow-only 时应为 0 抖动）。

Stop point：W4-A 完成并验收后暂停。

### 4.2 W4-B：候选归一化 + 去重 + 确定性 tie-break（跨源）

**目标**：为融合重排提供可复验的 deterministic 候选列表：

- `remoteId` 去重（跨 mem0/graphiti/local 的同 id / 同 path 情况）。
- score 字段来源明确（`score` / `rank_score` / 其他）；缺失时必须记录 tie 场景。
- 稳定排序：`score desc` + 明确 tie-break（`source` 优先级 / `path` / `remoteId` / `index`）。

交付（计划）：

- 抽出可单测的 `normalizeAndRankCandidates()` helper（不绑具体 route）。
- tests 覆盖：
  - “全 0 分 tie”
  - “重复 remoteId 去重（保留最高分）”
  - “跨源同 remoteId”的选择与 trace。

关键验收（计划）：

- Top1 determinism：相同输入 payload 的 Top1 必须可复现（100%）。
- raw payload + topK evidence：每次 bounded/stability 均落盘（5+10）。

Stop point：W4-B 完成并验收后暂停。

### 4.3 W4-C：约束重排 v1（预算 + 权重 + 可解释）

**目标**：在候选归一化之上，启用融合重排：

- 约束：精确键 guard lane 仍可强制 local；fallback 逻辑不回退。
- 预算：按 query bucket 对 local/mem0/graphiti 分配预算（例如 topK quota、timeout budget、score boost）。
- 权重：按 bucket 设定 source weights（先 shadow 观测，再进入 primary）。
- source-aware citation：输出的 snippet `source` 不再全部映射为 `memory`（至少区分 `local/mem0/graphiti`）。

交付（计划）：

1. flags：新增 `read.fusion.enabled`（默认 false）与 `read.fusion.bucket_policy.*`（默认 conservative）。
2. citations：新增/调整 citation schema，使下游 assembler 能区分来源（local/mem0/graphiti）。
3. shadow compare report：按 bucket 输出 baseline vs fusion 的 Top1/FUR/p95 变化与归因（至少包含 candidate breakdown）。

关键验收（计划）：

- Gate-4 预检：全桶 Top1/FUR 方向正确，且 p95 增幅可控（<=15%）。
- W2 Gate-2 minimal regression：pass（硬阻断）。
- stability：10 次抽样 Gate-4 Top1 不抖动（unique values=1）。

Stop point：W4-C 完成并验收后暂停。

### 4.4 W4-D：Gate-4 评审（最终结论）

**目标**：基于冻结口径产出 Gate-4 最终结论（Go/No-Go），并落盘可复算证据与 superseded 关系。

- Gate-4 文案（冻结，不改）：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:169`
- Gate-4 产物（冻结命名建议）：
  - `.../wave4-artifacts/day10/w4-gate4-report.json`
  - `.../wave4-artifacts/day10/w4-gate4-report.txt`
  - `.../wave4-artifacts/day10/w4-gate4-review.md`
  - `.../wave4-artifacts/day10/w4-master-closure.md`（单点事实 + superseded）

Stop point：W4-D 完成并输出 master closure 后暂停（等待进入 Wave5）。

## 5) Stop points（冻结后必须暂停）

- Stop-0（本轮必须执行）：完成 Day1 的 `W4-01 入口冻结` + `W4-02 执行计划` 文档后 **立即暂停**，等待人工确认后才允许进入 W4-A 代码实施。
- Stop-1：W4-A 完成并验收后暂停。
- Stop-2：W4-B 完成并验收后暂停。
- Stop-3：W4-C 完成并验收后暂停。
- Stop-4：W4-D（Gate-4 评审）完成并输出 master closure 后暂停。

## 6) Gate-4 评测与证据模板（口径冻结）

> 本节冻结 Gate-4 的可复验口径：dataset、runner、统计公式、证据目录结构。  
> **注意：本节只定义口径与模板，不包含任何 W4 代码实现。**

### 6.1 Gate-4 数据集（四桶，全桶评测）

目标：构造一个覆盖四桶的 dataset，用于 Gate-4 的 Top1 平均提升、FUR 提升与 p95 增幅评审。

- 桶定义（冻结）：`exact_id / decision_reason / temporal_relation / project_context`
  - bucket 标签来源：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:195`
- 样本规模（冻结）：
  - 每桶 `sample_size >= 30`（避免 low_confidence）
  - 建议总样本 `>= 120`（四桶各 30）
- dataset 文件（冻结命名）：
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day2/inputs/retrieval-gate4-dataset.v1.json`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day2/dataset-notes.md`
  - 每次评测 run 必须在对应 step 的证据目录 `inputs/` 下 **复制 dataset 快照**（避免 dataset 演进导致历史 run 不可复验）。
- Ground truth 核验（冻结规则）：
  - 对于 `expected_ids`：必须能通过 remote GET-by-id 语义核验（Graphiti 或 Mem0 的 OpenAPI 路径，以实际 OpenAPI 为准）。
  - 任何无法核验的样本必须剔除，不允许“凑样本”。
- 去重规则（冻结）：
  1. 同一 `expected_id` 不重复计分（避免放大单一事实）。
  2. 同一 `query` 不重复（允许 alias）。
  3. 近似 query 允许但需 `dataset-notes.md` 说明来源与覆盖目的。

### 6.2 Runner 证据模板（baseline vs variant；bounded + stability + latency）

- 运行强制项（冻结）：
  - `bounded_runs=5`
  - `stability_runs=10`
  - baseline 与 variant 必须在同一机器、同一 stack 配置下跑（避免环境漂移不可归因）。
- 证据目录模板（冻结）：
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/dayX/w4-*/`
    - `inputs/`（dataset 快照 + runner 入参快照）
    - `openapi/`（Mem0/Graphiti OpenAPI 快照，用于字段对齐）
    - `tests/`（vitest.log + vitest.exit）
    - `retrieval/`
      - `baseline/`
        - `bounded-01/` … `bounded-05/`
        - `stability-01/` … `stability-10/`
      - `variant/`
        - `bounded-01/` … `bounded-05/`
        - `stability-01/` … `stability-10/`
      - 每次检索必须落盘：
        - raw search payload（graphiti/mem0/local）：`search.raw.<source>.*.json`
        - normalized topK（同维度）：`search.topk.<source>.*.json`
        - 若无 score 字段必须记录 tie：`tie-debug.*.json`
    - `latency/`（冻结）：
      - `latency.samples.jsonl`（每次 query 的 total + per-source ms）
      - `latency.summary.json`（p50/p95 + baseline vs variant）
    - `report/`
      - `w4-gate4-baseline-report.json`
      - `w4-gate4-variant-report.json`
      - `w4-gate4-delta.json`
      - `w4-gate4-review.md`
    - `acceptance.md`（changed_files + acceptance_check + unresolved）

### 6.3 Gate-4 统计口径（冻结公式）

- Top1（按桶）：
  - `hit_at_1(bucket) = matched_top1 / sample_size(bucket)`
- “全桶 Top1 平均提升（pp）”（冻结解释：四桶 Top1 取均值后再算提升）：
  - `avg_hit_at_1 = mean_over_buckets(hit_at_1(bucket))`
  - `top1_avg_delta_pp = (avg_hit_at_1_variant - avg_hit_at_1_baseline) * 100`
  - Gate-4 条件：`top1_avg_delta_pp >= 8`
- FUR（冻结定义见指标字典）：
  - `FUR = first_usable / sample_size`
  - `fur_delta_pp = (fur_variant - fur_baseline) * 100`
  - Gate-4 条件：`fur_delta_pp >= 10`
  - 注意：若阶段性使用 proxy（例如 `min(hit_at_1, structure_coverage)`），必须在 review 明确标注为 proxy，不得冒充正式 FUR。
- p95 增幅（冻结）：
  - `p95_increase_pct = ((p95_total_variant_ms - p95_total_baseline_ms) / p95_total_baseline_ms) * 100`
  - Gate-4 条件：`p95_increase_pct <= 15`

### 6.4 Gate-4 最终单点事实（master closure 模板）

- 单点事实（最终锚点）统一指向：
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-gate4-report.json`
- superseded：
  - 任何早期 Iter 的 report/review 只标记 superseded，不删除历史。
