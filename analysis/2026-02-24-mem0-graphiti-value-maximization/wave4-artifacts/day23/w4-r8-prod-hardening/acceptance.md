# W4-R8 Prod Hardening Acceptance (Mem0 required fields + error observability + latency budget)

This wave lands three production-hardening changes for the Mem0/Graphiti memory bridge:

- A) Mem0 `/search` no longer 500s due to missing required identifier fields.
- B) Remote 4xx/5xx/timeout no longer "quietly looks like empty results"; errors are diagnosable via `details.fallback.reason` (and status/message fields).
- C) Remote latency budget is controlled (especially Graphiti): no more "3s + 9s retry" turning a single query into ~12s by default.

Constraints honored:

- No qmd introduced/enabled.
- No changes to the "18082 embeddings" policy.
- No real API keys committed (tests use mocks only).
- No stop/start of memory stack (changes are code + unit tests only).

## A) Mem0 required field injection

What changed:

- `RemoteSearchOptions` now supports optional top-level `user_id`, `agent_id`, `run_id`.
- Mem0 request body includes these fields at the top level when provided.
- The `memory_search` bridge tool auto-injects a stable Mem0 identifier when routing to Mem0 and none is provided:
  - Priority: `params.oc_user_id` or `params.metadata.oc_user_id`
  - Fallback: bridge `sessionKey`
  - Fallback: `toolCallId`
  - Graphiti routing does not inject these fields.

How to verify:

- Unit test: `extensions/memory-mem0-graphiti-bridge/src/__tests__/clients.test.ts`
  - Case: "includes run_id in mem0 /search request body (required field injection)"
  - Evidence body example is captured in `mem0-request-body.mock.json`.
- Unit test: `extensions/memory-mem0-graphiti-bridge/src/__tests__/memory-search-tool.test.ts`
  - Case: "injects mem0 stable identifier into remote search options when missing"

## B) Remote errors are visible (no silent empty results)

What changed:

- Remote client search now surfaces non-2xx (and final timeout/unavailable) as a structured error that bubbles up into `searchRemoteWithDiagnostics().error`.
- `memory_search` diagnostics classify remote failures into `details.fallback.reason`:
  - `timeout`
  - `http_4xx`
  - `http_5xx`
  - `remote_error`

How to verify:

- Unit test: `extensions/memory-mem0-graphiti-bridge/src/__tests__/clients.test.ts`
  - Case: "throws on http 500 and preserves status for diagnostics"
- Unit test: `extensions/memory-mem0-graphiti-bridge/src/__tests__/fallback-fault-injection.test.ts`
  - Case: "injects timeout fault and routes to fallback_route" => `fallback.reason=timeout`
  - Case: "injects 5xx fault and degrades to local fallback" => `fallback.reason=http_5xx` and `fallback.primary_status=503`

## C) Latency budget / retry hardening

Chosen implementation:

- Option A: add per-client retry control on `createRemoteClient(...)`.
  - Graphiti disables retry by default.
  - Mem0 keeps a single retry (existing behavior) for resilience on transient network/timeout errors.

Rationale:

- Graphiti queries are typically the slowest/most variable. Disabling retry prevents a single search from stretching into multi-attempt waits and respects the configured timeout budget.
- Mem0 is kept retry-enabled to preserve best-effort recall on transient failures without changing existing behavior.

How to verify:

- Unit test: `extensions/memory-mem0-graphiti-bridge/src/__tests__/clients.test.ts`
  - Case: "throws on timeout and does not retry (graphiti)" asserts `fetch` is called once.
