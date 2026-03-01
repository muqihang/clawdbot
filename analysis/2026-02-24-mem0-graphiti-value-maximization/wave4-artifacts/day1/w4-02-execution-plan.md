# Wave4 三路融合重排（Local + Mem0 + Graphiti）Implementation Plan

> **说明**：我在使用 `writing-plans` skill 来产出可执行的 Wave4 实施计划（Step-by-step、可派发、可审计）。  
> **硬约束**：Gate-4 门槛冻结不降；单变量纪律；证据全部落盘到 `analysis/.../wave4-artifacts/...`；不以 `/tmp` 作为最终锚点。  
> **Stop point**：本计划落盘后暂停，等待人工确认再进入 W4-A 代码实施。

**Goal：** 通过 Gate-4（全桶 Top1 平均提升 `>=8pp`、FUR 提升 `>=10pp`、p95 增幅 `<=15%`），同时不回退 Wave2 Gate-2（精确 ID 桶）与 Wave3 Gate-3 的既有收益。

**Architecture：** 先补齐“三路并行候选 + 统一归一”的 shadow 骨架（不改最终 Top1），再引入“约束重排（预算/权重/兜底）+ source-aware citation”，最后用 Gate-4 runner 产出 bounded+stability+latency 的可复算证据并出 master closure。

**Tech Stack：** TypeScript（ESM）、Vitest（`vitest.extensions.config.ts`）、Node 22+、pnpm（必要时 node `--import tsx` 运行 runner）。

---

## 0) 全局执行纪律（必须先读）

### 0.1 单变量纪律（不可归因红线）

- 每个 Iter 只允许改一个“变量域”，例如：
  - 只改并行召回（不改重排，不改输出）
  - 只改候选归一化/去重/tie-break
  - 只改 bucket budget/weight 策略
  - 只改 citation 映射
- 每次改动后立刻固定产出 3 件套证据：
  1. bounded 5
  2. stability 10（unique values=1）
  3. W2 Gate-2 minimal regression（exit=0）

### 0.2 证据落盘与目录口径

- Wave4 全量证据根目录（冻结）：  
  `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day*/`
- 每个 Iter 的证据目录必须包含：
  - `inputs/`（dataset 快照 + runner 入参快照）
  - `retrieval/`（raw payload + normalized topK；baseline/variant；bounded/stability）
  - `latency/`（p95 相关，至少 `latency.samples.jsonl` + `latency.summary.json`）
  - `tests/`（vitest.log + vitest.exit）
  - `gate2-regression/`（W2 最小回归）
  - `report/`（baseline/variant/delta + review）
  - `acceptance.md`（changed_files + acceptance_check + unresolved）

### 0.3 最小回归命令（冻结；每次 Iter 必跑）

桥接层单测（全量）：

```bash
pnpm -s vitest run --config vitest.extensions.config.ts \
  extensions/memory-mem0-graphiti-bridge/src/__tests__ \
  > <evidence_dir>/tests/vitest.log 2>&1; echo $? > <evidence_dir>/tests/vitest.exit
```

W2 Gate-2 最小回归（精确 ID 保护线）：

```bash
pnpm -s vitest run --config vitest.extensions.config.ts \
  extensions/memory-mem0-graphiti-bridge/src/__tests__/memory-search-tool.test.ts \
  -t "keeps W2 exact-id bucket protected when recipe routing is enabled" \
  > <evidence_dir>/gate2-regression/w2-gate2-minimal-verify.log 2>&1; \
  echo $? > <evidence_dir>/gate2-regression/w2-gate2-minimal-verify.exit
```

通过标准：两个 exit 文件均为 `0`。

---

## 1) 入口前置核验（Preflight）

### Task 1: 复核进入条件（文档核验；不改代码）

**Files：**

- Read: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day10/w3-master-closure.md`
- Read: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day10/w3-gate3-report.json`
- Read: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-execution-task-packages.md`

**Step 1: 确认 Gate-3 为 GO**

- 期望：`w3-gate3-report.json` 中 `gate3="GO"`。

**Step 2: 确认 Wave4 已冻结但未开工**

- 期望：`wave4-execution-task-packages.md` 与本计划仅文档，不含代码改动。

**Stop point：** Task 1 完成后仍暂停，等待人工确认再进入 W4-A。

---

## 2) Gate-4 数据集（四桶，>=30/桶）

### Task 2: 构建 `retrieval-gate4-dataset.v1.json`

**Files：**

- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day2/inputs/retrieval-gate4-dataset.v1.json`
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day2/dataset-notes.md`
- (Plan) Create script: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day2/scripts/build-gate4-dataset.ts`
- (Plan) Create script: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day2/scripts/verify-gate4-dataset-ground-truth.ts`

**Dataset schema（冻结建议，JSON array）：**

- `id`: 稳定 sample id（建议含短 hash）
- `bucket`: `exact_id | decision_reason | temporal_relation | project_context`
- `query`: 自然短 query（贴近真实用法）
- `aliases?`: 可选别名数组（覆盖缩写/简称）
- `expected_ids`: 期望 remoteId（允许 1..N；用于 Top1 计算）
- `fur_hint?`: （可选）FUR 人工核验备注（不参与计算，只辅助审计）

**Step 1: 先用“Ground truth 可核验”的原则扩样**

- 来源（冻结口径）：以 `/entity-edge/{uuid}`（或 OpenAPI 标注的 GET-by-id）可语义核验通过的事实作为 ground truth。
- 去重（冻结）：同一 `expected_id` 不重复；同一 `query` 不重复。
- 覆盖（冻结）：四桶各 >=30，并在 `dataset-notes.md` 写清覆盖面与来源。

**Step 2: 跑 ground-truth 核验脚本**

- 通过标准：每条样本均可被 GET-by-id 语义核验通过；不通过样本直接剔除。
- 证据：核验脚本 stdout/stderr、exit code 必须落盘到 day2 目录（不落 `/tmp`）。

**Step 3: 冻结 dataset v1**

- 将最终 dataset 复制到后续每次 runner 的 `inputs/` 下做快照，避免后续演进破坏历史复验。

**Stop point：** dataset v1 冻结后暂停，等待人工确认再进入 W4-A（因为 dataset 是 Gate-4 的计分基础）。

---

## 3) Gate-4 Runner（baseline vs variant + latency）

### Task 3: 产出可复算 runner（先离线可复验，后在线测 p95）

**Files：**

- (Plan) Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day3/scripts/run-w4-gate4-eval.ts`
- (Plan) Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day3/scripts/mock-replay.mjs`
- (Plan) Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day3/acceptance.md`

**Step 1: 先把“命中与稳定性”跑通（离线 replay）**

- 目的：保证每次代码变更的 Top1/稳定性可复验，不依赖线上波动。
- 证据：每次 search 保存 raw payload + normalized topK（按 `source` 分开）。

**Step 2: 再把“p95”跑通（在线 stack 或录制 latency）**

- 目的：Gate-4 有 `p95 增幅 <=15%` 硬门槛，离线 replay 不得替代在线 p95。
- 证据：写 `latency.samples.jsonl`（每 query 一行：total + local/mem0/graphiti ms），并在 `latency.summary.json` 计算 p50/p95。

**Step 3: 固化 report 结构**

- `w4-gate4-baseline-report.json`
- `w4-gate4-variant-report.json`
- `w4-gate4-delta.json`
- `w4-gate4-review.md`（必须显式写明：Top1/FUR/p95 的计算公式与 evidence path）

**Stop point：** runner 可复验后暂停；没有 runner 就进入实现会导致“修了什么/怎么过的”不可审计。

---

## 4) W4-A：并行召回骨架（shadow-only，不改最终输出）

### Task 4: 接入并行召回，但保持输出不变

**Files（预计修改点；以实际代码为准）：**

- Modify: `extensions/memory-mem0-graphiti-bridge/src/config/flags.ts`
- Modify: `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts`
- (Optional) Modify: `extensions/memory-mem0-graphiti-bridge/src/client/mem0-client.ts`
- Test: `extensions/memory-mem0-graphiti-bridge/src/__tests__/memory-search-tool.test.ts`
- Test: `extensions/memory-mem0-graphiti-bridge/src/__tests__/flags.test.ts`

**Step 1: 写 failing test（shadow-only 不改输出）**

- 目标：开启 `read.fusion.shadow_enabled=true` 时：
  - 返回结果的 `results` 与关闭时一致（不改 top1）
  - 但 trace/metrics 中出现 fusion 的 shadow 字段（例如 per-source counts/latency 占位）

**Step 2: 实现最小并行骨架**

- 并行取候选（Promise.all + per-source timeout）。
- 将 raw payload 与 topK 落盘（通过 runner，而不是在 tool 内直接写文件）。

**Step 3: 跑 bounded 5 + stability 10 + Gate-2 regression**

- 通过标准：W2 regression exit=0；Top1 稳定（shadow-only 应与 baseline 完全一致）。

**Step 4: Commit**

- 拆分建议：
  - commit A：代码+tests
  - commit B：本 Iter 证据落盘

**Stop point：** W4-A 验收后暂停。

---

## 5) W4-B：候选归一化/去重/tie-break（确定性）

### Task 5: 把“跨源候选列表”变成 deterministic 输入

**Files（建议）：**

- Create: `extensions/memory-mem0-graphiti-bridge/src/fusion/normalize.ts`
- Test: `extensions/memory-mem0-graphiti-bridge/src/__tests__/fusion-normalize.test.ts`
- Modify (wire): `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts`

**Step 1: 写 failing tests**

- 场景 1：全 0 分 tie ⇒ Top1 固定（不依赖数组原始顺序）。
- 场景 2：重复 `remoteId`（不同分）⇒ 去重保留最高分。
- 场景 3：重复 `remoteId`（同分）⇒ 明确 tie-break（source 优先级 + path + remoteId + index）。

**Step 2: 实现 helper**

- 输出：稳定排序后的 candidates（含 `source`/`remoteId`/`score`/`path`）。
- 要求：对 score 字段来源标注清晰；缺失 score 时记录 tie debug（用于审计）。

**Step 3: 回归 runner + W2 regression**

- 通过标准：Top1/stability 可复现；W2 regression exit=0。

**Stop point：** W4-B 验收后暂停。

---

## 6) W4-C：约束重排 v1（预算/权重/兜底）+ source-aware citation

### Task 6: 启用融合重排（先 shadow，再 primary）

**Files（预计）：**

- Modify: `extensions/memory-mem0-graphiti-bridge/src/config/flags.ts`
- Modify: `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts`
- Modify: `extensions/memory-mem0-graphiti-bridge/src/router/read-router.ts`（如需按 bucket 注入 policy）
- Test: `extensions/memory-mem0-graphiti-bridge/src/__tests__/memory-search-tool.test.ts`

**Step 1: 先实现 shadow compare（不改输出）**

- 输出仍走原 selectedRoute，但额外计算 fusion 的“如果选它会怎样”。
- 产出 shadow report（按 bucket 输出 Top1/FUR/p95 的 delta）。

**Step 2: 再启用 primary（受 flag 控制）**

- `read.fusion.enabled=true` 时才替换最终 Top1。
- 预算与权重必须按 bucket 可配置，默认 conservative。

**Step 3: source-aware citation**

- 目标：检索结果中 `source` 与 citation 一致，不再全部映射为 `memory`。
- 单测：至少验证返回 payload 中 `source` 字段可被下游消费，且与候选来源一致。

**Step 4: 回归 Gate-4 runner（bounded+stability+latency）**

- 通过标准（预检）：Top1_avg_delta_pp 方向正确；fur_delta_pp 方向正确；p95_increase_pct <=15；stability unique-values=1；W2 regression exit=0。

**Stop point：** W4-C 验收后暂停。

---

## 7) W4-D：Gate-4 最终评审（Go/No-Go + master closure）

### Task 7: 形成最终单点事实与 superseded 关系

**Files（冻结产物）：**

- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-gate4-report.json`
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-gate4-report.txt`
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-gate4-review.md`
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-master-closure.md`

**Step 1: bounded 5 + stability 10 + latency**

- 用同一 dataset、同一机器、同一 stack 跑 baseline 与 variant。

**Step 2: 复算 Gate-4**

- 必须在 `w4-gate4-review.md` 里写明公式与 evidence path。
- Gate-4 pass 条件（冻结）：
  - `top1_avg_delta_pp >= 8`
  - `fur_delta_pp >= 10`
  - `p95_increase_pct <= 15`
  - stability unique-values=1
  - tests_pass=true
  - gate2_regression_pass=true

**Step 3: master closure（单点事实）**

- master closure 只做指向与 superseded 标记，不覆盖/删除历史 No-Go。

**Stop point：** Gate-4 出结论后暂停，等待进入 Wave5。

---

## 8) 并行化建议（2+1）

如果要并行推进（推荐 2+1）：

- Agent A（实现主链路）：W4-A/W4-C（flags + memory-search-tool 并行召回骨架 + 融合重排开关）
- Agent B（评测与证据）：Task 2/Task 3（dataset + runner + report 模板 + evidence 落盘）
- 主控（你/我）：负责冲突消解、Cherry-pick、统一跑回归与 Gate-4 最终裁决

原则：

- 尽量让 A/B 触碰的文件集合不交叉（降低冲突面）。
- 每个 Iter 都要有独立 evidence_dir，且 runner 输入快照不可缺。
