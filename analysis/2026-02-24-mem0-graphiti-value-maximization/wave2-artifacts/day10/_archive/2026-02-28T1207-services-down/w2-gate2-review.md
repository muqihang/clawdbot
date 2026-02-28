# W2-D Gate-2 Review

Gate-2 文案（冻结，不改）：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:145`。

## Evidence Paths

- Gate-2 report (json): `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/w2-gate2-report.json`
- Gate-2 report (txt): `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/w2-gate2-report.txt`
- Retrieval runs: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/retrieval/`
- AB eval: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/ab/ab-eval.simulated.json`
- Reconciliation report: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/report/reconciliation-report.json`
- OpenAPI snapshots: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/openapi/`

## Summary

- Conclusion: **No-Go**
- top1_exact_id_proxy (hit@1): 0 (sample_size=5)
- CFP proxy: 0 (baseline=0)
- fallback failure-rate proxy: 0 (failed=0, dead=0)
- stability unique hit@1 values: [0]
- OpenAPI probe: `openapi/graphiti-openapi.exit=1` + `openapi/mem0-openapi.exit=1` (`fetch failed`) ⇒ remote services unreachable at default base URLs, so retrieval hits were empty.

## Unresolved

- G2: low_confidence (sample_size=5 < 30)
- G4: top1_exact_id_proxy=0 < 0.93
- env: Graphiti/Mem0 OpenAPI probe failed (see `openapi/*.err`). Bring up the memory stack and rerun `run-w2-gate2-eval.ts` to capture non-empty raw payloads + topK.
