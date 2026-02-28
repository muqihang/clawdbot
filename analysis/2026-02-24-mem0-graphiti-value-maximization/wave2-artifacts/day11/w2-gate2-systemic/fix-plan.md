# W2 Gate-2 修复计划（单变量迭代）

- owner: `Codex CLI`
- generated_at_utc: `2026-02-28T06:05:00Z`
- baseline_gate2_report: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/w2-gate2-report.json`（No-Go）
- root-cause_matrix: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/root-cause-matrix.md`

## 冻结门槛（不允许降标准）

- `sample_size >= 30`（解除 low_confidence）
- `top1_exact_id_proxy(hit@1) >= 0.93`
- stability：10 次不抖动，且结果满足门槛
- 其他 gate 条件继续满足（cfp/fallback/failed/dead 等）

## 执行纪律（必须遵守）

- 一次只改一个变量（避免不可归因）
- 每次改动后立刻执行：
  - bounded 5 次重跑（选择规则保持冻结）
  - stability 10 次抽样
  - 重算 Gate-2，证据落盘
- 严禁把 `/tmp` 作为最终锚点；所有证据落盘到 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day*/...`

## Step 0：W2-D baseline 复用（不改代码）

目的：把 day10 No-Go 作为审计基线，不覆盖历史。

- 基线报告：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/w2-gate2-report.json`
- 基线检索证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/retrieval/`
- 基线 closure：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/w2-master-closure.md`

Stop point：本 step 完成后，进入单变量修复；每个 step 都更新 `fix-log.md`。

## Step 1（变量：DATASET）— 修复并扩充 retrieval dataset 到 >=30

**只改数据，不改检索/排序逻辑。**

### 为什么先做

- 当前 dataset 同时存在：
  - `sample_size=5` → 冻结门槛直接 Reject；
  - expected_ids 语义错配 → 继续用它评估会把“样本错”误判成“系统差”。

### 要做什么（交付物）

- 生成新的 dataset（>=30）并落盘在可审计路径（推荐放到 wave2 artifacts day11 inputs）：
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/inputs/retrieval-dataset.v1.json`
- 逐条样本提供“来源/去重规则/覆盖面”说明（写入同目录 `dataset-notes.md`）。

### 推荐抽样与去重规则（可复现）

- 抽样来源：Graphiti `/entity-edge/{uuid}` 的事实文本（以事实为 ground truth），并用固定 seed queries 发现候选（因为 OpenAPI 不提供 facts list）。
- 去重：
  - expected_ids 去重（case-insensitive），同一事实只出现一次；
  - query 去重（trim + lower），避免重复 query 造成指标虚高。
- 覆盖面（最少保证）：
  - 中英文混合（至少 10 条含中文、10 条含英文 alias）
  - 至少覆盖 5 个主题簇：产品/任务、偏好/配置、流程/规则、路由/升级、质量/门禁

### 回归（每次必跑）

- 跑 Gate-2（bounded 5 + stability 10）并落盘到新的 day11 目录（建议复制 day10 的 runner 到 day11 目录，避免覆盖 day10 证据）。

### 通过/失败判据

- 通过：`sample_size >= 30` 且 dataset-notes 完整、可审计（并不要求此 step 就 hit@1 达标）。
- 失败：样本仍无法对齐 ground truth（expected_id 无法通过 `/entity-edge/{uuid}` 取回或语义明显不匹配）。

## Step 2（变量：RANKING_ORDER）— 修复 Graphiti score=0 tie 下的排序/选择

**只改“tie-break 规则”，不改 Gate 阈值、不改 dataset。**

### 目标

- 在 Graphiti 无 score 的现实约束下，把“最终 top1”从 UUID 排序改为“保真 Graphiti 返回的相关性顺序”（rank）：
  - 建议 tie-break：`score desc` → `rank asc` → `remoteId asc`（最终兜底 determinism）

### 预期收益

- 对 `probe-jarvis-os` 这类样本：raw payload 的第一个 fact 通常就是最相关；保序后 top1 更可能命中 expected_id。
- 同时提升 stability：rank 是确定性的（同一响应序列），避免 UUID 的偶然性干扰。

### 变更范围（预告）

- `extensions/memory-mem0-graphiti-bridge/src/client/mem0-client.ts`
  - `normalizeSearchHits()`：引入 rank tie-break（保序）并在 dedup 时保留 rank
- 需要补充/调整 tests（以 W2 为准，不回写 W1 Gate）：
  - 新增至少 1 个单测覆盖 `score 全 0 tie` 的 deterministic + 保序行为（Graphiti 路径）

### 回归（每次必跑）

- bounded 5 + stability 10 + Gate-2 重算

## Step 3（变量：QUERY_CONSTRUCTION）— Graphiti `/search` 显式传入 `max_facts`（必要时加 `group_ids`）

**一次只加一个字段，避免混改：先 `max_facts`，再评估是否需要 `group_ids`。**

- 3A：只增加 `max_facts`（例如 30/50），验证是否把目标事实从截断区拉回 topK
- 3B：如仍存在跨域噪音（同 query 命中完全无关 group），再加入 `group_ids`

回归：同上（bounded 5 + stability 10）。

## Step 4（变量：SCORING_FALLBACK）— Graphiti 无 score 时引入轻量 lexical scoring（最后手段）

仅当 Step 2/3 仍无法把 hit@1 推到 >=0.93 才进入。

- 做法：对 facts 的 `fact` 文本做 token overlap / substring hit 的加权分；作为 score=0 时的补充评分。
- 注意：这一步属于“行为变更”，必须严格单变量，并要求新增针对性 tests。

## Stop points（强制停点）

- Stop#1：你确认 Step 1 的 dataset 生成方式与覆盖面后，才进入 Step 1 执行。
- Stop#2：每完成一个 step（并完成回归 + 落盘证据）都停下复核，再进入下一个变量。
- Stop#Final：达到 **Go** 后再写 `w2-master-closure.md`（单点事实 + superseded 关系），并暂停等待你决定是否继续 W2 后续。
