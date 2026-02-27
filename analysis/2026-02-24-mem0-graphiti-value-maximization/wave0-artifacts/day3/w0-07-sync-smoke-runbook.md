# W0-07 同步后 Smoke 套件固化 Runbook

## 1) 元信息

- artifact_id: `W0-07-SYNC-SMOKE-RUNBOOK`
- author: `子代理 #W0-07-Implementer-Fix1（Wave 0 Day3）`
- timestamp (UTC): `2026-02-25T09:18:00Z`
- timestamp (UTC+08:00): `2026-02-25T17:18:00+08:00`
- scope: 仅覆盖 `W0-07`（S1-S5 smoke 固化、失败处理、日志规范、回滚手册）；不展开 Wave1~Wave5，不修改业务代码。
- dependencies: `W0-05`、`W0-06B`

## 2) 全局执行约束

1. 执行顺序固定：`S1 -> S2 -> S3 -> S4 -> S5`。
2. 总时长约束：从 `S1.started_utc` 到 `S5.ended_utc` 必须 `<=60` 分钟；超时直接判定整套 `fail`。
3. 统一命令兜底规则（必须记录 `used_command` + `fallback_trigger`）：
   - `pnpm openclaw ...` 不可用 -> `node openclaw.mjs ...`
   - `pnpm vitest ...` 不可用 -> `node node_modules/vitest/vitest.mjs ...`
   - `pnpm tsgo` 不可用 -> `node node_modules/@typescript/native-preview/bin/tsgo.js`
4. 兜底仅在 `primary` 命令不可用时触发；若 `primary` 可用但出现业务/运行错误（如 `EPERM`、report 空文件、exit 非 `0`），不触发兜底并直接判该步骤 `fail`。
5. S3 `report` 的 `--report-json/--report-text` 输出路径必须使用绝对路径（推荐 `$(pwd)/analysis/...`），避免 `cwd/workspaceDir` 偏差导致写入失败（如 `EPERM`）。
6. 若主命令成功，`fallback_trigger=not_used`；若 `primary` 可用但因非“命令不可用”失败，`fallback_trigger=not_triggered_primary_available_non_unavailable_error`；若步骤被跳过，标记 `skip` 并写明 `skip_reason`。
7. 执行模式固定：`diagnostic_mode=true`（失败后继续跑后续步骤采集证据），但 `overall_result` 不得回到 `pass`。

## 2.1) V1.1 与代码现实差异（先核对再执行）

### 差异 D1：S2 命令配置口径冲突

- V1.1 要求：`pnpm vitest run --config vitest.unit.config.ts ...`。
  - 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:243`
- 代码现实：`vitest.unit.config.ts` 会主动过滤并排除 `extensions/**`，与 S2 的扩展测试目标冲突。
  - 证据：`vitest.unit.config.ts:8`（过滤掉 `extensions/` include）
  - 证据：`vitest.unit.config.ts:16`（显式 `exclude ... "extensions/**"`）
- 可执行口径：S2 必须切换到 `vitest.extensions.config.ts`。
  - 证据：`vitest.extensions.config.ts:12`（`include: ["extensions/**/*.test.ts"]`）

### 差异 D2：S3/S5 CLI 执行入口需显式兜底

- 执行环境若 `pnpm openclaw` 不可用，S3/S5 必须统一回退 `node openclaw.mjs ...`，并记录 `fallback_trigger=openclaw_primary_unavailable`。
- 该规则属于运行手册强制约束：仅当 `primary` 不可用时允许 fallback，不得将业务/运行错误当作 fallback 触发条件。

## 3) S1-S5 命令矩阵（主命令 + 兜底 + 阈值）

| 步骤                                | 主命令（primary）                                                                                                                                                                                                                                                                                       | 兜底（fallback）                                                                                                                                                                   | 通过阈值                                              | 失败阈值                                    | 可跳过条件                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| S1 依赖与类型检查                   | `pnpm install`；`pnpm tsgo`                                                                                                                                                                                                                                                                             | `CI=true pnpm install`（no-TTY 或 frozen-lockfile 阻塞时）；`node node_modules/@typescript/native-preview/bin/tsgo.js`                                                             | 两条命令退出码均为 `0`                                | 任一退出码非 `0` 或出现 TS error            | 不可跳过                                                                                                 |
| S2 bridge 最小单测集合              | `pnpm vitest run --config vitest.extensions.config.ts <6个测试文件>`                                                                                                                                                                                                                                    | `node node_modules/vitest/vitest.mjs run --config vitest.extensions.config.ts <6个测试文件>`                                                                                       | 6 个测试文件全部通过，失败数 `0`                      | 任一用例失败或命令非 `0`                    | 不可跳过                                                                                                 |
| S3 P3 CLI 合约 smoke                | `pnpm openclaw memory-bridge-p3 index-check --json`；`pnpm openclaw memory-bridge-p3 report --run-date "$RUN_DATE" --report-json "$(pwd)/analysis/...-s3-report.json" --report-text "$(pwd)/analysis/...-s3-report.txt"`；`pnpm openclaw memory-bridge-p3 rollback-hints`                               | 仅当 `primary` 命令不可用（如 `Command "openclaw" not found`）时，对应命令改为 `node openclaw.mjs ...`                                                                             | 三条命令退出码均为 `0`，且 report JSON/TXT 非空       | 任一命令非 `0`，或 report 文件缺失/空文件   | 不可跳过                                                                                                 |
| S4 自托管栈健康检查 + nodes 校验    | `scripts/memory-stack/status.sh`；`scripts/memory-stack/smoke.sh`；若 smoke 未输出 nodes，则追加 `curl -fsS -X POST "http://127.0.0.1:8000/search" -H 'content-type: application/json' -d '{"query":"Jarvis OS"}' \| jq '{facts:(.facts\|length),episodes:(.episodes\|length),nodes:(.nodes\|length)}'` | 使用显式环境重试：`OPENCLAW_MEMORY_STACK_ROOT=<stack_root> GRAPHITI_PORT=<port> MEM0_PORT=<port> scripts/memory-stack/status.sh` 与 `smoke.sh`；nodes 查询改为对应 `GRAPHITI_PORT` | `status`/`smoke` 均 `0` 且 `nodes>=1`（或命中白名单） | 任一命令非 `0`，或 `nodes<1` 且不命中白名单 | 不可跳过                                                                                                 |
| S5 retrieval-eval（有数据集时执行） | `pnpm openclaw memory-bridge-p3 retrieval-eval --route mem0 ...`；`pnpm openclaw memory-bridge-p3 retrieval-eval --route graphiti ...`                                                                                                                                                                  | 对应命令改为 `node openclaw.mjs ...`                                                                                                                                               | 数据集存在时，两条命令均 `0`                          | 数据集存在但任一命令非 `0`                  | `~/.openclaw/memory-bridge-p3-retrieval-dataset.json` 不存在可跳过，必须写 `skip_reason=dataset_missing` |

### S4 nodes 校验白名单（必须预先声明）

仅允许以下 3 种判据之一用于 `nodes_nonzero=true`：

1. `smoke.sh` 直接输出 `nodes_nonzero=true`。
2. 追加执行 `http://127.0.0.1:8000/search` 查询并得到 `nodes>=1`。
3. `status.sh` 明确显示 Graphiti 监听非 `8000` 端口，且对该端口执行同构查询返回 `nodes>=1`。

除以上 3 种外，其他“等价证据”一律不计入通过判定。

## 4) 失败处理与重试上限（每步固定）

### S1

- failure_signal: `pnpm install` 或 `pnpm tsgo` 非 `0`；命中 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`、`ERR_PNPM_OUTDATED_LOCKFILE`、`Command "tsgo" not found`。
- retry_limit: `1`
- fallback_action:
  1. `pnpm install` 因 no TTY 失败 -> `CI=true pnpm install`。
  2. `pnpm tsgo` 不可用 -> `node node_modules/@typescript/native-preview/bin/tsgo.js`。
- escalation_rule:
  - 若重试后仍失败：`S1=fail`，`overall_result` 直接锁定为 `fail`，继续执行后续步骤做诊断留证。
  - 若步骤日志无法写入：整套流程立即 `blocked` 并中止。

### S2

- failure_signal: `pnpm vitest` 非 `0`、测试失败、或命中 `Command "vitest" not found`。
- retry_limit: `1`
- fallback_action: `node node_modules/vitest/vitest.mjs run --config vitest.extensions.config.ts <6个测试文件>`。
- escalation_rule:
  - 重试后仍失败：`S2=fail`，继续执行 `S3-S5` 留证，`overall_result` 保持 `fail`。
  - 若日志写入失败：立即 `blocked` 并中止整套流程。

### S3

- failure_signal:
  1. 命中 `Command "openclaw" not found`（命令不可用）。
  2. `primary` 可用但出现业务/运行错误：任一子命令非 `0`，或 report JSON/TXT 缺失/空文件。
- output_path_rule: `report-json/report-text` 必须传绝对路径（推荐 `$(pwd)/analysis/...`），避免 `cwd/workspaceDir` 偏差导致写入失败。
- retry_limit: `1`（仅命令不可用场景）
- fallback_action: 仅在 `primary` 命令不可用时，将 3 条命令全部切换为 `node openclaw.mjs ...` 再执行一次。
- escalation_rule:
  - 命中“命令不可用”且 fallback 重试后仍失败：`S3=fail`，继续执行 `S4-S5` 留证，`overall_result` 保持 `fail`。
  - `primary` 可用但出现业务/运行错误（如 `EPERM`、exit 非 `0`、report 缺失/空文件）：不触发 fallback，直接 `S3=fail` 并留证。
  - 若日志写入失败：立即 `blocked` 并中止整套流程。

### S4

- failure_signal: `status.sh` 或 `smoke.sh` 非 `0`；`nodes` 查询失败；`nodes<1`。
- retry_limit: `1`
- fallback_action:
  1. 使用显式 `OPENCLAW_MEMORY_STACK_ROOT/GRAPHITI_PORT/MEM0_PORT` 重跑 `status.sh` + `smoke.sh`。
  2. 若 smoke 未输出 nodes，必须追加 nodes 查询（默认 `8000`，或命中白名单第 3 条时使用非默认端口）。
- escalation_rule:
  - 重试后仍失败：`S4=fail`，继续执行 `S5` 的数据集存在性检查并结束。
  - 若 `scripts/memory-stack/status.sh` 或 `smoke.sh` 文件缺失/不可执行：立即 `blocked` 并中止整套流程。

### S5

- failure_signal: 数据集存在且任一 retrieval-eval 命令非 `0`；输出文件缺失。
- retry_limit: `1`（仅当命令不可用时触发）
- fallback_action: `pnpm openclaw ...` 不可用时改用 `node openclaw.mjs ...`。
- escalation_rule:
  - 数据集缺失：`S5=skip` 且 `skip_reason=dataset_missing`，不视为失败。
  - 数据集存在但重试后仍失败：`S5=fail`，整套流程结束并保持 `overall_result=fail`。

## 5) 输出日志命名规范

- 日志目录：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/`
- 命名模板：`sync-smoke-<YYYY-MM-DD>-<run_id>-s<step>.log`
  - `run_id` 规范：`s1` 首次执行，`r2/r3...` 重跑。
  - 示例：`sync-smoke-2026-02-25-r2-s1.log`
- 步骤特定附件：
  - `sync-smoke-<date>-<run_id>-s3-report.json`
  - `sync-smoke-<date>-<run_id>-s3-report.txt`
  - `sync-smoke-<date>-<run_id>-s4-nodes.json`
- 结果文件：
  - 执行记录：`sync-smoke-<YYYY-MM-DD>-<run_id>.md`
  - 状态机文件：`sync-smoke-<YYYY-MM-DD>-<run_id>.status.json`

## 6) 60 分钟判定规则

1. `started_at = S1.started_utc`。
2. `ended_at = S5.ended_utc`。
3. `duration_minutes = (ended_at - started_at) / 60`，保留 2 位小数。
4. 判定规则：
   - `duration_minutes <= 60` -> 时长约束通过（不代表整体通过）。
   - `duration_minutes > 60` -> 整体 `fail`，且必须在执行记录写出瓶颈步骤与压缩建议（至少 3 条）。

## 7) 回滚策略（切换到手动最小健康探针清单）

触发条件（任一满足）：

1. 自动 smoke 连续两次 `overall_result=fail`。
2. 发生 `blocked`（脚本缺失、日志不可写、关键命令不可执行）。

切换后只保留以下最小探针（按顺序执行）：

1. `scripts/memory-stack/status.sh`
2. `curl -fsS "http://127.0.0.1:8000/healthcheck"`
3. `curl -fsS "http://127.0.0.1:8766/docs" >/dev/null`
4. `curl -fsS -X POST "http://127.0.0.1:8000/search" -H 'content-type: application/json' -d '{"query":"Jarvis OS"}' | jq '{facts:(.facts|length),episodes:(.episodes|length),nodes:(.nodes|length)}'`
5. `node openclaw.mjs memory-bridge-p3 rollback-hints`

最小探针判定：

- 第 1~4 项全部成功且第 4 项 `nodes>=1` -> 手动健康 `pass`。
- 任一失败 -> 手动健康 `fail`，保持回滚模式，不恢复自动 smoke。
