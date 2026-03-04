# Wave4 Gate-4 Review (W4-R5 / Day19)

Single source of truth:

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-gate4-report.json`

Evidence root:

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day19/w4-r5-gate4-aliyun-1536/`

## 本轮执行结果

- **NO-GO**
- 阻断位置：`D) memory_search regression` 硬门禁
- 按执行约束，硬门禁失败后停止 Gate-4 runner（不进入 bounded/stability）

## 已确认策略与运行状态

- embeddings 全链路统一为阿里云：`text-embedding-v4@1536`
- `127.0.0.1:18082` 已禁用为向量端点（start 脚本策略 + 运行状态均未启动 embeddings 子进程）
- LLM 使用 `gpt-5.3-codex`，网关基址 `http://127.0.0.1:18081/v1`（Responses API）
- graphiti `/search` ping before/after re-embed 均 `HTTP 200`
- mem0 `/search` ping `HTTP 200`

## Neo4j 向量维度取证（重算前后）

- 目标 group（实际发现）：
  - `openclaw-backfill-canonical`
  - `agent_main_main`
- before 采样：节点 `name_embedding` 与边 `fact_embedding` 均为 `1536`
- 执行重算写回（不改 UUID）：
  - nodes: `297`
  - edges: `317`
- after 采样：节点/边维度仍均为 `1536`

证据：

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day19/w4-r5-gate4-aliyun-1536/preflight/neo4j.embedding-dims.before.txt`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day19/w4-r5-gate4-aliyun-1536/preflight/neo4j.embedding-dims.after.txt`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day19/w4-r5-gate4-aliyun-1536/stack/neo4j.reembed.log`

## 硬门禁失败细节（memory_search regression）

- `hyphen-01`: `DEC-2026-02-21-main-role-boundary` → L2 primary `results_count=0`
- `hyphen-02`: `DEC-2026-02-22-documentation-first-freeze` → L2 primary `results_count=0`

证据：

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day19/w4-r5-gate4-aliyun-1536/memory-search-regression/summary.json`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day19/w4-r5-gate4-aliyun-1536/memory-search-regression/acceptance.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day19/w4-r5-gate4-aliyun-1536/report/no-go-summary.json`

## 回归测试状态

- extensions vitest: PASS (`tests/vitest.exit = 0`)
- W2 Gate-2 minimal: PASS (`gate2-regression/w2-gate2-minimal-verify.exit = 0`)
- W3 Gate-3 minimal: PASS (`gate3-regression/w3-gate3-minimal-verify.exit = 0`)

## Gate-4 指标

- Top1/FUR/p95/stability：**N/A（未执行）**
- 原因：memory_search 硬门禁失败后按策略停止 Gate-4 runner
