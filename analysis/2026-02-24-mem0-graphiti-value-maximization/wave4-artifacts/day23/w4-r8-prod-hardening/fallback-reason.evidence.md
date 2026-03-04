# Evidence: fallback.reason surfaces http_5xx + timeout

Remote failures are surfaced as diagnosable `details.fallback.reason` values rather than silently appearing as empty results.

Verification:

- Timeout path:
  - `extensions/memory-mem0-graphiti-bridge/src/__tests__/fallback-fault-injection.test.ts`
  - Test: "injects timeout fault and routes to fallback_route"
  - Assertion: `fallbackRecord.reason === "timeout"`

- HTTP 5xx path:
  - `extensions/memory-mem0-graphiti-bridge/src/__tests__/fallback-fault-injection.test.ts`
  - Test: "injects 5xx fault and degrades to local fallback"
  - Assertions:
    - `fallbackRecord.reason === "http_5xx"`
    - `fallbackRecord.primary_status === 503`
