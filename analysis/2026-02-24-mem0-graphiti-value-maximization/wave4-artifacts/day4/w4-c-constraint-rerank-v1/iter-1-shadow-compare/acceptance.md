# W4-C Iter-1 Acceptance: shadow compare + source-aware citation（不改最终输出）

## changed_files

See `changed_files.txt`.

## acceptance_check

- flags 扩展（默认行为保持关闭）
  - 新增 `read.fusion.enabled`（默认 `false`）
  - 新增 `read.fusion.bucket_policy`（默认 `conservative`）
  - `resolveBridgeFlags()` 支持 snake_case + camelCase：
    - `read.fusion.shadow_enabled` / `shadowEnabled`
    - `read.fusion.bucket_policy` / `bucketPolicy`
- source-aware citation（仅 remote hit 映射）
  - `mapBridgeHitsToMemoryResults()` 不再把 remote `source` 写死为 `"memory"`
  - remote payload `results[*].source` 现在透传命中来源：`"mem0"` / `"graphiti"`
  - local tool 原样输出仍保持 `"memory"`
- shadow compare trace 扩展（仍返回 local）
  - 仅在 `read_mode === "shadow"` + `candidateRoute != "local"` + `read.fusion.shadow_enabled=true` 出现 `details.fusion_shadow`
  - `fusion_shadow` 新增并可审计：
    - `bucket`（四桶之一：exact_id/decision_reason/temporal_relation/project_context）
    - `bucket_policy`（策略名 + per-source quota/weight + strategy）
    - `candidate_breakdown`（per-source hit_count / quota / after_quota_count）
  - 保留 `normalized_topk` / `tie` / `dedupe` / `score_source_counts`
  - shadow 模式最终输出不变：`details.source === "local"`，`details.results` 仍走 local
- 测试与回归
  - 全量 extension tests：`tests/vitest.exit = 0`
  - W2 Gate-2 最小回归：`gate2-regression/w2-gate2-minimal-verify.exit = 0`
- 离线稳定性证据（bounded 5 + stability 10）
  - 评估脚本：`scripts/run-w4-c-shadow-compare-eval.ts`
  - `retrieval/stability-summary.json`:
    - `baseline.top1_paths_unique = 1`
    - `variant.top1_paths_unique = 1`
    - `invariant_top1 = true`
  - `run.exit = 0`

## unresolved

- None
