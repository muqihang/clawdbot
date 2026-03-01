# Iter-2 Acceptance

## changed_files

- extensions/memory-mem0-graphiti-bridge/src/config/flags.ts
- extensions/memory-mem0-graphiti-bridge/src/p3/ontology-v1.ts
- extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts
- extensions/memory-mem0-graphiti-bridge/src/**tests**/flags.test.ts
- extensions/memory-mem0-graphiti-bridge/src/**tests**/memory-search-tool.test.ts
- extensions/memory-mem0-graphiti-bridge/src/**tests**/fallback-fault-injection.test.ts
- iter-2-ontology-readback-eval/scripts/run-w3-c-ontology-readback-eval.ts
- iter-2-ontology-readback-eval/inputs/ontology-readback-dataset.v1.json
- iter-2-ontology-readback-eval/inputs/runner-input.snapshot.json
- iter-2-ontology-readback-eval/openapi/README.md
- iter-2-ontology-readback-eval/openapi/graphiti-openapi.snapshot.json
- iter-2-ontology-readback-eval/openapi/graphiti-openapi.snapshot.exit
- iter-2-ontology-readback-eval/report/w3-ontology-baseline-report.json
- iter-2-ontology-readback-eval/report/w3-ontology-variant-report.json
- iter-2-ontology-readback-eval/report/w3-ontology-delta.json
- iter-2-ontology-readback-eval/report/w3-ontology-review.md
- iter-2-ontology-readback-eval/retrieval/\*_/search.raw._.json
- iter-2-ontology-readback-eval/retrieval/\*_/search.topk._.json
- iter-2-ontology-readback-eval/tests/vitest.log
- iter-2-ontology-readback-eval/tests/vitest.exit
- iter-2-ontology-readback-eval/gate2-regression/w2-gate2-minimal-verify.command.txt
- iter-2-ontology-readback-eval/gate2-regression/w2-gate2-minimal-verify.log
- iter-2-ontology-readback-eval/gate2-regression/w2-gate2-minimal-verify.exit

## acceptance_check

- [x] 新增 `read.graphiti_ontology_readback` 且默认关闭
- [x] 仅在 graphiti + decision_reason 条件下执行 marker 解析与统计
- [x] 输出 `details.ontology_v1`（含解析结果/统计/失败原因）
- [x] 不改变排序逻辑（top1 hit rate baseline=variant=1）
- [x] baseline vs variant 单变量成立（仅 readback/reporting）
- [x] bounded=5 / stability=10 离线 mock 评测完成并落盘
- [x] 每次检索 raw/topk 证据落盘至 `analysis/.../retrieval`（非 /tmp）
- [x] extension vitest run 记录 (`tests/vitest.exit=0`)
- [x] W2 Gate-2 最小回归记录 (`gate2-regression/*.exit=0`)

## unresolved

- 无
