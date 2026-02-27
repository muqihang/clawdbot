# W1-R2 Runtime Stack Bringup Receipt (Day11)

- owner: `A (Implementer)`
- scope: `W1-R2 运行时解阻（仅环境/证据，不改业务代码）`
- execution_date_utc: `2026-02-27`
- stack_root: `/tmp/openclaw-memory-stack`

## execution_summary

- `bootstrap` 已成功完成；源码与 Python 依赖已在 `/tmp/openclaw-memory-stack` 准备就绪。
- `start` 失败于必填环境校验：`LLM_API_KEY` 为空，导致 graphiti/mem0 未启动。
- 因服务未 up，按本批执行条件跳过 `retrieval-eval` 复测（primary/fallback 均未触发）。
- 客观结论：本轮没有产生新的 retrieval-eval 结果，无法形成“FUR 提升”新证据；现有最近快照仍为 `fur_current=0`。

## command_log

- command: `export OPENCLAW_MEMORY_STACK_ROOT=/tmp/openclaw-memory-stack`（并写入 `/tmp/w1-r2-evidence/env.txt`）
  - exit_code: `0`
  - summary: 变量已设置并落证据文件。

- command: `scripts/memory-stack/bootstrap.sh`
  - exit_code: `0`
  - summary: bootstrap 完成，日志含 `bootstrap complete`。

- command: `scripts/memory-stack/start.sh`
  - exit_code: `1`
  - summary: 启动前校验失败，缺失 `LLM_API_KEY`。

- command: `scripts/memory-stack/status.sh`
  - exit_code: `0`
  - summary: `graphiti`/`mem0` 均 `alive=no`、`health=down`。

- command: `scripts/memory-stack/smoke.sh`
  - exit_code: `7`
  - summary: 无法连接 `127.0.0.1:8000`，与未启动状态一致。

- command: `pnpm openclaw memory-bridge-p3 retrieval-eval --dataset .openclaw/memory-bridge-p3-retrieval-dataset.json --out /tmp/w1-r2-retrieval-eval.json --route graphiti --top-k 3`
  - exit_code: `N/A (skipped)`
  - summary: 前置条件“服务 up”不满足，按步骤 4 条件跳过。

- command: `node openclaw.mjs memory-bridge-p3 retrieval-eval --dataset .openclaw/memory-bridge-p3-retrieval-dataset.json --out /tmp/w1-r2-retrieval-eval.json --route graphiti --top-k 3`
  - exit_code: `N/A (not triggered)`
  - summary: 仅在 primary 非 0 且 primary 已执行时触发；本轮 primary 未执行。

- command: `curl -fsS http://127.0.0.1:6333/healthz`
  - exit_code: `0`
  - summary: qdrant 健康，当前主阻塞点集中在 `LLM_API_KEY`。

## fur_objective_result

- 本轮未产出 `/tmp/w1-r2-retrieval-eval.json`，因此无新 `FUR` 数值可对比。
- 截至本仓库最近 Gate-1 快照，`fur_baseline=0`、`fur_current=0`、`fur_improvement_pp=0`；本轮无证据改变该结论。

## minimal_next_step_if_failed

- 最小可执行下一步（不改业务代码）：
  1. 向 `/tmp/openclaw-memory-stack/env/memory-stack.env` 注入有效 `LLM_API_KEY`（仅该项当前为空）。
  2. 重新执行：`scripts/memory-stack/start.sh && scripts/memory-stack/status.sh && scripts/memory-stack/smoke.sh`。
  3. 若 `status` 显示双服务健康，再执行 retrieval-eval：
     - primary: `pnpm openclaw memory-bridge-p3 retrieval-eval --dataset .openclaw/memory-bridge-p3-retrieval-dataset.json --out /tmp/w1-r2-retrieval-eval.json --route graphiti --top-k 3`
     - fallback（仅 primary 非 0 时立刻执行）: `node openclaw.mjs memory-bridge-p3 retrieval-eval --dataset .openclaw/memory-bridge-p3-retrieval-dataset.json --out /tmp/w1-r2-retrieval-eval.json --route graphiti --top-k 3`

## evidence_anchors

- `scripts/memory-stack/bootstrap.sh:14`
- `scripts/memory-stack/bootstrap.sh:58`
- `scripts/memory-stack/start.sh:13`
- `scripts/memory-stack/start.sh:59`
- `scripts/memory-stack/common.sh:146`
- `scripts/memory-stack/common.sh:169`
- `/tmp/w1-r2-evidence/env.txt:2`
- `/tmp/w1-r2-evidence/bootstrap.exit:1`
- `/tmp/w1-r2-evidence/bootstrap.log:252`
- `/tmp/w1-r2-evidence/start.exit:1`
- `/tmp/w1-r2-evidence/start.log:1`
- `/tmp/openclaw-memory-stack/env/memory-stack.env:2`
- `/tmp/w1-r2-evidence/status.log:1`
- `/tmp/w1-r2-evidence/status.log:2`
- `/tmp/w1-r2-evidence/smoke.log:1`
- `/tmp/w1-r2-evidence/qdrant-health.log:1`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-gate1-report.json:37`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-gate1-report.json:41`

## acceptance

- changed_files: []
- acceptance_check: `fail`
  - `AC-R2-1`: `PASS` — 已在 `/tmp/openclaw-memory-stack` 完成 bootstrap。
  - `AC-R2-2`: `FAIL` — runtime 未拉起（`start=1`，`status` 双 down，`smoke=7`）。
  - `AC-R2-3`: `BLOCKED` — 服务未 up，retrieval-eval 未执行，无法得出新 FUR 提升值。
- unresolved:
  - `/tmp/openclaw-memory-stack/env/memory-stack.env` 缺 `LLM_API_KEY`（当前为空）。
  - 服务未 up（`graphiti`/`mem0` 均 down），`retrieval-eval` blocked。

## w1-r2b-runtime-stack-retest

### r2_vs_r2b_delta

- `R2 -> R2b` 环境差异：`LLM_API_KEY` 已补齐；`LLM_BASE_URL`、`LLM_MODEL_NAME`、`MEM0_USE_RESPONSES_API` 已与本机既有 stack 配置对齐（仅对齐状态，不披露值）。
- `R2 -> R2b` 运行态差异：`start` 从 `1` 变为 `0`，`status` 维持 `0` 且双服务转为 `alive=yes/health=ok`。
- `R2 -> R2b` 烟测差异：`smoke` 从 `7`（端口不可达）变为 `1`（服务可达但 graphiti 语义链路未通过，`episodes=0`、`facts=0`）。
- `R2 -> R2b` 评测差异：R2 的 retrieval-eval 为 skipped；R2b 已执行 primary（`exit=0`），fallback 按规则未触发。

### latest_exit_codes

- `start_exit=0`
- `status_exit=0`
- `smoke_exit=1`
- `retrieval_eval_primary_exit=0`
- `retrieval_eval_fallback_exit=skipped`

### fur_objective_result_r2b

- R2b retrieval-eval 已产出：`sample_size=5`、`hit_at_1=0`、`hit_at_3=0`、`structure_coverage=0`、`alias_recall=0`。
- 按既有文档中的临时 proxy 口径（`fur_proxy=min(hit_at_1,structure_coverage)`），本轮 `fur_proxy=0`。
- 与 Gate-1 快照对照：`fur_baseline=0`、`fur_current=0`、`fur_improvement_pp=0`；本轮未形成正向提升证据。

### evidence_anchors_r2b

- `/tmp/w1-r2b-env-sync.log:2`
- `/tmp/w1-r2b-env-sync.log:3`
- `/tmp/w1-r2b-env-sync.log:4`
- `/tmp/w1-r2b-env-sync.log:15`
- `/tmp/w1-r2b-env-sync.log:18`
- `/tmp/w1-r2b-evidence/start.out:1`
- `/tmp/w1-r2b-evidence/start.out:2`
- `/tmp/w1-r2b-evidence/start.out:3`
- `/tmp/w1-r2b-evidence/status.out:1`
- `/tmp/w1-r2b-evidence/status.out:2`
- `/tmp/w1-r2b-evidence/smoke.out:1`
- `/tmp/w1-r2b-evidence/smoke.out:2`
- `/tmp/w1-r2b-evidence/smoke.out:3`
- `/tmp/openclaw-memory-stack/logs/graphiti.log:10`
- `/tmp/openclaw-memory-stack/logs/graphiti.log:15`
- `/tmp/w1-r2b-evidence/retrieval-eval-primary.out:913`
- `/tmp/w1-r2b-evidence/retrieval-eval-primary.out:916`
- `/tmp/w1-r2b-evidence/retrieval-eval-primary.out:918`
- `/tmp/w1-r2b-evidence/r2-vs-r2b-summary.txt:2`
- `/tmp/w1-r2b-evidence/r2-vs-r2b-summary.txt:5`
- `/tmp/w1-r2b-evidence/r2-vs-r2b-summary.txt:7`
- `/tmp/w1-r2b-evidence/r2-vs-r2b-summary.txt:8`
- `/tmp/w1-r2b-evidence/r2-vs-r2b-summary.txt:9`
- `/tmp/w1-r2b-evidence/r2-vs-r2b-summary.txt:14`
- `/tmp/w1-r2b-evidence/r2-vs-r2b-summary.txt:17`
- `/tmp/w1-r2b-retrieval-eval.json:5`
- `/tmp/w1-r2b-retrieval-eval.json:7`
- `/tmp/w1-r2b-retrieval-eval.json:9`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-gate1-report.json:37`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-gate1-report.json:38`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-gate1-report.json:41`

### next_step_r2b

- 目标：在不改业务代码前提下，快速判定 graphiti `404` 是否由 `LLM_BASE_URL` / `LLM_MODEL_NAME` 可用性导致，并给出可复现证据。
- 命令 1（模型可用性探测）：
  - `set -a; source /tmp/openclaw-memory-stack/env/memory-stack.env; set +a; curl -sS -H "Authorization: Bearer $LLM_API_KEY" "${LLM_BASE_URL%/}/models" | tee /tmp/w1-r2b-next-models.out`
  - 判定：输出可解析且包含 `LLM_MODEL_NAME` 对应 model id => 通过；若返回 `401/403/404` 或无该 model => 不通过。
- 命令 2（烟测复跑并固化退出码）：
  - `scripts/memory-stack/smoke.sh > /tmp/w1-r2b-next-smoke.out 2>&1; echo $? | tee /tmp/w1-r2b-next-smoke.exit`
  - 判定：`/tmp/w1-r2b-next-smoke.exit` 为 `0` => 通过；非 `0` => 不通过。
- 命令 3（抓取 graphiti 末尾日志）：
  - `tail -n 160 /tmp/openclaw-memory-stack/logs/graphiti.log > /tmp/w1-r2b-next-graphiti-tail.log`
  - 判定：日志中不再出现 `404` 且可见语义链路成功写入/查询痕迹 => 通过；反之不通过。
- 命令 4（失败指纹检索）：
  - `rg -n "404|Not Found|episodes=0|facts=0" /tmp/w1-r2b-next-smoke.out /tmp/w1-r2b-next-graphiti-tail.log || true`
  - 判定：无匹配 => 可进入下一轮 retrieval-eval；有匹配 => 保持 R2b `partial-pass`，并据输出继续定位 provider 路由/模型映射。

### acceptance_r2b

- changed_files: []
- acceptance_check: `partial-pass`
  - `AC-R2b-1`: `PASS` — 已补齐/对齐关键 env 字段，必填项均为 `set`。
  - `AC-R2b-2`: `PASS` — `start=0` 且 `status=0`，graphiti/mem0 均 up。
  - `AC-R2b-3`: `FAIL` — `smoke=1`，graphiti 路径出现 LLM `404`，`episodes/facts` 未生成。
  - `AC-R2b-4`: `PASS` — retrieval-eval primary 成功产出结果文件，fallback 未触发。
- unresolved:
  - graphiti 语义链路仍失败（LLM 404），导致 smoke 未通过，当前 FUR/proxy 仍为 `0`。
  - 直接执行下一步见 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r2-runtime-stack-bringup-receipt.md:152`（`next_step_r2b`）。
