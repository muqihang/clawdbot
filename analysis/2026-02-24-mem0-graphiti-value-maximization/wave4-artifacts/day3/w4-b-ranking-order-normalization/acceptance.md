# W4-B Acceptance: 候选归一化去重与确定性排序（跨源）

## changed_files

See `changed_files.txt`.

## acceptance_check

- normalize helper
  - Adds `normalizeAndRankCandidates()` helper (route-agnostic) with deterministic ranking + dedupe
  - Dedupe key: `remoteId.trim().toLowerCase()` (cross-source)
  - Tie-break (total order): `score desc` → `source (local > mem0 > graphiti)` → `path (lower, then raw)` → `remoteId (lower, then raw)` → `original_index`
  - Debug output includes `topk`, `dedupe.collisions`, `tie` (all_zero/all_same_score), and `score_source_counts`
- score source auditing
  - `BridgeSearchHit.score_source?: "score" | "rank_score" | "missing"` is populated by `parseSearchHit()` (no score math changes)
- memory_search trace wiring (shadow-only)
  - Only active when `read_mode === "shadow"` + `read.fusion.shadow_enabled === true` + `candidateRoute !== "local"`
  - Still returns local output (`details.source === "local"`, `details.results` unchanged)
  - Adds to `details.fusion_shadow`:
    - `normalized_topk` (remote_id/path/score/score_source/source)
    - `tie` (explicit all-zero / all-same-score flags)
    - `dedupe.collisions` (cross-source same remoteId audit trace)
    - `score_source_counts`
- Tests
  - Full extension vitest: `tests/vitest.exit` = 0
  - W2 Gate-2 minimal regression: `gate2-regression/w2-gate2-minimal-verify.exit` = 0
- Offline evidence (baseline vs variant determinism)
  - bounded 5 + stability 10 via `scripts/run-w4-b-ranking-order-eval.ts`
  - `retrieval/stability-summary.json`
    - `baseline_top1_unique > 1` (legacy top1 jitters on ties)
    - `variant_top1_unique = 1` (normalize helper is deterministic)
    - `invariant_top1 = true`
  - `run.exit` = 0

## unresolved

- None
