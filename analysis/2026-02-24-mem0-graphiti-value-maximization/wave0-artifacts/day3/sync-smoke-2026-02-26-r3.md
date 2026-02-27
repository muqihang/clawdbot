# Sync Smoke 执行记录（2026-02-26 r3）

## 1) 执行元信息

- executor: `子代理 #W0-U2-Implementer（解除 No-Go-P2 + r3 复跑）`
- run_id: `r3`
- run_date: `2026-02-26`
- timezone: `UTC` + `UTC+08:00`
- started_at (UTC): `2026-02-26T03:10:03Z`
- started_at (UTC+08:00): `2026-02-26T11:10:03+08:00`
- ended_at (UTC): `2026-02-26T03:14:55Z`
- ended_at (UTC+08:00): `2026-02-26T11:14:55+08:00`
- duration: `292s`（`4.87` 分钟）

## 2) S1-S5 实际执行记录

| Step                                | status | used_command | exit_code | fallback_trigger                    | 关键输出摘要                                                                                             | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------- | ------ | ------------ | --------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 依赖与类型检查                   | `pass` | `fallback`   | `0`       | `install_no_tty_or_frozen_lockfile` | `pnpm install` 首次命中 no-TTY，按 runbook 触发 `CI=true pnpm install`；随后 `pnpm tsgo` 退出 `0`。      | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s1.log:6`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s1.log:126`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s1.log:130`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s1.log:133`                                                                                                                                                                                                                                                      |
| S2 bridge 最小单测集合              | `pass` | `primary`    | `0`       | `not_used`                          | 使用 `vitest.extensions.config.ts` 执行 6 个测试文件，`21/21` 全通过。                                   | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s2.log:15`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s2.log:16`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s2.log:23`                                                                                                                                                                                                                                                                                                                                                                             |
| S3 P3 CLI 合约 smoke                | `pass` | `primary`    | `0`       | `not_used`                          | `index-check / report / rollback-hints` 全部退出 `0`；`report` 使用绝对路径输出，JSON/TXT 均存在且非空。 | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s3.log:24`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s3.log:43`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s3.log:64`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s3.log:65`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s3-report.json:2`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s3-report.txt:1` |
| S4 自托管栈健康检查 + nodes 校验    | `pass` | `primary`    | `0`       | `not_used`                          | `status.sh` / `smoke.sh` 均成功；追加查询得到 `nodes=10`，满足 `nodes>=1`。                              | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s4.log:7`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s4.log:12`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s4.log:23`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s4-nodes.json:4`                                                                                                                                                                                                                                                   |
| S5 retrieval-eval（有数据集时执行） | `skip` | `skip`       | `n/a`     | `dataset_missing`                   | 本机不存在 retrieval dataset，按规则跳过并显式写 `skip_reason=dataset_missing`。                         | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s5.log:5`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s5.log:8`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s5.log:10`                                                                                                                                                                                                                                                                                                                                                                               |

## 3) 60 分钟约束核验

- 计算口径：`S1.started_utc -> S5.ended_utc`
- 实际耗时：`4.87` 分钟
- 判定：`pass`（`<=60` 分钟）

## 4) 闭环判定（唯一）

- `closure_mode = closed_pass_path`
- `overall_result = pass`

No-Go 前置解除结论（仅 U1/U2）：

1. `No-Go-P1` 已解除：`S1.status=pass`，且 `pnpm tsgo` 退出码 `0`。
2. `No-Go-P2` 已解除：`S3.status=pass`，且 report JSON/TXT 非空。

对应状态机证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/sync-smoke-2026-02-26-r3.status.json:11`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/sync-smoke-2026-02-26-r3.status.json:35`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/sync-smoke-2026-02-26-r3.status.json:74`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/sync-smoke-2026-02-26-r3.status.json:80`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/sync-smoke-2026-02-26-r3.status.json:86`

## 5) 仍未闭环项（保持 Gate `No-Go`）

- U3：W0->W1 前提纠偏闭环证据未完成。
- U4：fallback 规范 + 故障注入冻结证据未完成。
- U5：指标口径字典 v1 签字证据未完成。

因此本次 r3 仅证明 U1/U2 已解除，Gate 总结论仍保持 `No-Go`（直至 U3/U4/U5 完成）。
