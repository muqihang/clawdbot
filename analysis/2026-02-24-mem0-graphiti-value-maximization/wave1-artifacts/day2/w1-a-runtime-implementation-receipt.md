# W1-A 执行回执（Day2）：oc\_\* runtime 落地（文档执行批次）

## 1) 本批执行范围

- in-scope：
  - 执行 W1-A 代码实施：`oc_user_id/oc_thread_id/oc_message_id` 落地到 runtime payload 与远端 metadata，并保持 legacy 字段兼容。
  - 完成 W1-A 目标测试（planned/effective 命令双证据）与 Day2 回执落盘。
- out-of-scope：
  - 不展开 W1-B/W1-C/W1-D/W1-E 的代码实施。
  - 不展开 Wave2~Wave5。

范围依据（path:line）：

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-day1-startup-status.md:5`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-day1-startup-status.md:10`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:160`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:181`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:447`

## 2) 命令兼容规则（统一）

- `primary`：`pnpm openclaw ...`
- `fallback`：`node openclaw.mjs ...`
- 规则：`primary` 不可用或退出码非 0 时，立即执行等价 `fallback`。

规则依据（path:line）：

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:39`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:40`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:10`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:11`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:12`

### 2.1 调度规则对齐（后续子代理）

- 对齐规则：W1-A 批次后续子代理派发（A/B/C/D）统一使用 `xhigh`；若运行器无显式强度开关，执行“双轮自检 + 证据锚点完整性检查”替代硬约束。

对齐依据（path:line）：

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:175`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:179`

## 3) 计划改动文件清单（与 W1-A 任务包一致）

- modify：`src/routing/session-key.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/p3/types.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts`
- modify：`extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-outbox-worker.test.ts`

一致性依据（path:line）：

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:213`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:222`

## 4) 计划测试命令（vitest）

- `pnpm vitest run --config vitest.unit.config.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-outbox-worker.test.ts`

依据（path:line）：

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:226`

## 5) 计划验收门槛

- AC-A1：目标测试文件 3 个全部通过（0 failed）。
- AC-A2：`oc_user_id/oc_thread_id/oc_message_id` 在入队 payload 可审计出现率 `=100%`。
- AC-A3：oc\_\* 三字段格式满足 `ocu_v1/oct_v1/ocm_v1` 规范。
- AC-A4：远端写入 metadata 携带 oc\_\* 且不破坏 legacy 字段。

依据（path:line）：

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:230`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:233`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:69`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:71`

## 6) 计划回滚触发条件（量化）

- 任一 W1-A 目标测试失败：`failed_tests > 0`。
- oc\_\* 三字段入队可审计出现率低于 100%：`oc_fields_coverage < 100%`。
- oc\_\* 格式校验出现违规：`regex_violation_count > 0`。
- 远端 metadata 兼容校验失败：`metadata_compat_break_count > 0`。

## 7) 计划回滚步骤

1. 回退 W1-A 变更文件到前一稳定提交（仅限本任务文件）。
2. 重跑 W1-A 目标测试命令，确认恢复到基线行为。
3. 执行兼容探针并留存日志：
   - `pnpm openclaw --help`
   - `node openclaw.mjs --help`
4. 在回执中记录 `rollback_applied`、受影响文件、测试结果和证据锚点。

依据（path:line）：

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:237`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:244`

## 8) 执行回执（固定格式）

- changed_files: [
  "src/routing/session-key.ts",
  "extensions/memory-mem0-graphiti-bridge/src/p3/types.ts",
  "extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts",
  "extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts",
  "extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts",
  "extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts",
  "extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-outbox-worker.test.ts",
  "analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day2/w1-a-runtime-implementation-receipt.md"
  ]
- acceptance_check:
  - AC-A1: PASS
    - 结果摘要：目标测试文件 3 个全部通过，12 tests passed（effective command）。
    - 证据锚点：
      - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts:13`
      - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts:95`
      - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-outbox-worker.test.ts:8`
      - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day2/w1-a-runtime-implementation-receipt.md:156`
  - AC-A2: PASS
    - 结果摘要：新增样本中 `oc_user_id/oc_thread_id/oc_message_id` 入队 payload 可审计出现率 100%（新增断言全部通过）。
    - 证据锚点：
      - `extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:182`
      - `extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:202`
      - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts:48`
      - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts:78`
      - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts:105`
      - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts:143`
      - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts:141`
      - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts:140`
      - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-outbox-worker.test.ts:322`
      - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-outbox-worker.test.ts:323`
  - AC-A3: PASS
    - 结果摘要：oc\_\* 三字段格式满足 `ocu_v1/oct_v1/ocm_v1` 规范，正则校验通过。
    - 证据锚点：
      - `src/routing/session-key.ts:260`
      - `src/routing/session-key.ts:262`
      - `src/routing/session-key.ts:264`
      - `src/routing/session-key.ts:355`
      - `src/routing/session-key.ts:359`
      - `src/routing/session-key.ts:363`
      - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts:4`
      - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts:17`
      - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-outbox-worker.test.ts:9`
  - AC-A4: PASS
    - 结果摘要：远端 metadata 在保留 legacy 字段（`event_id/model/write_mode/source_ref/source_tier/candidate_memory_id/fact_key`）前提下携带 oc\_\* 三字段。
    - 证据锚点：
      - `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:175`
      - `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:185`
      - `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:119`
      - `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:137`
      - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts:180`
      - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts:189`
      - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-outbox-worker.test.ts:346`
- unresolved: []

- tests:
  - planned_command: `pnpm vitest run --config vitest.unit.config.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-outbox-worker.test.ts`
  - planned_exit_code: 1
  - planned_summary: `No test files found`（`vitest.unit.config.ts` 显式排除 `extensions/**`）。
  - effective_command: `pnpm vitest run --config vitest.extensions.config.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-outbox-worker.test.ts`
  - effective_exit_code: 0
  - effective_summary: `3 files passed, 12 tests passed`
  - config_evidence:
    - `vitest.unit.config.ts:8`
    - `vitest.unit.config.ts:16`
    - `vitest.extensions.config.ts:12`

- rollback_applied: false
- rollback_evidence:
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:237`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:240`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day2/w1-a-runtime-implementation-receipt.md:156`
