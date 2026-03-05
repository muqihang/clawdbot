# Memory Stack Scripts

Stable self-host deployment helpers for Mem0 + Graphiti used by the `memory-mem0-graphiti-bridge` flow.

## Where things live

- Versioned scripts + patches: `scripts/memory-stack/`
- Runtime state (clones, venv, logs, pids, env): `~/chelingxi_workspace/.openclaw-memory-stack/`

## Commands

```bash
scripts/memory-stack/bootstrap.sh
scripts/memory-stack/start.sh
scripts/memory-stack/smoke.sh
scripts/memory-stack/status.sh
scripts/memory-stack/backfill.sh
scripts/memory-stack/verify-backfill.sh
scripts/memory-stack/stop.sh
```

## Notes

- Pinned upstream refs are in `scripts/memory-stack/common.sh`.
- `bootstrap.sh` auto-generates env template and imports defaults from `~/chelingxi_workspace/chelingxi-os/.env.local` when available.
- `bootstrap.sh` and `start.sh` also import keys from repo `./.env` when present (for example `SUB2API_API_KEY` and `MEMORY_REMOTE_API_KEY`) and sync them into the stack env (`LLM_API_KEY`, `EMBEDDING_API_KEY`).
- `LLM_BASE_URL` must be an OpenAI-compatible Responses endpoint base (for example `http://127.0.0.1:18081/v1`).
- Default `LLM_MODEL_NAME` is `gpt-5.3-codex` for higher extraction quality on ingestion.
- Graphiti site-package patch enforces `json_schema` structured output and disables reasoning/verbosity request kwargs by default for better compatibility with OpenAI-compatible gateways.
