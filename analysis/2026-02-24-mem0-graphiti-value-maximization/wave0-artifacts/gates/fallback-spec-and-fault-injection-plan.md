# Fallback 行为规范与故障注入冻结审计（Gate W0->W1 条件 3）

## 1) 元信息

- ArtifactID: `W0-08-FALLBACK-FAULT-INJECTION-PLAN`
- checker: `子代理 #W0-U4-Implementer`
- checked_at_utc: `2026-02-26T12:30:00Z`
- checked_at_utc8: `2026-02-26T20:30:00+08:00`
- timezone: `UTC / Asia/Shanghai (UTC+08:00)`
- scope: 仅用于 Gate W0->W1 条件 3「fallback 行为规范 + 故障注入计划冻结」的可复核审计。

## 2) 判定规则（机械）

| rule_id | 判定规则                                                     | 通过阈值                                                                                  | 失败阈值                   |
| ------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------- |
| F1      | 必须存在 fallback 行为规范（触发条件 + 执行步骤 + 通过阈值） | 三项均可在证据中定位                                                                      | 任一项缺失                 |
| F2      | 必须存在故障注入计划（场景 + 注入动作 + 预期结果 + 回滚）    | 至少 3 个场景，且每个场景四要素齐全                                                       | 场景数不足或任一场景缺要素 |
| F3      | 必须冻结版本与审计签字字段                                   | `spec_version`、`frozen_at_utc`、`frozen_at_utc8`、`reviewer_signoff` 全非空              | 任一字段为空或缺失         |
| F4      | 结论公式固定可复算                                           | `final_status = pass_frozen if (F1==pass and F2==pass and F3==pass) else fail_not_frozen` | 公式无法计算或结果不一致   |

## 3) F1 证据：Fallback 行为规范

- 触发条件：自动 smoke 连续两次 `overall_result=fail` 或出现 `blocked`。
- 执行步骤：切换到最小健康探针清单并串行执行探针。
- 通过阈值：最小探针第 1~4 项成功，且 `/search` 返回 `nodes>=1`。
- 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/w0-07-sync-smoke-runbook.md:138`、`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/w0-07-sync-smoke-runbook.md:145`、`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/w0-07-sync-smoke-runbook.md:155`。

## 4) F2 证据：故障注入计划冻结（v1）

命令兼容规则（适用于本节所有 OpenClaw CLI 命令）：

- 首选命令前缀：`pnpm openclaw`
- 对等兜底命令前缀：`node openclaw.mjs`

| scenario_id | 场景                             | 注入动作                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 预期结果                                                                                                         | 回滚动作                                                                                                                                                                                                                                               |
| ----------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F2-S1       | 远端网关地址错误导致主链路不可达 | 1) `pnpm openclaw config set gateway.mode remote --json`；兜底 `node openclaw.mjs config set gateway.mode remote --json`。2) `pnpm openclaw config set gateway.remote.url "ws://127.0.0.1:19999" --json`；兜底 `node openclaw.mjs config set gateway.remote.url "ws://127.0.0.1:19999" --json`。3) `pnpm openclaw gateway status --probe --deep`；兜底 `node openclaw.mjs gateway status --probe --deep`。                                               | `gateway status` 报告远端不可达，但命令可返回并输出可诊断状态；触发 fallback 判定路径，不得出现进程卡死。        | 1) `pnpm openclaw config set gateway.mode local --json`；兜底 `node openclaw.mjs config set gateway.mode local --json`。2) `pnpm openclaw gateway status --probe --deep`；兜底 `node openclaw.mjs gateway status --probe --deep`。预期恢复为本地可达。 |
| F2-S2       | 本地 gateway 进程中断            | 1) `pkill -9 -f openclaw-gateway                                                                                                                                                                                                                                                                                                                                                                                                                         |                                                                                                                  | true`。2) `pnpm openclaw gateway status --probe --deep`；兜底 `node openclaw.mjs gateway status --probe --deep`。3) `pnpm openclaw channels status --probe`；兜底 `node openclaw.mjs channels status --probe`。                                        | `gateway status`/`channels status` 在超时预算内返回故障状态，并明确不可达原因；系统进入 fallback 观测路径而非崩溃退出。 | 1) `nohup pnpm openclaw gateway run --bind loopback --port 18789 --force >/tmp/openclaw-gateway.log 2>&1 &`；兜底 `nohup node openclaw.mjs gateway run --bind loopback --port 18789 --force >/tmp/openclaw-gateway.log 2>&1 &`。2) `pnpm openclaw gateway status --probe --deep`；兜底 `node openclaw.mjs gateway status --probe --deep`。预期恢复可达。 |
| F2-S3       | 单渠道凭证错误触发局部故障       | 1) `pnpm openclaw config set channels.discord.enabled true --json`；兜底 `node openclaw.mjs config set channels.discord.enabled true --json`。2) `pnpm openclaw config set channels.discord.token '"invalid-token-for-fault-injection"' --json`；兜底 `node openclaw.mjs config set channels.discord.token '"invalid-token-for-fault-injection"' --json`。3) `pnpm openclaw channels status --probe`；兜底 `node openclaw.mjs channels status --probe`。 | 仅 Discord 通道显示鉴权失败，其他通道状态与 gateway 探针仍可输出；满足“局部失败不拖垮全局观测”的 fallback 预期。 | 1) `pnpm openclaw config unset channels.discord.token --json`；兜底 `node openclaw.mjs config unset channels.discord.token --json`。2) `pnpm openclaw channels status --probe`；兜底 `node openclaw.mjs channels status --probe`。预期移除注入错误。   |

## 5) F3 冻结字段记录（审计快照）

- spec_version: `W0-08-FALLBACK-FAULT-INJECTION-PLAN-v1.0.0`
- frozen_at_utc: `2026-02-26T12:32:00Z`
- frozen_at_utc8: `2026-02-26T20:32:00+08:00`
- reviewer_signoff: `Muqihang | Eng-Governance Reviewer | 2026-02-26T20:35:00+08:00`

## 6) 核查结果与可复算结论

| check_id | required_item           | observed                                                                           | evidence_pathline                                                                                                                                                                                                                                                                                                                     | result |
| -------- | ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| F1       | fallback 行为规范可定位 | 触发条件、步骤、通过阈值齐全                                                       | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/w0-07-sync-smoke-runbook.md:138`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/w0-07-sync-smoke-runbook.md:145`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/w0-07-sync-smoke-runbook.md:155` | `pass` |
| F2       | 故障注入计划已冻结      | 共 3 个场景，且每个场景具备“场景/注入动作/预期结果/回滚动作”四要素                 | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/fallback-spec-and-fault-injection-plan.md:37`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/fallback-spec-and-fault-injection-plan.md:39`                                                                                  | `pass` |
| F3       | 冻结字段齐全            | `spec_version`、`frozen_at_utc`、`frozen_at_utc8`、`reviewer_signoff` 全为非空实值 | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/fallback-spec-and-fault-injection-plan.md:43`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/fallback-spec-and-fault-injection-plan.md:46`                                                                                  | `pass` |

- formula: `final_status = pass_frozen if (F1==pass and F2==pass and F3==pass) else fail_not_frozen`
- substitution: `final_status = pass_frozen if (pass and pass and pass) else fail_not_frozen`
- final_status: `pass_frozen`
- gate_condition_3_result: `pass`
