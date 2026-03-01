# W2 Gate-2 Review (Step 3A: query construction)

Gate-2 文案（冻结，不改）：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:145`。

## Evidence Paths

- Gate-2 report (json): `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day15/w2-step1-dataset-v2/w2-gate2-report.json`
- Gate-2 report (txt): `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day15/w2-step1-dataset-v2/w2-gate2-report.txt`
- Retrieval runs: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day15/w2-step1-dataset-v2/retrieval/`
- AB eval: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day15/w2-step1-dataset-v2/ab/ab-eval.simulated.json`
- Reconciliation report: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day15/w2-step1-dataset-v2/report/reconciliation-report.json`
- OpenAPI snapshots: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day15/w2-step1-dataset-v2/openapi/`
- Dataset v1: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day15/w2-step1-dataset-v2/inputs/retrieval-dataset.v2.json`

## Summary

- Conclusion: **No-Go**
- top1_exact_id_proxy (hit@1): 1 (sample_size=34)
- CFP proxy: 0 (baseline=0)
- fallback failure-rate proxy: 0 (failed=0, dead=0)
- stability unique hit@1 values: [1,0.9706]

## Unresolved

- stability: hit_at_1 varied across runs: [1,0.9706]

## Stability Drilldown（定位单点 miss）

- miss run: `retrieval/stability-06/`（hit@1=0.9706 = 33/34）
- miss sample: `g2v2-depends-on-3b4474d0`
- miss symptom: topK 为空（该样本命中被计为 miss）
  - empty topK evidence: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day15/w2-step1-dataset-v2/retrieval/stability-06/graphiti/search.topk.sample.g2v2-depends-on-3b4474d0.json`
- upstream request evidence 缺失（推断为 fetch throw：timeout / connection / abort；因为 runner 只有在收到 response 时才会落盘 raw）
  - missing raw evidence: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day15/w2-step1-dataset-v2/report/stability-empty-topk-missing-raw-check.txt`
  - empty topK scan list: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day15/w2-step1-dataset-v2/report/stability-empty-topk-hits.txt`
