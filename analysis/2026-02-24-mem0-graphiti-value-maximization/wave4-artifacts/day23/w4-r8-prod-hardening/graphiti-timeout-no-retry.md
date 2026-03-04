# Evidence: Graphiti timeout does not retry

Graphiti client disables retry via `createGraphitiClient(...)` (passes `retry: { enabled: false }`).

Verification:

- `extensions/memory-mem0-graphiti-bridge/src/__tests__/clients.test.ts`
  - Test: "throws on timeout and does not retry (graphiti)"
  - Assertion: `expect(fetchMock).toHaveBeenCalledTimes(1)`
