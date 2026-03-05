# memory_search regression acceptance

- result: FAIL
- last_run_id: run-03

## Blockers
- control-01: control query empty in L1 (local tool)
- control-01: control query empty in L2 (bridge primary)
- control-02: control query empty in L1 (local tool)
- hyphen-01: hard gate violated (L2 primary hyphen results_count=0)
- hyphen-02: hard gate violated (L2 primary hyphen results_count=0)
- hyphen-02: L2 primary hyphen=0 but space>0 (bridge-level tokenization suspected)

## Diagnostics
- control-01: control query empty in CLI (expected if qmd scope denies session=<none>)
- control-02: control query empty in CLI (expected if qmd scope denies session=<none>)

## Evidence
- summary: /Users/muqihang/chelingxi_workspace/clawdbot/analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/memory-search-regression/summary.json
- runs: /Users/muqihang/chelingxi_workspace/clawdbot/analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/memory-search-regression/runs
- queries: /Users/muqihang/chelingxi_workspace/clawdbot/analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/memory-search-regression/queries.json
- env: /Users/muqihang/chelingxi_workspace/clawdbot/analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/memory-search-regression/env.json
