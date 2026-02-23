import type { BridgeFactRecord } from "../p2/types.js";

export type P3WriteMode = "off" | "propose_only" | "propose_commit";

export type P3EventStatus = "pending" | "inflight" | "succeeded" | "failed" | "dead";

export type P3TargetStatus = "pending" | "succeeded" | "failed" | "skipped";

export type P3SourceTier = "online_incremental" | "manual" | "replay";

export type P3CandidatePayload = {
  candidate: BridgeFactRecord;
  metadata?: {
    userText?: string;
    assistantText?: string;
    tags?: string[];
  };
};

export type P3OutboxEventRecord = {
  event_id: string;
  idempotency_key: string;
  session_key: string;
  source_ref: string;
  source_tier: P3SourceTier;
  payload: P3CandidatePayload;
  write_mode: P3WriteMode;
  effective_model: string;
  status: P3EventStatus;
  mem0_status: P3TargetStatus;
  graphiti_status: P3TargetStatus;
  attempt_count: number;
  next_retry_at: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type P3OutboxAttemptRecord = {
  attempt_id: number;
  event_id: string;
  target: "mem0" | "graphiti";
  status: "ok" | "error" | "skipped";
  latency_ms: number | null;
  error_message: string | null;
  created_at: string;
};

export type P3DeadLetterRecord = {
  event_id: string;
  idempotency_key: string;
  session_key: string;
  source_ref: string;
  source_tier: P3SourceTier;
  payload: P3CandidatePayload;
  attempt_count: number;
  last_error: string | null;
  failed_at: string;
};

export type P3SnapshotMetrics = {
  candidateCount: number;
  addedCount: number;
  duplicateSkippedCount: number;
  conflictCount: number;
  sensitiveInterceptedCount: number;
  indexConsistencyFailureCount: number;
  outbox: {
    pending: number;
    inflight: number;
    succeeded: number;
    failed: number;
    dead: number;
  };
};
