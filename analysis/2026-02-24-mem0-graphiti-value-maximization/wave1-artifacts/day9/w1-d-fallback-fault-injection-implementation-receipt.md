# W1-D Fallback Fault Injection Implementation Receipt (Day8/Day9)

- owner: `A (Implementer)`
- scope: `仅 W1-D（Day8/Day9）`
- rollback_applied: `false`

## required_read_evidence

1. `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:109`
2. `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:127`
3. `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:76`
4. `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-gate-review.md:42`
5. `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:279`
6. `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:206`
7. `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06-context-template-spec.md:467`
8. `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/fallback-spec-and-fault-injection-plan.md:35`
9. `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:380`
10. `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:140`
11. `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:145`
12. `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/fallback-spec-and-fault-injection-plan.md:39`
13. `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/fallback-spec-and-fault-injection-plan.md:56`
14. `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-02-command-compat-probe-and-evidence-template.md:12`
15. `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day1/w1-day1-startup-status.md:12`

## changed_files

- `extensions/memory-mem0-graphiti-bridge/src/router/read-router.ts`
- `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts`
- `extensions/memory-mem0-graphiti-bridge/src/config/flags.ts`
- `extensions/memory-mem0-graphiti-bridge/src/__tests__/flags.test.ts`
- `extensions/memory-mem0-graphiti-bridge/src/__tests__/read-router.test.ts`
- `extensions/memory-mem0-graphiti-bridge/src/__tests__/memory-search-tool.test.ts`
- `extensions/memory-mem0-graphiti-bridge/src/__tests__/fallback-fault-injection.test.ts`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day9/w1-d-fallback-fault-injection-implementation-receipt.md`

## acceptance_check

- `AC-D1`: `PASS`
  - 证据：三类故障注入场景已覆盖并通过（timeout / 5xx / empty）
    - `extensions/memory-mem0-graphiti-bridge/src/__tests__/fallback-fault-injection.test.ts:119`
    - `extensions/memory-mem0-graphiti-bridge/src/__tests__/fallback-fault-injection.test.ts:168`
    - `extensions/memory-mem0-graphiti-bridge/src/__tests__/fallback-fault-injection.test.ts:215`
    - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:425`

- `AC-D2`: `PASS`
  - 证据：fallback 执行路径具备可观测字段（`source/route/fallback/reason/latency/status`）
    - `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts:374`
    - `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts:392`
    - `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts:484`
    - `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts:557`
    - `extensions/memory-mem0-graphiti-bridge/src/__tests__/memory-search-tool.test.ts:363`
    - `extensions/memory-mem0-graphiti-bridge/src/__tests__/fallback-fault-injection.test.ts:161`

- `AC-D3`: `PASS`
  - 证据：主读异常时进入诊断型 fallback，不抛出未处理异常并返回可诊断状态
    - `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts:300`
    - `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts:564`
    - `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts:636`
    - `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts:415`
    - `extensions/memory-mem0-graphiti-bridge/src/__tests__/fallback-fault-injection.test.ts:207`
    - `extensions/memory-mem0-graphiti-bridge/src/__tests__/fallback-fault-injection.test.ts:250`

- `AC-D4`: `PASS`
  - 证据：实现边界与冻结规范一致，仅覆盖 W1-D，不扩展 W1-E
    - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:385`
    - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:386`
    - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:387`
    - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:390`
    - `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:145`

## unresolved

- `[]`

## tests

- command: `pnpm vitest run --config vitest.extensions.config.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/flags.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/read-router.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/memory-search-tool.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/fallback-fault-injection.test.ts`
- exit_code: `0`
- summary: `4 test files passed; 21 tests passed; 0 failed`
