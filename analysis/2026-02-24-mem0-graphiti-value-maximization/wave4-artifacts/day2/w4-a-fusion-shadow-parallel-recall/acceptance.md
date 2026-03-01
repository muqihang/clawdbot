# W4-A Acceptance: fusion shadow 并行召回（shadow-only）

## changed_files

See `changed_files.txt`.

## acceptance_check

- Flags
  - `read.fusion.shadow_enabled` default = `false`
  - `resolveBridgeFlags()` supports both `shadow_enabled` and `shadowEnabled`
- memory_search tool
  - Only enabled when `read_mode === "shadow"` + `read.fusion.shadow_enabled === true` + `candidateRoute !== "local"`
  - Mem0 + Graphiti remote search runs in parallel (`Promise.all`) in fusion shadow mode
  - Final output remains local (`details.source === "local"`, `details.results` unchanged)
  - Adds `details.fusion_shadow` trace fields (enabled + per-source attempted/hit_count/latency_ms/error_kind)
  - No changes to shadowReporter schema (tool-only trace)
- Tests
  - Full extension vitest: `tests/vitest.exit` = 0
  - W2 Gate-2 minimal regression: `gate2-regression/w2-gate2-minimal-verify.exit` = 0
- Offline replay
  - bounded 5 + stability 10 via `scripts/run-w4-a-fusion-shadow-eval.ts`
  - `retrieval/stability-summary.json` shows baseline/variant Top1 path stability (unique values = 1)
  - `run.exit` = 0

## unresolved

- None
