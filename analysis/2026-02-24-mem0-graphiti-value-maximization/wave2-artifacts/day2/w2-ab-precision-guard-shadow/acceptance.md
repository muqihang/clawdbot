# W2-A/B 回执：Precision Guard Lane + Mem0 filters/criteria（shadow）

证据目录：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day2/w2-ab-precision-guard-shadow/`

## Acceptance Criteria

### AC1：Precision Guard Lane（signature + deterministic guard + trace）

- [x] **Query signature**：识别精确键类 query（`endpoint_path/commit_sha/ticket_id/error_code/group_id`）。
- [x] **Read-router 前置识别接入**：`memory_search` 在调用 `resolveReadPlan()` 前生成 `querySignature` 并透传；read-router 在 signature 命中时强制 `intent=semantic`（避免 timeline 误路由）。
- [x] **Deterministic guard + rerank**：当 precision guard 开启且 local 命中 exact key 时，强制返回 local（不改变 tool 入参契约），并对结果做稳定重排（tie 场景 top1 可复现）。
- [x] **Auditable trace**：返回 payload 中包含可审计字段：`signature`、`guard`、`route`、`fallback`（local/remote 均可见）。

证据：
- 测试：`extensions/memory-mem0-graphiti-bridge/src/__tests__/query-signature.test.ts`
- 测试：`extensions/memory-mem0-graphiti-bridge/src/__tests__/memory-search-tool.test.ts`

### AC2：Mem0 filters + criteria（shadow 先行，默认不影响用户返回）

- [x] **Shadow 模式请求扩展**：当 `read_mode=shadow` 且 candidate route 为 mem0 时，可在 shadow compare 请求中携带 `filters/criteria`（用户返回仍走 local）。
- [x] **Shadow compare trace**：shadowReporter 记录 `shadow_filters_criteria=true` 用于后续对比报表/追溯。
- [x] **开关冻结**：默认关闭；仅在 `read.mem0_filters_criteria_shadow.enabled=true` 且 `sample_percent>0` 且入参存在 filters/criteria 时启用（并进行 deterministic 采样）。

证据：
- 测试：`extensions/memory-mem0-graphiti-bridge/src/__tests__/memory-search-tool.test.ts`

### AC3：兼容性硬约束（tool 契约不破坏）

- [x] `memory_search` 对外入参保持兼容：仅新增读取可选字段 `filters/criteria`，不引入必填/改名/改类型。
- [x] Remote client `search()` 扩展为可选第二参数（不影响现有单参调用）。

## Evidence Files

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day2/w2-ab-precision-guard-shadow/acceptance.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day2/w2-ab-precision-guard-shadow/vitest.log`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day2/w2-ab-precision-guard-shadow/vitest.exit`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day2/w2-ab-precision-guard-shadow/changed_files.txt`
