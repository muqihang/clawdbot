# Sync Smoke 执行记录（2026-02-25）

## 1) 执行元信息

- executor: `子代理 #W0-07-Implementer（Wave 0 Day3）`
- run_date: `2026-02-25`
- timezone: `UTC` + `UTC+08:00`
- started_at (UTC): `2026-02-25T07:18:18Z`
- started_at (UTC+08:00): `2026-02-25T15:18:18+08:00`
- ended_at (UTC): `2026-02-25T07:21:58Z`
- ended_at (UTC+08:00): `2026-02-25T15:21:58+08:00`
- duration: `220s`（`3.67` 分钟）

## 2) S1-S5 实际执行记录

| Step                                | status | used_command | exit_code | 关键输出摘要                                                                                                                                                                                                                          | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------- | ------ | ------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 依赖与类型检查                   | `fail` | `fallback`   | `nonzero` | `pnpm install` 首次失败（`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`）；重试 `CI=true pnpm install` 失败（`ERR_PNPM_OUTDATED_LOCKFILE`）；`pnpm tsgo` 报 TS 错误且重试时不可用；fallback `node .../tsgo.js` 失败（module missing）。 | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-s1.log:6`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-s1.log:74`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-s1.log:110`                                                                                                                        |
| S2 bridge 最小单测集合              | `fail` | `fallback`   | `nonzero` | `pnpm vitest` 不可用（`Command "vitest" not found`），触发 fallback；fallback `node node_modules/vitest/vitest.mjs ...` 失败（module missing）。                                                                                      | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-s2.log:10`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-s2.log:30`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-s2.log:32`                                                                                                                        |
| S3 P3 CLI 合约 smoke                | `fail` | `primary`    | `nonzero` | `index-check/report/rollback-hints` 三条命令均执行，但统一报错 `openclaw: missing dist/entry.(m)js`；report 产物 JSON/TXT 均未生成。                                                                                                  | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-s3.log:13`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-s3.log:52`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-s3.log:55`                                                                                                                        |
| S4 自托管栈健康检查 + nodes 校验    | `pass` | `primary`    | `0`       | `status.sh` / `smoke.sh` 均成功；`smoke.sh` 未直接输出 nodes，因此追加执行强制 nodes 查询，返回 `nodes=10`，满足 `nodes>=1`。                                                                                                         | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-s4.log:7`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-s4.log:21`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-s4.log:24`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-s4-nodes.json:4` |
| S5 retrieval-eval（有数据集时执行） | `skip` | `skip`       | `n/a`     | 本机不存在 `~/.openclaw/memory-bridge-p3-retrieval-dataset.json`，按规则跳过并显式写 `skip_reason=dataset_missing`。                                                                                                                  | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-s5.log:5`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-s5.log:7`                                                                                                                                                                                                                                            |

## 3) 60 分钟约束核验

- 计算口径：`S1.started_utc -> S5.ended_utc`
- 实际耗时：`3.67` 分钟
- 判定：`pass`（`<=60` 分钟）

## 4) 结论（唯一）

`overall_result = fail`

失败原因归并：

1. `S1` 未通过（依赖安装/类型检查链路失败，且兜底命令无法恢复）。
2. `S2` 未通过（vitest 主命令不可用，fallback 二进制缺失）。
3. `S3` 未通过（`dist/entry.(m)js` 缺失导致 P3 CLI 合约 smoke 全失败）。

说明：尽管 `S4=pass` 且总时长满足 60 分钟约束，但整套 smoke 仍按失败判定，不可放行。
