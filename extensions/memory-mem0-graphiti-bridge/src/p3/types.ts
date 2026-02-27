import type { BridgeFactRecord } from "../p2/types.js";

export type P3WriteMode = "off" | "propose_only" | "propose_commit";

export type P3EventStatus = "pending" | "inflight" | "succeeded" | "failed" | "dead";

export type P3TargetStatus = "pending" | "succeeded" | "failed" | "skipped";

export type P3AttemptErrorBucket = "4xx" | "5xx" | "timeout" | "contract" | "unknown";

export type P3SourceTier = "online_incremental" | "manual" | "replay";

export const P3_MESSAGE_ROLE_VALUES = ["user", "assistant", "system", "tool"] as const;

export type P3MessageRole = (typeof P3_MESSAGE_ROLE_VALUES)[number];

export type P3MessageEnvelope = {
  role?: P3MessageRole;
  name?: string;
  created_at?: string;
  metadata?: Record<string, unknown>;
  ignore_roles?: P3MessageRole[];
};

export type P3ContextBucket = "exact_id" | "timeline" | "decision_reason";

export type P3ContextRetrievalHit = {
  source_id: string;
  snippet: string;
  score: number;
  created_at?: string;
};

export type P3ContextDecision = "answer" | "degrade";

type P3ContextBaseResult = {
  decision: P3ContextDecision;
  answer_text: string;
  confidence: number;
  degrade_reason: string | null;
  trim_report: string[];
  token_usage: {
    input: number;
    output: number;
  };
};

export type P3ContextT1Result = P3ContextBaseResult & {
  template_id: "T1";
  resolved_id: string | null;
  resolved_id_type: "oc_user_id" | "oc_thread_id" | "oc_message_id" | null;
  evidence: Array<{
    source_id: string;
    snippet: string;
    score: number;
  }>;
};

export type P3ContextT2Result = P3ContextBaseResult & {
  template_id: "T2";
  timeline: Array<{
    ts: string;
    event: string;
    source_id: string;
  }>;
  coverage: {
    events_used: number;
    events_total: number;
  };
};

export type P3ContextT3Result = P3ContextBaseResult & {
  template_id: "T3";
  claim: string;
  rationale: Array<{
    point: string;
    source_id: string;
  }>;
  counter_evidence: Array<{
    point: string;
    source_id: string;
  }>;
  final_recommendation: "keep" | "revise" | "rollback" | "unknown";
};

export type P3ContextAssembleResult = P3ContextT1Result | P3ContextT2Result | P3ContextT3Result;

export type P3ContextAssembleInput = {
  query_id: string;
  query_text: string;
  bucket: P3ContextBucket;
  retrieval_hits: P3ContextRetrievalHit[];
  oc_user_id?: string;
  oc_thread_id?: string;
  oc_message_id?: string;
  aliases?: string[];
  message_envelope?: P3MessageEnvelope;
  timezone_hint?: string;
  max_events?: number;
  constraints?: string[];
  risk_flags?: string[];
};

export type P3CandidatePayload = {
  candidate: BridgeFactRecord;
  metadata?: {
    userText?: string;
    assistantText?: string;
    tags?: string[];
    indexCheckOk?: boolean;
    oc_user_id?: string;
    oc_thread_id?: string;
    oc_message_id?: string;
  };
  message_envelope?: P3MessageEnvelope;
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
  error_bucket: P3AttemptErrorBucket | null;
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

export type P3WeeklyGateFields = {
  proposal_count: number;
  canary_commit_count: number;
  manual_propose_commit_count: number;
  pending_review_count: number;
  failed_count: number;
  dead_count: number;
  admission_enabled: boolean;
  commit_canary_ratio: number;
  effective_write_mode: P3WriteMode;
};
