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

## Rollback

- Stop stack only: `scripts/memory-stack/stop.sh`
- Rebuild same pinned environment: rerun `scripts/memory-stack/bootstrap.sh`
- Change upstream refs by editing `scripts/memory-stack/common.sh`, then rerun bootstrap
