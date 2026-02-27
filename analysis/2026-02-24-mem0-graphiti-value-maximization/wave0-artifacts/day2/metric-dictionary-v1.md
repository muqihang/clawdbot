# W0-05 指标口径字典冻结 v1

## 1) 元信息

- ArtifactID: `W0-05-METRIC-DICTIONARY-V1`
- Author: `子代理 #W0-05-Implementer（Wave0 Day2）`
- Created At (UTC): `2026-02-25T05:26:13Z`
- Created At (Local, UTC+08:00): `2026-02-25T13:26:13+08:00`
- Scope: 仅交付 W0-05「指标口径字典冻结」与字段缺口闭环约束；不展开 Wave1~Wave5，不修改业务代码。
- Dependency: 依赖 `W0-02` 基线冻结产物，作为当前字段基线输入（`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-02-baseline-freeze.md:1`）。
- Requirement Source:
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:171`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:174`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:182`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:183`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:189`

## 2) 冻结通用统计约束（统一）

| 约束ID | 冻结口径                                | 执行说明                                                         | 证据                                                                                                                                                                                                 |
| ------ | --------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1     | 统计单位固定为 `query_id`               | 所有指标分子/分母统一按“单次用户可见检索请求”计数。              | `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:193`                                                                                                    |
| C2     | 日窗 + 周窗双窗并行                     | 日窗：自然日（UTC）主采样；周窗：周报主窗口（含 7 日滚动趋势）。 | `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:194`; `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:206` |
| C3     | 报表维度固定为“总体 + 四桶”             | 四桶为：精确ID/决策原因/时序关系/项目上下文。                    | `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:195`                                                                                                    |
| C4     | `low_confidence` 判定固定为样本数 `<30` | 任一桶在任一自然日样本数 `<30`，标记 `low_confidence=1`。        | `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:196`                                                                                                    |

## 3) 核心指标定义与阈值（冻结）

| 指标          | 冻结定义                              | 统计窗                                                   | Gate 阈值                                                |
| ------------- | ------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `Top1`        | `top1 命中金标样本 / 总样本`          | 日窗统计 + 7 日滚动均值；分桶独立计算                    | 精确ID `>=95%`；决策 `>=85%`；时序 `>=82%`；项目 `>=88%` |
| `FUR`         | `首条片段可支撑正确回答样本 / 总样本` | 日窗统计；总体与分桶并行                                 | 总体 `>=85%`；精确ID桶 `>=90%`                           |
| `CFP`         | `误判冲突数 / 金标非冲突样本数`       | 日窗统计 + 周趋势                                        | `<=5%`                                                   |
| `p95_total`   | 用户可见总链路延迟 `p95`              | 日窗统计；必须同时拆出 `p95_local/p95_mem0/p95_graphiti` | `p95_total <= 4.0s` 且检索子链路 `<=1.8s`                |
| `cost_per_1k` | `总成本 / query_count * 1000`         | 周窗为主，日窗预警                                       | 融合阶段 `<= 基线 +25%`                                  |

指标冻结依据：

- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:202`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:203`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:204`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:205`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:206`

## 4) 分账字段清单（冻结）

写链路报表与 Gate 输入统一使用以下 6 个分账字段（字段名冻结，不得改名）：

| 分账桶   | 冻结字段名                    | 字段语义                               |
| -------- | ----------------------------- | -------------------------------------- |
| proposal | `proposal_count`              | 进入 proposal 生命周期的事件数         |
| canary   | `canary_commit_count`         | 命中 canary 提交路径并完成提交的事件数 |
| manual   | `manual_propose_commit_count` | 人工触发 propose->commit 的事件数      |
| pending  | `pending_review_count`        | 当前处于 `pending_review` 的事件数     |
| failed   | `failed_count`                | 写链路失败事件数                       |
| dead     | `dead_count`                  | 进入 dead-letter 的事件数              |

字段冻结依据：

- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:208`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:212`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:213`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:214`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:215`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:216`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:217`

## 5) Gate 使用口径（含 `low_confidence` 放行/拒绝规则）

### 5.1 Gate 判定输入（必须）

1. 连续 `N` 日窗口（默认 `N=7`，若调整必须在 Gate 记录里显式声明）。
2. 五个核心指标完整可计算（`Top1/FUR/CFP/p95_total/cost_per_1k`）。
3. 六个分账字段完整可计算（`proposal/canary/manual/pending/failed/dead`）。
4. 四桶 + 总体维度均可计算。

### 5.2 放行/拒绝规则（冻结）

| 规则ID | 判定条件                                                           | 结果       |
| ------ | ------------------------------------------------------------------ | ---------- |
| G1     | 任一必须字段缺失（核心指标或 6 分账字段）                          | **Reject** |
| G2     | 任一桶在任一日 `sample_count < 30`，即 `low_confidence=1`          | **Reject** |
| G3     | 全部必须字段齐全，且 `low_confidence=0`，且连续 `N` 日全部阈值达标 | **Allow**  |
| G4     | 字段齐全但出现任一阈值不达标                                       | **Reject** |

红线：未分账报表不得用于 Gate 放行。

规则依据：

- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:196`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:219`

## 6) 周报 / Gate / 评测脚本 三方口径对齐矩阵

| 项目          | 周报口径（字段来源）                                                                                                   | Gate 判定方式                             | 评测脚本口径（字段来源）                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Top1`        | 周报字段 `top1_by_bucket`（按四桶）                                                                                    | 按四桶阈值判定（见第 3 节）               | 当前可用代理为 `hit_at_1`，来源 `extensions/memory-mem0-graphiti-bridge/src/p3/retrieval-eval.ts:15` / `extensions/memory-mem0-graphiti-bridge/src/p3/retrieval-eval.ts:160`                                                                                                                                                                                                                               |
| `FUR`         | 周报字段 `fur_by_bucket`                                                                                               | 总体 + 精确ID桶双阈值判定                 | 当前评测脚本无同名稳定输出，按缺口管理（见 `wave0-artifacts/day2/reporting-field-gap-closure.md`）                                                                                                                                                                                                                                                                                                         |
| `CFP`         | 周报字段 `cfp_daily` + `cfp_weekly`                                                                                    | `CFP <= 5%` 且连续 `N` 日有效             | 当前可用代理为 `conflictFalsePositiveRate`，来源 `extensions/memory-mem0-graphiti-bridge/src/p3/ab-eval.ts:556` / `extensions/memory-mem0-graphiti-bridge/src/p3/ab-eval.ts:572`                                                                                                                                                                                                                           |
| `p95_total`   | 周报字段 `p95_total/p95_local/p95_mem0/p95_graphiti`                                                                   | `p95_total <= 4.0s` 且检索子链路 `<=1.8s` | 当前仅有写链路 `p95WriteLatencyMs` 代理，来源 `extensions/memory-mem0-graphiti-bridge/src/p3/ab-eval.ts:562` / `extensions/memory-mem0-graphiti-bridge/src/p3/ab-eval.ts:575`                                                                                                                                                                                                                              |
| `cost_per_1k` | 周报字段 `cost_per_1k_weekly`                                                                                          | 周窗 `<= 基线 +25%`                       | 当前可用代理为 `estimatedCostPer1kChunksUsd`，来源 `extensions/memory-mem0-graphiti-bridge/src/p3/ab-eval.ts:563` / `extensions/memory-mem0-graphiti-bridge/src/p3/ab-eval.ts:576`                                                                                                                                                                                                                         |
| 六分账字段    | 周报字段 `proposal_count/canary_commit_count/manual_propose_commit_count/pending_review_count/failed_count/dead_count` | 任一字段缺失即 Reject                     | 当前 `report` 仅稳定输出 `outbox.pending/inflight/succeeded/failed/dead`，来源 `extensions/memory-mem0-graphiti-bridge/src/p3/reporting.ts:20` / `extensions/memory-mem0-graphiti-bridge/src/p3/reporting.ts:24` / `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/report.json:13` / `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/report.json:17` |

## 7) 回滚条款（冻结）

若后续审计判定本字典失效或口径冲突，按以下步骤回滚：

1. 立即回退到上一版统一口径来源（`openclaw-mem0-graphiti-upgrade-v1.1.md` 第 4 章）。
2. 生成差异比对：至少包含指标定义、阈值、字段名、Gate 判定规则四项。
3. 差异比对必须归档到 `wave0-artifacts/day2/`，并附执行时间与负责人。
4. 差异比对未完成前，不得使用新字典做 Gate 放行。

建议差异检查命令：

```bash
diff -u \
  <(sed -n '189,220p' analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md) \
  analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md
```

回滚依据：

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:185`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:181`

## 8) 验收矩阵（M1-M6）

| 验收ID | Owner            | 步骤                                                                     | Pass/Fail 判定                                                                | 当前状态 | 证据路径                                                                                                                                                                                             |
| ------ | ---------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1     | Quality          | 检查元信息是否包含作者、UTC+08:00 时间戳、scope、W0-02 依赖              | Pass：四项齐全；Fail：任一缺失                                                | pass     | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:174`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-02-baseline-freeze.md:1`  |
| M2     | Quality          | 检查通用统计约束四项（`query_id`、日窗/周窗、四桶、`low_confidence<30`） | Pass：四项均固定且可执行；Fail：任一口径模糊                                  | pass     | `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:193`; `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:196` |
| M3     | Jarvis           | 检查 5 个核心指标定义与阈值是否完整冻结                                  | Pass：`Top1/FUR/CFP/p95_total/cost_per_1k` 全部具备定义+阈值；Fail：缺任一项  | pass     | `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:202`; `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:206` |
| M4     | Quality + Eng-P3 | 检查六分账字段是否完整冻结                                               | Pass：`proposal/canary/manual/pending/failed/dead` 六桶齐全；Fail：缺项或改名 | pass     | `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:212`; `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:217` |
| M5     | Gate Reviewer    | 检查 Gate 放行/拒绝规则是否包含 `low_confidence` 红线                    | Pass：存在 Allow/Reject 双向规则且可执行；Fail：规则缺失或不可判定            | pass     | `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:196`; `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:219` |
| M6     | Quality + Jarvis | 核对“三方口径对齐矩阵 + 回滚条款”是否同时存在                            | Pass：矩阵可对齐、回滚要求含差异比对；Fail：任一缺失                          | pass     | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:184`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:185`             |

## 9) 签字区块（Gate D0 条件 4）

### 9.1 Quality 签字

- 姓名: `Muqihang`
- 角色: `Quality`
- 签字文本: `我确认指标口径字典 v1 已冻结，口径定义与 Gate D0 条件 4 要求一致，同意作为放行审计依据。`
- 签署时间（UTC）: `2026-02-26T05:40:22Z`
- 签署时间（UTC+08:00）: `2026-02-26T13:40:22+08:00`

### 9.2 Jarvis 签字

- 姓名: `Jarvis`
- 角色: `Jarvis`
- 签字文本: `I sign off the metric dictionary v1 freeze and confirm the evidence is auditable for Gate D0 condition 4.`
- 签署时间（UTC）: `2026-02-26T05:41:10Z`
- 签署时间（UTC+08:00）: `2026-02-26T13:41:10+08:00`
