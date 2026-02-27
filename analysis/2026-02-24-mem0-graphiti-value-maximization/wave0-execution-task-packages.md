# OpenClaw Mem0 + Graphiti Wave 0 执行任务包（Day0-Day3）

> 角色定位：Wave 0 执行总架构师（Execution Architect）
>
> 范围边界（严格）：仅覆盖 Day0-Day3、Gate D0、Gate W0->W1。  
> 不在本手册范围：Wave 1~5 的实现细节与代码改造设计。

---

## 0. 基线与执行约束

### 0.1 基线输入（必须）

- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/README.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/zep-cloud-gap-copy-playbook.md`
- `analysis/2026-02-24-p3-writepath-remediation-plan/07-mem0-graphiti-value-max-plan.md`

### 0.2 产物目录（统一）

- 主目录：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/`
- 子目录：
  - `day0/`
  - `day1/`
  - `day2/`
  - `day3/`
  - `gates/`
  - `logs/`

### 0.3 执行原则

1. 先做“口径与观测地基”，不提前进入 Wave 1 实现。
2. 每个任务包必须具备：输入、步骤、输出、验收、回滚。
3. 所有 Gate 走“证据驱动”：无证据即 No-Go。

### 0.4 命令兼容兜底（环境差异）

- 优先命令：`pnpm openclaw ...`
- 兜底命令：若 `pnpm openclaw` 不可用，统一改用 `node openclaw.mjs ...`
- 示例：
  - `pnpm openclaw memory-bridge-p3 index-check --json`
  - `node openclaw.mjs memory-bridge-p3 index-check --json`

---

## 1. Gate 先行定义（D0 与 W0->W1）

## 1.1 Gate D0（进入 Wave 0 前）

### 通过条件（四项全满足）

1. 明确 D0-A 或 D0-B 策略与 owner。
2. 明确上游同步频率（<=14 天）。
3. 同步后最小 smoke 套件可跑通（至少 1 轮）。
4. 指标口径字典 v1 冻结并签字。

### 证据清单

- `wave0-artifacts/gates/d0-decision-record.md`
- `wave0-artifacts/gates/d0-sync-policy.md`
- `wave0-artifacts/day3/sync-smoke-<date>.md`
- `wave0-artifacts/day2/metric-dictionary-v1.md`

### Gate D0 失败回滚

- 回退策略：固定 `D0-A`（私有增强层）并冻结推进。
- 执行动作：暂停 Day1+ 任务，仅允许修正 Gate 缺项。

## 1.2 Gate W0->W1（离开 Wave 0 前）

### 通过条件（四项全满足）

1. 三大前提纠偏动作全部落到任务级并绑定 owner。
2. 连续 3 个日窗可产出完整周报字段（含分账与路由字段）。
3. fallback 行为规范 + 故障注入计划冻结。
4. 同步后最小 smoke 套件至少 1 轮通过。

### 证据清单

- `wave0-artifacts/gates/w0-prereq-closure.md`
- `wave0-artifacts/day2/reporting-field-gap-closure.md`
- `wave0-artifacts/gates/fallback-spec-and-fault-injection-plan.md`
- `wave0-artifacts/day3/sync-smoke-<date>.md`

### Gate W0->W1 失败回滚

- 结论必须标记 No-Go。
- 冻结进入 Wave 1；仅允许补齐 Wave 0 缺口。

---

## 2. Day0-Day3 任务包（可执行 / 可验收 / 可回滚）

## Day0

### W0-01：D0 决策会

- Owner：Founder + Jarvis
- 依赖：无
- 输入：V1/V1.1 主文档、当前配置快照
- 步骤：
  1. 默认推荐先按 D0-A 评估（私有增强层，短期最稳）。
  2. 决定 D0-A 或 D0-B。
  3. 明确“默认落 D0-A”触发条件（满足任一条即触发）：
     - 会议时限内（建议 60 分钟）无法形成一致结论。
     - D0-B 未绑定单一 owner 或无法承诺 <=14 天同步节奏。
     - D0-B 风险/回滚证据不足，无法通过 D0 Gate 条件。
  4. 明确 owner（单点责任人）。
  5. 固化 rebase 节奏（<=14 天）。
  6. 记录 No-Go 触发与恢复条件。
- 输出：`wave0-artifacts/day0/w0-01-d0-decision-record.md`
- 验收：文档中必须出现策略、owner、周期、失败策略四块。
- 回滚：若 24 小时内无法定案，默认执行 D0-A 并锁定 2 周。
- 时间盒：2 小时。

### W0-02：基线冻结

- Owner：Quality
- 依赖：W0-01
- 输入：`~/.openclaw/openclaw.json`、P3 报表、路由配置
- 步骤：
  1. 采集配置快照（只保留非敏感字段）。
  2. 采集 `index-check` 与 `report` 基线输出。
  3. 形成“配置+指标+路由”同日快照。
- 建议命令：
  - `jq '{plugins:{slots:.plugins.slots,bridge:.plugins.entries["memory-mem0-graphiti-bridge"].config}}' ~/.openclaw/openclaw.json > analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/config-snapshot.json`
  - `pnpm openclaw memory-bridge-p3 index-check --json > analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/index-check.json`
  - `pnpm openclaw memory-bridge-p3 report --run-date "$(date -u +%F)" --report-json analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/report.json --report-text analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/report.txt`
- 输出：`wave0-artifacts/day0/w0-02-baseline-freeze.md` + 三个快照文件
- 验收：可复跑、可比对，且包含 `admission_enabled` / `commit_canary_ratio` / `write_mode` 当前值。
- 回滚：同日重采并覆盖，保留旧版本于 `logs/`。
- 时间盒：3 小时。

## Day1

### W0-03：身份映射规范（identity-map）

- Owner：Eng-Routing
- 依赖：W0-02
- 输入：内置渠道清单、现有 session/user/thread 样本
- 步骤：
  1. 锁定内置渠道范围（以 `src/channels/registry.ts:7` 为准）。
  2. 为每个渠道定义 `oc_user_id / oc_thread_id / oc_message_id` 生成规则。
  3. 定义冲突规则（重名、跨渠道同 ID、迁移会话）。
  4. 给出至少 2 个冲突样本与裁决结果。
- 输出：`wave0-artifacts/day1/w0-03-identity-map-spec.md`
- 验收：覆盖 `CHAT_CHANNEL_ORDER` 全量渠道，且每渠道都有映射示例。
- 回滚：退回 `sessionKey` 单键策略并记录影响。
- 时间盒：4 小时。

### W0-04：Message Envelope 草案

- Owner：Eng-Governance
- 依赖：W0-02
- 输入：outbox payload 样本、Zep 对照字段
- 步骤：
  1. 盘点现有 payload 字段与缺口。
  2. 冻结最小字段集：`role/name/created_at/metadata/ignore_roles`。
  3. 声明兼容策略：新增字段可选，旧字段直通。
  4. 定义灰度开关与默认关闭策略。
- 输出：`wave0-artifacts/day1/w0-04-message-envelope-spec.md`
- 验收：
  - 字段定义含类型/是否必填/默认值。
  - 兼容策略可解释“老 payload 不改也能跑”。
- 回滚：仅保留旧 payload 契约，不启用扩展字段。
- 时间盒：4 小时。

## Day2

### W0-05：指标口径字典冻结

- Owner：Quality + Jarvis
- 依赖：W0-02
- 输入：V1.1 第 4 章指标、现有 P3 报表字段
- 步骤：
  1. 冻结 Top1/FUR/CFP/p95/cost 统计口径。
  2. 冻结分账字段（proposal/canary/manual/pending/failed/dead）。
  3. 标注“已具备字段 vs 缺口字段”与补齐 owner。
  4. 输出 Gate 使用口径（含 low_confidence 处理）。
- 输出：
  - `wave0-artifacts/day2/metric-dictionary-v1.md`
  - `wave0-artifacts/day2/reporting-field-gap-closure.md`
- 验收：周报/Gate/评测脚本三方口径一致，缺口有 owner 和截止时间。
- 回滚：回到上一版字典，并附差异比对。
- 时间盒：4 小时。

### W0-06：Context 模板草案

- Owner：Prompt/Agent Eng
- 依赖：W0-03, W0-04
- 输入：四桶样本、检索样本
- 步骤：
  1. 产出 3 套模板（精确ID / 时序 / 决策）。
  2. 每模板补“失败兜底 + 裁剪规则 + token 预算”。
  3. 定义评分 rubric（可解释性、可用性、噪声率）。
  4. 给出 shadow 对比协议（不切主流量）。
- 输出：`wave0-artifacts/day2/w0-06-context-template-spec.md`
- 验收：每模板都有输入/输出范式与失败处理路径。
- 回滚：关闭 assembler，维持检索直出。
- 时间盒：4 小时。

### W0-06B：运行态补丁固化（Graphiti）

- Owner：Ops + Eng-Infra
- 依赖：W0-02
- 输入：`scripts/memory-stack/*`、当前 patch 记录
- 步骤：
  1. 盘点 patch 来源与作用域（source patch / sitepkg patch）。
  2. 从干净环境执行 `bootstrap -> start -> smoke -> status`。
  3. 记录“重建后依然生效”的证据。
  4. 产出 patch 清单与再现场景。
- 建议命令：
  - `scripts/memory-stack/bootstrap.sh`
  - `scripts/memory-stack/start.sh`
  - `scripts/memory-stack/smoke.sh`
  - `scripts/memory-stack/status.sh`
- 输出：
  - `wave0-artifacts/day2/w0-06b-patch-manifest.md`
  - `wave0-artifacts/day2/w0-06b-rebuild-verify.log`
- 验收：干净重建后 smoke 通过，且补丁不依赖人工热修。
- 回滚：恢复上一版 patch 清单并重新 bootstrap。
- 时间盒：6 小时。

## Day3

### W0-07：同步后 smoke 套件固化

- Owner：Ops + Eng
- 依赖：W0-05, W0-06B
- 输入：V1.1 第 5 章命令清单
- 步骤：
  1. 固化 S1-S5 命令与日志模板。
  2. 增补 Graphiti nodes 校验（若 `smoke.sh` 未输出 nodes）。
  3. 标注每一步失败处理与重试上限。
  4. 验证整套流程 <=60 分钟。
- 输出：`wave0-artifacts/day3/w0-07-sync-smoke-runbook.md`
- 验收：
  - 全命令可执行。
  - 失败时可定位到具体步骤与错误日志。
  - 输出带时间戳与执行人。
- 回滚：切换手动检查清单（只保留最小健康探针）。
- 时间盒：4 小时。

### W0-08：Wave0 Gate 评审

- Owner：Founder + Jarvis + Quality
- 依赖：W0-01~W0-07（含 06B）
- 输入：全部 Wave0 产物与日志
- 步骤：
  1. 按 Gate D0 与 Gate W0->W1 检查单逐条过会。
  2. 逐项标注 Pass/Fail 与证据路径。
  3. 出具 Go/No-Go 结论及下一步动作（仅到 Wave 1 入口，不展开实现）。
- 输出：`wave0-artifacts/gates/w0-gate-review.md`
- 验收：
  - 没有“口头通过”；每条标准都有证据路径。
  - 结论唯一（Go 或 No-Go）。
- 回滚：No-Go 即停留 Wave0，并生成缺口收敛清单。
- 时间盒：2 小时。

---

## 3. 关键偏差与证据（V1.1 vs 当前代码现实）

> 说明：以下用于指导 Wave0 任务优先级，不等于要求本轮改代码。

1. `propose_only` 在 `admission_enabled=true` 时可发生 commit（与“纯观察”认知冲突风险）。
   - 证据：`extensions/memory-mem0-graphiti-bridge/src/p3/worker.ts:376`
   - 证据：`extensions/memory-mem0-graphiti-bridge/src/p3/worker.ts:386`
   - 证据：`extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-outbox-worker.test.ts:225`

2. `outbox.enabled` 不是写链路主闸门（写捕获由 `write_mode` 驱动）。
   - 证据：`extensions/memory-mem0-graphiti-bridge/index.ts:114`
   - 证据：`extensions/memory-mem0-graphiti-bridge/src/config/flags.ts:361`

3. `fallback_route` 已定义但未进入主读路由决策闭环。
   - 证据：`extensions/memory-mem0-graphiti-bridge/src/config/flags.ts:10`
   - 证据：`extensions/memory-mem0-graphiti-bridge/src/router/read-router.ts:5`
   - 证据：`extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts:227`

4. V1.1 要求的分账/路由字段尚未在现有 P3 报表中完备体现。
   - 证据（当前报表字段）：`extensions/memory-mem0-graphiti-bridge/src/p3/reporting.ts:11`
   - 证据（当前 audit counters 结构）：`extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts:46`
   - 证据（report 命令输出结构）：`extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:475`

---

## 4. 执行顺序与关键路径

关键路径：`W0-01 -> W0-02 -> (W0-03/W0-04 并行) -> W0-05 -> (W0-06/W0-06B 并行) -> W0-07 -> W0-08`

- 并行建议：
  - Day1：`W0-03` 与 `W0-04` 可并行。
  - Day2：`W0-06` 与 `W0-06B` 可并行。
- 串行硬约束：
  - `W0-02` 未完成，不允许进入 Day1。
  - `W0-05` 未冻结，不允许进入 Day3 Gate 评审。

---

## 5. 交付即验收清单（Wave0 结束时）

1. Day0-Day3 任务产物齐全且路径可访问。
2. D0 Gate 检查单完成并有结论。
3. W0->W1 Gate 检查单完成并有结论。
4. 偏差清单每条都有 owner 和收敛计划。
5. 存在可执行回滚路径（配置层 + 运行手册层）。
