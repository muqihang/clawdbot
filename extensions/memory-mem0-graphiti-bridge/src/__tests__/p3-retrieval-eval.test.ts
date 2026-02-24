import { describe, expect, it, vi } from "vitest";
import {
  parseRetrievalDataset,
  runRetrievalEvaluation,
  type RetrievalEvalSample,
} from "../p3/retrieval-eval.js";

describe("P3 retrieval evaluation", () => {
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
