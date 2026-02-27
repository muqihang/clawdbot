# W1-E Gate-1 Rerun Review (Day11)

- owner: `A (Implementer)`
- scope: `W1-E-RERUN（仅文档/评审产物，不改代码）`
- execution_date_utc: `2026-02-27`

## 1) 输入证据与复评边界

- 本次仅基于新证据重算 Gate-1，不覆盖 Day10 历史文件。
- 新检索证据：`hit_at_1=0.2`。
  - `/tmp/w1-r2c-retrieval.json:7`
- 新运行态退出码证据：`START=0`、`STATUS=0`、`SMOKE=22`、`RETR_PRIMARY=0`。
  - `/tmp/w1-r2c-exit.txt:1`
  - `/tmp/w1-r2c-exit.txt:2`
  - `/tmp/w1-r2c-exit.txt:3`
  - `/tmp/w1-r2c-exit.txt:4`
- Gate-1 p95 字段沿用 Day10 代理口径（`p95WriteLatencyMs`）：`44/47`。
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-ab-eval.absprobe.json:14`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-ab-eval.absprobe.json:25`

## 2) Gate-1 复算（严格沿用既有规则）

- 公式：
  - `fur_improvement_pp = (fur_current - fur_baseline) * 100`
  - `p95_degradation_pct = ((p95_total_current_ms - p95_total_baseline_ms) / p95_total_baseline_ms) * 100`
- 阈值：`fur_improvement_pp >= 6 && p95_degradation_pct <= 10`。
- 强制 No-Go 条件：字段缺失或 `p95_total_baseline_ms <= 0`。

输入值：

- `fur_baseline = 0`（wave0 day0）
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/s5-retrieval-eval.json:7`
- `fur_current = 0.2`（R2c retrieval）
  - `/tmp/w1-r2c-retrieval.json:7`
- `p95_total_baseline_ms = 44`（Day10 proxy）
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-ab-eval.absprobe.json:14`
- `p95_total_current_ms = 47`（Day10 proxy）
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-ab-eval.absprobe.json:25`

复算结果：

- `fur_improvement_pp = (0.2 - 0) * 100 = 20`
- `p95_degradation_pct = ((47 - 44) / 44) * 100 = 6.818181818181818`
- 阈值判断：`20 >= 6` 且 `6.818181818181818 <= 10`，均满足。

## 3) Gate-1 复评唯一结论

`Go`

## 4) 风险记录（不改变本次 Gate 结论）

- 风险 R1：`smoke_exit=22`（500）提示运行态稳定性仍有波动。
  - `/tmp/w1-r2c-exit.txt:3`
- 风险 R2：graphiti 语义链路稳定性问题仍需持续跟踪（历史证据含 `smoke=1` 且语义链路失败）。
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r2-runtime-stack-bringup-receipt.md:174`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r2-runtime-stack-bringup-receipt.md:177`

## 5) 产物对齐

- 已生成 Day11 复评包：
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-e-gate1-rerun-review.md`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-e-gate1-rerun-report.json`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-e-gate1-rerun-report.txt`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-e-gate1-rerun-receipt.md`
