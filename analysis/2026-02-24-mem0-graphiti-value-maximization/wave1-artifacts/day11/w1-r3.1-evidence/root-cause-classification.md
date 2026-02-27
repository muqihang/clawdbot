# W1-R3.1 Root-Cause Classification

- owner: `A (Implementer)`
- scope: `W1-R3.1 only`
- generated_at_utc: `2026-02-27T09:02:00Z`

## classification

- primary: `QUERY_PATH`
- secondary: `RANKING_ORDER`
- combined_type: `QUERY_PATH + RANKING_ORDER`

## evidence

- query-path mismatch evidence (`getById` path support mismatch):
  - Graphiti OpenAPI path list contains `/search` but does not expose `/items/{id}`:
    - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/root-cause-graphiti-openapi-paths.json:1`
  - Mem0 OpenAPI path list uses `/memories/{memory_id}` and `/search`:
    - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/root-cause-mem0-openapi-paths.json:1`
  - Existence matrix shows all expected IDs unresolved via current `getById` pathing (graphiti + mem0 all false):
    - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/root-cause-existence-matrix.json:20`

- ranking-order evidence:
  - Graphiti top5 includes expected IDs, but they are often not rank1 while all top5 scores are `0` (ties):
    - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/root-cause-top5.json:81`
  - Live retrieval eval during root-cause probe can reach `hit_at_1=0.2`, but repeated gate attempts fall back to `0`, indicating unstable tie-order impact:
    - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/root-cause-live-retrieval-eval.graphiti.json:7`
    - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3.1-evidence/retrieval-attempts-summary.txt:9`

## id_drift_decision

- `ID_DRIFT` is **not** the primary blocker in this round.
- rationale: expected IDs are retrievable in Graphiti top5 for multiple samples, so strict ID remapping is not required before proceeding with code-path fixes.

## fix-path decision

- selected minimal path for Step B: `QUERY_PATH` consistency fix in `retrieval-eval` client base-url fallback defaults.
- status after fix: path consistency improved; Gate metric target still not met because `hit_at_1` remains `0` across bounded 5 attempts in this run.
