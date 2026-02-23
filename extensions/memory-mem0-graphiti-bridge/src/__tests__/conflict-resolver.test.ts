import { describe, expect, it } from "vitest";
import { resolveFactConflicts } from "../p2/conflict-resolver.js";
import type { BridgeFactRecord } from "../p2/types.js";

const buildRecord = (overrides: Partial<BridgeFactRecord>): BridgeFactRecord => {
  const now = "2026-02-23T10:00:00.000Z";
  return {
    memory_id: "fact-base",
    fact_key: "decision.locale",
    fact_value: "zh-CN",
    ttl_class: "daily_scan",
    confidence: 0.9,
    status: "active",
    source_event_id: "2026-02-22:1",
    detail_path: "memory/2026-02-22.md",
    trigger_keywords: [],
    active_context: false,
    event_time: "2026-02-22T00:00:00.000Z",
    ingest_time: now,
    ...overrides,
  };
};

describe("P2 conflict resolver", () => {
  it("marks old value superseded and links new value via supersedes_id", () => {
    const existing = [
      buildRecord({
        memory_id: "fact-old",
        fact_key: "project.release_channel",
        fact_value: "beta",
        status: "active",
      }),
    ];

    const incoming = [
      buildRecord({
        memory_id: "fact-new",
        fact_key: "project.release_channel",
        fact_value: "stable",
        confidence: 0.93,
      }),
    ];

    const result = resolveFactConflicts({
      existingRecords: existing,
      candidates: incoming,
      lowConfidenceThreshold: 0.7,
    });

    const oldRecord = result.records.find((record) => record.memory_id === "fact-old");
    const newRecord = result.records.find((record) => record.memory_id === "fact-new");

    expect(oldRecord?.status).toBe("superseded");
    expect(newRecord?.status).toBe("active");
    expect(newRecord?.supersedes_id).toBe("fact-old");
    expect(result.metrics.conflictCount).toBe(1);
    expect(result.metrics.addedCount).toBe(1);
  });

  it("routes low-confidence conflict to pending_review queue", () => {
    const existing = [
      buildRecord({
        memory_id: "fact-old",
        fact_key: "decision.rollout",
        fact_value: "phase1",
      }),
    ];

    const incoming = [
      buildRecord({
        memory_id: "fact-review",
        fact_key: "decision.rollout",
        fact_value: "phase2",
        confidence: 0.42,
      }),
    ];

    const result = resolveFactConflicts({
      existingRecords: existing,
      candidates: incoming,
      lowConfidenceThreshold: 0.7,
    });

    const pending = result.records.find((record) => record.memory_id === "fact-review");
    const activeOld = result.records.find((record) => record.memory_id === "fact-old");

    expect(pending?.status).toBe("pending_review");
    expect(activeOld?.status).toBe("active");
    expect(result.reviewQueue).toHaveLength(1);
    expect(result.reviewQueue[0]).toEqual(
      expect.objectContaining({
        candidateId: "fact-review",
        reason: "low_confidence_conflict",
      }),
    );
    expect(result.metrics.conflictCount).toBe(1);
    expect(result.metrics.addedCount).toBe(0);
  });

  it("skips duplicates with same fact_key and fact_value", () => {
    const existing = [
      buildRecord({
        memory_id: "fact-old",
        fact_key: "decision.locale",
        fact_value: "zh-CN",
      }),
    ];

    const incoming = [
      buildRecord({
        memory_id: "fact-dup",
        fact_key: "decision.locale",
        fact_value: "zh-CN",
      }),
    ];

    const result = resolveFactConflicts({
      existingRecords: existing,
      candidates: incoming,
      lowConfidenceThreshold: 0.7,
    });

    expect(result.records).toHaveLength(1);
    expect(result.metrics.duplicateSkippedCount).toBe(1);
    expect(result.metrics.addedCount).toBe(0);
  });
});
