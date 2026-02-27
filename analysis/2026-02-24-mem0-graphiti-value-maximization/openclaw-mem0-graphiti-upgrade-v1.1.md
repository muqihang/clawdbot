# OpenClaw Mem0 + Graphiti 升级落地方案 V1.1（执行修订版）

> 版本：V1.1（在 V1 基础上的执行修订）  
> 日期：2026-02-24  
> 修订目标：在不改代码前提下，把 V1 升级为“可执行、可量化、可回滚”的实施蓝图。  
> 继承关系：未在本文件明确修改的内容，沿用 V1（`openclaw-mem0-graphiti-upgrade-v1.md`）。

---

## 0. 执行摘要（结论优先）

本次修订采用 **策略 B（平衡型）** 作为主线：

1. 先做“口径纠偏 + 观测地基 + shadow 验证”，再推进检索策略与融合。
2. **策略 A（保守型）** 作为硬兜底：任何稳定性红线触发，立即退回 A。
3. **策略 C（激进型）** 仅作为后置试点：满足门槛后，在小流量独立实验，不直接进主链路。

本版新增 6 个执行关键：

- 策略选择与切换规则（量化触发）
- 三大前提纠偏（事实 -> 影响 -> 动作 -> 验收）
- Wave 0 强化版（Day0-Day3 到任务级）
- 指标口径字典（定义/采样窗/统计/阈值统一）
- 同步后兼容回归（命令级最小 smoke）
- 决策闸门更新（新增 D0 与 Wave0->Wave1 Go/No-Go）

---

## 1. 策略选择与切换规则

## 1.1 主线：策略 B（平衡型）

### 适用条件

- 当前写链路稳定（`outbox_failed=0`、`outbox_dead=0` 为主趋势）。
- 允许在 shadow/小流量下引入新能力，但不接受不可回滚改造。
- 目标是“先拿证据，再扩流”，而不是一次性替换主路径。

### 执行原则

- 先修正口径，再优化能力；先可观测，再可扩流。
- 所有新能力先 shadow，过 Gate 后再 canary。
- 每个 Wave 只引入一个主变量，避免多变量耦合导致归因失败。

## 1.2 兜底：策略 A（保守型）触发条件与动作

### 触发条件（满足任一条即触发）

1. 连续 2 个日窗出现 `outbox_failed > 0` 或 `outbox_dead > 0`。
2. 连续 2 个日窗 `p95_total` 相对基线劣化 > 20%。
3. 连续 2 次离线评测中，精确 ID 桶 `Top1 < 90%`。
4. 故障注入中 fallback 路径不可用（3 次中任意 1 次失败）。

### 触发后动作（24 小时内完成）

- 读链路退回 `local` 或 `shadow` 安全态。
- 写链路固定为 `write_mode=propose_only`，并将 admission/canary commit 关闭。
- 暂停进入下一 Wave，只允许修复稳定性与观测缺口。

### 退出 A 的恢复条件

- 连续 3 个日窗恢复：`failed=0`、`dead=0`、`p95_total` 回到基线 +10% 内。
- 重新通过 Wave0->Wave1 闸门。

## 1.3 后置试点：策略 C（激进型）启动门槛

仅在满足以下条件后，允许开 C 试点（不直接影响主流量）：

1. 连续 14 天满足 B 主线质量门槛（Top1/FUR/CFP/p95/cost 全达标）。
2. 连续 3 次上游同步后，兼容 smoke 全通过。
3. 回滚演练成功率 100%，且回退耗时 <= 1 分钟。
4. 成本预算仍有 >= 10% 余量。

### C 试点边界

- 流量上限：<= 5%。
- 仅允许验证“并行融合重排”与“高阶图策略”，不改主契约。
- 必须具备一键下线能力，且保留全部 trace 证据。

---

## 2. 三大前提纠偏（必须先修正）

## 2.1 纠偏项 #1：`propose_only` 非绝对“零 commit”

### 事实

- 在 `admission_enabled=true` 时，`propose_only` 仍可能按 canary 比例进入 commit 逻辑。

### 影响

- 若不分账，`proposal` 与 `canonical` 指标会互相污染。
- Gate 判断会误把“试点 commit”当“纯观察结果”。

### 计划修正动作

1. 报表强制拆分：`proposal_count`、`canary_commit_count`、`manual_propose_commit_count`。
2. 所有 Wave 周报增加字段：`admission_enabled`、`commit_canary_ratio`、`effective_write_mode`。
3. Gate 审核以“分账后指标”为准，禁止混合口径。

### 验收口径

- 任意一份周报中，proposal 与 canonical 指标可独立追溯。
- 评审会上不再出现“propose_only 是否包含 commit”的口径争议。

## 2.2 纠偏项 #2：`outbox.enabled` 不是写链路主闸门

### 事实

- 写链路是否捕获/执行主要由 `write_mode` 驱动，`outbox.enabled` 不是主控制闸门。

### 影响

- 若仍把 `outbox.enabled` 当主开关，可能出现“误以为已关闭写入”但实际仍写。

### 计划修正动作

1. 运行手册改为“以 `write_mode` 为唯一主闸门，`outbox.*` 仅作存储配置”。
2. 新增配置检查清单：变更前后必须打印 `read_mode/write_mode/admission_enabled/commit_canary_ratio`。
3. Gate 审核时只认 `write_mode` 口径，不接受 `outbox.enabled` 作为放行依据。

### 验收口径

- 运行文档与周报中的写链路状态字段一致且无冲突。
- 演练中可通过 `write_mode` 单点完成写链路启停。

## 2.3 纠偏项 #3：`fallback_route` 已定义但主读路由未实质消费

### 事实

- 现阶段 `fallback_route` 在配置层存在，但主读路由闭环中未形成可验证的回退执行路径。

### 影响

- 在远端异常场景，回退行为可能依赖隐式逻辑，导致稳定性不可证明。

### 计划修正动作

1. 在 Wave 1 前补“fallback 行为规范”：触发条件、优先级、日志字段、用户可见行为。
2. 在 Wave 1 任务中加入“fallback 执行路径落地 + 注入测试”作为必交付。
3. 在 Gate 中新增“fallback 故障注入通过率”硬指标。

### 验收口径

- 故障注入（超时/5xx/空结果）下 fallback 行为可复现、可观测、可解释。
- fallback 触发后回答成功率与延迟均满足阈值。

---

## 3. Wave 0 强化版（Day0-Day3）

## 3.1 Wave 0 目标（从“口号”到“交付件”）

Wave 0 不是准备周，而是“把后续 90 天决策基础一次补齐”：

- 统一口径（指标、分账、配置主闸门）。
- 统一数据面（User/Thread/Message 映射与 envelope 草案）。
- 统一观测面（trace schema + 质量报表 + smoke 套件）。

## 3.2 将 V1 的 4.1 映射项嵌入 Wave 0

| 映射项                     | Wave 0 落地动作                                                           | 交付标准                                        |
| -------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| User-Thread-Message 语义   | 输出 `oc_user_id/oc_thread_id/oc_message_id` 规范与冲突规则               | 覆盖全部内置渠道，给出映射示例与冲突处理        |
| Context assembly 模板      | 产出 3 模板草案（精确ID/时序/决策）与评测 rubric                          | 每模板有输入/输出格式与失败兜底                 |
| Graphiti 结构检索策略      | 输出 recipe 参数层设计稿（不切流）                                        | 明确 edge/node/hybrid 触发条件                  |
| 运行态补丁固化（Graphiti） | 将本轮 Graphiti runtime 修复固化进 `bootstrap/patch` 流程（而非人工热补） | 重建环境后修复自动生效，避免下次 bootstrap 回退 |
| 异步 task/webhook 观测     | 输出事件模型与状态机映射表                                                | 可把 outbox 状态映射到 task 视图                |
| Mem0 两阶段治理语义        | 输出动作字典（ADD/UPDATE/DELETE/NOOP）与分账规则                          | proposal/canonical 口径一致                     |
| filters + criteria         | 输出 payload 扩展草案与灰度开关策略                                       | 明确默认关闭、shadow 开启条件                   |
| adapter-first 扩展原则     | 输出“契约不变、参数扩展”边界文档                                          | 明确禁止破坏工具契约                            |

## 3.3 Day0-Day3 任务分解（可执行版）

| Day  | 任务ID                      | Owner                      | 输入                                           | 输出                                                            | 验收标准                                  | 回滚方案                        |
| ---- | --------------------------- | -------------------------- | ---------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------- | ------------------------------- |
| Day0 | W0-01 D0 决策会             | Founder + Jarvis           | V1/V1.1、当前配置快照                          | D0 决策单（A/B、owner、rebase 周期）                            | 明确 D0-A 或 D0-B、负责人、双周同步节奏   | 默认回退 D0-A（私有增强层）     |
| Day0 | W0-02 基线冻结              | Quality                    | `openclaw.json`、outbox 状态、现网报表         | baseline 包（配置/指标/路由快照）                               | 基线可复跑；包含 admission/canary 字段    | 重新采样并覆盖同日快照          |
| Day1 | W0-03 身份映射规范          | Eng-Routing                | 多渠道 session/user/thread 样本                | `identity-map` 规范草案                                         | 100% 内置渠道可映射，冲突规则明确         | 退回 `sessionKey` 单键方案      |
| Day1 | W0-04 Message Envelope 草案 | Eng-Governance             | 当前 outbox payload、Zep 对照项                | envelope 字段规范（role/name/created_at/metadata/ignore_roles） | 字段最小集冻结，兼容现有 payload          | 新字段全设可选，旧字段直通      |
| Day2 | W0-05 指标口径字典冻结      | Quality + Jarvis           | 现有 Top1/FUR/CFP/p95/cost 定义                | 指标字典 v1（本文件第 4 章）                                    | 周报、Gate、评测脚本口径一致              | 回退到上一版字典并标注差异      |
| Day2 | W0-06 Context 模板草案      | Prompt/Agent Eng           | 四桶样本、检索结果样本                         | 3 模板 + 评分 rubrics                                           | 每模板均有“失败兜底与裁剪规则”            | 关闭 assembler，保持直出        |
| Day2 | W0-06B 运行态补丁固化       | Ops + Eng-Infra            | 当前 Graphiti runtime 修复记录、bootstrap 流程 | 补丁固化清单 + 重建验证记录                                     | 从干净环境重建后修复仍生效，且 smoke 通过 | 回退到上一版 patch 清单并重建   |
| Day3 | W0-07 同步后 smoke 套件     | Ops + Eng                  | 本文件第 5 章命令清单                          | `sync-smoke` 运行记录模板                                       | 全部命令可在 60 分钟内跑通                | 切换手动检查清单                |
| Day3 | W0-08 Wave0 Gate 评审       | Founder + Jarvis + Quality | W0-01~W0-07 + W0-06B 输出                      | Wave0 Go/No-Go 结论                                             | D0 与 Wave0 闸门全部达标                  | No-Go：停留 Wave0，禁止进 Wave1 |

---

## 4. 指标口径字典（统一定义）

## 4.1 通用统计约束

- 统计单位：`query_id`（一次用户可见检索请求）。
- 主统计窗：按自然日（UTC）切窗；Gate 使用“连续 N 日窗”。
- 报表维度：总体 + 四桶（精确ID/决策原因/时序关系/项目上下文）。
- 置信规则：每个桶每日日样本数不足 30 时，标记为 `low_confidence`，不得用于放行 Gate。

## 4.2 核心指标定义

| 指标        | 精确定义                              | 采样窗与统计                               | 通过阈值（90天目标）                          |
| ----------- | ------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| Top1        | `top1 命中金标样本 / 总样本`          | 日窗统计 + 7 日滚动均值；按桶独立算        | 精确ID >=95%，决策>=85%，时序>=82%，项目>=88% |
| FUR         | `首条片段可支撑正确回答样本 / 总样本` | 日窗统计；分桶与总体同时看                 | 总体 >=85%，精确ID桶 >=90%                    |
| CFP         | `误判冲突数 / 金标非冲突样本数`       | 日窗统计 + 周趋势                          | <=5%                                          |
| p95_total   | 用户可见总链路延迟 p95                | 日窗统计；同时报 `p95_local/mem0/graphiti` | `p95_total <= 4.0s`，检索子链路 <=1.8s        |
| cost_per_1k | `总成本 / query_count * 1000`         | 周窗为主，日窗做预警                       | 融合阶段 <= 基线 +25%                         |

## 4.3 分账字段（必须）

写链路相关报表必须拆分以下字段：

- `proposal_count`
- `canary_commit_count`
- `manual_propose_commit_count`
- `pending_review_count`
- `failed_count`
- `dead_count`

未分账的报表不得用于 Gate 放行。

---

## 5. 同步后兼容回归（最小 smoke 套件，命令级）

## 5.1 触发时机

每次上游同步（rebase/merge）后必须执行一次，目标时长 <= 60 分钟。

## 5.2 命令清单

### S1. 依赖与类型检查

```bash
pnpm install
pnpm tsgo
```

通过标准：命令退出码为 0。

### S2. 桥接核心单测（最小集合）

```bash
pnpm vitest run --config vitest.unit.config.ts \
  extensions/memory-mem0-graphiti-bridge/src/__tests__/read-router.test.ts \
  extensions/memory-mem0-graphiti-bridge/src/__tests__/clients.test.ts \
  extensions/memory-mem0-graphiti-bridge/src/__tests__/memory-search-tool.test.ts \
  extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-outbox-worker.test.ts \
  extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-reporting.test.ts \
  extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-retrieval-eval.test.ts
```

通过标准：全部通过，无新增失败用例。

### S3. P3 CLI 合约 smoke（读多写少）

```bash
pnpm openclaw memory-bridge-p3 index-check --json
pnpm openclaw memory-bridge-p3 report --run-date "$(date +%F)" --report-json /tmp/memory-bridge-p3-report.json --report-text /tmp/memory-bridge-p3-report.txt
pnpm openclaw memory-bridge-p3 rollback-hints
```

通过标准：

- `index-check` 可返回结构化结果；
- `report` 成功产出 JSON/TXT；
- `rollback-hints` 可输出回滚开关提示。

### S4. 自托管栈健康检查

```bash
scripts/memory-stack/status.sh
scripts/memory-stack/smoke.sh
```

通过标准：

- smoke 输出包含 `graphiti episodes>=1 facts>=1` 与 `mem0 add_results>=1 search_results>=1`；
- 图结构验收必须满足 `nodes_nonzero=true`（即 `nodes>=1`）。

若 `smoke.sh` 未直接打印 nodes 计数，追加执行：

```bash
curl -fsS -X POST "http://127.0.0.1:8000/search" \
  -H 'content-type: application/json' \
  -d '{"query":"Jarvis OS"}' | jq '{facts:(.facts|length),episodes:(.episodes|length),nodes:(.nodes|length)}'
```

### S5. 检索评测冒烟（有数据集时执行）

```bash
if [ -f ~/.openclaw/memory-bridge-p3-retrieval-dataset.json ]; then
  pnpm openclaw memory-bridge-p3 retrieval-eval --route mem0 --dataset ~/.openclaw/memory-bridge-p3-retrieval-dataset.json --out /tmp/memory-bridge-p3-retrieval-mem0.json
  pnpm openclaw memory-bridge-p3 retrieval-eval --route graphiti --dataset ~/.openclaw/memory-bridge-p3-retrieval-dataset.json --out /tmp/memory-bridge-p3-retrieval-graphiti.json
fi
```

数据集规范（评测前必须满足）：

- 单条样本字段：
  - `id`（字符串，唯一）
  - `query`（字符串）
  - `expected_ids`（字符串数组，建议必填）
  - `expected_structures`（可选，枚举：`facts|episodes|nodes`）
  - `aliases`（可选，字符串数组）
- `hit@k` 的分母仅统计 `expected_ids` 非空样本；若该字段缺失过多，`hit@k=0` 可能是口径问题而非能力退化。
- 结构覆盖率依赖 `expected_structures`；时序/关系类样本建议强制填写。

推荐最小样本格式：

```json
[
  {
    "id": "timeline-001",
    "query": "when did we switch providers",
    "expected_ids": ["abc123"],
    "expected_structures": ["episodes", "facts"],
    "aliases": ["provider migration timeline"]
  }
]
```

通过标准：

- 命令成功结束；
- `expected_ids` 非空样本占比 >= 80%，`expected_structures` 填写率 >= 80%（关系/时序桶）；
- 关键指标无异常断崖（相对基线降幅不超过 3pp）。

---

## 6. 决策闸门更新（Go / No-Go）

## 6.1 新增 Gate D0（Bridge 维护策略闸门）

进入 Wave 0 前必须满足：

1. 明确 D0-A 或 D0-B 策略与 owner。
2. 约定上游同步频率（<= 14 天）。
3. 最小 smoke 套件可跑通（第 5 章）。
4. 指标口径字典冻结（第 4 章）。

任一不满足即 No-Go。

## 6.2 新增 Gate W0->W1（Wave 0 到 Wave 1）

进入 Wave 1 前必须同时满足：

1. 三大前提纠偏的“计划动作”全部落地到任务级并有 owner。
2. 连续 3 个日窗可产出完整周报字段（含分账与路由字段）。
3. fallback 行为规范与注入测试计划已冻结。
4. 同步后 smoke 套件至少通过 1 轮。

任一不满足即 No-Go，继续停留 Wave 0。

## 6.3 原 Gate A/B/C 的 V1.1 更新

### Gate A（shadow -> 5% canary）

- 保留 V1 阈值；新增前置要求：
  - 报表必须分账；
  - 明确 `admission_enabled` 与 `commit_canary_ratio`；
  - fallback 注入通过率 100%。

### Gate B（5% -> 20% -> 50% 扩流）

- 保留 V1 阈值；新增前置要求：
  - 连续 3 日 `failed=0`、`dead=0`；
  - 每次扩流前都执行一次最小 smoke 套件。

### Gate C（讨论更高 commit 放权）

- 保留 V1 主阈值；新增要求：
  - `canary_commit` 与 `manual_commit` 的质量数据可独立审计；
  - 回滚 drill 记录齐全且 <= 1 分钟可恢复。

---

## 7. V1.1 下的 Wave 顺序调整（B 主线）

1. **Wave 0（强化）**：先把口径和观测做成可决策系统。
2. **Wave 1**：User/Thread/Message 语义层 + fallback 规范落地。
3. **Wave 2**：精确键保护 + Mem0 filters/criteria（shadow 先行）。
4. **Wave 3**：Graphiti graph-native 参数层与 recipe（仍先 shadow）。
5. **Wave 4**：三路融合重排（先试点，再扩流）。
6. **Wave 5**：扩流与写模式决策（仅在 Gate 通过后进行）。

---

## 8. 本周执行清单（V1.1 版本）

1. 完成 D0 决策与 owner 绑定。
2. 冻结指标字典与分账字段。
3. 交付 Day0-Day3 的 9 个任务输出（含运行态补丁固化）。
4. 跑通 1 轮同步后最小 smoke 套件。
5. 开 Wave0->W1 评审会并给出 Go/No-Go。

---

## 9. 风险与回滚（V1.1 增补）

新增重点风险：

1. 口径未纠偏即扩流，导致“指标看起来好但不可解释”。
2. fallback 规范缺失，故障场景下回退不可控。
3. 误把 `outbox.enabled` 当主闸门，出现错误操作。

统一回滚动作（V1.1）：

- 先触发策略 A；
- 再冻结 Wave 推进；
- 最后基于 smoke 与分账报表定位问题。

---

## 10. 版本声明

本 V1.1 是 V1 的执行修订版，重点解决“口径、门禁、执行颗粒度”问题。  
进入实现阶段时，应再产出 `V1.2（文件路径级改动单 + 验收脚本）`，再进入编码执行。
