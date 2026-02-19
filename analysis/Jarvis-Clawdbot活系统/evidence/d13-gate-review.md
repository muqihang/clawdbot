# D13 Gate Review

- generated_at_utc: 2026-02-19T02:31:51.475Z
- p0_all_green: true
- p1_readiness: true
- decision: GO

## Gate Summary

| Gate | Result | Key Metrics |
| --- | --- | --- |
| P0-0 合同冻结 | PASS | lock_ready=true, unresolved=0 |
| P0-1 审批闭环 | PASS | approval_api_pass=true, audit_completeness=1, decision_id_evidence=true |
| P0-2 鉴权映射 | PASS | missing_claim=1, cross_scope=1, plugin_combined=1 |
| P0-3 切流回填 | PASS | backfill=1, shadow=1, rollback_s=0, fault_dag=1 |
| P1 Readiness（非阻断） | PASS | replay_ordered=1, replay_consistency=1, quota_rate=1, schema_ledger_complete=true |

## Evidence Inventory

- required_total: 26
- required_ready: 26
- missing_required: 0
- required_parse_failures: 0

## Blockers

- 无

## Warnings

- 无

## Hard Rule

- 仅当 p0_all_green=true 时，decision 才能为 GO；否则强制 NO-GO

## Output Files

- JSON: analysis/Jarvis-Clawdbot活系统/evidence/d13-gate-review.json
- Markdown: analysis/Jarvis-Clawdbot活系统/evidence/d13-gate-review.md
