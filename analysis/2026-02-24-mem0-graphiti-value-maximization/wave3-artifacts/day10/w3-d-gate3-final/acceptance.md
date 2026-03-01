# W3-D Gate-3 Final Acceptance Receipt

## changed_files

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day10/w3-gate3-report.json`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day10/w3-gate3-report.txt`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day10/w3-gate3-review.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day10/w3-master-closure.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day10/w3-d-gate3-final/inputs/*`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day10/w3-d-gate3-final/scripts/*`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day10/w3-d-gate3-final/report/*`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day10/w3-d-gate3-final/retrieval/baseline/*`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day10/w3-d-gate3-final/retrieval/variant/*`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day10/w3-d-gate3-final/tests/*`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day10/w3-d-gate3-final/gate2-regression/*`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day10/w3-d-gate3-final/run-w3-d-gate3-eval.node.log`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day10/w3-d-gate3-final/run-w3-d-gate3-eval.node.exit`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day10/w3-d-gate3-final/acceptance.md`

## acceptance_check

- [x] dataset sample_size >= 30：`inputs/retrieval-temporal-dataset.v1.json` 共 `34` 条。
- [x] bounded_runs=5 + stability_runs=10：见 `inputs/runner-input.snapshot.json`。
- [x] Top1 提升（delta_pp >= 10）：`hit@1 baseline=0 variant=1 delta_pp=100`（见 `report/w3-gate3-delta.json`）。
- [x] episodes coverage 显著提升：baseline=0，variant=1，且满足 `variant >= max(0.20, baseline+0.10)`。
- [x] nodes coverage 显著提升：baseline=0，variant=1，且满足 `variant >= max(0.20, baseline+0.10)`。
- [x] stability（10 runs unique-values=1）：episodes/nodes（并包含 hit@1/hit@3）均满足（见 `report/w3-gate3-delta.json`）。
- [x] runner 产物齐全：`report/w3-gate3-baseline-report.json`、`report/w3-gate3-variant-report.json`、`report/w3-gate3-delta.json` 存在。
- [x] bounded/stability 全量落盘：`retrieval/{baseline,variant}/{bounded-01..05,stability-01..10}` 每个 run 均有 `search.raw.*.json` + `search.topk.*.json`。
- [x] tests 通过：`tests/vitest.log` + `tests/vitest.exit`（exit=`0`）。
- [x] W2 Gate-2 最小回归通过：`gate2-regression/w2-gate2-minimal-verify.log` + `gate2-regression/w2-gate2-minimal-verify.exit`（exit=`0`）。

## unresolved

- 无
