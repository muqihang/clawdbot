# W3 Gate-3 Final Review (Day10)

## 冻结目标（Gate-3）

来源：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md`

- Gate-3：时序关系桶 Top1 提升 >= 10pp，episodes/nodes 非零覆盖显著提升。

冻结口径：

- dataset sample_size >= 30
- bounded_runs=5，stability_runs=10
- delta_pp = (hit@1_variant - hit@1_baseline) \* 100，要求 >= 10
- 覆盖显著提升（双阈值）：
  - episodes_variant >= max(0.20, episodes_baseline + 0.10)
  - nodes_variant >= max(0.20, nodes_baseline + 0.10)
  - stability 10 次 unique values 各自必须为 1（episodes/nodes 必须；建议 hit@1/hit@3 也统计）
- W2 Gate-2 不回退：跑最小回归用例，exit=0

## 结论

- Gate-3：**GO**
- 单点事实锚点：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day10/w3-gate3-report.json`

## 指标摘要

- sample_size=34（>=30）
- hit@1: baseline=0 / variant=1 / delta_pp=100（>=10）
- hit@3: baseline=0 / variant=1
- episodes_nonzero_coverage: baseline=0 / variant=1
- nodes_nonzero_coverage: baseline=0 / variant=1
- stability unique values（10 runs）：baseline/variant 各指标 unique-values=1
- tests exit=0；W2 Gate-2 minimal regression exit=0

## baseline vs variant 开关差异

- baseline：recipe/focal/temporal 全关闭，ontology_readback 关闭。
- variant：recipe/focal/temporal 全开启，ontology_readback 关闭（本轮 Gate-3 不评 ontology readback）。

## 证据结构

- evidence_root：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day10/w3-d-gate3-final/`
- bounded/stability：`retrieval/{baseline,variant}/{bounded-01..05,stability-01..10}/`
- 每次 run：落盘 `search.raw.*.json` + `search.topk.*.json`
- tests：`tests/`
- W2 Gate-2 最小回归：`gate2-regression/`
