import { describe, expect, it, vi } from "vitest";
import { createGraphitiClient } from "../client/graphiti-client.js";
import { createMem0Client, type RemoteClientError } from "../client/mem0-client.js";

const toJsonResponse = (status: number, payload: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }) as Response;

describe("mem0 + graphiti clients", () => {
  it("maps remote search hits to bridge hits", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      toJsonResponse(200, {
        results: [
          {
            id: "abc123",
            snippet: "prefers dark mode",
            score: 0.91,
          },
        ],
      }),
    );

    const errors: RemoteClientError[] = [];
    const client = createMem0Client({
      baseUrl: "https://mem0.test",
      timeoutMs: 2_000,
      fetchImpl: fetchMock,
      errorReporter: (error) => {
        errors.push(error);
      },
    });

    const hits = await client.search("user preference");

    expect(hits).toEqual([
      {
        path: "bridge/mem0/abc123",
        startLine: 1,
        endLine: 1,
        score: 0.91,
        snippet: "prefers dark mode",
        source: "mem0",
        remoteId: "abc123",
      },
    ]);
    expect(errors).toEqual([]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://mem0.test/search",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ query: "user preference" }),
      }),
    );
  });

  it("uses separate timeout budgets for search and get", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(toJsonResponse(200, { results: [] }))
      .mockResolvedValueOnce(toJsonResponse(200, { text: "fetched" }));

    const client = createGraphitiClient({
      baseUrl: "https://graphiti.test",
      timeoutMs: 1_500,
      getTimeoutMs: 3_000,
      fetchImpl: fetchMock,
    });

    await client.search("timeline");
    await client.getById("g-1");

    expect(timeoutSpy).toHaveBeenNthCalledWith(1, 1_500);
    expect(timeoutSpy).toHaveBeenNthCalledWith(2, 3_000);

    timeoutSpy.mockRestore();
  });

  it("returns empty results on timeout", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(Object.assign(new Error("timed out"), { name: "TimeoutError" }));

    const errors: RemoteClientError[] = [];
    const client = createGraphitiClient({
      baseUrl: "https://graphiti.test",
      timeoutMs: 1_500,
      fetchImpl: fetchMock,
      errorReporter: (error) => {
        errors.push(error);
      },
    });

    const hits = await client.search("timeline");

    expect(hits).toEqual([]);
    expect(errors).toEqual([
      {
        source: "graphiti",
        operation: "search",
        code: "REMOTE_TIMEOUT",
        message: "timed out",
      },
    ]);
  });

  it("maps getById http error into remote client error", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      toJsonResponse(503, {
        error: {
          message: "upstream unavailable",
        },
      }),
    );

    const errors: RemoteClientError[] = [];
    const client = createMem0Client({
      baseUrl: "https://mem0.test",
      timeoutMs: 2_000,
      fetchImpl: fetchMock,
      errorReporter: (error) => {
        errors.push(error);
      },
    });

    const record = await client.getById("abc123");
    expect(record).toBeNull();
    expect(errors).toEqual([
      {
        source: "mem0",
        operation: "get",
        code: "REMOTE_HTTP_ERROR",
        status: 503,
        message: "upstream unavailable",
      },
    ]);
  });
});
