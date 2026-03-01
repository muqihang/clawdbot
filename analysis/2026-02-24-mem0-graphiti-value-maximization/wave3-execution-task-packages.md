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
