# D1 Contract Diff Baseline

- generated_at: 2026-02-17T15:48:59.436Z
- total_diffs: 12
- unresolved_without_owner: 0

## Category Summary

| category | total | open | resolved |
| --- | ---: | ---: | ---: |
| openapi | 7 | 7 | 0 |
| ddl | 4 | 4 | 0 |
| flags | 1 | 1 | 0 |

## Diff Items

| id | category | status | owner | item | expected | actual | resolution_task | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| api.missing_path.cancel | openapi | open | API 合同负责人 | /v0/approval-tickets/{approvalId}/cancel | POST path exists | missing | T00-02 | P0 必需路径缺失。 |
| api.missing_path.cutover.create | openapi | open | API 合同负责人 | /v0/cutover/runs | POST path exists | missing | T00-02 | P0 必需路径缺失。 |
| api.missing_path.cutover.advance | openapi | open | API 合同负责人 | /v0/cutover/runs/{cutoverId}/advance | POST path exists | missing | T00-02 | P0 必需路径缺失。 |
| api.missing_path.cutover.rollback | openapi | open | API 合同负责人 | /v0/cutover/runs/{cutoverId}/rollback | POST path exists | missing | T00-02 | P0 必需路径缺失。 |
| api.schema.approval_action_response.decision_id_required | openapi | open | API 合同负责人 | components.schemas.ApprovalActionResponse.data.required | contains decision_id | ["approval_id","status"] | T00-02 | 审批动作返回体缺少 decision_id 必填约束。 |
| api.schema.approval_action_response.decision_id_property | openapi | open | API 合同负责人 | components.schemas.ApprovalActionResponse.data.properties.decision_id | UUID field exists | missing | T00-02 | 审批动作返回体未声明 decision_id 字段。 |
| api.schema.approval_action_response.status_canceled | openapi | open | API 合同负责人 | components.schemas.ApprovalActionResponse.data.properties.status.enum | includes canceled | ["approved","rejected","expired"] | T00-02 | 审批终态缺少 canceled。 |
| ddl.missing_object.batch_003.audit.cutover_run | ddl | open | DB 负责人 | audit.cutover_run | batch_003 contains object | missing | T00-03 | DDL 草案缺少 batch_003 对象。 |
| ddl.missing_object.batch_003.audit.cutover_stage_log | ddl | open | DB 负责人 | audit.cutover_stage_log | batch_003 contains object | missing | T00-03 | DDL 草案缺少 batch_003 对象。 |
| ddl.missing_object.batch_004.public.memory_lifecycle_status_enum | ddl | open | DB 负责人 | public.memory_lifecycle_status_enum | batch_004 contains object | missing | T00-03 | DDL 草案缺少 batch_004 对象。 |
| ddl.missing_object.batch_004.mem.memory_record.lifecycle_status | ddl | open | DB 负责人 | mem.memory_record.lifecycle_status | batch_004 contains object | missing | T00-03 | DDL 草案缺少 batch_004 对象。 |
| flags.contract.freeze.pending | flags | open | 配置/门禁负责人 | 15 canonical flags + defaults | contract file frozen in D1 | pending T00-04/T00-06 lock | T00-04 | 待冻结 flags: memory.jarvis.enabled=false, memory.jarvis.read_mode=local, memory.jarvis.write_mode=off, memory.jarvis.cutover_percent=0, memory.jarvis.backfill.enabled=false, security.auth_claim_mapping.enabled=false, security.mtls.required=false, governance.approval_api.enabled=false, governance.approval_api.require_audit_write=true, governance.data_policy.enforced=false, governance.forgetting.purge_enabled=false, quota.enforced=false, quota.hard_block.enabled=false, replay.auto.enabled=false, replay.partition_strict.enabled=true |
