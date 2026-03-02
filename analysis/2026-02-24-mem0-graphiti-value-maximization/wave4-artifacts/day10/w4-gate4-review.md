# Wave4 Gate-4 Final Review (W4-D)

Single source of truth (audit anchor):

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-gate4-report.json`

Evidence root (full artifacts):

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/`

## Conclusion

Gate-4 result: **NO-GO**

Reasons (hard gates):

- `memory_search` regression fails on **hyphenated DEC** queries (must be non-empty).
- Gate-4 p95 increase exceeds frozen threshold (`18.9549% > 15%`).
- Gate-4 stability fails (`unique-values != 1` across 10 stability runs).

## Frozen Metrics (from delta json)

- `Top1_avg_delta_pp=74.8` (PASS, threshold `>= 8`)
- `FUR_delta_pp=72.58` (PASS, threshold `>= 10`)
  - Note: FUR is reported as **proxy** (`overall_hit_at_1`) and is explicitly labeled as such.
- `p95_increase_pct=18.9549` (FAIL, threshold `<= 15`)
- `stability_pass=false` (FAIL)
- sample_size_by_bucket:
  - exact_id=30
  - decision_reason=30
  - temporal_relation=34
  - project_context=30

Primary evidence:

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/report/w4-gate4-delta.json`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/report/w4-gate4-review.md`

## Required Tests / Regressions (hard gate)

- extensions vitest: PASS (exit=0)
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/tests/vitest.exit`
- W2 Gate-2 minimal regression: PASS (exit=0)
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/gate2-regression/w2-gate2-minimal-verify.exit`
- W3 Gate-3 minimal regression: PASS (exit=0)
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/gate3-regression/w3-gate3-minimal-verify.exit`

## memory_search Regression (new hard gate)

Result: FAIL

- Control queries return non-empty in tool/bridge chain, but **hyphenated DEC** queries are empty while the space-separated control is non-empty.

Primary evidence:

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/memory-search-regression/summary.json`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/memory-search-regression/acceptance.md`

## Minimal Fix Plan (do not implement in W4-D)

1. Fix hyphenated DEC query normalization:
   - Make `DEC-YYYY-MM-DD-*` tokenize equivalently to whitespace separators across CLI/tool/bridge.
2. Reduce p95 regression:
   - Identify p95 contribution per provider and reduce unnecessary provider calls (or tighten fusion bucket policy).
3. Eliminate stability jitter:
   - Remove non-deterministic ordering/ties and reduce timeout/fallback variance; ensure a single stable route for repeated runs.

## Reproduce (suggested)

From repo root:

```bash
# Gate-4 eval (baseline vs variant)
bun analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/scripts/run-w4-d-gate4-eval.ts

# memory_search regression (L1 CLI + L1 localTool + L2 bridge local/primary)
bun analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/scripts/run-memory-search-regression.ts

# required tests
pnpm -s vitest run --config vitest.extensions.config.ts extensions/memory-mem0-graphiti-bridge/src/__tests__
```
