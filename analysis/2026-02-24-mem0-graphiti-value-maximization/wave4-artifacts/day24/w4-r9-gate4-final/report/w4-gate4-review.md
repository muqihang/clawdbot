# W4-D Gate-4 Runner Review Notes

## Single Variable (frozen discipline)

- baseline: `read.fusion.enabled=false`
- variant: `read.fusion.enabled=true`
- all other bridge flags are identical (loaded from `~/.openclaw/openclaw.json` plugin entry).

## Scoring (frozen formula)

- Per bucket: `hit_at_1(bucket) = matched_top1 / sample_size(bucket)` (sample queries only; aliases are audit-only).
- `avg_hit_at_1 = mean_over_buckets(hit_at_1(bucket))`
- `top1_avg_delta_pp = (avg_hit_at_1_variant - avg_hit_at_1_baseline) * 100`
- FUR proxy: `fur_proxy = overall_hit_at_1` (explicit proxy; see delta json).
- `p95_increase_pct = ((p95_total_variant_ms - p95_total_baseline_ms) / p95_total_baseline_ms) * 100`
- Dedupe (aligned with dataset-notes): within each bucket, `expected_ids[0]` and `query` are de-duped for scoring (see `metrics.dedupe.json` per run).

## Parsing Top1 remoteId

- Tool results emit `path` like `bridge/<source>/<remoteId>`; runner extracts remoteId using the last path segment.

## TopK normalization / tie-break

- Runner preserves tool/provider result order and only truncates to TOP_K; no additional tie-break is applied beyond the upstream ordering.

## Evidence layout

- dataset snapshot: /Users/muqihang/chelingxi_workspace/clawdbot/analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day24/w4-r9-gate4-final/inputs/retrieval-gate4-dataset.v1.snapshot.json
- openapi: /Users/muqihang/chelingxi_workspace/clawdbot/analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day24/w4-r9-gate4-final/openapi
- retrieval: /Users/muqihang/chelingxi_workspace/clawdbot/analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day24/w4-r9-gate4-final/retrieval
- latency samples: /Users/muqihang/chelingxi_workspace/clawdbot/analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day24/w4-r9-gate4-final/latency/latency.samples.jsonl
- reports: /Users/muqihang/chelingxi_workspace/clawdbot/analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day24/w4-r9-gate4-final/report

## Outputs (quick numbers)

- top1_avg_delta_pp=0
- fur_delta_pp=0
- p95_increase_pct=6.8525
- stability_pass=true
