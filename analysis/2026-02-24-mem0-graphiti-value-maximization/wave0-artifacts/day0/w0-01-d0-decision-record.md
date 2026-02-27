# W0-01 D0 决策记录（Day0）

- 日期：2026-02-24（Day0）
- 范围：仅覆盖 Wave0 Day0 的 D0 决策，不展开 Wave1~Wave5 实现
- 会议结论类型：唯一结论（A/B 二选一）

## 0) 当前闭环状态（审计快照）

- 审计快照时间：`2026-02-25T10:59:21+08:00`（`Asia/Shanghai`）。
- 当前时间已超过 `2026-02-25T00:00:00+08:00` 的签署超时阈值，超时规则已触发。
- W0-01 当前状态：`closed_by_no_go`（非 `pending`）。
- 当前闭环结论：`A1=Fail`、`A6=Fail（Closed）`，并以 No-Go 回滚证据完成审计闭环。

## 1) 决策结论：D0-A 或 D0-B（必须给唯一结论）

**唯一结论：D0-A（私有增强层）**

- 自 2026-02-24 起采用 D0-A：维持 `memory-mem0-graphiti-bridge` 作为私有增强层，与上游 `memory-core` 并行共存。
- D0-B（适配为 `memory-core` 兼容扩展层）不作为 Day0 执行策略，仅保留为后续评估备选。
- 结论有效期：先锁定 2 周（至 2026-03-10），期间按 <=14 天同步节奏执行并复核。

### 证据来源

- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md`（1.1 同步后基线校正）：明确 D0-A 为“短期最稳”。
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md`（3.3 Day0-Day3 任务分解）：W0-01 回滚方案写明“默认回退 D0-A（私有增强层）”。
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md`（W0-01）：默认推荐先按 D0-A 评估，且 24 小时无法定案时默认执行 D0-A 并锁定 2 周。

## 2) 默认推荐：若会中无结论，默认 D0-A（私有增强层）

- 本次会议默认推荐策略为 **D0-A（私有增强层）**。
- 若会中未形成有效且可执行的唯一结论，则自动落入 D0-A，不等待额外拍板。

### 证据来源

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md`（W0-01 步骤 1）：默认推荐先按 D0-A 评估。
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md`（W0-01 回滚）：24 小时内无法定案即默认执行 D0-A。
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md`（1.1 D0）：D0-A 定义为短期稳定路径。

## 3) 默认落 D0-A 触发条件（满足任一条）

触发规则：以下任一条件成立，立即默认落 D0-A，并锁定 2 周（至 2026-03-10）。

- 60 分钟内无法达成一致（计时规则见本节下方）
- D0-B 无单一 owner 或无法承诺 <=14 天同步
- D0-B 缺少风险/回滚证据，无法过 D0 Gate

60 分钟计时规则（用于“未达成一致”判定）：

- 计时起点（`T0`）：主持人在 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-01-consensus-timer-log.md` 写入 `start_at=2026-02-24 HH:mm:ss` 的时刻。
- 记录人：Quality 值班记录人（姓名占位：`<QUALITY_RECORDER_NAME>`）。
- 超时时刻（`T_deadline`）：`start_at + 60 分钟`，并在同一记录文件中落盘为 `deadline_at=2026-02-24 HH:mm:ss`。
- 判定规则：到达 `T_deadline` 时若本文件第 1 节仍未形成“唯一结论（D0-A 或 D0-B 且仅一项）”，立即触发默认落 D0-A。

触发后动作：

- 立即记录为 D0-A 生效状态，冻结 D0-B 当期推进。
- 仅允许继续执行 Wave0 范围内任务与 Gate 缺项补齐。

### 证据来源

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md`（W0-01 步骤 3）：逐条定义上述三项触发条件。
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md`（6.1 Gate D0）：未满足 Gate 条件即 No-Go。

## 4) Owner 与职责边界（单点责任人）

**单点责任人（DRI）：Jarvis**

- 负责 D0 策略执行闭环：策略状态、证据归档、节奏跟踪、Gate 汇报。
- 负责跨任务依赖编排：确保 W0-01 与 W0-02/W0-05/W0-07 产物可对齐 D0 Gate。
- 负责风险升级：出现 No-Go 触发时在 2 小时内发起恢复流程。

协作边界（非单点 owner）：

- Founder：仅负责策略审批与风险阈值拍板，不替代 DRI 的日常推进责任。
- Quality：负责口径/报表证据生产，不承担 D0 策略 owner 职责。
- Ops/Eng：负责 smoke 与兼容回归执行，不承担 D0 策略 owner 职责。

### 证据来源

- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md`（5 责任分工）：Jarvis 为主线程编排与门禁裁决角色。
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md`（3.3 W0-01）：Owner 为 Founder + Jarvis，且需明确“负责人”。
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md`（W0-01 步骤 4）：要求明确 owner（单点责任人）。

## 5) 上游同步策略（<=14 天，给节奏与检查项）

同步节奏（硬约束）：

- 主节奏：**每 14 天至少 1 次**上游同步（rebase/merge），不得超期。
- 固定检查点：每周二进行一次同步准备检查（差异盘点 + 风险预读）。
- Day0 锁定后首个硬截止同步日：**2026-03-10**。

Wave0 证据路径策略（执行日志与验收文档分层）：

- 执行日志统一归档到 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/`。
- 验收文档与决策记录保留在 `wave0-artifacts/day*/` 与 `wave0-artifacts/gates/`。
- 唯一检索入口固定为 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/evidence-index.md` 的 `Active Evidence` 段，以 `ArtifactID -> 唯一文件路径` 建立映射。
- 任何证据文件未登记到该索引清单时，一律按“证据缺失”处理。

每次同步必做检查项（与 D0 Gate 对齐）：

1. 产出本次同步差异摘要（变更面 + 风险点 + 回滚点）。
2. 执行最小 smoke 套件 S1-S5（目标 <=60 分钟）。
3. 记录 `index-check` / `report` / `rollback-hints` 结果。
4. 校验 Graphiti 结构健康（`nodes_nonzero=true` 或命中本节“等价证据白名单”）。
5. 归档执行日志到 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/`。
6. 结果判定：通过则维持 D0-A；失败则触发 No-Go 与恢复流程。

### S1-S5 执行入口与判定规则（命令级）

统一命令兜底规则：

- `pnpm openclaw ...` 不可用时，改用 `node openclaw.mjs ...`。
- `pnpm vitest ...` 不可用时，改用 `node node_modules/vitest/vitest.mjs ...`。
- `pnpm tsgo` 不可用时，改用 `node node_modules/@typescript/native-preview/bin/tsgo.js`。

#### S1. 依赖与类型检查

执行入口（pnpm）：

```bash
pnpm install
pnpm tsgo
```

兜底入口（node）：

```bash
pnpm install
node node_modules/@typescript/native-preview/bin/tsgo.js
```

- 通过阈值：`install` 与类型检查均退出码为 `0`。
- 失败阈值：任一命令退出码非 `0`，或类型检查出现错误。
- 可跳过条件：无（不可跳过）。

#### S2. 桥接核心单测（最小集合）

执行入口（pnpm）：

```bash
pnpm vitest run --config vitest.unit.config.ts \
  extensions/memory-mem0-graphiti-bridge/src/__tests__/read-router.test.ts \
  extensions/memory-mem0-graphiti-bridge/src/__tests__/clients.test.ts \
  extensions/memory-mem0-graphiti-bridge/src/__tests__/memory-search-tool.test.ts \
  extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-outbox-worker.test.ts \
  extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-reporting.test.ts \
  extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-retrieval-eval.test.ts
```

兜底入口（node）：

```bash
node node_modules/vitest/vitest.mjs run --config vitest.unit.config.ts \
  extensions/memory-mem0-graphiti-bridge/src/__tests__/read-router.test.ts \
  extensions/memory-mem0-graphiti-bridge/src/__tests__/clients.test.ts \
  extensions/memory-mem0-graphiti-bridge/src/__tests__/memory-search-tool.test.ts \
  extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-outbox-worker.test.ts \
  extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-reporting.test.ts \
  extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-retrieval-eval.test.ts
```

- 通过阈值：上述 6 个测试文件全部通过，失败用例数为 `0`。
- 失败阈值：任一用例失败、命令退出码非 `0`。
- 可跳过条件：无（不可跳过）。

#### S3. P3 CLI 合约 smoke（读多写少）

执行入口（pnpm）：

```bash
pnpm openclaw memory-bridge-p3 index-check --json
pnpm openclaw memory-bridge-p3 report --run-date "2026-02-24" --report-json /tmp/memory-bridge-p3-report.json --report-text /tmp/memory-bridge-p3-report.txt
pnpm openclaw memory-bridge-p3 rollback-hints
```

兜底入口（node）：

```bash
node openclaw.mjs memory-bridge-p3 index-check --json
node openclaw.mjs memory-bridge-p3 report --run-date "2026-02-24" --report-json /tmp/memory-bridge-p3-report.json --report-text /tmp/memory-bridge-p3-report.txt
node openclaw.mjs memory-bridge-p3 rollback-hints
```

- 通过阈值：`index-check` 返回结构化结果；`report` 成功生成 JSON/TXT；`rollback-hints` 输出回滚提示。
- 失败阈值：任一命令退出码非 `0`，或 `report` 任一输出文件缺失/空文件。
- 可跳过条件：无（不可跳过）。

#### S4. 自托管栈健康检查

执行入口（pnpm）：

```bash
pnpm openclaw memory-bridge-p3 index-check --json > analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/s4-index-check-2026-02-24.json
bash scripts/memory-stack/status.sh
bash scripts/memory-stack/smoke.sh
curl -fsS -X POST "http://127.0.0.1:8000/search" -H 'content-type: application/json' -d '{"query":"Jarvis OS"}' | jq '{facts:(.facts|length),episodes:(.episodes|length),nodes:(.nodes|length)}' > analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/s4-search-nodes-2026-02-24.json
```

兜底入口（node）：

```bash
node openclaw.mjs memory-bridge-p3 index-check --json > analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/s4-index-check-2026-02-24.json
bash scripts/memory-stack/status.sh
bash scripts/memory-stack/smoke.sh
curl -fsS -X POST "http://127.0.0.1:8000/search" -H 'content-type: application/json' -d '{"query":"Jarvis OS"}' | jq '{facts:(.facts|length),episodes:(.episodes|length),nodes:(.nodes|length)}' > analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/s4-search-nodes-2026-02-24.json
```

- 通过阈值：`status.sh` 与 `smoke.sh` 均退出码为 `0`，且图结构证据满足 `nodes_nonzero=true` 或命中白名单。
- 失败阈值：任一命令退出码非 `0`，或图结构证据不满足白名单。
- 可跳过条件：无（不可跳过）。

等价证据白名单（仅允许以下 3 种）：

1. `scripts/memory-stack/smoke.sh` 输出明确包含 `nodes_nonzero=true`。
2. `curl -fsS -X POST "http://127.0.0.1:8000/search" -H 'content-type: application/json' -d '{"query":"Jarvis OS"}' | jq '{facts:(.facts|length),episodes:(.episodes|length),nodes:(.nodes|length)}'` 输出中 `nodes>=1`。
3. `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/s4-search-nodes-2026-02-24.json` 中存在 `"nodes": N` 且 `N>=1`。

除以上 3 种外，其他“等价证据”一律不计入通过判定。

#### S5. 检索评测冒烟（有数据集时执行）

执行入口（pnpm）：

```bash
if [ -f ~/.openclaw/memory-bridge-p3-retrieval-dataset.json ]; then
  pnpm openclaw memory-bridge-p3 retrieval-eval --route mem0 --dataset ~/.openclaw/memory-bridge-p3-retrieval-dataset.json --out /tmp/memory-bridge-p3-retrieval-mem0-2026-02-24.json
  pnpm openclaw memory-bridge-p3 retrieval-eval --route graphiti --dataset ~/.openclaw/memory-bridge-p3-retrieval-dataset.json --out /tmp/memory-bridge-p3-retrieval-graphiti-2026-02-24.json
fi
```

兜底入口（node）：

```bash
if [ -f ~/.openclaw/memory-bridge-p3-retrieval-dataset.json ]; then
  node openclaw.mjs memory-bridge-p3 retrieval-eval --route mem0 --dataset ~/.openclaw/memory-bridge-p3-retrieval-dataset.json --out /tmp/memory-bridge-p3-retrieval-mem0-2026-02-24.json
  node openclaw.mjs memory-bridge-p3 retrieval-eval --route graphiti --dataset ~/.openclaw/memory-bridge-p3-retrieval-dataset.json --out /tmp/memory-bridge-p3-retrieval-graphiti-2026-02-24.json
fi
```

- 通过阈值：命令成功结束，且 `expected_ids` 非空样本占比 >= `80%`，`expected_structures` 填写率 >= `80%`，关键指标相对基线降幅不超过 `3pp`。
- 失败阈值：数据集存在且任一阈值不满足，或命令退出码非 `0`。
- 可跳过条件：`~/.openclaw/memory-bridge-p3-retrieval-dataset.json` 不存在时允许跳过；必须在证据中记录 `skip_reason=dataset_missing`。

S5 量化口径（固定，不可替换）：

- 关键指标集合固定为：`hit_at_1`、`hit_at_3`、`structure_coverage`、`alias_recall`。
- 基线来源文件固定为：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-02-baseline-freeze.md`（`S5 Baseline Metrics` 段）。
- 比较公式固定为：`delta_pp = (current - baseline) * 100`。
- 通过规则固定为：上述 4 个关键指标逐项满足 `delta_pp >= -3`；任一指标低于 `-3` 即 S5 Fail。

### 证据来源

- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md`（1.1 D0 Gate）：要求 rebase 周期 <= 2 周。
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md`（5 同步后兼容回归）：S1-S5 最小 smoke 与 <=60 分钟目标。
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md`（Gate D0 条件 2/3）：明确 <=14 天与 smoke 至少 1 轮。

## 6) No-Go 触发条件 + 恢复条件

No-Go 触发条件（任一条即 No-Go）：

1. D0 结论、owner、同步节奏三者任一未明确。
2. 无法提供可执行的最小 smoke 通过证据。
3. D0-B 被提出但不满足单一 owner、<=14 天同步承诺、风险/回滚证据任一项。
4. 指标口径字典未冻结，导致 Gate 判定口径不一致。

No-Go 后默认动作：

- 立即固定为 D0-A（私有增强层）。
- 冻结推进到 Wave1；仅允许补齐 Wave0 缺口。

恢复条件（全部满足方可解除 No-Go）：

1. D0-A 生效记录、单点 owner、同步节奏三项齐备。
2. 最小 smoke 至少 1 轮通过并归档。
3. 指标口径字典 v1 冻结并签字。
4. 形成可执行回滚路径（配置层 + 运行手册层）。

### No-Go 回滚 Runbook（可执行）

- 执行人：主责 owner 为 Jarvis；协作人为 Ops 值班（姓名占位：`<OPS_ONCALL_NAME>`）。
- 执行时点：No-Go 触发后 `15` 分钟内启动，`30` 分钟内完成配置回滚与证据落盘。
- 冻结范围：冻结 Wave1~Wave5 的新开发、合入与扩流，仅允许 Wave0 缺口修复与证据补齐。
- 解除前置条件：仅当本节“恢复条件”4 项全部满足且 A6 判定为 Pass，方可解除冻结。
- 回滚完成后证据文件（唯一定位）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/w0-01-no-go-rollback-2026-02-24.md`。

执行步骤（按顺序）：

1. 记录触发与执行信息（执行人、触发时间、触发条款）到上述唯一证据文件。
2. 执行配置回滚（以下 4 个键必须全部执行；每项含 pnpm/node 兜底）：

   同一配置项仅执行一条命令：优先执行 `pnpm` 行，若 `pnpm` 不可用再执行对应 `node` 行。

```bash
pnpm openclaw config set plugins.entries.memory-mem0-graphiti-bridge.config.read_mode local
node openclaw.mjs config set plugins.entries.memory-mem0-graphiti-bridge.config.read_mode local

pnpm openclaw config set plugins.entries.memory-mem0-graphiti-bridge.config.write_mode propose_only
node openclaw.mjs config set plugins.entries.memory-mem0-graphiti-bridge.config.write_mode propose_only

pnpm openclaw config set plugins.entries.memory-mem0-graphiti-bridge.config.p3.admission_enabled false
node openclaw.mjs config set plugins.entries.memory-mem0-graphiti-bridge.config.p3.admission_enabled false

pnpm openclaw config set plugins.entries.memory-mem0-graphiti-bridge.config.p3.commit_canary_ratio 0
node openclaw.mjs config set plugins.entries.memory-mem0-graphiti-bridge.config.p3.commit_canary_ratio 0
```

3. 回读并核验配置值（4 项必须全部命中；同一配置项仅执行一条命令：优先 `pnpm`，不可用时执行对应 `node`）：

```bash
pnpm openclaw config get plugins.entries.memory-mem0-graphiti-bridge.config.read_mode
node openclaw.mjs config get plugins.entries.memory-mem0-graphiti-bridge.config.read_mode

pnpm openclaw config get plugins.entries.memory-mem0-graphiti-bridge.config.write_mode
node openclaw.mjs config get plugins.entries.memory-mem0-graphiti-bridge.config.write_mode

pnpm openclaw config get plugins.entries.memory-mem0-graphiti-bridge.config.p3.admission_enabled
node openclaw.mjs config get plugins.entries.memory-mem0-graphiti-bridge.config.p3.admission_enabled

pnpm openclaw config get plugins.entries.memory-mem0-graphiti-bridge.config.p3.commit_canary_ratio
node openclaw.mjs config get plugins.entries.memory-mem0-graphiti-bridge.config.p3.commit_canary_ratio
```

命中判据与期望值（全部满足才算通过）：

- `plugins.entries.memory-mem0-graphiti-bridge.config.read_mode=local`
- `plugins.entries.memory-mem0-graphiti-bridge.config.write_mode=propose_only`
- `plugins.entries.memory-mem0-graphiti-bridge.config.p3.admission_enabled=false`
- `plugins.entries.memory-mem0-graphiti-bridge.config.p3.commit_canary_ratio=0`

4. 执行 `S3` 与 `S4` 快速复测并将命令输出追加写入同一证据文件。
5. 发布冻结通知并登记“解除前置条件”缺口清单。

回滚完成判据（全部满足）：

- 4 项配置值分别为 `local / propose_only / false / 0`。
- `S3`、`S4` 复测通过。
- 冻结范围已生效并记录。
- 唯一证据文件存在且包含执行人、时间戳、命令输出。

### 证据来源

- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md`（6.1/6.2）：Gate 条件不满足即 No-Go。
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md`（1.1/1.2）：D0 与 W0->W1 失败回滚均要求冻结推进、补齐缺口。
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md`（5 交付即验收清单）：要求可执行回滚路径。

## 7) 会议行动项（含截止日期，按 2026-02-24 当日为 Day0）

| 行动项                                        | 主责 owner | 协作人          | 截止日期   | 输出物                                                     | 失败处置                                                                                                                                                               |
| --------------------------------------------- | ---------- | --------------- | ---------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1. 发布并签署本 D0 决策记录（唯一结论 D0-A） | Jarvis     | Founder         | 2026-02-24 | `wave0-artifacts/day0/w0-01-d0-decision-record.md`         | 缺签或超时则立即按默认条款锁定 D0-A 2 周，并触发 No-Go Runbook                                                                                                         |
| A2. 固化 D0 同步策略与检查单（<=14 天）       | Jarvis     | Ops             | 2026-02-25 | `wave0-artifacts/gates/d0-sync-policy.md`                  | 缺失则标记 D0 No-Go，冻结推进                                                                                                                                          |
| A3. 完成基线冻结（配置/指标/路由快照）        | Quality    | Jarvis          | 2026-02-24 | `wave0-artifacts/day0/w0-02-baseline-freeze.md` + 快照文件 | 当日重采并覆盖前，先在 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/immutable/` 保留“原始快照不可变副本（文件名含首采时间戳，禁止覆盖）” |
| A4. 冻结指标口径字典 v1 并标注缺口 owner      | Quality    | Jarvis          | 2026-02-26 | `wave0-artifacts/day2/metric-dictionary-v1.md`             | 回退上一版字典并附差异                                                                                                                                                 |
| A5. 跑通并归档首轮同步后最小 smoke（S1-S5）   | Ops        | Eng             | 2026-02-27 | `wave0-artifacts/day3/sync-smoke-2026-02-27.md`            | 任一套件 Fail 则判定 A5 Fail，并触发 No-Go                                                                                                                             |
| A6. 执行 Gate D0 复核并输出 Pass/Fail         | Founder    | Jarvis、Quality | 2026-02-27 | `wave0-artifacts/gates/w0-gate-review.md`（含 D0 判定）    | A6 Fail 则 No-Go：停留 Wave0，禁止进入 Wave1                                                                                                                           |

### A5 / A6 独立判定规则（本文件内可直接执行）

#### A5 判定

- **Pass**：`S1-S4` 全部 Pass；`S5` 为 Pass 或满足 `dataset_missing` 的合法 Skip；且 `wave0-artifacts/day3/sync-smoke-2026-02-27.md` 包含执行人、时间戳、每个套件的 Pass/Fail/Skip。
- **Fail**：`S1-S4` 任一 Fail；或 `S5` 在数据集存在时 Fail；或输出文件缺失上述必填字段。

#### A6 判定

- **Pass**：`A1-A5` 全部 Pass；`wave0-artifacts/gates/w0-gate-review.md` 明确写出 `Gate D0: Pass`；本文件第 8 节签署区块无缺签；且 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/w0-01-signoff-audit-2026-02-24.md` 记录 `signoff_audit=pass`。
- **Closed-Fail（Closed）**：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/w0-01-signoff-audit-2026-02-24.md` 记录 `signoff_audit=fail`，且 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/w0-01-no-go-rollback-2026-02-24.md` 文件存在并可复核，则结论为 `A6=Fail（Closed）`，审计状态为“可复核、可追踪”。
- **Fail**：任一前置项 Fail；或 Gate 结论非唯一；或存在缺签/超时。

## 8) 签署协议（签字可复核）

### 8.1 签署人列表（角色 + 姓名占位）

| 角色                | 签署人（姓名占位） | 是否必签 |
| ------------------- | ------------------ | -------- |
| Founder（审批）     | `<FOUNDER_NAME>`   | 是       |
| Jarvis（DRI）       | `<JARVIS_NAME>`    | 是       |
| Quality（证据复核） | `<QUALITY_NAME>`   | 是       |

### 8.2 签署介质、落盘位置、缺签与超时规则

- 签署介质：仅允许在本文件 `8.3 本文件签署区块` 填写签字记录。
- 落盘位置：固定为 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-01-d0-decision-record.md`（本文件），不接受外链文档替代。
- 占位符值一律视为未签：`<SIGN_HERE>`、`<FOUNDER_NAME>`、`<JARVIS_NAME>`、`<QUALITY_NAME>`、`<REVIEWER_NAME>`、`2026-02-24 HH:mm:ss`、`2026-02-24 HH:mm:ss +08:00`。
- 有效签署格式（全部满足才视为有效）：
  - `姓名`：必须为真实姓名文本，且不允许为任何 `<...>` 模板占位值。
  - `签字（文本）`：必须为非空真实签字文本，且不允许为 `<SIGN_HERE>`。
  - `复核人`：必须为非空真实姓名文本，且不允许为 `<REVIEWER_NAME>` 或任何 `<...>` 模板占位值。
  - `签署时间`、`复核时间`：必须使用 `YYYY-MM-DD HH:mm:ss +08:00` 格式，并以 `Asia/Shanghai (UTC+08:00)` 计时。
- 检查责任人：Quality 审计值班（姓名占位：`<QUALITY_AUDITOR_NAME>`）；协作复核：Jarvis（姓名占位：`<JARVIS_REVIEWER_NAME>`）。
- 检查结果落盘路径：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/w0-01-signoff-audit-2026-02-24.md`。
- 缺签判定时刻：`2026-02-24T23:30:00+08:00`（`Asia/Shanghai`）。到时检查 8.3 区块，任一“必签”角色不满足上述有效签署格式即判定缺签。
- 超时规则：到 `2026-02-25T00:00:00+08:00`（`Asia/Shanghai`）仍存在缺签，自动判定 `A1=Fail` 与 `A6=Fail`，并立即执行本文件第 6 节 No-Go 回滚 Runbook。
- 闭环状态规则：当超时规则触发且 `signoff_audit=fail` 与 No-Go 回滚证据均已落盘时，W0-01 状态置为 `closed_by_no_go`。

### 8.3 本文件签署区块（固定章节）

| 角色                | 姓名             | 签字（文本）  | 签署时间（YYYY-MM-DD HH:mm:ss +08:00） | 复核人            | 复核时间（YYYY-MM-DD HH:mm:ss +08:00） |
| ------------------- | ---------------- | ------------- | -------------------------------------- | ----------------- | -------------------------------------- |
| Founder（审批）     | `<FOUNDER_NAME>` | `<SIGN_HERE>` | `2026-02-24 HH:mm:ss +08:00`           | `<REVIEWER_NAME>` | `2026-02-24 HH:mm:ss +08:00`           |
| Jarvis（DRI）       | `<JARVIS_NAME>`  | `<SIGN_HERE>` | `2026-02-24 HH:mm:ss +08:00`           | `<REVIEWER_NAME>` | `2026-02-24 HH:mm:ss +08:00`           |
| Quality（证据复核） | `<QUALITY_NAME>` | `<SIGN_HERE>` | `2026-02-24 HH:mm:ss +08:00`           | `<REVIEWER_NAME>` | `2026-02-24 HH:mm:ss +08:00`           |

### 证据来源

- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md`（3.3 Day0-Day3）：W0-01~W0-08 的任务、依赖、回滚。
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md`（第 2 节 Day0-Day3）：每个任务包的输出、验收、回滚与时间盒。
