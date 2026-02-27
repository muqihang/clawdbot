# W1-R3 Risk Burndown Review (Day11)

- owner: `A (Implementer)`
- scope: `W1-R3 risk burndown（仅运行时证据与评审产物，不改 W1-A~W1-D 业务逻辑）`
- execution_date_utc: `2026-02-27`

## 1) 执行边界与证据路径

- 本轮仅执行 W1 风险清零与 Gate-1 复算，不引入 Wave2 实现。
- 关键证据全部持久化到仓库路径：
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/`

## 2) R1（smoke_exit）三连清零结果（保留原三轮证据）

- Round1：`start=0`、`status=0`、`smoke=0`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/round1-summary.txt:1`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/round1-summary.txt:2`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/round1-summary.txt:3`
- Round2：`start=0`、`status=0`、`smoke=0`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/round2-summary.txt:1`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/round2-summary.txt:2`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/round2-summary.txt:3`
- Round3：`start=0`、`status=0`、`smoke=0`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/round3-summary.txt:1`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/round3-summary.txt:2`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/round3-summary.txt:3`

## 3) R2（graphiti 失败指纹）三连稳定结果（保留原三轮证据）

- Round1 指纹检索结果：`NO_MATCH`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/round1-fingerprint-check.txt:1`
- Round2 指纹检索结果：`NO_MATCH`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/round2-fingerprint-check.txt:1`
- Round3 指纹检索结果：`NO_MATCH`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/round3-fingerprint-check.txt:1`

## 4) live stack 同 shell 复跑（显式环境）

- 已在同一 shell 会话显式设置 `OPENCLAW_MEMORY_STACK_ROOT`、`MEM0_BASE_URL`、`GRAPHITI_BASE_URL`。
- 复跑结果：`start_exit=0`、`status_exit=0`、`smoke_exit=0`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/followup-live-summary.txt:1`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/followup-live-summary.txt:2`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/followup-live-summary.txt:3`

## 5) retrieval-eval 兼容命令 + 有界重试（最多 5 次）

- 命令兼容规则执行：每轮先跑 primary；仅当 primary 非 0 时才跑 fallback。
- 5 轮结果摘要：primary 均为 `0`，fallback 均为 `SKIPPED`。
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/retrieval-attempts-summary.txt:5`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/retrieval-attempts-summary.txt:37`
- 选择规则：首个 `hit_at_1 > 0` 的尝试；若不存在则取最后一次。
- 本次无任何尝试满足 `hit_at_1 > 0`，因此选择 final attempt=`5`（策略原因：`no_hit_at_1_gt_0_use_last_attempt`）。
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/retrieval-summary.txt:5`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/retrieval-summary.txt:6`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/retrieval-summary.txt:8`

## 6) Gate-1 复算输入（repo-local）

- `fur_baseline=0`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/s5-retrieval-eval.json:7`
- `fur_current=0`（来自选定 final retrieval）
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r3-evidence/retrieval-eval.json:7`
- `p95_total_baseline_ms=44`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-ab-eval.absprobe.json:14`
- `p95_total_current_ms=47`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-ab-eval.absprobe.json:25`
- 复算：`fur_improvement_pp=0`，`p95_degradation_pct=6.818181818181818`

## 7) 结论与阻塞项

- Gate-1 最终结论：`No-Go`（`fur_improvement_pp=0 < 6`）。
- 一致性校验：`gate1_conclusion=No-Go` ⇒ `acceptance_check=fail`，`unresolved` 非空。
- unresolved blocker（显式）：
  - `BLOCKER-R3-RET-HIT1-000`: 在有界重试 1~5 轮中 `hit_at_1` 始终为 `0`，未出现任一 `hit_at_1 > 0` 的候选 final retrieval，导致 `fur_improvement_pp >= 6` 无法满足。
