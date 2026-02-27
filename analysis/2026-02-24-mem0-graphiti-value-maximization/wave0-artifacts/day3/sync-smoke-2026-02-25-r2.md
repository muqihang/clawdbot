# Sync Smoke 执行记录（2026-02-25 r2）

## 1) 执行元信息

- executor: `子代理 #W0-07-Implementer-Fix1（Wave 0 Day3）`
- run_id: `r2`
- run_date: `2026-02-25`
- timezone: `UTC` + `UTC+08:00`
- started_at (UTC): `2026-02-25T09:16:40Z`
- started_at (UTC+08:00): `2026-02-25T17:16:40+08:00`
- ended_at (UTC): `2026-02-25T09:23:16Z`
- ended_at (UTC+08:00): `2026-02-25T17:23:16+08:00`
- duration: `396s`（`6.60` 分钟）

## 2) S1-S5 实际执行记录

| Step                                | status | used_command | exit_code | fallback_trigger                                        | 关键输出摘要                                                                                                                                                             | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ------ | ------------ | --------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 依赖与类型检查                   | `fail` | `fallback`   | `1`       | `install_no_tty_or_frozen_lockfile`                     | `pnpm install` 首次命中 no-TTY，fallback `CI=true pnpm install` 成功；`pnpm tsgo` 仍返回 TS 错误，步骤失败。                                                             | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s1.log:6`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s1.log:183`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s1.log:234`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s1.log:238`                                                                                                                    |
| S2 bridge 最小单测集合              | `pass` | `primary`    | `0`       | `not_used`                                              | 改用 `vitest.extensions.config.ts` 后，6 个文件、21 个测试全部通过。                                                                                                     | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s2.log:15`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s2.log:23`                                                                                                                                                                                                                                                                                                                                                                |
| S3 P3 CLI 合约 smoke                | `fail` | `primary`    | `1`       | `not_triggered_primary_available_non_unavailable_error` | `index-check` 与 `rollback-hints` 成功；`report` 因 `EPERM`（创建目录失败）退出 `1`，report JSON/TXT 未生成；fallback 未触发（`primary` 可用且失败类型非“命令不可用”）。 | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s3.log:21`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s3.log:30`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s3.log:36`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s3.log:57`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s3.log:64` |
| S4 自托管栈健康检查 + nodes 校验    | `pass` | `primary`    | `0`       | `not_used`                                              | `status.sh`/`smoke.sh` 均成功；追加 search 查询得到 `nodes=10`，满足 `nodes>=1`。                                                                                        | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s4.log:7`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s4.log:12`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s4.log:23`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s4-nodes.json:4`                                                                                                                 |
| S5 retrieval-eval（有数据集时执行） | `skip` | `skip`       | `n/a`     | `dataset_missing`                                       | 本机不存在 retrieval dataset，按规则跳过并显式写 `skip_reason=dataset_missing`。                                                                                         | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s5.log:5`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s5.log:9`                                                                                                                                                                                                                                                                                                                                                                  |

## 3) 60 分钟约束核验

- 计算口径：`S1.started_utc -> S5.ended_utc`
- 实际耗时：`6.60` 分钟
- 判定：`pass`（`<=60` 分钟）

## 4) 闭环判定（唯一）

- `closure_mode = closed_fail_path`
- `overall_result = fail`

未满足 `pass_path` 的原因：

1. `S1 != pass`（`pnpm tsgo` 返回 TS 错误）。
2. `S3 != pass`（`report` 子命令失败且 report 产物缺失）。

## 5) closed_fail_path：No-Go 前置（必须先解除）

1. `No-Go-P1`：`S1` 必须先恢复为 `pass`（install + tsgo 双零退出）。
   - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s1.log:234`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s1.log:238`
2. `No-Go-P2`：`S3 report` 必须可写且产出 JSON/TXT 非空。
   - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s3.log:30`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s3.log:57`

## 6) 回滚/冻结动作（可执行、可审计）

1. 冻结推进：标记 Wave0 Gate 为 `No-Go`，暂停进入 Wave1~Wave5。
   - 审计要求：在后续 Gate 评审文档中记录 `No-Go-P1/No-Go-P2`。
2. 切换手动最小健康探针（runbook §7）作为临时保活路径：
   - `scripts/memory-stack/status.sh`
   - `curl -fsS "http://127.0.0.1:8000/healthcheck"`
   - `curl -fsS "http://127.0.0.1:8766/docs" >/dev/null`
   - `curl -fsS -X POST "http://127.0.0.1:8000/search" -H 'content-type: application/json' -d '{"query":"Jarvis OS"}' | jq '{facts:(.facts|length),episodes:(.episodes|length),nodes:(.nodes|length)}'`
   - `node openclaw.mjs memory-bridge-p3 rollback-hints`
3. 解除条件（全部满足才可解除冻结）：
   - `Unblock-U1`：`pnpm tsgo` 退出码 `0`。
   - `Unblock-U2`：`pnpm openclaw memory-bridge-p3 report ...` 退出码 `0` 且 report JSON/TXT 非空。
   - `Unblock-U3`：下一轮 `r3` 达到 `S1-S4 全 pass` 且 `S5 pass 或 skip(dataset_missing)`。
