import { describe, expect, it, vi } from "vitest";
import { createGraphitiClient } from "../client/graphiti-client.js";

describe("graphiti query construction", () => {
  it("includes max_facts in /search request body", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ facts: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const client = createGraphitiClient({
      baseUrl: "https://graphiti.test",
      timeoutMs: 2_000,
      fetchImpl: fetchMock,
    });

    await client.search("telegram preference");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    expect(requestBody).toEqual({
      query: "telegram preference",
      max_facts: 1,
    });
  });
});
