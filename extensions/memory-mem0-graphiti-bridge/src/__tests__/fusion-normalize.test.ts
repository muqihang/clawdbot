import { describe, expect, it } from "vitest";
import { normalizeAndRankCandidates } from "../fusion/normalize.js";

describe("normalizeAndRankCandidates", () => {
  it("keeps top1 deterministic on all-zero ties even when input order flips", () => {
    const candidates = [
      {
        source: "graphiti" as const,
        remoteId: "g-1",
        path: "bridge/graphiti/g-1",
        score: 0,
        score_source: "missing" as const,
      },
      {
        source: "mem0" as const,
        remoteId: "m-2",
        path: "bridge/mem0/z-path",
        score: 0,
        score_source: "missing" as const,
      },
      {
        source: "mem0" as const,
        remoteId: "m-1",
        path: "bridge/mem0/a-path",
        score: 0,
        score_source: "missing" as const,
      },
    ];

    const forward = normalizeAndRankCandidates({ candidates, topK: 3 });
    const reversed = normalizeAndRankCandidates({
      candidates: [...candidates].reverse(),
      topK: 3,
    });

    expect(forward.topk[0]).toEqual(
      expect.objectContaining({
        source: "mem0",
        remoteId: "m-1",
        path: "bridge/mem0/a-path",
        score: 0,
      }),
    );
    expect(reversed.topk[0]).toEqual(
      expect.objectContaining({
        source: "mem0",
        remoteId: "m-1",
        path: "bridge/mem0/a-path",
        score: 0,
      }),
    );
    expect(reversed.topk[0]?.remoteId).toBe(forward.topk[0]?.remoteId);
    expect(forward.tie.all_zero).toBe(true);
    expect(forward.tie.all_same_score).toBe(true);
  });

  it("dedupes by remoteId (case-insensitive + trim) and keeps the higher score", () => {
    const candidates = [
      {
        source: "mem0" as const,
        remoteId: "DUP",
        path: "bridge/mem0/dup-old",
        score: 0.1,
        score_source: "score" as const,
      },
      {
        source: "mem0" as const,
        remoteId: " dup ",
        path: "bridge/mem0/dup-new",
        score: 0.9,
        score_source: "rank_score" as const,
      },
    ];

    const ranked = normalizeAndRankCandidates({ candidates, topK: 5 });

    expect(ranked.ranked).toHaveLength(1);
    expect(ranked.ranked[0]).toEqual(
      expect.objectContaining({
        remoteId: " dup ",
        path: "bridge/mem0/dup-new",
        score: 0.9,
      }),
    );

    expect(ranked.dedupe.collisions).toHaveLength(1);
    expect(ranked.dedupe.dropped).toHaveLength(1);
  });

  it("dedupes cross-source collisions and applies fixed source priority on score ties", () => {
    const candidates = [
      {
        source: "graphiti" as const,
        remoteId: "Same",
        path: "bridge/graphiti/same",
        score: 0.7,
        score_source: "score" as const,
      },
      {
        source: "mem0" as const,
        remoteId: "same",
        path: "bridge/mem0/same",
        score: 0.7,
        score_source: "rank_score" as const,
      },
    ];

    const ranked = normalizeAndRankCandidates({ candidates, topK: 5 });

    expect(ranked.ranked).toHaveLength(1);
    expect(ranked.ranked[0]).toEqual(
      expect.objectContaining({
        source: "mem0",
        remoteId: "same",
      }),
    );

    expect(ranked.dedupe.collisions).toEqual([
      expect.objectContaining({
        normalized_key: "same",
        kept: expect.objectContaining({
          source: "mem0",
        }),
        dropped: [
          expect.objectContaining({
            source: "graphiti",
          }),
        ],
      }),
    ]);
  });
});
