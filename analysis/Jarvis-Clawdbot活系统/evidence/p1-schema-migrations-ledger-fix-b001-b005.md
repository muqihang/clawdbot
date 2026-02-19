# P1 schema_migrations 联合补账本执行与核验报告（Batch001~005）

- 生成时间（UTC）：2026-02-18T14:24:58Z
- 环境：staging（`tchjnedljlkspqcdthip`）
- 约束执行：仅 staging；未执行 `supabase db push`；未执行业务对象 DDL/DML；仅执行官方 `supabase migration repair`。
- 结论：**PASS**

## A. Pre-check（只读）

### A1. 账本缺口确认（Batch001~005）

`supabase_migrations.schema_migrations` 核对结果（修复前）：

> 修复前完整版本清单已按 `SELECT version,name,created_by ... ORDER BY version` 落盘到同目录 `*.json` 与 `*.log`（before snapshot）。

| version | marker object | marker_exists | in_ledger |
|---|---|---:|---:|
| 20260217090000 | audit.approval_ticket | true | false |
| 20260217093000 | audit.actor_role_binding | true | false |
| 20260217100000 | audit.cutover_run | true | false |
| 20260217103000 | mem.memory_record | true | false |
| 20260217110000 | audit.quota_policy | true | false |

修复前缺失版本：

`[20260217090000, 20260217093000, 20260217100000, 20260217103000, 20260217110000]`

### A2. 对象存在性核验（仅只读）

- Batch001 marker：`audit.approval_ticket` 存在。
- Batch002 marker：`audit.actor_role_binding` 存在。
- Batch003 marker：`audit.cutover_run` 存在。
- Batch004：`mem.memory_record`、`public.memory_lifecycle_status_enum`、`mem.memory_record.lifecycle_status` 均存在。
- Batch005：`audit.quota_policy`、`audit.quota_usage_hourly`、`degraded_reason` 关键列、`uq_quota_scope` / `uq_quota_usage_bucket` 关键约束均存在。

判定：Batch001~005 全部满足“对象已落地，可补 applied 账本”。

## B. 官方补账本执行（升序）

执行方法：Supabase 官方 migration repair。

```bash
supabase migration repair 20260217090000 --status applied --db-url "$SUPABASE_DB_URL" --yes
supabase migration repair 20260217093000 --status applied --db-url "$SUPABASE_DB_URL" --yes
supabase migration repair 20260217100000 --status applied --db-url "$SUPABASE_DB_URL" --yes
supabase migration repair 20260217103000 --status applied --db-url "$SUPABASE_DB_URL" --yes
supabase migration repair 20260217110000 --status applied --db-url "$SUPABASE_DB_URL" --yes
```

每一步 CLI 返回 `Repaired migration history: [version] => applied`，并在每一步后立即只读复核 `in_ledger=true`：

- 20260217090000：`in_ledger=true`，marker 仍存在。
- 20260217093000：`in_ledger=true`，marker 仍存在。
- 20260217100000：`in_ledger=true`，marker 仍存在。
- 20260217103000：`in_ledger=true`，Batch004 关键对象/列仍存在。
- 20260217110000：`in_ledger=true`，Batch005 关键对象/列/约束仍存在。

## C. Post-check（必须）

### C1. 账本一致性

修复后缺失版本：`[]`

`schema_migrations` 中已可见：

- `20260217090000 / batch_001_approval_closure`
- `20260217093000 / batch_002_auth_scope_mapping`
- `20260217100000 / batch_003_cutover_runbook`
- `20260217103000 / batch_004_data_governance`
- `20260217110000 / batch_005_quota_capacity`

### C2. verify 脚本核验

执行/复用 `verify_schema_migrations_ledger_reconcile.sql` 等价断言（同一断言逻辑）：

- 返回：`verify_schema_migrations_ledger_reconcile: PASS`

### C3. Batch006+ 与漂移检查

- 观察 `version >= 20260217090000` 的账本条目仅包含 Batch001~005 五条。
- `20260217113000`（Batch006）仍未入账，且 marker `mem.replay_queue` 不存在（与预期一致）。
- 未发现无关对象漂移。

## D. 专项结论

1. 结论：**PASS**（Batch001~005 联合补账本完成）。
2. 修复前后缺失对比：
   - 修复前：`20260217090000, 20260217093000, 20260217100000, 20260217103000, 20260217110000`
   - 修复后：`[]`
3. ledger 风险关闭情况：**已在 Batch001~005 范围内完全关闭**。
4. 越界/漂移：**未发现越界写入、未发现无关漂移**。
