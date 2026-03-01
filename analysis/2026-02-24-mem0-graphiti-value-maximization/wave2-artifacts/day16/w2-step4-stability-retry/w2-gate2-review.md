# W2 Gate-2 Review (Step 3A: query construction)

Gate-2 文案（冻结，不改）：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:145`。

## Evidence Paths

- Gate-2 report (json): `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day16/w2-step4-stability-retry/w2-gate2-report.json`
- Gate-2 report (txt): `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day16/w2-step4-stability-retry/w2-gate2-report.txt`
- Retrieval runs: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day16/w2-step4-stability-retry/retrieval/`
- AB eval: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day16/w2-step4-stability-retry/ab/ab-eval.simulated.json`
- Reconciliation report: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day16/w2-step4-stability-retry/report/reconciliation-report.json`
- OpenAPI snapshots: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day16/w2-step4-stability-retry/openapi/`
- Dataset v1: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day16/w2-step4-stability-retry/inputs/retrieval-dataset.v2.json`

## Summary

- Conclusion: **No-Go**
- top1_exact_id_proxy (hit@1): 1 (sample_size=34)
- CFP proxy: 0 (baseline=0)
- fallback failure-rate proxy: 0 (failed=0, dead=0)
- stability unique hit@1 values: [1,0.8235]

## Unresolved

- stability: hit_at_1 varied across runs: [1,0.8235]

## Stability Drilldown（定位单点 miss 集合）

- miss run: `retrieval/stability-10/`（hit@1=0.8235 = 28/34）
- miss symptom: 多个样本 topK 为空（runner 计为 miss）
  - empty topK scan list: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day16/w2-step4-stability-retry/report/stability-empty-topk-hits.txt`
- upstream request evidence 缺失（推断为 fetch throw：timeout / connection / abort；因为 runner 只有在收到 response 时才会落盘 raw）
  - missing raw check: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day16/w2-step4-stability-retry/report/stability-empty-topk-missing-raw-check.txt`
