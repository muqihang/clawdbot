# Wave3 执行任务包（仅计划冻结；未开工实施）

> **状态：Frozen（文档冻结）**  
> 本文件在进入 Wave3 代码实施（W3-A）前，用于冻结范围/口径/证据目录/Stop points。  
> **本文件不包含任何代码变更**，也不授权直接进入 W3-A；必须等待人工确认。

## 1) Wave3 范围与目标（来自 V1 的统一口径）

Wave3（第 21-35 天）目标：**Graphiti 结构价值释放**，让 Graphiti 不再只是“另一个 search 后端”，而是能在时序/关系类查询中发挥结构优势。

- 权威输入（不要改口径，只引用）：
  - Wave3 定义与交付项：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:147`
  - Gate-3 文案（冻结，不改）：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:157`

## 2) 硬约束（必须遵守）

1. **不降低 Gate-3 门槛**（Gate-3 评审必须严格按冻结文案执行）。
2. **不允许回退 Wave2 的既有质量**：Wave3 的任何实现不得导致 Wave2 Gate-2 的精确 ID 桶指标回退（若回退，视为阻断项，必须先修复再谈 Gate-3）。
3. Wave3 所有证据必须落盘到：
   - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day*/`
   - 禁止以 `/tmp` 作为最终证据锚点（允许运行时临时文件，但最终证据必须复制/重放到 `analysis/...`）。
4. 单变量纪律：一次只改一个变量（避免不可归因）；每次改动后必须产出 bounded + stability 证据与对比结论。
5. 新能力先 shadow，再 canary，再扩流（默认关闭；开关与采样规则必须在 Day1 冻结）。

## 3) 证据目录约定（Wave3）

- Day1（入口冻结）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day1/`
- Day2+（实施与回执）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day2/` …（按实际迭代追加）
- Gate-3（最终评审）：建议统一落盘到 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day10/`（或 `gates/` 子目录，但目录策略需在 Day1 冻结）。

## 4) 任务包拆分（W3-A ~ W3-D）

### 4.1 W3-A：按 query 类型切 Graphiti search recipe（edge/node/hybrid）

**目标**：把“Graphiti 结构能力”变成可控策略：不同 query bucket 走不同 recipe（edge/node/hybrid），并输出可审计 trace。

- 交付（计划）：
  1. query typing（至少覆盖：时序关系类 / 实体属性类 / 决策类 / 其他）。
  2. recipe 选择策略（edge/node/hybrid）与降级路径（保守回落不破坏现有质量）。
  3. shadow 对比报表（bucket 维度）与差异归因。
- 关键验收（计划）：
  - bucket 级 hit@1/hit@3 不回退（尤其精确 ID 桶）。
  - trace 可追溯（输入 bucket、选用 recipe、降级原因）。

### 4.2 W3-B：focal-node + temporal filters 策略

**目标**：在时序关系类查询中引入 focal-node 与 temporal filters，提升“关系/演进”类检索命中与结构覆盖。

- 交付（计划）：
  1. focal-node 选择策略（可复现、可解释）。
  2. temporal filters（时间窗/相对时间）解析与落盘证据（避免“看起来是时序但实际没用过滤”的假象）。
  3. 结构覆盖指标采集（episodes/nodes 非零覆盖）与报表。
- 关键验收（计划）：
  - Gate-3 的“时序关系桶”Top1 明显提升（>=10pp 的提升在 W3-D 结论里给出）。
  - episodes/nodes 覆盖显著提升（在 Gate-3 report 中给出定义与统计口径）。

### 4.3 W3-C：ontology v1（Decision/Project/Reason/RejectedOption）

**目标**：把“决策/原因/备选方案”这一类结构信息固化为可检索/可评测的 schema，避免只落成散乱 facts。

- 交付（计划）：
  1. ontology v1 的最小字段集合（名称与语义冻结）。
  2. 结构落盘与检索回读（shadow 优先）。
  3. 与 Gate-3 评测样本对齐的 evidence（至少 30 个样本，去重规则可复现）。

### 4.4 W3-D：Gate-3 评审（最终结论）

**目标**：基于冻结口径产出 Gate-3 最终结论（Go/No-Go），并落盘可复算证据。

- Gate-3 文案（冻结，不改）：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:157`
- Gate-3 产物（计划）：
  - `.../wave3-artifacts/day10/w3-gate3-report.json`
  - `.../wave3-artifacts/day10/w3-gate3-report.txt`
  - `.../wave3-artifacts/day10/w3-gate3-review.md`
  - `.../wave3-artifacts/day10/w3-master-closure.md`（单点事实 + superseded）

## 5) Stop points（冻结后必须暂停）

- Stop-0（本轮必须执行）：完成 Day1 的 `W3-01 入口冻结` 文档后 **立即暂停**，等待人工确认后才允许进入 W3-A 代码实施。
- Stop-1：W3-A 完成并验收后暂停。
- Stop-2：W3-B 完成并验收后暂停。
- Stop-3：W3-C 完成并验收后暂停。
- Stop-4：W3-D（Gate-3 评审）完成并输出 master closure 后暂停。

## 6) Gate-3 评测与证据模板（口径冻结）

> 本节用于把 Gate-3 的“可复验口径”冻结下来：dataset 构造、去重、覆盖面、runner 证据结构与统计口径。  
> **注意：本节只定义口径与模板，不包含任何 W3 代码实现。**

### 6.1 时序关系桶数据集（Temporal Relation Bucket Dataset）

目标：构造一个“时序关系桶”的最小可复验数据集，用于评估 Gate-3 的 **Top1 提升（>=10pp）** 与结构覆盖提升。

- 数据集文件（冻结命名）：
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day2/inputs/retrieval-temporal-dataset.v1.json`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day2/dataset-notes.md`
  - 每次评测 run 必须在对应 step 的证据目录 `inputs/` 下 **复制一份 dataset 快照**（避免后续 dataset 演进导致历史 run 无法复验）。
- 最小字段（冻结 schema；与 Wave2 dataset v2 保持同构，便于复用 runner）：
  - `id`：稳定 sample id（建议含短 hash，避免重名）
  - `query`：自然语言查询（尽量短，贴近真实使用）
  - `aliases`：可选别名列表（用于覆盖真实用法的短 query/缩写）
  - `expected_ids`：期望的 Graphiti remote id（允许 1..N）
  - `expected_structures`：期望结构类型（允许 `facts/episodes/nodes`；默认建议从 `facts` 起步）
  - `bucket`：固定为 `temporal_relation`（用于 runner 分桶统计）
- 样本规模（冻结）：
  - `sample_size >= 30`（避免低置信度；与 Wave2 的经验一致）
- Ground truth 核验（冻结规则）：
  - 每条 `expected_id` 必须能被 Graphiti 的语义核验通过（优先用 OpenAPI 中的 **GET-by-id** 路径；若只支持 `/entity-edge/{uuid}`，则以该路径为准）。
  - 任何无法核验的样本必须剔除（不允许“凑样本”）。
- 去重规则（冻结）：
  1. `expected_id` 去重：同一个 `expected_id` 只能出现一次（避免某个事实被重复计分放大）。
  2. `query` 去重：完全相同的 `query` 不重复（允许不同 alias）。
  3. 近似 query（同义改写）允许，但需在 `dataset-notes.md` 说明来源与目的。
- 覆盖面要求（冻结 checklist；用于 dataset-notes.md 可审计说明）：
  - 至少覆盖 4 类时序关系表达：
    1. before/after（之前/之后/随后）
    2. precedes/follows（先于/后于/前置依赖）
    3. milestone timeline（第 N 天/阶段/里程碑）
    4. causal-ish temporal（导致/触发/因此/之后发生）
  - 至少覆盖 3 种 query 形态：
    - 短 query（<=12 字/词）
    - 带专有名词（项目/模块/人名占位符）
    - 带时间锚（日期/Day N/相对时间）

### 6.2 Runner 证据模板（bounded + stability）

目标：每次迭代都能用同一套目录结构复验结果；禁止 `/tmp` 作为最终锚点。

- 运行强制项（冻结）：
  - `bounded_runs=5`
  - `stability_runs=10`
  - baseline 与 variant 必须在同一机器/同一 stack 配置下运行（避免环境漂移不可归因）。
- 证据目录（冻结模板，按 day/step 追加）：
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day2/w3-a-recipe-routing/`
    - `inputs/`（dataset 副本 + runner 入参快照）
    - `openapi/`（Graphiti/Mem0 OpenAPI 快照，用于对齐字段）
    - `tests/`（vitest.log + vitest.exit）
    - `retrieval/`
      - `baseline/`
        - `bounded-01/` … `bounded-05/`
        - `stability-01/` … `stability-10/`
      - `variant/`
        - `bounded-01/` … `bounded-05/`
        - `stability-01/` … `stability-10/`
    - `report/`
      - `w3-gate3-baseline-report.json`
      - `w3-gate3-variant-report.json`
      - `w3-gate3-delta.json`
      - `w3-gate3-review.md`
    - `acceptance.md`（changed_files + acceptance_check + unresolved）
- 每次检索必须落盘（冻结要求）：
  - raw search payload（每个 sample + 每个 alias）：`search.raw.*.json`
  - 归一化 topK（同维度）：`search.topk.*.json`
  - 若远端无 `score/rank_score`，必须记录 tie 场景（topK 内 score 分布 + tie-break 说明）。

### 6.3 “episodes/nodes 非零覆盖显著提升”的统计口径（冻结）

背景：Gate-3 文案包含 “episodes/nodes 非零覆盖显著提升”，必须冻结“什么叫覆盖、什么叫显著”。

- 结构判定（冻结）：
  - 以归一化 topK 命中项的 `structure` 字段为准（规范化规则与 bridge 一致：`facts/episodes/nodes`）。
- 覆盖（coverage）定义（冻结）：
  - 对每个 sample（以 `query` 评测维度）计算：
    - `episodes_present = topK 中存在 structure == 'episodes'`
    - `nodes_present = topK 中存在 structure == 'nodes'`
  - 聚合为比例：
    - `episodes_nonzero_coverage = mean(episodes_present)`
    - `nodes_nonzero_coverage = mean(nodes_present)`
- “显著提升”（significant improvement）判定（冻结，双阈值防止走样）：
  - 必须同时满足：
    1. `episodes_nonzero_coverage_variant >= max(0.20, episodes_nonzero_coverage_baseline + 0.10)`
    2. `nodes_nonzero_coverage_variant >= max(0.20, nodes_nonzero_coverage_baseline + 0.10)`
  - 且稳定性要求：
    - `episodes_nonzero_coverage` 与 `nodes_nonzero_coverage` 在 `stability_runs=10` 中取值不允许抖动（unique values 各自必须为 1）。

### 6.4 Gate-3 评分口径（Top1 提升 >= 10pp）

冻结口径：在 `bucket=temporal_relation` 的 dataset 上，对比 baseline 与 variant 的 Top1：

- `hit@1_baseline = mean(top1_exact_id_hit_baseline)`
- `hit@1_variant = mean(top1_exact_id_hit_variant)`
- `delta_pp = (hit@1_variant - hit@1_baseline) * 100`
- Gate-3 的 “Top1 提升 >= 10pp” 以 `delta_pp >= 10` 为通过条件。
