# W2 Gate-2 Review (Step 3A: query construction, rerun after env fix)

Gate-2 文案（冻结，不改）：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:145`。

## Evidence Paths

- Gate-2 report (json): `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day14/w2-step3-query-construction-after-env-fix/w2-gate2-report.json`
- Gate-2 report (txt): `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day14/w2-step3-query-construction-after-env-fix/w2-gate2-report.txt`
- Retrieval runs: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day14/w2-step3-query-construction-after-env-fix/retrieval/`
- AB eval: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day14/w2-step3-query-construction-after-env-fix/ab/ab-eval.simulated.json`
- Reconciliation report: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day14/w2-step3-query-construction-after-env-fix/report/reconciliation-report.json`
- OpenAPI snapshots: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day14/w2-step3-query-construction-after-env-fix/openapi/`
- Dataset v1: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/inputs/retrieval-dataset.v1.json`

## Summary

- Conclusion: **No-Go**
- top1_exact_id_proxy (hit@1): 0 (sample_size=34)
- CFP proxy: 0 (baseline=0)
- fallback failure-rate proxy: 0 (failed=0, dead=0)
- stability unique hit@1 values: [0]

## Unresolved

- G4: top1_exact_id_proxy=0 < 0.93
