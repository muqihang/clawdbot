# Mem0 + Graphiti Self-Hosted Memory Stack

This runbook describes a stable, repeatable self-host deployment for Mem0 + Graphiti used by the `memory-mem0-graphiti-bridge` integration.

## Layout

- Versioned deployment assets in repo: `scripts/memory-stack/*`
- Runtime state outside repo: `$HOME/chelingxi_workspace/.openclaw-memory-stack/`
  - upstream clones
  - virtual environments
  - runtime env file
  - logs and pid files

## Script entrypoints

- `scripts/memory-stack/bootstrap.sh`
- `scripts/memory-stack/start.sh`
- `scripts/memory-stack/status.sh`
- `scripts/memory-stack/smoke.sh`
- `scripts/memory-stack/stop.sh`

## Bootstrap behavior

`bootstrap.sh` will:

- clone/fetch pinned upstream refs
  - graphiti: `510bd50d5408477bc172b63b5567b753b50b9d11`
  - mem0: `db15d5c6297ee2afaed2e91d86796a86f383949e`
- apply source patches for Graphiti server and Mem0 server
- apply site-package compatibility patches for Graphiti and Mem0
- create runtime env template at:
  - `$HOME/chelingxi_workspace/.openclaw-memory-stack/env/memory-stack.env`
- import defaults from local env when available

## Required environment values

Set in `$HOME/chelingxi_workspace/.openclaw-memory-stack/env/memory-stack.env`:

- LLM: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL_NAME`
- Embedding: `EMBEDDING_API_KEY`, `EMBEDDING_BASE_URL`, `EMBEDDING_MODEL_NAME`, `EMBEDDING_DIM`
- Neo4j: `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`

## Recommended model profiles

- Higher quality profile: `LLM_MODEL_NAME=gpt-5.3-codex`
- Faster profile: `LLM_MODEL_NAME=gpt-5.1-codex-mini`

## Compatibility notes

- sub2api is consumed via OpenAI-compatible Responses endpoint (`/v1/responses`).
- Graphiti patch enforces structured JSON schema output for extraction calls.
- Mem0 patch routes LLM calls through Responses API in this stack.
- Bridge mem0 contract uses `/search` and `/memories/{id}` and supports `memory` field parsing.

## Start and verify

```bash
scripts/memory-stack/bootstrap.sh
scripts/memory-stack/start.sh
scripts/memory-stack/smoke.sh
scripts/memory-stack/status.sh
```

Expected smoke output includes:

- `graphiti episodes>=1 facts>=1`
- `mem0 add_results>=1 search_results>=1`

## Canonical-first batch backfill

### Dry-run

```bash
scripts/memory-stack/backfill.sh --source-root /Users/muqihang/clawd --phase canonical --dry-run
```

### Phase-by-phase apply

```bash
scripts/memory-stack/backfill.sh --source-root /Users/muqihang/clawd --phase canonical --apply
scripts/memory-stack/backfill.sh --source-root /Users/muqihang/clawd --phase topics --apply
scripts/memory-stack/backfill.sh --source-root /Users/muqihang/clawd --phase daily --days 14 --apply
```

### `--phase all` order

`--phase all` always executes in this order:

1. `canonical`
2. `topics`
3. `daily`

Topics are ingested as derived records (`source_tier=topic_derived`) and reconciliation never lets topic-derived ownership overwrite canonical ownership.

### Resume and retry behavior

- Deterministic chunk id: `sha256(source_path + heading + normalized_chunk_text)`
- Persistent resumable state: `~/.openclaw-memory-stack/run/backfill-state.json`
- Audit log: `~/.openclaw-memory-stack/run/backfill-*.audit.jsonl`
- Summary report: `~/.openclaw-memory-stack/run/backfill-*.summary.json`
- Retry policy covers timeout/429/5xx with exponential backoff (default attempts: 5)
- Bounded concurrency defaults to `2` and can be tuned via `--concurrency`

### Idempotency rerun check

Re-run canonical apply to prove idempotency and bounded duplicate behavior:

```bash
scripts/memory-stack/backfill.sh --source-root /Users/muqihang/clawd --phase canonical --apply
```

On the second apply, `skipped_existing` should increase significantly while success counts should not show duplicate explosion.

### Verification command and pass criteria

```bash
scripts/memory-stack/verify-backfill.sh
```

Required pass criteria:

- Mem0 probes: at least `3/5` with non-zero search results
- Graphiti probes: at least `3/5` with non-zero search/facts/episodes evidence

Probe set used by verification:

- `牧启航`
- `Telegram 优先`
- `Jarvis OS`
- `Mem0 Graphiti 记忆升级`
- `thinktank/topology`

## Rollback

- Stop stack only: `scripts/memory-stack/stop.sh`
- Keep `write_mode=off` and avoid enabling runtime outbox/write chain during rollback
- Resume from previous successful progress by keeping `~/.openclaw-memory-stack/run/backfill-state.json`
- Force replay from scratch by moving the state file aside (for example, rename to `backfill-state.<timestamp>.json`) and re-running phased apply
- Rebuild same pinned environment: rerun `scripts/memory-stack/bootstrap.sh`
- Change upstream refs by editing `scripts/memory-stack/common.sh`, then rerun bootstrap
