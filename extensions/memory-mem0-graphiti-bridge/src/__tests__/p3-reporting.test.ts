import { describe, expect, it } from "vitest";
import {
  buildP3RunSummary,
  buildP3SnapshotMetrics,
  buildP3WeeklyGateFields,
} from "../p3/reporting.js";

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

    const weeklyGateFields = buildP3WeeklyGateFields({
      proposal_count: 6,
      canary_commit_count: 4,
      manual_propose_commit_count: 2,
      pending_review_count: 1,
      failed_count: 2,
      dead_count: 1,
      admission_enabled: true,
      commit_canary_ratio: 0.25,
      effective_write_mode: "propose_commit",
    });

    const summary = buildP3RunSummary({
      metrics,
      effectiveModel: "gpt-5.1-codex-mini",
      runDate: "2026-02-23",
      weeklyGateFields,
    });

    expect(summary).toContain("candidate_count: 12");
    expect(summary).toContain("outbox_pending: 3");
    expect(summary).toContain("effective_model: gpt-5.1-codex-mini");
    expect(summary).toContain("weekly_gate_fields.proposal_count: 6");
    expect(summary).toContain("weekly_gate_fields.canary_commit_count: 4");
    expect(summary).toContain("weekly_gate_fields.manual_propose_commit_count: 2");
    expect(summary).toContain("weekly_gate_fields.pending_review_count: 1");
    expect(summary).toContain("weekly_gate_fields.failed_count: 2");
    expect(summary).toContain("weekly_gate_fields.dead_count: 1");
    expect(summary).toContain("weekly_gate_fields.admission_enabled: true");
    expect(summary).toContain("weekly_gate_fields.commit_canary_ratio: 0.25");
    expect(summary).toContain("weekly_gate_fields.effective_write_mode: propose_commit");
  });
});
