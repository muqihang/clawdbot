# W1-E Gate-1 Final Receipt (Day11)

- owner: `A (Implementer)`
- scope: `W1-R3.1 finalization (no Gate formula/threshold/baseline changes)`
- execution_date_utc: `2026-02-27`

## summary

- Root-cause typing completed and persisted under `w1-r3.1-evidence`.
- QUERY_PATH minimal fix landed for retrieval-eval base URL defaults.
- Focused retrieval-eval tests added and verified with TDD red/green evidence.
- Bounded retrieval attempts (max=5) completed with command-compat policy.
- Final selected retrieval has `hit_at_1=0`, so Gate-1 remains `No-Go`.

## gate_recompute

- `fur_improvement_pp = (fur_current - fur_baseline) * 100 = (0 - 0) * 100 = 0`
- `p95_degradation_pct = ((47 - 44) / 44) * 100 = 6.818181818181818`
- threshold rule unchanged: `fur_improvement_pp >= 6 && p95_degradation_pct <= 10`
- final verdict: `No-Go`

## code_fix_anchors

- retrieval-eval default base URLs:
  - `extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:592`
  - `extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:593`
  - `extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:600`
  - `extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts:606`

## test_anchors

- added focused defaults tests:
  - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-manual-cli-path-resolution.test.ts:122`
  - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-manual-cli-path-resolution.test.ts:203`
- TDD red evidence:
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/stepb-tdd-red-vitest.summary.txt:4`
- TDD green evidence:
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/stepb-tdd-green-vitest.summary.txt:6`

## evidence_anchors

- root-cause classification:
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/root-cause-classification.md:1`
- runtime exits:
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/final-live-summary.txt:1`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/final-live-summary.txt:2`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/final-live-summary.txt:3`
- retrieval attempts and selection:
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/retrieval-attempts-summary.txt:9`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/retrieval-attempts-summary.txt:17`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/retrieval-attempts-summary.txt:25`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/retrieval-attempts-summary.txt:33`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/retrieval-attempts-summary.txt:41`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/retrieval-summary.txt:5`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/retrieval-summary.txt:6`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/retrieval-eval.json:7`

## changed_files

- `extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts`
- `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-manual-cli-path-resolution.test.ts`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/root-cause-classification.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-execution-review.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-e-gate1-final-report.json`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-e-gate1-final-receipt.md`

## acceptance

- acceptance_check: `fail`
- unresolved:
  - code: `BLOCKER-R3-RET-HIT1-000`
  - reason: retrieval attempts 1~5 all `hit_at_1=0`
  - minimal next executable fix: implement deterministic ranking normalization + focused tie-score test + bounded re-run.
