# W2 Gate-2 Fix Log（单变量迭代记录）

- owner: `Codex CLI`
- started_at_utc: `2026-02-28T06:05:00Z`
- baseline_gate2_report: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/w2-gate2-report.json`
- root_cause_matrix: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/root-cause-matrix.md`
- fix_plan: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/fix-plan.md`

## Iteration table

> 规则：每次只改一个变量；每次改动后必须 bounded 5 + stability 10；所有证据必须给出路径。

| iter | date       | variable           | summary                                                                                                     |  hit@1 |  hit@3 | sample_size | stability_unique_hit@1 | gate2 | evidence_path                                                                                                               |
| ---: | ---------- | ------------------ | ----------------------------------------------------------------------------------------------------------- | -----: | -----: | ----------: | ---------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------- |
|    0 | 2026-02-28 | baseline           | day10 No-Go（仅记录，不改动）                                                                               |    0.0 |    0.2 |           5 | `[0]`                  | No-Go | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/`                                               |
|    1 | 2026-02-28 | plan               | 产出 root-cause matrix + fix plan（未执行修复）                                                             |      - |      - |           - | -                      | -     | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/`                             |
|    2 | 2026-02-28 | DATASET            | dataset 扩到 34（解除 low_confidence）；bounded#1-#4 hit@1=0.0294，但冻结选择规则选 attempt#5（hit@1=0）    |    0.0 | 0.0294 |          34 | `[0.0294,0]`           | No-Go | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/`                             |
|    3 | 2026-02-28 | RANKING_ORDER      | 排序归一化改为 `score→structure→rank→remoteId→path`，并按 remote rank 去重 tie-break（facts 优先）          | 0.6471 | 0.7353 |          34 | `[0.6471]`             | No-Go | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day12/w2-step2-ranking-order/`                        |
|    4 | 2026-02-28 | QUERY_CONSTRUCTION | Graphiti `/search` 请求体改为 `{query,max_facts:50}`（仅改候选容量字段）；raw evidence 记录真实 requestBody |    0.0 |    0.0 |          34 | `[0]`                  | No-Go | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day13/w2-step3-query-construction/`                   |
|    5 | 2026-02-28 | DATASET(v2)        | dataset v1 与当前 Graphiti DB 脱节；改用 `/entity-edge/{uuid}` 可核验的 dataset v2 并重跑（仍需稳定性修复） |    1.0 |    1.0 |          34 | `[1,0.9706]`           | No-Go | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day15/w2-step1-dataset-v2/`                           |
|    6 | 2026-02-28 | RETRY_ON_THROW     | remote client search：对 timeout/unavailable 的 throw 做一次 retry（仍出现 stability-10 多点 empty topK）   |    1.0 |    1.0 |          34 | `[1,0.8235]`           | No-Go | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day16/w2-step4-stability-retry/`                      |
|    7 | 2026-02-28 | STABILITY          | 重跑 Gate-2（bounded 5 + stability 10）；stability hit@1 常量 `[1]`，Gate-2=Go（首次通过）                  |    1.0 |    1.0 |          34 | `[1]`                  | Go    | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day22/w2-step5-retry-timeout-escalation-inline-eval/` |
|    8 | 2026-02-28 | VERIFY             | fresh verify：再次完整重跑 Gate-2（bounded 5 + stability 10）；bounded/stability 全 1，Gate-2=Go            |    1.0 |    1.0 |          34 | `[1]`                  | Go    | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day23/w2-gate2-final-verify/`                         |

## Notes

- 本文件只追加，不覆盖历史记录。
- 达到 Go 后，需要在同目录生成 `w2-master-closure.md`（单点事实 + superseded 归档标记）。
