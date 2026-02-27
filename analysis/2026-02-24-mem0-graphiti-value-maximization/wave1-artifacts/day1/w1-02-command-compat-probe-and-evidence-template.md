# W1-02 执行回执：命令兼容探针 + Day1 证据模板实例化

## 1) 任务边界

- in-scope：执行 `primary/fallback` 命令兼容探针，并实例化 Day1 证据模板。
- out-of-scope：业务代码修改、Wave2~Wave5 推进。

## 2) 命令兼容规则（已执行）

- primary：`pnpm openclaw ...`
- fallback：`node openclaw.mjs ...`
- 规则：先跑 primary；若 primary 不可用或退出码非 0，立即执行 fallback，并记录命令与退出码。

## 3) 兼容探针执行记录（UTC）

执行时间：`2026-02-26T12:09:23Z`

| 探针     | 命令                       | exit_code | 结果 |
| -------- | -------------------------- | --------: | ---- |
| primary  | `pnpm openclaw --help`     |       `0` | pass |
| fallback | `node openclaw.mjs --help` |       `0` | pass |

探针输出摘录（用于审计）：

- primary 输出含：`Usage: openclaw [options] [command]`
- fallback 输出含：`Usage: openclaw [options] [command]`

兼容判定：`primary_available=true`，`fallback_available=true`，`final_exit_code=0`。

- 证据（path:line）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:20`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:21`

## 4) Day1 证据模板实例（W1-02）

```yaml
evidence_id: W1-02-2026-02-26T12:09:23Z
task_id: W1-02
objective: 验证 primary/fallback 命令兼容并落盘 Day1 模板实例
scope_boundary:
  in_scope:
    - analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:11
    - analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:14
  out_of_scope:
    - analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:6
inputs:
  - artifact: runtime probe commands
    anchor: analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:16
execution_log:
  - timestamp_utc: 2026-02-26T12:09:23Z
    command: pnpm openclaw --help
    exit_code: 0
    fallback_triggered: false
    note: primary probe pass
  - timestamp_utc: 2026-02-26T12:09:23Z
    command: node openclaw.mjs --help
    exit_code: 0
    fallback_triggered: false
    note: proactive fallback equivalence probe pass
outputs:
  - artifact: analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md
    anchors:
      - analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:20
acceptance_check:
  status: pass
  checks:
    - id: AC-07
      result: pass
      evidence: analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:20
    - id: AC-08
      result: pass
      evidence: analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:21
    - id: AC-09
      result: pass
      evidence: analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:12; analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:28
    - id: AC-10
      result: pass
      evidence: analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:87; analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:88; analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:90
rollback:
  trigger: primary/fallback both fail
  action: mark W1 entry blocked and stop Wave2+
  evidence: analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:95
changed_files: []
unresolved: []
```

## 5) 执行回执

- changed_files: []
- acceptance_check: pass（AC-07~AC-10 满足；primary/fallback 均 exit 0）
- acceptance_check_evidence（path:line）：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:20`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:21`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:12`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:28`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:87`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:88`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:90`
- unresolved: []
