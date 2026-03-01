# W3-B Iter-1 Acceptance Receipt

## changed_files

- `extensions/memory-mem0-graphiti-bridge/src/config/flags.ts`
- `extensions/memory-mem0-graphiti-bridge/src/client/mem0-client.ts`
- `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts`
- `extensions/memory-mem0-graphiti-bridge/src/__tests__/flags.test.ts`
- `extensions/memory-mem0-graphiti-bridge/src/__tests__/memory-search-tool.test.ts`
- `extensions/memory-mem0-graphiti-bridge/src/__tests__/fallback-fault-injection.test.ts`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day3/w3-b-focal-temporal/iter-1-focal-node/scripts/run-w3-b-focal-node-eval.ts`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day3/w3-b-focal-temporal/iter-1-focal-node/inputs/*`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day3/w3-b-focal-temporal/iter-1-focal-node/retrieval/baseline/*`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day3/w3-b-focal-temporal/iter-1-focal-node/retrieval/variant/*`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day3/w3-b-focal-temporal/iter-1-focal-node/report/*`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day3/w3-b-focal-temporal/iter-1-focal-node/tests/*`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day3/w3-b-focal-temporal/iter-1-focal-node/gate2-regression/*`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day3/w3-b-focal-temporal/iter-1-focal-node/acceptance.md`

## acceptance_check

- [x] 单变量：仅引入 `graphiti_focal_node`（recipe routing 固定开启，未引入 temporal filters）。
- [x] flag 默认关闭：`read.graphiti_focal_node.enabled=false` 且 `sample_percent=0`，仅 variant 显式 `100%` 开启。
- [x] W2 Gate-2 保护：`exact_id` bucket 下 focal-node degrade（`precision_key_bucket`），不触发 discovery。
- [x] 证据目录完整：`inputs/`、`retrieval/`、`report/`、`tests/`、`gate2-regression/`、`acceptance.md` 全部存在。
- [x] dataset 快照固定：`inputs/retrieval-temporal-dataset.v1.json` 复制自 W3-A day2（34 条，未改内容）。
- [x] bounded/stability 全量落盘：`retrieval/{baseline,variant}/{bounded-01..05,stability-01..10}` 每个 run 均含 `search.raw.*.json` + `search.topk.*.json`。
- [x] raw 请求可审计：`search.raw.*.json` 含 `requestBody`、`search_calls`、`route/recipe/focal_node` trace。
- [x] Gate-3 报告齐全：`report/w3-gate3-baseline-report.json`、`report/w3-gate3-variant-report.json`、`report/w3-gate3-delta.json`、`report/w3-gate3-review.md`。
- [x] 扩展测试通过：`tests/vitest.exit`=`0`（日志：`tests/vitest.log`）。
- [x] W2 Gate-2 最小回归通过：`gate2-regression/w2-gate2-minimal-verify.exit`=`0`（日志：`gate2-regression/w2-gate2-minimal-verify.log`）。

## unresolved

- 无。
