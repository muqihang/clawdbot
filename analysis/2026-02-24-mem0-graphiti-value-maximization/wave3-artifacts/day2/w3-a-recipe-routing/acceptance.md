# W3-A Acceptance Receipt

## changed_files

- `extensions/memory-mem0-graphiti-bridge/src/router/read-router.ts`
- `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts`
- `extensions/memory-mem0-graphiti-bridge/src/config/flags.ts`
- `extensions/memory-mem0-graphiti-bridge/src/__tests__/read-router.test.ts`
- `extensions/memory-mem0-graphiti-bridge/src/__tests__/memory-search-tool.test.ts`
- `extensions/memory-mem0-graphiti-bridge/src/__tests__/flags.test.ts`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day2/w3-a-recipe-routing/scripts/build-temporal-dataset.ts`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day2/w3-a-recipe-routing/scripts/verify-temporal-dataset-ground-truth.ts`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day2/w3-a-recipe-routing/scripts/run-w3-a-recipe-routing-eval.ts`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day2/w3-a-recipe-routing/inputs/*`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day2/w3-a-recipe-routing/retrieval/baseline/*`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day2/w3-a-recipe-routing/retrieval/variant/*`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day2/w3-a-recipe-routing/report/*`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day2/w3-a-recipe-routing/tests/*`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day2/w3-a-recipe-routing/gate2-regression/*`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day2/w3-a-recipe-routing/dataset-notes.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day2/w3-a-recipe-routing/acceptance.md`

## acceptance_check

- [x] dataset >= 30：`inputs/retrieval-temporal-dataset.v1.json` 共 `34` 条（全部 `bucket=temporal_relation`）。
- [x] ground truth 核验通过：`inputs/retrieval-temporal-dataset.verify.log`（`passed: true`，expected_ids 传递性对齐 Wave2 Day23 已核验 ID 集）。
- [x] runner 证据齐全：`report/w3-gate3-baseline-report.json`、`report/w3-gate3-variant-report.json`、`report/w3-gate3-delta.json`、`report/w3-gate3-review.md` 全部存在。
- [x] bounded/stability 全量落盘：`retrieval/{baseline,variant}/{bounded-01..05,stability-01..10}` 每个 run 均有 `search.raw.*.json` + `search.topk.*.json`。
- [x] coverage 口径计算：`report/w3-gate3-delta.json` 含 `hit@1_baseline/variant/delta_pp`、episodes/nodes coverage baseline/variant、stability unique values。
- [x] W2 Gate-2 不回退（等价最小验证）：`gate2-regression/w2-gate2-minimal-verify.log` + `gate2-regression/w2-gate2-minimal-verify.exit`（exit=`0`）。
- [x] tests 通过：`tests/vitest.log` + `tests/vitest.exit`（exit=`0`）。

## unresolved

- 本轮 Gate-3 仅输出 W3-A 对比证据（mock replay stack）；不做最终 Gate-3 Go/No-Go 结论（W3-D out-of-scope）。
