# W1-B Message Envelope Implementation Receipt

## Pre-read evidence anchors (required inputs completed)

- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:120`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:180`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:152`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-gate-review.md:45`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:62`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:47`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06-context-template-spec.md:66`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/fallback-spec-and-fault-injection-plan.md:30`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md:251`

## TDD execution log (RED -> GREEN)

- RED-1 (`exit_code=1`): 新增断言后失败点集中在 `message_envelope` 缺失与 `ignore_roles`/默认关闭未实现。失败证据：`extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts:123`、`extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts:280`、`extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-governance.test.ts:109`。
- GREEN fix-1（最小实现）：补齐 payload envelope 类型、在线捕获启用路径字段构造、远端写入过滤与可审计字段。修复锚点：`extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:17`、`extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:220`、`extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:147`。
- RED-2 (`exit_code=1`): 仅剩配置默认值与 role 归一失败（2 例）。失败证据：`extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-governance.test.ts:119`、`extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-governance.test.ts:141`。
- GREEN fix-2（最小实现）：补 `p3.message_envelope` 默认关闭与 `ignore_roles` 去重归一解析。修复锚点：`extensions/memory-mem0-graphiti-bridge/src/config/flags.ts:136`、`extensions/memory-mem0-graphiti-bridge/src/config/flags.ts:476`。

## Delivery fields

```yaml
changed_files:
  - extensions/memory-mem0-graphiti-bridge/src/p3/types.ts
  - extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts
  - extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts
  - extensions/memory-mem0-graphiti-bridge/src/config/flags.ts
  - extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts
  - extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts
  - extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-governance.test.ts
  - analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day4/w1-b-message-envelope-implementation-receipt.md

acceptance_check:
  AC-B1:
    result: PASS
    evidence:
      - extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts:123
      - extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts:280
      - extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-governance.test.ts:109
    test_summary: "指定命令执行通过：3 files passed, 14 tests passed, 0 failed."

  AC-B2:
    result: PASS
    evidence:
      - extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:17
      - extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:222
      - extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:233
      - extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts:153
    test_summary: "启用路径可审计字段齐全：role/name/created_at/metadata/ignore_roles。"

  AC-B3:
    result: PASS
    evidence:
      - extensions/memory-mem0-graphiti-bridge/src/config/flags.ts:136
      - extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:220
      - extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts:107
      - extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts:143
    test_summary: "`p3.message_envelope.enabled=false` 下保持 legacy payload 行为。"

  AC-B4:
    result: PASS
    evidence:
      - extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:147
      - extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:309
      - extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:315
      - extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts:363
      - extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts:365
    test_summary: "ignore_roles 过滤后保留可解释审计字段：ignore_roles/filtered_roles/effective_roles。"

unresolved: []

tests:
  command: pnpm vitest run --config vitest.extensions.config.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-governance.test.ts
  exit_code: 0
  summary: "Test Files: 3 passed; Tests: 14 passed, 0 failed; Duration: 4.43s."

rollback_applied: false
```

## Day4 HF1 addendum (W1-B-HF1)

- 范围：仅追加 W1-B-HF1 最小补丁，不涉及 W1-C 代码路径。
- 变更：在插件层创建在线 capture 时，透传 `p3.message_envelope` 的 `enabled` 与 `ignore_roles` 到 `messageEnvelope`。
- 变更锚点：
  - `extensions/memory-mem0-graphiti-bridge/index.ts:212`
  - `extensions/memory-mem0-graphiti-bridge/index.ts:216`
  - `extensions/memory-mem0-graphiti-bridge/index.ts:217`
  - `extensions/memory-mem0-graphiti-bridge/index.ts:218`

```yaml
hf1_changed_files:
  - extensions/memory-mem0-graphiti-bridge/index.ts
  - analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day4/w1-b-message-envelope-implementation-receipt.md

hf1_tests:
  command: pnpm vitest run --config vitest.extensions.config.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-online-capture.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-governance.test.ts
  exit_code: 0
  summary: "Test Files: 3 passed; Tests: 14 passed, 0 failed; Duration: 4.45s."

hf1_evidence:
  - extensions/memory-mem0-graphiti-bridge/index.ts:212
  - extensions/memory-mem0-graphiti-bridge/index.ts:216
  - extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:220
  - extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-integration.test.ts:280
```
