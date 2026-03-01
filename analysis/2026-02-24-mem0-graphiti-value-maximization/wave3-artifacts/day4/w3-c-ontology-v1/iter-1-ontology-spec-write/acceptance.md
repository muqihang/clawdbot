# Iter-1 Acceptance

## changed_files

- extensions/memory-mem0-graphiti-bridge/src/config/flags.ts
- extensions/memory-mem0-graphiti-bridge/src/p3/ontology-v1.ts
- extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts
- extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts
- extensions/memory-mem0-graphiti-bridge/index.ts
- extensions/memory-mem0-graphiti-bridge/src/**tests**/flags.test.ts
- extensions/memory-mem0-graphiti-bridge/src/**tests**/p3-remote-writer-ontology.test.ts
- iter-1-ontology-spec-write/ontology-v1.md
- iter-1-ontology-spec-write/ontology-v1.schema.json
- iter-1-ontology-spec-write/inputs/iter1-write-signal-input.snapshot.json
- iter-1-ontology-spec-write/openapi/graphiti-openapi.snapshot.json
- iter-1-ontology-spec-write/openapi/graphiti-openapi.snapshot.exit
- iter-1-ontology-spec-write/openapi/README.md
- iter-1-ontology-spec-write/tests/vitest.log
- iter-1-ontology-spec-write/tests/vitest.exit
- iter-1-ontology-spec-write/gate2-regression/w2-gate2-minimal-verify.command.txt
- iter-1-ontology-spec-write/gate2-regression/w2-gate2-minimal-verify.log
- iter-1-ontology-spec-write/gate2-regression/w2-gate2-minimal-verify.exit
- iter-1-ontology-spec-write/report/w3-c-iter1-write-signal-report.json
- iter-1-ontology-spec-write/report/review.md

## acceptance_check

- [x] ontology v1 minimal entity/field semantics frozen and auditable
- [x] write-side signal default OFF with canary sampling controls
- [x] Graphiti `/messages` request contract not expanded
- [x] auditable trace fields present and asserted in tests
- [x] W2 Gate-2 precision bucket protection kept (`precision_key_bucket` degrade)
- [x] extension vitest run recorded (`tests/vitest.exit=0`)
- [x] W2 Gate-2 minimal regression recorded (`gate2-regression/*.exit=0`)

## unresolved

- 无
