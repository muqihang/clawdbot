# W0-02 Day0 基线冻结（配置 + 指标 + 路由）

## 1) 执行元信息

- ArtifactID: `W0-02-BASELINE-FREEZE`
- Executor: `子代理 #W0-02-Implementer / muqihang`
- Workspace: `/Users/muqihang/chelingxi_workspace/clawdbot`
- Executed At (UTC): `2026-02-25T03:22:34Z`
- Executed At (Local): `2026-02-25T11:22:34+08:00`
- Timezone: `Asia/Shanghai (UTC+08:00, CST)`
- Scope Guardrail: 仅执行 W0-02 基线冻结；未修改 `src/`、`extensions/`、`package.json`。

## 2) 命令矩阵（pnpm 主命令 + node 兜底）

> 统一规则：同一命令先尝试 `pnpm openclaw ...`；仅当不可用/失败时才执行 `node openclaw.mjs ...`。

| name                | pnpm 主命令                                                                                                                                                                                                                                                                                                                                                    | node 兜底                                                                                                                                                                                                                                                                                                                                                          | 实际命中 | exit code | 输出文件                                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index_check`       | `pnpm openclaw memory-bridge-p3 index-check --json > analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/index-check.raw.log 2>&1`                                                                                                                                                                                                       | `node openclaw.mjs memory-bridge-p3 index-check --json > analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/index-check.raw.log 2>&1`                                                                                                                                                                                                       | `pnpm`   |       `0` | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/index-check.json`                                                                                    |
| `report`            | `pnpm openclaw memory-bridge-p3 report --run-date 2026-02-25 --report-json /Users/muqihang/chelingxi_workspace/clawdbot/analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/report.json --report-text /Users/muqihang/chelingxi_workspace/clawdbot/analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/report.txt` | `node openclaw.mjs memory-bridge-p3 report --run-date 2026-02-25 --report-json /Users/muqihang/chelingxi_workspace/clawdbot/analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/report.json --report-text /Users/muqihang/chelingxi_workspace/clawdbot/analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/report.txt` | `pnpm`   |       `0` | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/report.json`；`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/report.txt` |
| `s5_retrieval_eval` | `pnpm openclaw memory-bridge-p3 retrieval-eval --dataset /Users/muqihang/chelingxi_workspace/clawdbot/.openclaw/memory-bridge-p3-retrieval-dataset.json --route graphiti --top-k 3 --out /Users/muqihang/chelingxi_workspace/clawdbot/analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/s5-retrieval-eval.json`                        | `node openclaw.mjs memory-bridge-p3 retrieval-eval --dataset /Users/muqihang/chelingxi_workspace/clawdbot/.openclaw/memory-bridge-p3-retrieval-dataset.json --route graphiti --top-k 3 --out /Users/muqihang/chelingxi_workspace/clawdbot/analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/s5-retrieval-eval.json`                        | `pnpm`   |       `0` | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/s5-retrieval-eval.json`                                                                              |

配置快照命令（非 openclaw CLI）：

- `jq '{snapshot_at_utc:(now|todateiso8601),read_mode:.plugins.entries["memory-mem0-graphiti-bridge"].config.read_mode,write_mode:.plugins.entries["memory-mem0-graphiti-bridge"].config.write_mode,admission_enabled:.plugins.entries["memory-mem0-graphiti-bridge"].config.p3.admission_enabled,commit_canary_ratio:.plugins.entries["memory-mem0-graphiti-bridge"].config.p3.commit_canary_ratio,outbox_enabled:.plugins.entries["memory-mem0-graphiti-bridge"].config.outbox.enabled,fallback_route:.plugins.entries["memory-mem0-graphiti-bridge"].config.fallback_route}' ~/.openclaw/openclaw.json > analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/config-snapshot.json`

## 3) 基线配置表（关键字段）

| 配置键                                                                      | 当前值         | 来源                                                                                             |
| --------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| `plugins.entries.memory-mem0-graphiti-bridge.config.read_mode`              | `primary`      | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/config-snapshot.json` |
| `plugins.entries.memory-mem0-graphiti-bridge.config.write_mode`             | `propose_only` | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/config-snapshot.json` |
| `plugins.entries.memory-mem0-graphiti-bridge.config.p3.admission_enabled`   | `true`         | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/config-snapshot.json` |
| `plugins.entries.memory-mem0-graphiti-bridge.config.p3.commit_canary_ratio` | `0.05`         | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/config-snapshot.json` |
| `plugins.entries.memory-mem0-graphiti-bridge.config.outbox.enabled`（可选） | `false`        | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/config-snapshot.json` |
| `plugins.entries.memory-mem0-graphiti-bridge.config.fallback_route`（可选） | `null`         | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/config-snapshot.json` |

## 4) Route Baseline（同日路由快照）

- 命令日志显示当前桥接状态：`Phase1 local-first active (read_mode=primary, write_mode=propose_only, model=gpt-5.1-codex-mini, candidate=mem0, user_route=mem0)`。
- 证据来源：
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/index-check.raw.log`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/s5-retrieval-eval.log`

## 5) S5 Baseline Metrics

来源文件：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/s5-retrieval-eval.json`

| metric               | baseline |
| -------------------- | -------: |
| `hit_at_1`           |      `0` |
| `hit_at_3`           |      `0` |
| `structure_coverage` |      `0` |
| `alias_recall`       |      `0` |

对比公式（固定）：`delta_pp = (current - baseline) * 100`

Gate 比较规则（固定）：上述 4 个指标逐项比较；任一指标 `delta_pp < -3` 判定 S5 Fail。

## 6) 回滚与重采规则

- 同日重采允许覆盖 `day0/` 下基线文件（`config-snapshot.json`、`index-check.json`、`report.json`、`report.txt`、`w0-02-baseline-freeze.md`）。
- 覆盖前必须先把旧快照副本保留到：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/immutable/`。
- 不可变副本命名规则：`<首采UTC时间戳>-<原文件名>`，例如：
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/immutable/20260225T031944Z-config-snapshot.json`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/immutable/20260225T031944Z-index-check.json`

## 7) 产物清单（W0-02）

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-02-baseline-freeze.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/config-snapshot.json`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/index-check.json`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/report.json`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/report.txt`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-02-command-status.json`
