# Wave1 执行任务包（Day1 Frozen + Day2-Day10 W1-A~W1-E 实施批次）

## 1) 执行范围（Day1 Frozen + Day2-Day10）

- Day1 冻结范围：`W1-01`、`W1-02`、`Day1 证据模板` 维持 Frozen，不改语义。
- Day2-Day10 实施范围：Wave1 `W1-A~W1-E` 文档执行批次（含验收与回滚口径）。
- 本批次不展开 Wave2~Wave5 的实施、排期、验收与落盘。
- 执行形态仅限“证据复核 + 兼容探针 + 回执落盘”；不涉及业务代码变更。
- 产物目录固定为：
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day2/`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day3/`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day4/`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day5/`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day6/`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day7/`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day8/`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day9/`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/`

## 2) 命令兼容规则（primary + fallback，必须显式记录）

- `primary`：`pnpm openclaw ...`
- `fallback`：`node openclaw.mjs ...`

执行规则（必须满足）：

1. 先执行 `primary`。
2. 若 `primary` 返回非零退出码，或命令不可用（例如 command not found），必须**立即**执行等价 `fallback`。
3. 无论 `primary` 成功或失败，Day1 至少保留一组可审计的 `primary/fallback` 探针记录（命令、退出码、时间戳、是否触发兜底）。
4. 命令兼容结论以 `final_exit_code` 为准；若 primary 失败但 fallback 成功，判定为“兼容可用（fallback 生效）”。

## 3) W1-01 任务包（Wave0 Go 复核 + W1 进入条件冻结）

### 3.1 任务边界

- in-scope：
  - 复核 Wave0 Gate 与 Master Closure 的 `Go` 证据一致性。
  - 冻结 W1 进入条件（Day1 仅判断是否可进入，不做 Wave2+ 展开）。
  - 输出 W1-01 回执文档。
- out-of-scope：
  - 任何业务代码改造。
  - Wave2~Wave5 内容展开。
  - 非 Day1 文件改写。

### 3.2 输入

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-gate-review.md:34`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-gate-review.md:45`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-gate-review.md:53`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-master-closure.md:36`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-master-closure.md:38`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-condition2-three-day-report-closure.md:90`

### 3.3 输出

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-01-wave0-go-revalidation-and-entry-freeze.md`

### 3.4 验收标准

- AC-01：`Gate D0` 为 `Pass` 且证据锚定到 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-gate-review.md:34`。
- AC-02：`Gate W0->W1` 为 `Pass` 且证据锚定到 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-gate-review.md:45`。
- AC-03：`final_decision` 为 `Go`，且引用 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-gate-review.md:53`。
- AC-04：机械规则引用 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-master-closure.md:36`，并补充 `final Go` 的实际行。
- AC-05：条件2结论为 `pass`，锚定 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-condition2-three-day-report-closure.md:90`。
- AC-06：回执段必须包含：`changed_files: []`、`acceptance_check`、`unresolved: []`。

### 3.5 回滚步骤

- 若 AC-01~AC-05 任一不满足：
  1. 将 `W1_entry_status` 标记为 `blocked`（仅限回执文档内状态，不做跨文件回写）。
  2. 冻结 Day1 后续任务推进（W1-02 可执行兼容探针，但不得宣告 W1 可进入 Wave2+）。
  3. 在 `unresolved` 中记录未满足项与证据缺口（`path:line`）。

## 4) W1-02 任务包（命令兼容探针 + Day1 证据模板实例化）

### 4.1 任务边界

- in-scope：
  - 执行至少一组 `primary/fallback` 兼容探针。
  - 记录命令、时间、退出码、触发逻辑。
  - 在 Day1 回执中实例化证据模板。
- out-of-scope：
  - 非 Day1 批次任务。
  - 业务代码修改。

### 4.2 输入

- 命令兼容规则（本文件第 2 节）。
- 运行时命令输出（probe stdout/stderr 摘要）。

### 4.3 输出

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md`

### 4.4 验收标准

- AC-07：至少存在一条 `primary` 探针记录（含命令、退出码、UTC 时间戳）。
- AC-08：至少存在一条 `fallback` 记录（可为“主动等价探针”或“primary 失败后的兜底执行”）。
- AC-09：若 `primary` 失败，必须可审计地记录“立即执行 fallback”与最终退出码。
- AC-10：回执段必须包含：`changed_files: []`、`acceptance_check`、`unresolved: []`。

### 4.5 回滚步骤

- 若 primary/fallback 均失败：
  1. 将 Day1 兼容状态记为 `failed`。
  2. 将 W1 进入状态记为 `blocked`，并禁止进入 Wave2+。
  3. 在 `unresolved` 记录失败命令、退出码、日志锚点（`path:line`）。
- 若 primary 失败但 fallback 成功：
  1. 标记为 `fallback_only`。
  2. 后续 Day1 命令执行统一采用 `node openclaw.mjs ...`。

## 5) Day1 证据模板（含 path:line 字段）

```yaml
evidence_id: W1-XX-<UTC-TIMESTAMP>
task_id: W1-01 | W1-02
objective: <一句话目标>
scope_boundary:
  in_scope:
    - <path:line>
  out_of_scope:
    - <path:line>
inputs:
  - artifact: <path>
    anchor: <path:line>
execution_log:
  - timestamp_utc: <YYYY-MM-DDTHH:MM:SSZ>
    command: <exact command>
    exit_code: <int>
    fallback_triggered: <true|false>
    note: <optional>
outputs:
  - artifact: <path>
    anchors:
      - <path:line>
acceptance_check:
  status: pass | fail
  checks:
    - id: AC-XX
      result: pass | fail
      evidence: <path:line>
rollback:
  trigger: <条件>
  action: <动作>
  evidence: <path:line>
changed_files: []
unresolved: []
```

## 6) Day1 启动包冻结声明（Frozen，不改语义）

- 冻结范围：本文件第 `3) W1-01`、`4) W1-02`、`5) Day1 证据模板` 作为 Day1 已执行基线，不改语义、不回写结论。
- 冻结依据（path:line）：
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-01-wave0-go-revalidation-and-entry-freeze.md:29`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:28`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-day1-startup-status.md:5`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-day1-startup-status.md:9`

## 7) Day2-Day10 统一执行约束（仅 W1-A~W1-E）

- Wave 边界：本批次只展开 Wave1 Day2-Day10 的 `W1-A~W1-E`，不展开 Wave2~Wave5。
  - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:114`
  - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-gate-review.md:79`
- 命令兼容规则（统一适用于 W1-A~W1-E 的 OpenClaw CLI）：
  - `primary`：`pnpm openclaw ...`
  - `fallback`：`node openclaw.mjs ...`
  - 触发条件：`primary` 不可用（例如 command not found）或退出码非 0，必须立即执行等价 `fallback`。
  - 判定口径：以最终退出码为准，并记录命令、退出码、UTC 时间戳、是否触发兜底。
  - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:39`
  - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:40`
  - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:10`
  - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:11`
  - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:12`
- 后续子代理调度规则（统一适用于 `A/B/C/D` 派发）：
  - 任一后续子代理派发必须使用 `xhigh` 思考强度。
  - 若运行器不提供显式强度开关，必须执行替代硬约束（缺一不可）：
    1. 双轮自检（结构一致性 + 证据锚点完整性）。
    2. 证据锚点完整性检查（所有新增结论都必须具备 `path:line`）。

## 8) W1-A 任务包（Day2-Day3）：`oc_user_id/oc_thread_id/oc_message_id` runtime 落地

### 8.1 任务边界

- in-scope：
  - 将 `oc_user_id/oc_thread_id/oc_message_id` 从规范层推进到 runtime payload 与远端写入元数据。
  - 保持 legacy 字段可回放（兼容模式）。
  - 仅限 Wave1 Day2-Day3。
- out-of-scope：
  - 不展开 message envelope 新字段（归 W1-B）。
  - 不展开 context 模板编排（归 W1-C）。
  - 不展开 Wave2~Wave5。

### 8.2 输入文件与证据锚点（path:line）

- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:119`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:173`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:164`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:137`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:149`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-gate-review.md:45`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-gate-review.md:53`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:51`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:69`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:71`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:47`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06-context-template-spec.md:48`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/fallback-spec-and-fault-injection-plan.md:30`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-01-wave0-go-revalidation-and-entry-freeze.md:29`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:12`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-day1-startup-status.md:5`

### 8.3 代码改动路径清单（计划）

- modify：`src/routing/session-key.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/p3/types.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-outbox-worker.test.ts`

### 8.4 测试命令（vitest）

- `pnpm vitest run --config vitest.unit.config.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-outbox-worker.test.ts`

### 8.5 验收标准（量化）

- AC-A1：新增/更新用例全部通过（目标文件 3 个，0 failed）。
- AC-A2：`oc_user_id/oc_thread_id/oc_message_id` 三字段在入队 payload 可审计出现率 `=100%`（以新增测试样本计）。
- AC-A3：三字段格式满足 W0-03 regex 规范（`ocu_v1/oct_v1/ocm_v1`）。
- AC-A4：远端写入 metadata 在不破坏 legacy 字段前提下携带 oc\_\* 三字段（兼容路径保留）。

### 8.5A 回滚触发条件（量化）

- 任一 W1-A 目标测试失败：`failed_tests > 0`。
- oc\_\* 三字段入队可审计出现率低于 100%：`oc_fields_coverage < 100%`。
- oc\_\* 格式校验出现违规：`regex_violation_count > 0`。
- 远端 metadata 兼容校验失败：`metadata_compat_break_count > 0`。

### 8.6 回滚步骤（可执行）

1. 代码回退到 W1-A 前稳定提交（仅回退本任务变更文件）。
2. 重新执行 W1-A 目标测试命令，确认恢复到“无 oc\_\* runtime 写入”预期。
3. 运行一组 OpenClaw CLI 探针并记录兼容结果：
   - `pnpm openclaw --help`
   - `node openclaw.mjs --help`
4. 在 Day2 回执中记录 `rollback_applied`、受影响文件、测试结果与证据锚点。

## 9) W1-B 任务包（Day4-Day5）：message envelope 最小字段落地

### 9.1 任务边界

- in-scope：
  - 落地最小字段：`role/name/created_at/metadata/ignore_roles`。
  - 确保默认关闭与 shadow 兼容策略可执行。
  - 仅限 Wave1 Day4-Day5。
- out-of-scope：
  - 不改写 oc\_\* 规范定义（归 W1-A）。
  - 不引入模板编排逻辑（归 W1-C）。
  - 不展开 Wave2~Wave5。

### 9.2 输入文件与证据锚点（path:line）

- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:120`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:180`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:152`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:166`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-gate-review.md:45`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:62`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:47`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:88`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:90`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06-context-template-spec.md:66`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/fallback-spec-and-fault-injection-plan.md:30`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:12`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-day1-startup-status.md:5`

### 9.3 代码改动路径清单（计划）

- modify：`extensions/memory-mem0-graphiti-bridge/src/p3/types.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/p3/worker.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/config/flags.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-governance.test.ts`

### 9.4 测试命令（vitest）

- `pnpm vitest run --config vitest.extensions.config.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-governance.test.ts`

### 9.5 验收标准（量化）

- AC-B1：新增/更新用例全部通过（目标文件 3 个，0 failed）。
- AC-B2：`message_envelope` 最小字段五项在启用路径齐全，字段缺省策略与默认值可审计。
- AC-B3：`p3.message_envelope.enabled=false` 时保持 legacy payload 行为一致（回归用例 100% 通过）。
- AC-B4：`ignore_roles` 生效后，过滤行为与审计字段一致（0 条不可解释过滤）。

### 9.5A 回滚触发条件（量化）

- 任一 W1-B 目标测试失败：`failed_tests > 0`。
- 最小字段齐全率低于 100%：`envelope_min_fields_coverage < 100%`。
- legacy 兼容回归失败：`legacy_compat_fail_count > 0`。
- 不可解释过滤记录大于 0：`unexplained_filter_count > 0`。

### 9.6 回滚步骤（可执行）

1. 关闭 envelope 增强：
   - `pnpm openclaw config set p3.message_envelope.enabled false --json`
   - `node openclaw.mjs config set p3.message_envelope.enabled false --json`
2. 清空策略残留：
   - `pnpm openclaw config set p3.message_envelope.ignore_roles '[]' --json`
   - `node openclaw.mjs config set p3.message_envelope.ignore_roles '[]' --json`
3. 重跑 W1-B 目标测试命令并在回执中记录结果。

## 10) W1-C 任务包（Day6-Day7）：`context_assemble` 三模板最小实现

### 10.1 任务边界

- in-scope：
  - 落地最小 `context_assemble` 阶段与模板路由：`T1/T2/T3`。
  - 对接 W1-A（三元 ID）与 W1-B（message envelope）输入字段。
  - 仅限 Wave1 Day6-Day7。
- out-of-scope：
  - 不扩展至高阶 rerank/fusion（Wave3+）。
  - 不展开 Wave2~Wave5。

### 10.2 输入文件与证据锚点（path:line）

- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:121`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:174`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:165`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:188`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:200`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-gate-review.md:45`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:62`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:47`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06-context-template-spec.md:74`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06-context-template-spec.md:144`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06-context-template-spec.md:242`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06-context-template-spec.md:386`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/fallback-spec-and-fault-injection-plan.md:56`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-day1-startup-status.md:5`

### 10.3 代码改动路径清单（计划）

- create：`extensions/memory-mem0-graphiti-bridge/src/p3/context-assemble.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/p3/types.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts`
- create：`extensions/memory-mem0-graphiti-bridge/src/__tests__/context-assemble.test.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/__tests__/memory-search-tool.test.ts`

### 10.4 测试命令（vitest）

- `pnpm vitest run --config vitest.extensions.config.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/context-assemble.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/memory-search-tool.test.ts`

### 10.5 验收标准（量化）

- AC-C1：`T1/T2/T3` 三模板路由用例全部通过（0 failed）。
- AC-C2：`exact_id -> T1`、`timeline -> T2`、`decision_reason -> T3` 映射 100% 命中。
- AC-C3：超预算与字段缺失路径均进入可解释 `degrade`，且 `degrade_reason` 非空率 100%。
- AC-C4：相对 baseline 直出路径，不出现 schema 破坏性变更（兼容用例 100% 通过）。

### 10.5A 回滚触发条件（量化）

- 任一 W1-C 目标测试失败：`failed_tests > 0`。
- 模板映射命中率低于 100%：`template_route_hit_rate < 100%`。
- `degrade_reason` 非空率低于 100%：`degrade_reason_nonempty_rate < 100%`。
- 兼容性用例出现 schema 破坏：`schema_break_count > 0`。

### 10.6 回滚步骤（可执行）

1. 关闭 assembler 路径，恢复检索直出模式（不切主流）。
2. 重跑 W1-C 目标测试命令，确认回退路径可通过。
3. 在回执记录 `template_path_disabled=true` 与回退证据锚点。

## 11) W1-D 任务包（Day8-Day9）：fallback 执行路径 + 故障注入测试

### 11.1 任务边界

- in-scope：
  - 将 `fallback_route` 纳入主读路由闭环。
  - 覆盖超时/5xx/空结果三类故障注入测试。
  - 固化执行日志字段与可复算结论。
- out-of-scope：
  - 不扩展到 Wave2+ 的策略重排。
  - 不展开 Wave2~Wave5。

### 11.2 输入文件与证据锚点（path:line）

- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:109`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:127`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:140`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:145`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:76`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-gate-review.md:42`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:279`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:206`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06-context-template-spec.md:467`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/fallback-spec-and-fault-injection-plan.md:35`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/fallback-spec-and-fault-injection-plan.md:39`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/fallback-spec-and-fault-injection-plan.md:56`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:12`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-day1-startup-status.md:12`

### 11.3 代码改动路径清单（计划）

- modify：`extensions/memory-mem0-graphiti-bridge/src/config/flags.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/router/read-router.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/__tests__/flags.test.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/__tests__/read-router.test.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/__tests__/memory-search-tool.test.ts`
- create：`extensions/memory-mem0-graphiti-bridge/src/__tests__/fallback-fault-injection.test.ts`

### 11.4 测试命令（vitest）

- `pnpm vitest run --config vitest.extensions.config.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/flags.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/read-router.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/memory-search-tool.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/fallback-fault-injection.test.ts`

### 11.5 验收标准（量化）

- AC-D1：故障注入 3 场景全部通过（超时/5xx/空结果），通过率 `=100%`。
- AC-D2：`fallback_route` 实际执行路径可观测（日志字段齐全率 `=100%`）。
- AC-D3：fallback 触发后无崩溃退出，且返回可诊断状态（0 unhandled error）。
- AC-D4：与 W0 冻结规范一致（规则与场景定义无偏移）。

### 11.5A 回滚触发条件（量化）

- 故障注入通过率低于 100%：`fault_injection_pass_rate < 100%`。
- fallback 日志字段齐全率低于 100%：`fallback_log_completeness < 100%`。
- 出现未处理异常：`unhandled_error_count > 0`。
- 冻结规范出现偏移：`rule_drift_count > 0`。

### 11.6 回滚步骤（可执行）

1. 将读路由恢复为本地优先并停用 fallback 新路径（按实现开关回退）。
2. 重新执行 W1-D 目标测试，确认老路径全部通过。
3. 使用 CLI 探针验证网关与通道状态：
   - `pnpm openclaw gateway status --probe --deep`
   - `node openclaw.mjs gateway status --probe --deep`
   - `pnpm openclaw channels status --probe`
   - `node openclaw.mjs channels status --probe`

## 12) W1-E 任务包（Day10）：Gate-1 评审与收口

### 12.1 任务边界

- in-scope：
  - 汇总 W1-A~W1-D 证据并形成 Gate-1 唯一结论。
  - 对 FUR / p95 做可复算评审并给出 Go/No-Go。
  - 输出收口文档与后续停点。
- out-of-scope：
  - 不实施 Wave2 内容。
  - 不修改业务代码。

### 12.2 输入文件与证据锚点（path:line）

- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:123`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:208`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:203`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:205`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:219`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:39`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:40`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:129`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:307`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-gate-review.md:51`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:32`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:34`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:312`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:229`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06-context-template-spec.md:495`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/fallback-spec-and-fault-injection-plan.md:59`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-01-wave0-go-revalidation-and-entry-freeze.md:35`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:88`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-day1-startup-status.md:5`

### 12.3 代码改动路径清单（计划）

- create：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-gate1-review.md`
- create：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-gate1-report.json`
- create：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-gate1-report.txt`
- create：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-metrics-snapshot.json`
- create：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-closure-checklist.md`

### 12.4 评审数据生成命令（primary + fallback）

- `primary`：`pnpm openclaw memory-bridge-p3 report --run-date "$(date -u +%F)" --report-json analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-gate1-report.json --report-text analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-gate1-report.txt`
- `fallback`：`node openclaw.mjs memory-bridge-p3 report --run-date "$(date -u +%F)" --report-json analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-gate1-report.json --report-text analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-gate1-report.txt`
- 执行判定：先执行 `primary`；若返回非 0 或不可用，必须立即执行等价 `fallback`；评审口径以最终退出码为准。

### 12.5 Gate-1 计算口径（可直接复算）

- 复算输入字段（来自 `w1-e-gate1-report.json`）：`fur_baseline`、`fur_current`、`p95_total_baseline_ms`、`p95_total_current_ms`。
- `FUR` 提升（pp）公式：`fur_improvement_pp = (fur_current - fur_baseline) * 100`。
- `p95` 劣化（%）公式：`p95_degradation_pct = ((p95_total_current_ms - p95_total_baseline_ms) / p95_total_baseline_ms) * 100`。
- Gate-1 判定阈值映射：`fur_improvement_pp >= 6` 且 `p95_degradation_pct <= 10` ⇒ `Go`；否则 `No-Go`。
- 复算失败保护：若任一输入字段缺失，或 `p95_total_baseline_ms <= 0`，直接判定 `No-Go` 并记录缺口。

### 12.6 测试命令（vitest）

- `pnpm vitest run --config vitest.extensions.config.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/memory-search-tool.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/read-router.test.ts`

### 12.7 验收标准（量化）

- AC-E1：W1-A~W1-D 计划验收项全部有证据锚点，缺失项 `=0`。
- AC-E2：Gate-1 结论唯一（`Go` 或 `No-Go`，不得双结论）。
- AC-E3：Gate-1 判定满足复算口径：`fur_improvement_pp >= 6` 且 `p95_degradation_pct <= 10`。
- AC-E4：评审产物包含 `changed_files`、`acceptance_check`、`unresolved` 三项统一字段。

### 12.8 回滚步骤（可执行）

1. 若 AC-E1~AC-E3 任一失败：Gate-1 结论强制 `No-Go`。
2. 冻结 Wave1 后续推进，保留在 Day10 收口状态并列出缺口清单。
3. 仅允许补齐 W1-A~W1-D 缺口，不得进入 Wave2。

## 13) Day2-Day10 执行顺序与 Stop Points

- 执行顺序：
  1. Day2-Day3：`W1-A`（oc\_\* runtime）
  2. Day4-Day5：`W1-B`（message envelope 最小字段）
  3. Day6-Day7：`W1-C`（context_assemble 三模板最小实现）
  4. Day8-Day9：`W1-D`（fallback 执行路径 + 故障注入）
  5. Day10：`W1-E`（Gate-1 评审与收口）
- Stop points（每批完成后暂停等待确认）：
  - Stop-1：`W1-A` 完成后暂停。
  - Stop-2：`W1-B` 完成后暂停。
  - Stop-3：`W1-C` 完成后暂停。
  - Stop-4：`W1-D` 完成后暂停。
  - Stop-5：`W1-E` 完成后暂停并等待 Gate-1 结论确认。
- Gate-1 判定公式：`fur_improvement_pp >= 6` 且 `p95_degradation_pct <= 10`。
- Gate-1 Final Evidence Path：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.2-evidence/post-fix/gate1-report.json`
