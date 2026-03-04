# Wave4 Master Closure (Day19 / W4-R5)

Final single-point fact:

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-gate4-report.json`

## Final Decision

**NO-GO**

## Why

- memory_search regression 硬门禁失败（DEC-xxxx 连字符查询在 L2 primary 为空）。
- 按门禁策略，未进入 Gate-4 bounded(5)+stability(10) runner。

## Policy Lock (已落实)

- 向量统一：阿里云 `text-embedding-v4@1536`
- 禁止向量端点：`127.0.0.1:18082`
- LLM 固定：`gpt-5.3-codex`（Sub2API `/v1/responses`）

## Evidence

- evidence_dir: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day19/w4-r5-gate4-aliyun-1536`
- no-go summary: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day19/w4-r5-gate4-aliyun-1536/report/no-go-summary.json`
- memory_search summary: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day19/w4-r5-gate4-aliyun-1536/memory-search-regression/summary.json`
- neo4j dims before/after:
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day19/w4-r5-gate4-aliyun-1536/preflight/neo4j.embedding-dims.before.txt`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day19/w4-r5-gate4-aliyun-1536/preflight/neo4j.embedding-dims.after.txt`

## Next Action

- 先修复 hyphenated DEC 查询召回，再重跑 memory_search regression；硬门禁通过后再跑 Gate-4 runner 并刷新 delta/p95/stability 指标。
