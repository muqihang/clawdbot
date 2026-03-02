# Wave4 Gate-4 Final (W4-D) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produce a reproducible, fully-auditable Wave4 Gate-4 final evaluation (GO/NO-GO) with all evidence persisted under the frozen Day10 evidence root and the Day10 single-point anchors.

**Architecture:** Treat this as an audit pipeline. Do not change any business logic under `extensions/memory-mem0-graphiti-bridge/src/**`. Only add runners / datasets / reports / scripts. All command outputs and exits are persisted as evidence files.

**Tech Stack:** Node 22+, pnpm, vitest, tsx, OpenClaw CLI, local Mem0+Graphiti memory stack scripts.

---

### Task 1: Preflight (evidence directory + environment snapshots)

**Files:**

- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/**`
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/inputs/git.snapshot.json`
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/inputs/runtime.snapshot.json`

**Steps:**

1. Create the frozen evidence directory structure (inputs/openapi/tests/gate2-regression/gate3-regression/stack/retrieval/latency/report/memory-search-regression).
2. Ensure `git status --porcelain` is clean; record `rev-parse HEAD`, branch name, and porcelain output.
3. Record runtime snapshot: `node -v`, `pnpm -v`, `uname -a`, and a redacted `~/.openclaw/openclaw.json` snapshot (exclude tokens/api keys).

---

### Task 2: Gate-4 dataset freeze (day2) + snapshot (day10)

**Files:**

- Create/Update: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day2/inputs/retrieval-gate4-dataset.v1.json`
- Create/Update: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day2/dataset-notes.md`
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day2/scripts/verify-gate4-dataset-ground-truth.ts`
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/inputs/retrieval-gate4-dataset.v1.snapshot.json`
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/inputs/dataset-notes.snapshot.md`

**Steps:**

1. Confirm dataset contains 4 buckets (`exact_id|decision_reason|temporal_relation|project_context`) and each bucket has `>= 30` samples after dedupe.
2. Implement dedupe rule in notes and in the Gate-4 runner: within each bucket, `expected_ids[0]` must be unique for scoring; `query` must be unique (aliases allowed).
3. Implement ground truth verifier: for each sample, call Graphiti GET-by-id (`/entity-edge/{uuid}`) and report ok/fail counts; exit non-zero if any fail.
4. Run verifier and persist logs/exits under Day10 `stack/` (or `inputs/`), then snapshot dataset + notes into Day10 evidence inputs.

---

### Task 3: memory_search regression gate (hyphenated DEC IDs)

**Files:**

- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/memory-search-regression/queries.json`
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/memory-search-regression/env.json`
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/memory-search-regression/summary.json`
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/memory-search-regression/acceptance.md`
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/scripts/run-memory-search-regression.ts`

**Steps:**

1. Persist the fixed query list (control + hyphenated + whitespace control) and expected non-empty/allowed-empty.
2. Run L1: `pnpm -s openclaw memory search "<query>" --json` three times, persist raw outputs.
3. Run L2: in-process tool execution (bridge tool) for `read_mode=local` and `read_mode=primary`, three times; persist raw outputs and diagnostic fields if present.
4. Build `summary.json` with results_count + key metadata; write `acceptance.md` with pass/fail + blockers.

---

### Task 4: Start local memory stack (Mem0 + Graphiti) and persist logs

**Files:**

- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/stack/bootstrap.log` (+ `.exit`)
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/stack/start.log` (+ `.exit`)
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/stack/status.log` (+ `.exit`)
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/stack/smoke.log` (+ `.exit`)

**Steps:**

1. Run `scripts/memory-stack/bootstrap.sh` if needed; persist logs/exits.
2. Run `scripts/memory-stack/start.sh`, then `status.sh`, then `smoke.sh`; persist logs/exits.
3. If the stack writes logs elsewhere (e.g. `~/.openclaw-memory-stack/`), copy at least tail 200 lines into evidence and note original path.

---

### Task 5: Gate-4 runner (baseline vs variant) + evidence outputs

**Files:**

- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/scripts/run-w4-d-gate4-eval.ts`
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/report/w4-gate4-baseline-report.json`
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/report/w4-gate4-variant-report.json`
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/report/w4-gate4-delta.json`
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/report/w4-gate4-review.md`

**Steps:**

1. Load dataset snapshot JSON array and enforce per-bucket dedupe for scoring (but keep full dataset in evidence).
2. Run two modes with a single-variable toggle:
   - baseline: `read.fusion.enabled=false`
   - variant: `read.fusion.enabled=true`
3. For each mode:
   - bounded runs = 5
   - stability runs = 10
   - persist per run raw outputs and normalized topK per source (`mem0`, `graphiti`, and local if present)
   - persist `metrics.per-sample.json` and latency samples (`latency.samples.jsonl`)
4. Compute frozen Gate-4 metrics:
   - `top1_avg_delta_pp >= 8`
   - `fur_delta_pp >= 10` (fur proxy = overall hit@1)
   - `p95_increase_pct <= 15`
   - stability: unique-values=1 for declared metrics across 10 stability runs

---

### Task 6: Mandatory tests + regressions (with logs + exits)

**Files:**

- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/tests/vitest.log` (+ `.exit`)
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/gate2-regression/w2-gate2-minimal-verify.log` (+ `.exit`)
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/gate3-regression/w3-gate3-minimal-verify.log` (+ `.exit`)

**Steps:**

1. Run full bridge vitest suite.
2. Run the exact W2 Gate-2 minimal regression test by name.
3. Run the W3 Gate-3 minimal regression runner (`run-w3-d-gate3-eval.ts`).
4. Persist logs/exits to evidence paths.

---

### Task 7: Final anchors (Day10 single-point facts) + acceptance

**Files:**

- Create/Update: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-gate4-report.json`
- Create/Update: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-gate4-report.txt`
- Create/Update: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-gate4-review.md`
- Create/Update: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-master-closure.md`
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/acceptance.md`
- Create: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day10/w4-d-gate4-final/changed_files.txt`

**Steps:**

1. Populate the single-point JSON anchor with computed Gate-4 metrics, pass/fail booleans for tests/regressions, and `gate4: GO|NO-GO`.
2. Ensure NO-GO contains explicit blockers with evidence paths.
3. Record acceptance checklist, changed files, and any caveats (e.g. if pre-commit hooks needed `--no-verify` due to argument limits).

---

### Task 8: Commits (2 commits, Chinese messages)

**Steps:**

1. Commit 1: dataset v1 + verifier script + runners/report templates (no large retrieval outputs).
2. Commit 2: Day10 final evidence outputs + Day10 single-point anchors.
3. Use `scripts/committer "<msg>" <file...>` to keep staging scoped and avoid accidental unrelated changes.
