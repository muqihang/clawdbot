import { describe, expect, it, vi } from "vitest";
import { createGraphitiClient } from "../client/graphiti-client.js";
import { createMem0Client } from "../client/mem0-client.js";
import {
  parseRetrievalDataset,
  runRetrievalEvaluation,
  type RetrievalEvalSample,
} from "../p3/retrieval-eval.js";

describe("P3 retrieval evaluation", () => {
  it("preserves remote rank for all-zero ties within the same structure", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            facts: [
              { uuid: "b-hit", fact: "second" },
              { uuid: "a-hit", fact: "first" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            facts: [
              { uuid: "a-hit", fact: "first" },
              { uuid: "b-hit", fact: "second" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    const client = createGraphitiClient({
      baseUrl: "https://graphiti.test",
      timeoutMs: 2_000,
      fetchImpl: fetchMock,
    });

    const first = await client.search("tie-query");
    const second = await client.search("tie-query");

    expect(first.map((hit) => hit.remoteId)).toEqual(["b-hit", "a-hit"]);
    expect(second.map((hit) => hit.remoteId)).toEqual(["a-hit", "b-hit"]);
  });

  it("keeps facts ahead of episodes and nodes on all-zero ties", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { id: "000-episode", summary: "episode-first", structure: "episodes" },
            { id: "001-node", name: "node-second", structure: "nodes" },
            { id: "999-fact", fact: "fact-third", structure: "facts" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const client = createGraphitiClient({
      baseUrl: "https://graphiti.test",
      timeoutMs: 2_000,
      fetchImpl: fetchMock,
    });

    const hits = await client.search("structure-priority-query");

    expect(hits[0]?.remoteId).toBe("999-fact");
    expect(hits.map((hit) => hit.remoteId)).toEqual(["999-fact", "000-episode", "001-node"]);
  });

  it("dedupes repeated remoteId hits by keeping the highest score", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { id: "dup", memory: "low", score: 0.2 },
            { id: "other", memory: "mid", score: 0.7 },
            { id: "dup", memory: "high", score: 0.91 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const client = createMem0Client({
      baseUrl: "https://mem0.test",
      timeoutMs: 2_000,
      fetchImpl: fetchMock,
    });

    const hits = await client.search("dedupe-query");

    expect(hits.map((hit) => hit.remoteId)).toEqual(["dup", "other"]);
    expect(hits[0]?.score).toBe(0.91);
  });

  it("computes hit, structure, and alias metrics", async () => {
    const dataset: RetrievalEvalSample[] = [
      {
        id: "s1",
        query: "telegram preference",
        aliases: ["tg preference"],
        expected_ids: ["fact-1"],
        expected_structures: ["facts", "episodes"],
      },
      {
        id: "s2",
        query: "imessage priority",
        aliases: ["苹果短信 优先级"],
        expected_ids: ["node-2"],
        expected_structures: ["nodes"],
      },
    ];

    const client = {
      search: vi.fn(async (query: string) => {
        if (query === "telegram preference") {
          return [
            {
              path: "bridge/graphiti/fact-1",
              startLine: 1,
              endLine: 1,
              score: 0.9,
              snippet: "telegram preferred",
              source: "graphiti" as const,
              remoteId: "fact-1",
              structure: "facts",
            },
            {
              path: "bridge/graphiti/episode-1",
              startLine: 1,
              endLine: 1,
              score: 0.8,
              snippet: "episode",
              source: "graphiti" as const,
              remoteId: "episode-1",
              structure: "episodes",
            },
          ];
        }

        if (query === "tg preference") {
          return [
            {
              path: "bridge/graphiti/fact-1",
              startLine: 1,
              endLine: 1,
              score: 0.92,
              snippet: "telegram preferred",
              source: "graphiti" as const,
              remoteId: "fact-1",
              structure: "facts",
            },
          ];
        }

        if (query === "imessage priority") {
          return [
            {
              path: "bridge/graphiti/fact-9",
              startLine: 1,
              endLine: 1,
              score: 0.9,
              snippet: "noise",
              source: "graphiti" as const,
              remoteId: "fact-9",
              structure: "facts",
            },
            {
              path: "bridge/graphiti/node-2",
              startLine: 1,
              endLine: 1,
              score: 0.85,
              snippet: "iMessage",
              source: "graphiti" as const,
              remoteId: "node-2",
              structure: "nodes",
            },
          ];
        }

        return [];
      }),
      getById: vi.fn(async () => null),
    };

    const summary = await runRetrievalEvaluation({
      dataset,
      client,
      topK: 3,
    });

    expect(summary.hit_at_1).toBe(0.5);
    expect(summary.hit_at_3).toBe(1);
    expect(summary.structure_coverage).toBe(1);
    expect(summary.alias_recall).toBe(0.5);
  });

  it("parses retrieval dataset and filters invalid rows", () => {
    const parsed = parseRetrievalDataset([
      {
        id: "ok",
        query: "query",
        aliases: ["alias"],
        expected_ids: ["fact-1"],
        expected_structures: ["facts", "invalid"],
      },
      {
        id: 1,
        query: "invalid",
      },
    ]);

    expect(parsed).toEqual([
      {
        id: "ok",
        query: "query",
        aliases: ["alias"],
        expected_ids: ["fact-1"],
        expected_structures: ["facts"],
      },
    ]);
  });
});
