# W4-C Iter-2 Acceptance: 受控启用 fusion primary（预算/权重/兜底）

## changed_files

See `changed_files.txt`.

## acceptance_check

- fusion primary 启用条件（flag 控制）
  - 仅在 `read.fusion.enabled === true` 且 `read_mode in {primary, remote}` 且 `responseRoute !== local` 时启用
  - `read.fusion.enabled` 默认仍为 `false`，默认行为保持不变
- 并行召回 + 约束重排 v1
  - primary/remote 下并行执行 `mem0.search` + `graphiti.search`（local 已先执行）
  - 按四桶映射选择 bucket policy（exact_id / decision_reason / temporal_relation / project_context）
  - 按每源 quota 截断候选，再按 `score * weight` 参与归一化排序与跨源去重
  - 排序仍复用 `normalizeAndRankCandidates()`（确定性 tie-break）
- 最终选路与输出一致性
  - `read.fusion.enabled=true` 时允许替换最终 Top1 来源
  - `details.source` 与 `route.selected_route` 与融合后 Top1 来源一致（local/mem0/graphiti）
- 精度保护与兜底
  - exact-id 命中 local precision guard 时，即使 fusion 开启仍强制 local
  - 任一路 remote 失败时，fusion 仍可由另一路（或 local）完成返回，不崩溃
- 测试与回归
  - 全量 extension tests：`tests/vitest.exit = 0`
  - W2 Gate-2 最小回归：`gate2-regression/w2-gate2-minimal-verify.exit = 0`
- 离线稳定性证据（bounded 5 + stability 10）
  - 评估脚本：`scripts/run-w4-c-primary-enabled-eval.ts`
  - `retrieval/stability-summary.json`:
    - `baseline_top1_unique = 1`
    - `variant_top1_unique = 1`
    - `invariant_top1 = false`（primary 启用后允许改变 Top1）
  - `run.exit = 0`

## unresolved

- None
