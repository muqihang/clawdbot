import { describe, expect, it } from "vitest";
import {
  buildReconciliationMetrics,
  buildReconciliationReport,
  formatReconciliationReport,
} from "../p2/reconciliation-report.js";

describe("P2 reconciliation report", () => {
  it("aggregates required daily metrics", () => {
    const metrics = buildReconciliationMetrics({
      candidateCount: 12,
      addedCount: 5,
      duplicateSkippedCount: 3,
      conflictCount: 4,
      sensitiveInterceptedCount: 2,
      indexConsistencyFailureCount: 1,
    });

    const report = buildReconciliationReport({
      runDate: "2026-02-23",
      metrics,
    });

    expect(report.metrics).toEqual({
      candidateCount: 12,
      addedCount: 5,
      duplicateSkippedCount: 3,
      conflictCount: 4,
      sensitiveInterceptedCount: 2,
      indexConsistencyFailureCount: 1,
    });
  });

  it("formats report output with all required fields", () => {
    const metrics = buildReconciliationMetrics({
      candidateCount: 8,
      addedCount: 4,
      duplicateSkippedCount: 2,
      conflictCount: 2,
      sensitiveInterceptedCount: 0,
      indexConsistencyFailureCount: 0,
    });

    const reportText = formatReconciliationReport(
      buildReconciliationReport({
        runDate: "2026-02-23",
        metrics,
      }),
    );

    expect(reportText).toContain("candidate_count: 8");
    expect(reportText).toContain("added_count: 4");
    expect(reportText).toContain("duplicate_skipped_count: 2");
    expect(reportText).toContain("conflict_count: 2");
    expect(reportText).toContain("sensitive_intercepted_count: 0");
    expect(reportText).toContain("index_consistency_failure_count: 0");
  });
});
