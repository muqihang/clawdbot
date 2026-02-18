# P1 schema_migrations 对账报告（A3）

- 生成时间（UTC）：2026-02-18T12:12:00Z
- 环境：staging（`tchjnedljlkspqcdthip`）

## 查询范围
- 账本版本：`20260217103000`（Batch004）、`20260217110000`（Batch005）
- 对象状态：
  - Batch004: `mem.memory_record`、`public.memory_lifecycle_status_enum`、`mem.memory_record.lifecycle_status`
  - Batch005: `audit.quota_policy`、`audit.quota_usage_hourly`、关键列/唯一约束

## 账本查询结果

```sql
select version, name, created_by, statements
from supabase_migrations.schema_migrations
where version in ('20260217103000','20260217110000')
order by version;
```

结果：空（`[]`）

## 对象落地查询结果

- Batch004 相关对象：
  - `to_regclass('mem.memory_record') = mem.memory_record`
  - `to_regtype('public.memory_lifecycle_status_enum') = memory_lifecycle_status_enum`
  - verify 脚本 `verify_batch_004_data_governance = PASS`
- Batch005 相关对象：
  - `to_regclass('audit.quota_policy') = audit.quota_policy`
  - `to_regclass('audit.quota_usage_hourly') = audit.quota_usage_hourly`
  - `degraded_reason` 列存在（两表均为 true）
  - `uq_quota_scope` / `uq_quota_usage_bucket` 约束存在（均为 true）

## 对账结论

结论类型：**仅演练执行未入账本**（而非本轮需立即修复的账本损坏）。

判定依据：
1. 版本账本缺失（`schema_migrations` 未记录 20260217103000 / 20260217110000）。
2. 对象已在库中存在且关键 verify 已通过，符合“通过 `execute_sql` 进行对象级演练但未登记 migration ledger”的特征。

## 风险评估与后续策略（本轮不执行修复）

- 风险级别：中（可追溯性风险 > 可用性风险）。
- 当前影响：
  - 功能对象可用；
  - 迁移账本与对象状态不一致，后续自动化迁移流程可能出现“重复执行/误判已执行”分歧。
- 建议策略（后续单独窗口处理）：
  1. 固定“账本修复规范”后再执行（禁止临时人工补账本）。
  2. 以对象校验快照为前置，采用受控 no-op/marker 迁移入账。
  3. 修复动作前后都产出可机判对账报告并走审批。

本轮结论：A3 已形成明确且可追溯结论；无阻断 Batch-7 的新增问题。
