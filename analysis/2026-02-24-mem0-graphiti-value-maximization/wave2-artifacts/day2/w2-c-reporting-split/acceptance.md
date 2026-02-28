# W2-C: proposal vs canonical 分账与报表对齐（禁止混合口径）- Acceptance

## AC（冻结要求）与达成说明

### AC1: 报表必须包含并正确计算/输出 6 个冻结字段（字段名不许改）

字段（必须全部存在且为 number）：

- `proposal_count`
- `canary_commit_count`
- `manual_propose_commit_count`
- `pending_review_count`
- `failed_count`
- `dead_count`

达成说明：

- `weekly_gate_fields` 的 6 字段仍按冻结字段名输出（JSON + txt summary 均包含）。
- 口径调整为“proposal vs canonical 不混用”：
  - commit 相关字段仅统计 **canonical commit**（以 `proposal_state.status='committed'` 为准）。
  - `canary_commit_count` / `manual_propose_commit_count` 再按 `outbox_events.write_mode` 做二次切分，避免把“remote write succeeded 但未 commit”混进 commit 统计。

证据：

- 单测覆盖：`extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-weekly-gate-fields-split.test.ts`
- 最小样例：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day2/w2-c-reporting-split/sample-report.json`

### AC2: “未分账报表不得用于 Gate 放行”的红线可落实（缺字段即 fail/invalid，可审计）

选择的策略：**严格校验**（strict validation）。

- 新增 `validateP3WeeklyGateFieldsStrict()`：对 `weekly_gate_fields` 做结构化校验，任一冻结字段缺失/非 number => `ok=false` + `issues[]`（可审计）。
- 单测断言缺字段必定拒绝（不允许 silent fallback）。

证据：

- 单测：`extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-weekly-gate-fields-split.test.ts`

### AC3: 必须补 tests（字段齐全性 + 语义边界）

达成说明：

- 字段齐全性：生成 `report.json` 并解析，断言 6 字段存在且为 number。
- 语义边界：构造 outbox/proposal_state fixture，确保：
  - canary/manual commit 只统计 committed 事件
  - canary/manual 通过 `write_mode` 分桶，不互相污染
  - pending/failed/dead 不污染 commit 统计

证据：

- `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-weekly-gate-fields-split.test.ts`

## 回归与验证记录

本目录落盘了本次实现的可复算验证输出：

- `vitest.log`：`pnpm vitest run --config vitest.extensions.config.ts extensions/memory-mem0-graphiti-bridge/src/__tests__`
- `vitest.exit`：对应退出码（应为 `0`）

## 关键产物路径（汇总）

- Tests:
  - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-weekly-gate-fields-split.test.ts`
- Implementation:
  - `extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts`
  - `extensions/memory-mem0-graphiti-bridge/src/p3/reporting.ts`
- Evidence bundle:
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day2/w2-c-reporting-split/vitest.log`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day2/w2-c-reporting-split/vitest.exit`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day2/w2-c-reporting-split/sample-report.json`
