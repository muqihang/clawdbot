# W4-D Gate-4 Final Acceptance

This file is the acceptance checklist for the Day10 evidence bundle.

## changed_files

- Full list: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/changed_files.txt`
  - count: 415 lines (2026-03-02)
  - includes Day10 anchors:
    - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-gate4-report.json`
    - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-gate4-review.md`

## acceptance_check

- result: FAIL

## hard gates (must be PASS to allow GO)

- Gate-4 p95 increase <= 15%: FAIL (`18.9549%`)
- Gate-4 stability unique-values == 1: FAIL
- memory_search hyphenated DEC queries non-empty: FAIL

## required tests / regressions

- extensions vitest: PASS (exit=0)
- W2 Gate-2 minimal regression: PASS (exit=0)
- W3 Gate-3 minimal regression: PASS (exit=0)

## unresolved (blockers)

- memory_search regression hard gate violated: hyphenated DEC queries are empty while space-separated control is non-empty.
- Gate-4 p95 increase exceeds frozen threshold (`18.9549% > 15%`).
- Gate-4 stability fails: key metrics vary across 10 stability runs (unique-values != 1).
