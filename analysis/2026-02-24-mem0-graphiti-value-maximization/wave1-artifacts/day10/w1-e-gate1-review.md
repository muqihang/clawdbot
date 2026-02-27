# W1-E Gate-1 Review (Day10)

- owner: `W1-A implementer`
- scope: `Fix-2（仅文档/回执修复，再次恢复 Gate-1 复算字段与统一字段）`
- execution_date_utc: `2026-02-27`

## 1) 背景与修复边界

- Day10 `w1-e-gate1-report.json/txt` 被原始 CLI 输出覆盖，仅保留基础统计字段，导致 Gate-1 复算字段与统一回执字段缺失。
- 本次 Fix-2 仅修复 Day10 文档/回执一致性：恢复字段、补齐证据链、统一结论表达。
- 本次不改 W1-A~W1-D 业务代码，不改 HF4 逻辑。

证据（path:line）：

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-closure-checklist.md:10`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-closure-checklist.md:12`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-closure-checklist.md:13`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-closure-checklist.md:15`

## 2) strict 12.4 结果保持不变

- strict 12.4 本次结果保持：`primary=0`，`fallback_triggered=false`，`final_exit_basis=primary`，`final_exit_code=0`。
- Fix-2 仅回填回执字段，不改变运行结果。

## 3) fallback 非 0 路径适用性证据（Day1 兼容探针）

- 规则锚点：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:12`
  - 语义：先跑 primary；若 primary 非 0，立即执行 fallback。
- primary 探针：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:20`
- fallback 探针：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:21`
- 结论：虽然本次 strict 12.4 未触发 fallback，但 fallback 非 0 路径规则与命令兼容性已有 Day1 先验证据，适用性成立。

## 4) Gate-1 复算字段恢复（口径不变）

- `fur_baseline = 0`，来源：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/s5-retrieval-eval.json:7`
- `fur_current = 0`，来源：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-retrieval-eval.absprobe.json:7`
- `p95_total_baseline_ms = 44`（由 `p95WriteLatencyMs` 代理），来源：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-ab-eval.absprobe.json:14`
- `p95_total_current_ms = 47`（由 `p95WriteLatencyMs` 代理），来源：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-ab-eval.absprobe.json:25`
- `fur_improvement_pp = (0 - 0) * 100 = 0`
- `p95_degradation_pct = ((47 - 44) / 44) * 100 = 6.818181818181818`
- Gate-1 唯一结论保持：`No-Go`

## 5) `weekly_gate_fields` 为 HF4 前既有字段

- `weekly_gate_fields` 并非 HF4 引入；其在 HF4 前的 absprobe 报告中已存在。
- pre-existing 证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-gate1-report.absprobe.json:20`

## 6) 输出一致性（Fix-2）

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-gate1-report.json` 已恢复：
  - `fur_baseline` / `fur_current` / `p95_total_baseline_ms` / `p95_total_current_ms`
  - `fur_improvement_pp` / `p95_degradation_pct` / `gate1_conclusion`
  - `changed_files` / `acceptance_check` / `unresolved`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-gate1-report.txt` 与 JSON 字段对齐。
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-gate1-implementation-receipt.md` 统一字段回执如下：
  - `changed_files: []`
  - `acceptance_check: pass`
  - `unresolved: []`
