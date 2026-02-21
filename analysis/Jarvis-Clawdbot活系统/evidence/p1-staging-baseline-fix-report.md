# P1 staging 基线补做报告（A1 + A2）

- 生成时间（UTC）：2026-02-18T12:12:00Z
- 执行环境：Supabase MCP
- project_ref：`tchjnedljlkspqcdthip`
- project_url：`https://tchjnedljlkspqcdthip.supabase.co`
- 写入范围：仅 staging（未触达生产）

## A1) staging 基线补齐（mem.memory_record）

### A1-Precheck（执行前）

```sql
select now() at time zone 'utc' as observed_at_utc,
       to_regnamespace('mem') as mem_schema,
       to_regclass('mem.memory_record') as mem_memory_record,
       to_regtype('public.memory_lifecycle_status_enum') as lifecycle_enum;
```

结果（UTC `2026-02-18 12:09:22.315471`）：

- `mem_schema = null`
- `mem_memory_record = null`
- `lifecycle_enum = null`

### A1-Fix（最小化 DDL，仅补缺）

```sql
begin;
create schema if not exists mem;
create table if not exists mem.memory_record (
  memory_id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
commit;
```

执行结果：成功（无异常）

### A1-Postcheck（补做后）

```sql
select to_regnamespace('mem') as mem_schema,
       to_regclass('mem.memory_record') as mem_memory_record,
       to_regtype('public.memory_lifecycle_status_enum') as lifecycle_enum;
```

结果：

- `mem_schema = mem`
- `mem_memory_record = mem.memory_record`
- `lifecycle_enum = null`（符合预期，T14-01 尚未执行）

### A1-漂移控制检查（mem schema）

```sql
select n.nspname as schema_name, c.relname as object_name, c.relkind as object_kind
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'mem'
order by c.relname;
```

结果：仅

- `mem.memory_record`（table）
- `mem.memory_record_pkey`（index）

结论：A1 仅补缺 `mem.memory_record` 及必要主键索引，未引入本任务无关对象。

---

## A2) staging 重跑 T14-01 + verify

### A2-Apply

- 执行对象：`/Users/muqihang/chelingxi_workspace/chelingxi-os/supabase/migrations/20260217103000_batch_004_data_governance.sql`
- 执行方式：Supabase MCP `execute_sql`（SQL 原文执行）
- 执行结果：成功（无异常）

### A2-Verify

- 执行对象：`/Users/muqihang/chelingxi_workspace/chelingxi-os/supabase/scripts/rollback/verify_batch_004_data_governance.sql`
- 执行结果：`verify_batch_004_data_governance: PASS`

### A2-关键断言复核

```sql
select array_agg(e.enumlabel order by e.enumsortorder) as lifecycle_enum_values
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
join pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public'
  and t.typname = 'memory_lifecycle_status_enum';
```

结果：`{active,stale,archived,purge_candidate,purged}`

```sql
select c.column_default, c.is_nullable
from information_schema.columns c
where c.table_schema='mem'
  and c.table_name='memory_record'
  and c.column_name='lifecycle_status';
```

结果：

- `column_default = 'active'::memory_lifecycle_status_enum`
- `is_nullable = NO`

结论：A2 满足 T14-01 staging PASS 要求。
