# W0->W1 条件2：连续 3 个日窗周报字段闭环

## 1) 元信息

- ArtifactID: `W0-U6-CONDITION2-CLOSURE`
- Author: `子代理 #W0-U6-Implementer（W0->W1 条件2收敛）`
- Timestamp (UTC): `2026-02-26T07:45:00Z`
- Scope: 仅覆盖 W0->W1 条件2（连续 3 个 UTC 日窗周报字段完整性）；不展开 Wave1~Wave5。
- 固定日窗（UTC）: `2026-02-24`、`2026-02-25`、`2026-02-26`。

## 2) weekly_gate_fields 字段与机械口径（代码落地）

周报新增 `weekly_gate_fields`（9 字段），并在 JSON 与文本摘要同时输出：

- 字段定义（9）：`proposal_count`、`canary_commit_count`、`manual_propose_commit_count`、`pending_review_count`、`failed_count`、`dead_count`、`admission_enabled`、`commit_canary_ratio`、`effective_write_mode`。
  - 证据：`extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:82`; `extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:91`

- 机械口径实现（分账字段 6 + 路由字段 3）：
  - `proposal_count = proposal_state 总数 = proposalStates.length`
    - 证据：`extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:164`; `extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:182`
  - `canary_commit_count = count(outbox_events where source_tier='online_incremental' and status='succeeded' and write_mode='propose_commit')`
    - 证据：`extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:166`; `extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:170`; `extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:183`
  - `manual_propose_commit_count = count(outbox_events where source_tier='manual' and status='succeeded')`
    - 证据：`extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:173`; `extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:175`; `extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:184`
  - `pending_review_count = count(proposal_state where status='pending_review')`
    - 证据：`extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:177`; `extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:179`; `extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:185`
  - `failed_count = outbox.failed`，`dead_count = outbox.dead`
    - 证据：`extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:186`; `extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:187`; `extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts:690`; `extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts:695`; `extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts:719`; `extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts:722`
  - `admission_enabled = flags.p3.admission_enabled`，`commit_canary_ratio = flags.p3.commit_canary_ratio`，`effective_write_mode = flags.write_mode`
    - 证据：`extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:188`; `extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:190`

- JSON 与文本摘要双输出：
  - JSON 中写入 `weekly_gate_fields`
    - 证据：`extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:329`; `extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:335`; `extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:538`; `extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:544`
  - 文本摘要中写入 9 个 `weekly_gate_fields.*` 行
    - 证据：`extensions/memory-mem0-graphiti-bridge/src/p3/reporting.ts:89`; `extensions/memory-mem0-graphiti-bridge/src/p3/reporting.ts:97`

## 3) 三日窗逐日字段完整性矩阵（9 字段）

判定符号：`✓ = 字段存在且非 null`。

| UTC 日窗   | proposal_count | canary_commit_count | manual_propose_commit_count | pending_review_count | failed_count | dead_count | admission_enabled | commit_canary_ratio | effective_write_mode | 日窗结论 |
| ---------- | -------------- | ------------------- | --------------------------- | -------------------- | ------------ | ---------- | ----------------- | ------------------- | -------------------- | -------- |
| 2026-02-24 | ✓              | ✓                   | ✓                           | ✓                    | ✓            | ✓          | ✓                 | ✓                   | ✓                    | pass     |
| 2026-02-25 | ✓              | ✓                   | ✓                           | ✓                    | ✓            | ✓          | ✓                 | ✓                   | ✓                    | pass     |
| 2026-02-26 | ✓              | ✓                   | ✓                           | ✓                    | ✓            | ✓          | ✓                 | ✓                   | ✓                    | pass     |

逐日证据（每个结论均可 path:line 复核）：

- `2026-02-24` 九字段存在且非 null（JSON）；文本摘要同样包含九字段。
  - JSON 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.json:21`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.json:22`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.json:23`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.json:24`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.json:25`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.json:26`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.json:27`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.json:28`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.json:29`
  - 文本证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.txt:14`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.txt:22`

- `2026-02-25` 九字段存在且非 null（JSON）；文本摘要同样包含九字段。
  - JSON 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.json:21`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.json:22`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.json:23`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.json:24`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.json:25`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.json:26`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.json:27`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.json:28`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.json:29`
  - 文本证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.txt:14`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.txt:22`

- `2026-02-26` 九字段存在且非 null（JSON）；文本摘要同样包含九字段。
  - JSON 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.json:21`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.json:22`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.json:23`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.json:24`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.json:25`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.json:26`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.json:27`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.json:28`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.json:29`
  - 文本证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.txt:14`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.txt:22`

## 4) 结论公式与最终结论

- 日窗完整性公式：
  - `daily_complete(d) = all_9_fields_exist_and_non_null(d)`
- 命令成功公式：
  - `cmd_exit_ok(d) = (final_exit_code(d) == 0)`
- 条件2判定公式：
  - `condition2_result = pass iff daily_complete(2026-02-24) ∧ daily_complete(2026-02-25) ∧ daily_complete(2026-02-26) ∧ cmd_exit_ok(2026-02-24) ∧ cmd_exit_ok(2026-02-25) ∧ cmd_exit_ok(2026-02-26)`
- 失败/回归绑定规则：
  - 若任一日窗触发 `daily_complete(d)=fail` 或 `cmd_exit_ok(d)=false`，立即改判 `condition2_result=fail`，并执行第 6 节冻结/回滚动作。
  - Gate 绑定口径：`condition2_result=fail` 时，Gate W0->W1 条件2必须改判 `Fail`，不得维持 `Pass`。
  - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:75`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:86`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:88`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:89`

按第 3 节逐日矩阵复算：

- `daily_complete(2026-02-24)=pass`
  - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.json:21`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.json:29`
- `daily_complete(2026-02-25)=pass`
  - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.json:21`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.json:29`
- `daily_complete(2026-02-26)=pass`
  - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.json:21`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.json:29`
- `cmd_exit_ok(2026-02-24)=true`
  - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.cmd.log:34`
- `cmd_exit_ok(2026-02-25)=true`
  - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.cmd.log:34`
- `cmd_exit_ok(2026-02-26)=true`
  - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.cmd.log:34`

最终结论：`condition2_result=pass`。

- 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.json:21`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.json:29`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.json:21`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.json:29`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.json:21`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.json:29`

## 5) 三次 report 命令执行与兜底规则记录

三次 report 均记录了主命令与 node 兜底命令；本轮主命令 `pnpm openclaw` 均成功，`fallback_triggered=false`。

- `2026-02-24`：`primary_cmd` + `fallback_cmd` + `final_exit_code:0`
  - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.cmd.log:3`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.cmd.log:4`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.cmd.log:33`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.cmd.log:34`
- `2026-02-25`：`primary_cmd` + `fallback_cmd` + `final_exit_code:0`
  - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.cmd.log:3`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.cmd.log:4`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.cmd.log:33`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.cmd.log:34`
- `2026-02-26`：`primary_cmd` + `fallback_cmd` + `final_exit_code:0`
  - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.cmd.log:3`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.cmd.log:4`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.cmd.log:33`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.cmd.log:34`

## 6) 失败/回归触发与回滚执行口径（与结论绑定）

- 触发条件（任一命中即触发回滚）：
  - T1：任一日窗 `weekly_gate_fields` 任一字段缺失或为 `null`（即 `daily_complete(d)=fail`）。
    - 证据锚点：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.json:21`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.json:29`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.json:21`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.json:29`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.json:21`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.json:29`
  - T2：任一日窗 `report-<UTC-day>.cmd.log` 出现 `final_exit_code != 0`（即 `cmd_exit_ok(d)=false`）。
    - 证据锚点：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.cmd.log:34`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.cmd.log:34`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.cmd.log:34`

- 执行动作（复用既有 Gate 失败冻结/回滚动作，不新设计）：
  - 动作 A：将 Gate 结论切换为 `No-Go` 并冻结进入 Wave1~Wave5，仅允许补齐 Wave0 缺口。
    - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:88`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:89`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/sync-smoke-2026-02-25-r2.md:50`
  - 动作 B：执行手动最小健康探针链路（`status`/`healthcheck`/`docs`/`search`/`rollback-hints`）。
    - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/sync-smoke-2026-02-25-r2.md:53`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/sync-smoke-2026-02-25-r2.md:57`
  - 动作 C：执行 D0 No-Go 配置回滚四项（`read_mode`、`write_mode`、`admission_enabled`、`commit_canary_ratio`）。
    - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-01-d0-decision-record.md:294`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-01-d0-decision-record.md:304`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-01-d0-decision-record.md:325`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-01-d0-decision-record.md:328`

- 回滚完成判据（全部满足才算执行完成）：
  - 判据 P1：冻结动作已落盘并可审计。
    - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/sync-smoke-2026-02-25-r2.status.json:79`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/sync-smoke-2026-02-25-r2.status.json:82`
  - 判据 P2：No-Go 回滚记录状态为 `triggered_and_completed`。
    - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/w0-01-no-go-rollback-2026-02-24.md:11`
  - 判据 P3：四项配置已回读命中 `local / propose_only / false / 0`。
    - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-01-d0-decision-record.md:335`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-01-d0-decision-record.md:338`

- 证据落盘路径（固定审计入口）：
  - 日窗字段与命令结果：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-<UTC-day>.json`、`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-<UTC-day>.txt`、`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-<UTC-day>.cmd.log`
  - 冻结/回滚执行记录：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/w0-01-no-go-rollback-2026-02-24.md`
  - Gate 执行动作状态：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/sync-smoke-2026-02-25-r2.status.json`
  - 索引唯一入口：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/evidence-index.md:62`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/evidence-index.md:65`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/evidence-index.md:71`

- 本轮触发检查：`T1=false` 且 `T2=false`，因此无需触发回滚，`condition2_result` 保持 `pass`。
  - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.cmd.log:34`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.cmd.log:34`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.cmd.log:34`
