import type { P3SnapshotMetrics, P3WeeklyGateFields, P3WriteMode } from "./types.js";

const toNonNegative = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  const normalized = Math.floor(value);
  return normalized >= 0 ? normalized : 0;
};

const toUnitInterval = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
};

const toBoolean = (value: unknown): boolean => {
  return value === true;
};

const toWriteMode = (value: unknown): P3WriteMode => {
  if (value === "off" || value === "propose_only" || value === "propose_commit") {
    return value;
  }
  return "off";
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

export function buildP3WeeklyGateFields(input: Partial<P3WeeklyGateFields>): P3WeeklyGateFields {
  return {
    proposal_count: toNonNegative(input.proposal_count),
    canary_commit_count: toNonNegative(input.canary_commit_count),
    manual_propose_commit_count: toNonNegative(input.manual_propose_commit_count),
    pending_review_count: toNonNegative(input.pending_review_count),
    failed_count: toNonNegative(input.failed_count),
    dead_count: toNonNegative(input.dead_count),
    admission_enabled: toBoolean(input.admission_enabled),
    commit_canary_ratio: toUnitInterval(input.commit_canary_ratio),
    effective_write_mode: toWriteMode(input.effective_write_mode),
  };
}

export function buildP3RunSummary(params: {
  metrics: P3SnapshotMetrics;
  weeklyGateFields: P3WeeklyGateFields;
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
    `weekly_gate_fields.proposal_count: ${params.weeklyGateFields.proposal_count}`,
    `weekly_gate_fields.canary_commit_count: ${params.weeklyGateFields.canary_commit_count}`,
    `weekly_gate_fields.manual_propose_commit_count: ${params.weeklyGateFields.manual_propose_commit_count}`,
    `weekly_gate_fields.pending_review_count: ${params.weeklyGateFields.pending_review_count}`,
    `weekly_gate_fields.failed_count: ${params.weeklyGateFields.failed_count}`,
    `weekly_gate_fields.dead_count: ${params.weeklyGateFields.dead_count}`,
    `weekly_gate_fields.admission_enabled: ${String(params.weeklyGateFields.admission_enabled)}`,
    `weekly_gate_fields.commit_canary_ratio: ${params.weeklyGateFields.commit_canary_ratio}`,
    `weekly_gate_fields.effective_write_mode: ${params.weeklyGateFields.effective_write_mode}`,
  ];

  return lines.join("\n");
}
