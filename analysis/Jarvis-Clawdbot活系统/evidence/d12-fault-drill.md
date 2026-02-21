# D12 Fault Drill Report

- generated_at: 2026-02-19T03:05:14.333Z
- total_scenarios: 6
- dag_complete_scenarios: 6
- dag_complete_ratio: 1
- default_guardrail_state: read_mode=local, write_mode=off

| Scenario            | Degrade | Fallback | Rollback | DAG Complete |
| ------------------- | ------- | -------- | -------- | ------------ |
| Jarvis down         | ✅      | ✅       | ✅       | ✅           |
| Graph timeout       | ✅      | ✅       | ✅       | ✅           |
| Vector down         | ✅      | ✅       | ✅       | ✅           |
| Auth fail           | ✅      | ✅       | ✅       | ✅           |
| Quota exceed        | ✅      | ✅       | ✅       | ✅           |
| Replay worker crash | ✅      | ✅       | ✅       | ✅           |

## Scenario Evidence

### Jarvis down

- degrade: detect jarvis endpoint unavailable and trigger degrade policy
- fallback: fallback to local retrieval-only chain without jarvis write path
- rollback: restore guardrails and keep read_mode=local/write_mode=off
- post_recovery: read_mode=local, write_mode=off

### Graph timeout

- degrade: detect graph execution timeout and lower retrieval complexity
- fallback: fallback to bounded local graph traversal timeout profile
- rollback: rollback graph timeout override and restore conservative defaults
- post_recovery: read_mode=local, write_mode=off

### Vector down

- degrade: detect vector index unavailable and disable vector retrieval path
- fallback: fallback to lexical retrieval and cache snapshot mode
- rollback: rollback temporary vector bypass and enforce local read-only policy
- post_recovery: read_mode=local, write_mode=off

### Auth fail

- degrade: detect auth scope mismatch and enter degraded authorization mode
- fallback: fallback to deny-write safe path and scoped local read mode
- rollback: rollback transient auth policy mutation to conservative defaults
- post_recovery: read_mode=local, write_mode=off

### Quota exceed

- degrade: detect quota exceeded and clamp expensive retrieval dimensions
- fallback: fallback to low-cost retrieval profile with strict budget guardrails
- rollback: rollback quota drill overrides and keep write_mode=off
- post_recovery: read_mode=local, write_mode=off

### Replay worker crash

- degrade: detect replay worker crash and switch to dead-letter accumulation
- fallback: fallback to manual replay trigger and manual fix flow
- rollback: rollback worker drill settings and preserve replay.auto.enabled=false
- post_recovery: read_mode=local, write_mode=off
