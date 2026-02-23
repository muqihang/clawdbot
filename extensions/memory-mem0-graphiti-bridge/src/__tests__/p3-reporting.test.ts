import { describe, expect, it } from "vitest";
import { buildP3RunSummary, buildP3SnapshotMetrics } from "../p3/reporting.js";

describe("P3 reporting", () => {
  it("includes reconciliation and outbox counters", () => {
    const metrics = buildP3SnapshotMetrics({
      candidateCount: 12,
      addedCount: 5,
      duplicateSkippedCount: 2,
      conflictCount: 5,
      sensitiveInterceptedCount: 1,
      indexConsistencyFailureCount: 0,
      outbox: {
        pending: 3,
        inflight: 1,
        succeeded: 20,
        failed: 2,
        dead: 1,
      },
    });

    const summary = buildP3RunSummary({
      metrics,
      effectiveModel: "gpt-5.1-codex-mini",
      runDate: "2026-02-23",
    });

    expect(summary).toContain("candidate_count: 12");
    expect(summary).toContain("outbox_pending: 3");
    expect(summary).toContain("effective_model: gpt-5.1-codex-mini");
  });
});
