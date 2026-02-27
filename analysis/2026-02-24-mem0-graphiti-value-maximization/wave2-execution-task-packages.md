# Wave2 执行任务包（仅计划冻结；未开工实施）

> **状态：Frozen（文档冻结）**  
> 本文件在进入 Wave2 代码实施（W2-A）前，用于冻结范围/口径/证据目录/Stop points。  
> **本文件不包含任何代码变更**，也不授权直接进入 W2-A；必须等待人工确认。

## 1) Wave2 范围与目标（来自 V1 / V1.1 的统一口径）

Wave2（第 11-20 天）目标：**先把高风险错答降下来**，优先解决“精确键类查询（ID/错误码/群号等）”的确定性与可回归性，同时把 Mem0 的 `filters + criteria` 能力以 **shadow** 形态接入，最后补齐 proposal vs canonical 的分账与报表，完成 Gate-2 评审。

- 权威输入（不要改口径，只引用）：
  - Wave2 定义与交付项：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:124`
  - Gate-2 文案：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:134`
  - 指标字典与分账字段冻结：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:196`

## 2) 硬约束（必须遵守）

1. **不改变 Gate 公式/阈值/baseline**（Gate-2 评审必须沿用已冻结的指标/分账口径）。
2. Wave2 所有证据必须落盘到：
   - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day*/`
   - 禁止以 `/tmp` 作为最终证据锚点（允许运行时临时文件，但最终证据必须复制/重放到 `analysis/...`）。
3. 所有 Gate 评审只接受“**可复算的证据文件**”（json + 人读 txt/md），并显式列出 `changed_files` / `acceptance_check` / `unresolved`。

## 3) 证据目录约定（Wave2）

- Day1（入口冻结）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day1/`
- Day2+（实施与回执）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day2/` … `day10/`
- Gate-2（最终评审）：建议统一落盘到 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/`（或新增 gates/ 目录，但目录策略需在 Day1 冻结）。

## 4) 任务包拆分（W2-A ~ W2-D）

### 4.1 W2-A：Precision Guard Lane（精确检索保护）

**目标**：对“精确键类查询（ID/错误码/群号/commit 等）”建立 deterministic 保护层，使 Top1 在精确 ID 桶稳定达标，且误答样本中“精确键未触发 guard”占比显著下降。

- 交付（计划）：
  1. query signature 识别（在 read-router 前置，不破坏 tool 契约）。
  2. 精确候选优先规则（exact match / exact key 命中时提升；证据不足才回落语义候选）。
  3. trace 必须输出：命中 signature、guard 是否触发、top1 来源、fallback 原因。
- 参考实现点（仅作为计划输入，不在本批次实施）：
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/README.md:166`
- 关键验收（计划）：
  - 精确 ID 桶 Top1 指标稳定提升（Gate-2 约束见第 4.4 节）。
  - 10 次抽样重跑 Top1 不随机摆动（稳定性证据落盘）。

### 4.2 W2-B：Mem0 `filters + criteria`（shadow 先行）

**目标**：把 Mem0 的 `filters + criteria` 检索能力以 shadow 方式接入：先产出可比较证据与报表，**不直接改变**线上主链路答复的候选选择，直到证据满足准入条件。

- 交付（计划）：
  1. payload 扩展草案（参数层扩展，不改 tool 契约）。
  2. 灰度/开关策略：默认关闭；shadow 启用条件与采样比例冻结。
  3. shadow 对比报表：按桶输出 Top1/FUR/CFP/p95/cost 对比与差异归因。
- 权威输入（口径冻结）：
  - `filters + criteria` 交付要求：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:170`

### 4.3 W2-C：proposal vs canonical 分账与报表（禁止混合口径）

**目标**：确保任何用于 Gate 的报表都“分账可追溯”，避免 proposal 与 canonical 指标互相污染。

- 交付（计划）：
  1. 报表字段齐全：`proposal_count/canary_commit_count/manual_propose_commit_count/pending_review_count/failed_count/dead_count`
  2. Gate 审核以“分账后指标”为准（禁止混合口径）
  3. proposal 与 canonical 指标可独立追溯（按桶、按日窗、可回归）
- 权威输入（口径冻结）：
  - 分账字段清单（必须）：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:208`
  - 红线：未分账报表不得用于 Gate 放行：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:219`

### 4.4 W2-D：Gate-2 评审（最终结论）

**目标**：基于冻结口径产出 Gate-2 最终结论（Go/No-Go），并落盘可复算证据。

- Gate-2 文案（冻结，不改）：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:134`
  - 精确 ID 桶 Top1 `>= 93%`
  - CFP 下降（按冻结定义统计）
  - fallback 可控（以 outbox/失败分账字段与稳定性证据作为判据）
- Gate-2 产物（计划）：
  - `.../wave2-artifacts/day10/w2-gate2-report.json`
  - `.../wave2-artifacts/day10/w2-gate2-report.txt`
  - `.../wave2-artifacts/day10/w2-gate2-review.md`
  - `.../wave2-artifacts/day10/w2-master-closure.md`（单点事实）

## 5) Stop points（冻结后必须暂停）

- Stop-0（本轮必须执行）：完成 Day1 的 `W2-01 入口冻结` 文档后 **立即暂停**，等待人工确认后才允许进入 W2-A 代码实施。
- Stop-1：W2-A（Precision Guard Lane）完成并验收后暂停。
- Stop-2：W2-B（filters+criteria shadow）完成并验收后暂停。
- Stop-3：W2-C（分账与报表）完成并验收后暂停。
- Stop-4：W2-D（Gate-2 评审）完成并输出 master closure 后暂停。
