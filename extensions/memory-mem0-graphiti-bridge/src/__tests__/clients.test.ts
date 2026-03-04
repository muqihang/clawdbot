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
            memory: "prefers dark mode",
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
        score_source: "score",
        snippet: "prefers dark mode",
        source: "mem0",
        remoteId: "abc123",
        structure: undefined,
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

  it("throws on timeout and does not retry (graphiti)", async () => {
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

    await expect(client.search("timeline")).rejects.toMatchObject({
      source: "graphiti",
      operation: "search",
      code: "REMOTE_TIMEOUT",
      message: "timed out",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      source: "graphiti",
      operation: "search",
      code: "REMOTE_TIMEOUT",
      message: "timed out",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on transient search failure (mem0)", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(Object.assign(new Error("timed out"), { name: "TimeoutError" }))
      .mockResolvedValueOnce(
        toJsonResponse(200, {
          results: [
            {
              id: "fact-1",
              fact: "Telegram is preferred",
              score: 0.91,
            },
          ],
        }),
      );

    const errors: RemoteClientError[] = [];
    const client = createMem0Client({
      baseUrl: "https://mem0.test",
      timeoutMs: 1_500,
      fetchImpl: fetchMock,
      errorReporter: (error) => {
        errors.push(error);
      },
    });

    const hits = await client.search("timeline");

    expect(hits).toEqual([
      {
        path: "bridge/mem0/fact-1",
        startLine: 1,
        endLine: 1,
        score: 0.91,
        score_source: "score",
        snippet: "Telegram is preferred",
        source: "mem0",
        remoteId: "fact-1",
        structure: undefined,
      },
    ]);
    expect(errors).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("includes run_id in mem0 /search request body (required field injection)", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      const hasId = Boolean(body?.run_id ?? body?.agent_id ?? body?.user_id);
      if (!hasId) {
        return toJsonResponse(500, { message: "missing required id field" });
      }
      return toJsonResponse(200, { results: [] });
    });

    const client = createMem0Client({
      baseUrl: "https://mem0.test",
      timeoutMs: 2_000,
      fetchImpl: fetchMock,
    });

    await client.search("user preference", { run_id: "run-123" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://mem0.test/search",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ query: "user preference", run_id: "run-123" }),
      }),
    );
  });

  it("throws on http 500 and preserves status for diagnostics", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      toJsonResponse(500, {
        error: {
          message: "upstream blew up",
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

    await expect(client.search("boom")).rejects.toMatchObject({
      source: "mem0",
      operation: "search",
      code: "REMOTE_HTTP_ERROR",
      status: 500,
      message: "upstream blew up",
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      source: "mem0",
      operation: "search",
      code: "REMOTE_HTTP_ERROR",
      status: 500,
      message: "upstream blew up",
    });
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

    expect(fetchMock).toHaveBeenCalledWith(
      "https://mem0.test/memories/abc123",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("aligns graphiti getById path with OpenAPI and parses fact payload", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      toJsonResponse(200, {
        uuid: "edge-1",
        name: "PREFERS",
        fact: "Telegram is preferred",
      }),
    );

    const client = createGraphitiClient({
      baseUrl: "https://graphiti.test",
      timeoutMs: 2_000,
      fetchImpl: fetchMock,
    });

    const record = await client.getById("edge-1");

    expect(record).toEqual({ text: "Telegram is preferred" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graphiti.test/entity-edge/edge-1",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("parses graphiti facts/episodes/nodes search payload", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      toJsonResponse(200, {
        facts: [
          {
            uuid: "fact-1",
            fact: "Telegram is preferred",
            score: 0.91,
          },
        ],
        episodes: [
          {
            uuid: "episode-1",
            summary: "Preference changed in Q1",
            score: 0.84,
          },
        ],
        nodes: [
          {
            uuid: "node-1",
            name: "Telegram",
            score: 0.8,
          },
        ],
      }),
    );

    const client = createGraphitiClient({
      baseUrl: "https://graphiti.test",
      timeoutMs: 2_000,
      fetchImpl: fetchMock,
    });

    const hits = await client.search("telegram preference");
    expect(hits).toEqual([
      {
        path: "bridge/graphiti/fact-1",
        startLine: 1,
        endLine: 1,
        score: 0.91,
        score_source: "score",
        snippet: "Telegram is preferred",
        source: "graphiti",
        remoteId: "fact-1",
        structure: "facts",
      },
      {
        path: "bridge/graphiti/episode-1",
        startLine: 1,
        endLine: 1,
        score: 0.84,
        score_source: "score",
        snippet: "Preference changed in Q1",
        source: "graphiti",
        remoteId: "episode-1",
        structure: "episodes",
      },
      {
        path: "bridge/graphiti/node-1",
        startLine: 1,
        endLine: 1,
        score: 0.8,
        score_source: "score",
        snippet: "Telegram",
        source: "graphiti",
        remoteId: "node-1",
        structure: "nodes",
      },
    ]);
  });

  it("fills missing graphiti scores with deterministic rank_score", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      toJsonResponse(200, {
        facts: [
          {
            uuid: "fact-1",
            fact: "First fact without score",
          },
          {
            uuid: "fact-2",
            fact: "Second fact without score",
          },
          {
            uuid: "fact-3",
            fact: "Fact with explicit score",
            score: 0.33,
          },
        ],
      }),
    );

    const client = createGraphitiClient({
      baseUrl: "https://graphiti.test",
      timeoutMs: 2_000,
      fetchImpl: fetchMock,
    });

    const hits = await client.search("timeline");
    expect(hits).toEqual([
      {
        path: "bridge/graphiti/fact-1",
        startLine: 1,
        endLine: 1,
        score: 1,
        score_source: "rank_score",
        snippet: "First fact without score",
        source: "graphiti",
        remoteId: "fact-1",
        structure: "facts",
      },
      {
        path: "bridge/graphiti/fact-2",
        startLine: 1,
        endLine: 1,
        score: 0.5,
        score_source: "rank_score",
        snippet: "Second fact without score",
        source: "graphiti",
        remoteId: "fact-2",
        structure: "facts",
      },
      {
        path: "bridge/graphiti/fact-3",
        startLine: 1,
        endLine: 1,
        score: 0.33,
        score_source: "score",
        snippet: "Fact with explicit score",
        source: "graphiti",
        remoteId: "fact-3",
        structure: "facts",
      },
    ]);
  });
});
