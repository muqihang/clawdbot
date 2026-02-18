# D14 最终切流决议（Batch-9 / T90-02）

- 生成时间（UTC）：2026-02-18T13:21:39.306Z
- 依据文件：`analysis/Jarvis-Clawdbot活系统/evidence/d13-gate-review.json`
- 硬规则：仅当 `p0_all_green=true` 时，才允许 `decision=GO`；否则强制 `NO-GO`

## 1) 最终结论

**GO**

判定依据：`p0_all_green=true`，满足 GO 的唯一硬前提。

## 2) 关键指标快照

### P0-0 合同冻结
- `lock_ready=true`
- `unresolved=0`

### P0-1 审批闭环
- approval API：PASS（`success=true`）
- 审计完整率：`audit_completeness_ratio=1.0`（100%）
- `decision_id` 全链路证据：存在（API 测试命中 + trace required）

### P0-2 鉴权映射
- `missing_claim_fail_rate=1.0`（100%）
- `cross_scope_denied_rate=1.0`（100%）
- 插件跨租户/跨 workspace 拦截率：`combined_blocked_rate=1.0`（100%）

### P0-3 切流回填
- backfill：`backfill_ratio=1.0`（阈值 `>=0.995`）
- shadow：`shadow_ratio=1.0`（阈值 `>=0.98`）
- rollback drill：`duration_seconds=0`（阈值 `<=60s`），且回切到 `read_mode=local`、`cutover_percent=0`
- d12 故障演练：`fault_dag_ratio=1.0`

### P1 Readiness（非 P0 硬门禁）
- replay：`ordered_ratio=1.0`、`replay_consistency=1.0`（达标）
- quota：`degraded_reason_rate=1.0`、告警时延 `max=210s`（阈值 `<=300s`）
- schema_migrations：对账状态与风险说明完整（`classification=only_executed_not_ledgered`，`risk.blocking=false`）

## 3) 剩余风险

### 阻断项（Blocking）
- 无

### 非阻断项（Non-blocking）
- `schema_migrations` 账本未完整记录（对象已落地但 ledger 缺失部分版本记录）。
- 风险等级：`medium`（可追溯性风险高于可用性风险）。

## 4) 执行建议（下一步）

1. 允许进入 merge/release review（保持当前保守切流治理与人工确认流程）。
2. 在单独审批窗口执行 `schema_migrations` 补账本方案（marker/no-op 迁移），并在前后重复对账报告。
3. 在正式放量前复核 `read_mode` 切换审批记录与回退预案，确保可在异常时快速回切到 `read_mode=local`。
