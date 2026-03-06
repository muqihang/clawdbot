# W5-0 输入摘要

## 1. 执行依据

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/plans/2026-03-05-wave5-mem0-graphiti-plan.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/plans/2026-03-06-w5-0-baseline-freeze-execution-plan.md`

## 2. `day33` 获胜证据

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/report/w4-gate4-delta.json`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/report/gate4.go-no-go.summary.json`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/memory-search-regression/acceptance.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/inputs/openclaw.config.json`

## 3. 审计与纠偏参考

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/preflight/01-audit-design-review-main/audit-review.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/preflight/01-audit-design-review-main/audit-summary.json`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/preflight/01-audit-design-review-main/recommendations-ranked.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md`

## 4. 方向约束（不执行后续 Phase）

- `analysis/2026-03-06-super-jarvis-memory-upgrade-plan.md`

## 5. 本机真实配置来源

- `~/.openclaw/openclaw.json`

## 6. 代码事实来源

- `extensions/memory-mem0-graphiti-bridge/index.ts`
- `extensions/memory-mem0-graphiti-bridge/src/p3/worker.ts`
- `extensions/memory-mem0-graphiti-bridge/src/config/flags.ts`
- `extensions/memory-mem0-graphiti-bridge/src/router/read-router.ts`
- `extensions/memory-mem0-graphiti-bridge/src/client/graphiti-client.ts`
- `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts`
- `src/agents/tools/memory-tool.ts`
- `src/memory/backend-config.ts`

## 7. 脚本事实来源

- `scripts/memory-stack/common.sh`
- `scripts/memory-stack/start.sh`

## 8. 输入裁决原则

1. `day33` 证据只负责回答“正式基线是什么”。
2. `~/.openclaw/openclaw.json` 与代码/脚本事实只负责回答“当前本机真实怎么跑”。
3. 审计与方向文档只负责回答“为什么 W5-0 必须先做，以及哪些词不能再混写”。
4. 若计划摘要与本机真实配置冲突，以本机真实配置为准，但仍保留计划中的纠偏原则。
