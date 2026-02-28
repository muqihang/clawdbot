# W2 Gate-2 Fix Log（单变量迭代记录）

- owner: `Codex CLI`
- started_at_utc: `2026-02-28T06:05:00Z`
- baseline_gate2_report: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/w2-gate2-report.json`
- root_cause_matrix: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/root-cause-matrix.md`
- fix_plan: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/fix-plan.md`

## Iteration table

> 规则：每次只改一个变量；每次改动后必须 bounded 5 + stability 10；所有证据必须给出路径。

| iter | date       | variable | summary                                                                                                  | hit@1 |  hit@3 | sample_size | stability_unique_hit@1 | gate2 | evidence_path                                                                                   |
| ---: | ---------- | -------- | -------------------------------------------------------------------------------------------------------- | ----: | -----: | ----------: | ---------------------- | ----- | ----------------------------------------------------------------------------------------------- |
|    0 | 2026-02-28 | baseline | day10 No-Go（仅记录，不改动）                                                                            |   0.0 |    0.2 |           5 | `[0]`                  | No-Go | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day10/`                   |
|    1 | 2026-02-28 | plan     | 产出 root-cause matrix + fix plan（未执行修复）                                                          |     - |      - |           - | -                      | -     | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/` |
|    2 | 2026-02-28 | DATASET  | dataset 扩到 34（解除 low_confidence）；bounded#1-#4 hit@1=0.0294，但冻结选择规则选 attempt#5（hit@1=0） |   0.0 | 0.0294 |          34 | `[0.0294,0]`           | No-Go | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/` |

## Notes

- 本文件只追加，不覆盖历史记录。
- 达到 Go 后，需要在同目录生成 `w2-master-closure.md`（单点事实 + superseded 归档标记）。
