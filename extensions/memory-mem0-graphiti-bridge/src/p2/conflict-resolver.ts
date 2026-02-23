import type { BridgeFactRecord, ReconciliationMetrics } from "./types.js";

export type PendingReviewQueueItem = {
  candidateId: string;
  factKey: string;
  existingId: string;
  reason: "low_confidence_conflict";
  confidence: number;
  createdAt: string;
};

export type ConflictResolutionResult = {
  records: BridgeFactRecord[];
  reviewQueue: PendingReviewQueueItem[];
  metrics: ReconciliationMetrics;
};

export type ResolveFactConflictsInput = {
  existingRecords: BridgeFactRecord[];
  candidates: BridgeFactRecord[];
  lowConfidenceThreshold: number;
  now?: Date;
  sensitiveInterceptedCount?: number;
  indexConsistencyFailureCount?: number;
};

const cloneRecord = (record: BridgeFactRecord): BridgeFactRecord => ({
  ...record,
  trigger_keywords: [...record.trigger_keywords],
});

const shouldPreferRecord = (left: BridgeFactRecord, right: BridgeFactRecord): boolean => {
  return Date.parse(left.ingest_time) > Date.parse(right.ingest_time);
};

const createMetrics = (input: ResolveFactConflictsInput): ReconciliationMetrics => {
  return {
    candidateCount: input.candidates.length,
    addedCount: 0,
    duplicateSkippedCount: 0,
    conflictCount: 0,
    sensitiveInterceptedCount: input.sensitiveInterceptedCount ?? 0,
    indexConsistencyFailureCount: input.indexConsistencyFailureCount ?? 0,
  };
};

export function resolveFactConflicts(input: ResolveFactConflictsInput): ConflictResolutionResult {
  const nowIso = (input.now ?? new Date()).toISOString();
  const recordsById = new Map<string, BridgeFactRecord>();
  const activeByKey = new Map<string, BridgeFactRecord>();
  const reviewQueue: PendingReviewQueueItem[] = [];
  const metrics = createMetrics(input);

  for (const source of input.existingRecords) {
    const record = cloneRecord(source);
    recordsById.set(record.memory_id, record);

    if (record.status !== "active") {
      continue;
    }

    const current = activeByKey.get(record.fact_key);
    if (!current || shouldPreferRecord(record, current)) {
      activeByKey.set(record.fact_key, record);
    }
  }

  for (const source of input.candidates) {
    const candidate = cloneRecord(source);
    const active = activeByKey.get(candidate.fact_key);

    if (!active) {
      candidate.status = "active";
      recordsById.set(candidate.memory_id, candidate);
      activeByKey.set(candidate.fact_key, candidate);
      metrics.addedCount += 1;
      continue;
    }

    if (active.fact_value === candidate.fact_value) {
      metrics.duplicateSkippedCount += 1;
      continue;
    }

    metrics.conflictCount += 1;

    if (candidate.confidence < input.lowConfidenceThreshold) {
      candidate.status = "pending_review";
      candidate.supersedes_id = active.memory_id;
      recordsById.set(candidate.memory_id, candidate);
      reviewQueue.push({
        candidateId: candidate.memory_id,
        factKey: candidate.fact_key,
        existingId: active.memory_id,
        reason: "low_confidence_conflict",
        confidence: candidate.confidence,
        createdAt: nowIso,
      });
      continue;
    }

    const supersededCurrent: BridgeFactRecord = {
      ...active,
      status: "superseded",
    };

    recordsById.set(supersededCurrent.memory_id, supersededCurrent);

    const accepted: BridgeFactRecord = {
      ...candidate,
      status: "active",
      supersedes_id: active.memory_id,
    };

    recordsById.set(accepted.memory_id, accepted);
    activeByKey.set(accepted.fact_key, accepted);
    metrics.addedCount += 1;
  }

  return {
    records: Array.from(recordsById.values()),
    reviewQueue,
    metrics,
  };
}
