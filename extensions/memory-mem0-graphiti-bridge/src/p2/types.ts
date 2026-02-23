export type BridgeFactStatus = "active" | "superseded" | "pending_review";

export type BridgeFactRecord = {
  memory_id: string;
  fact_key: string;
  fact_value: string;
  ttl_class: string;
  expires_at?: string;
  last_confirmed_at?: string;
  confidence: number;
  status: BridgeFactStatus;
  source_event_id: string;
  supersedes_id?: string;
  detail_path: string;
  trigger_keywords: string[];
  active_context: boolean;
  event_time: string;
  ingest_time: string;
};

export type DailyScanAuditMetrics = {
  candidateCount: number;
  scannedFileCount: number;
  enqueuedCount: number;
};

export type DailyScanAuditRecord = {
  runId: string;
  createdAt: string;
  dryRun: boolean;
  days: number;
  scannedFiles: string[];
  metrics: DailyScanAuditMetrics;
};

export type ReconciliationMetrics = {
  candidateCount: number;
  addedCount: number;
  duplicateSkippedCount: number;
  conflictCount: number;
  sensitiveInterceptedCount: number;
  indexConsistencyFailureCount: number;
};
