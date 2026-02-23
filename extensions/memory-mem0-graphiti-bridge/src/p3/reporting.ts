import type { P3SnapshotMetrics } from "./types.js";

const toNonNegative = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  const normalized = Math.floor(value);
  return normalized >= 0 ? normalized : 0;
};

export function buildP3SnapshotMetrics(input: Partial<P3SnapshotMetrics>): P3SnapshotMetrics {
  return {
    candidateCount: toNonNegative(input.candidateCount),
    addedCount: toNonNegative(input.addedCount),
    duplicateSkippedCount: toNonNegative(input.duplicateSkippedCount),
    conflictCount: toNonNegative(input.conflictCount),
    sensitiveInterceptedCount: toNonNegative(input.sensitiveInterceptedCount),
    indexConsistencyFailureCount: toNonNegative(input.indexConsistencyFailureCount),
    outbox: {
      pending: toNonNegative(input.outbox?.pending),
      inflight: toNonNegative(input.outbox?.inflight),
      succeeded: toNonNegative(input.outbox?.succeeded),
      failed: toNonNegative(input.outbox?.failed),
      dead: toNonNegative(input.outbox?.dead),
    },
  };
}

export function buildP3RunSummary(params: {
  metrics: P3SnapshotMetrics;
  effectiveModel: string;
  runDate: string;
}): string {
  const lines = [
    `run_date: ${params.runDate}`,
    `effective_model: ${params.effectiveModel}`,
    `candidate_count: ${params.metrics.candidateCount}`,
    `added_count: ${params.metrics.addedCount}`,
    `duplicate_skipped_count: ${params.metrics.duplicateSkippedCount}`,
    `conflict_count: ${params.metrics.conflictCount}`,
    `sensitive_intercepted_count: ${params.metrics.sensitiveInterceptedCount}`,
    `index_consistency_failure_count: ${params.metrics.indexConsistencyFailureCount}`,
    `outbox_pending: ${params.metrics.outbox.pending}`,
    `outbox_inflight: ${params.metrics.outbox.inflight}`,
    `outbox_succeeded: ${params.metrics.outbox.succeeded}`,
    `outbox_failed: ${params.metrics.outbox.failed}`,
    `outbox_dead: ${params.metrics.outbox.dead}`,
  ];

  return lines.join("\n");
}
