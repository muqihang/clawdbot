import { describe, expect, it } from "vitest";
import { contextAssemble } from "../p3/context-assemble.js";

const baseHits = [
  {
    source_id: "bridge/mem0/1",
    snippet: "provider switched at 2026-02-01T10:00:00Z",
    score: 0.92,
    created_at: "2026-02-01T10:00:00Z",
  },
  {
    source_id: "bridge/graphiti/2",
    snippet: "decision rationale recorded at 2026-02-02T10:00:00Z",
    score: 0.88,
    created_at: "2026-02-02T10:00:00Z",
  },
];

describe("contextAssemble", () => {
  it("routes exact_id bucket to T1", () => {
    const result = contextAssemble({
      query_id: "q-1",
      query_text: "what is the ticket id",
      bucket: "exact_id",
      retrieval_hits: baseHits,
      oc_user_id: "ocu_v1:telegram:123456",
      message_envelope: {
        role: "user",
        created_at: "2026-02-02T10:00:00Z",
      },
    });

    expect(result.template_id).toBe("T1");
    expect(result.decision).toBe("answer");
    expect(result.degrade_reason).toBeNull();
    expect(result.resolved_id).toBe("ocu_v1:telegram:123456");
    expect(result.resolved_id_type).toBe("oc_user_id");
  });

  it("routes timeline bucket to T2", () => {
    const result = contextAssemble({
      query_id: "q-2",
      query_text: "timeline for migration",
      bucket: "timeline",
      retrieval_hits: baseHits,
      message_envelope: {
        role: "assistant",
        created_at: "2026-02-03T10:00:00Z",
      },
    });

    expect(result.template_id).toBe("T2");
    expect(result.decision).toBe("answer");
    expect(result.degrade_reason).toBeNull();
    expect(result.timeline).toHaveLength(2);
    expect(result.timeline?.[0]?.ts <= result.timeline?.[1]?.ts).toBe(true);
  });

  it("routes decision_reason bucket to T3", () => {
    const result = contextAssemble({
      query_id: "q-3",
      query_text: "why did we switch providers",
      bucket: "decision_reason",
      retrieval_hits: baseHits,
      constraints: ["risk<=5%", "fallback<10%"],
      message_envelope: {
        metadata: {
          channel: "telegram",
        },
      },
    });

    expect(result.template_id).toBe("T3");
    expect(result.decision).toBe("answer");
    expect(result.degrade_reason).toBeNull();
    expect(result.rationale?.length).toBeGreaterThanOrEqual(2);
  });

  it("degrades with non-empty reason when exact_id misses identity fields", () => {
    const result = contextAssemble({
      query_id: "q-4",
      query_text: "exact lookup",
      bucket: "exact_id",
      retrieval_hits: baseHits,
    });

    expect(result.template_id).toBe("T1");
    expect(result.decision).toBe("degrade");
    expect(result.degrade_reason).toEqual(expect.any(String));
    expect(result.degrade_reason?.length ?? 0).toBeGreaterThan(0);
  });

  it("degrades with non-empty reason when budget is exceeded", () => {
    const hugeSnippet = "x".repeat(30_000);
    const result = contextAssemble({
      query_id: "q-5",
      query_text: "timeline".repeat(5000),
      bucket: "timeline",
      retrieval_hits: [
        {
          source_id: "bridge/graphiti/too-large",
          snippet: hugeSnippet,
          score: 0.6,
          created_at: "2026-02-01T10:00:00Z",
        },
      ],
    });

    expect(result.template_id).toBe("T2");
    expect(result.decision).toBe("degrade");
    expect(result.degrade_reason).toEqual(expect.any(String));
    expect(result.degrade_reason?.length ?? 0).toBeGreaterThan(0);
  });
});
