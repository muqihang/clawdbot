# Gate-2 Retrieval Dataset v1 (Step 1)

- goal: expand dataset to `>=30` with auditable ground truth via Graphiti `/entity-edge/{uuid}`
- generated_at_utc: `2026-02-28T06:39:36.301Z`
- graphiti_base_url: `http://127.0.0.1:8000`
- max_facts_used_for_sampling: `50`

## Outputs

- dataset: `inputs/retrieval-dataset.v1.json`
- candidates snapshot: `inputs/retrieval-dataset.v1.candidates.json`
- build log: `inputs/retrieval-dataset.v1.build.log`

## Repro command

```bash
node --import tsx analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/scripts/build-retrieval-dataset-v1.ts
```

## Source

- candidate discovery: POST `/search` with seed queries (see script `seeds` list)
- ground truth validation: GET `/entity-edge/{uuid}` for every `expected_id`

## Dedup rules

- `expected_id` (uuid) is unique (case-insensitive) across dataset
- `query` is unique after `trim + lower`

## Coverage

- sample_size: `34`
- chinese_queries: `3`
- aliases_total: `33` (<=1 per sample)
- topic coverage is approximated via seed diversity + per-name cap (max 4 per `edge.name`)

## Validation

- every sample uses `query = fact text` from `/entity-edge/{uuid}` (semantic match by construction)
- samples failing `/entity-edge` fetch or filtered by safety heuristics are excluded
