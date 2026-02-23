import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { BridgeFactRecord } from "../p2/types.js";
import { requireNodeSqlite } from "./sqlite.js";
import type {
  P3CandidatePayload,
  P3DeadLetterRecord,
  P3EventStatus,
  P3OutboxAttemptRecord,
  P3OutboxEventRecord,
  P3SourceTier,
  P3TargetStatus,
  P3WriteMode,
} from "./types.js";

type SqliteRunResult = {
  changes?: number;
};

type ProposalStateStatus =
  | "proposed"
  | "committed"
  | "superseded"
  | "pending_review"
  | "sensitive_intercepted"
  | "failed";

export type P3ProposalStateRecord = {
  proposal_id: string;
  event_id: string;
  session_key: string;
  fact_key: string | null;
  candidate_memory_id: string | null;
  status: ProposalStateStatus;
  supersedes_id: string | null;
  superseded_by_id: string | null;
  review_reason: string | null;
  payload: P3CandidatePayload;
  created_at: string;
  updated_at: string;
};

export type P3AuditCounters = {
  runDate: string;
  candidateCount: number;
  addedCount: number;
  duplicateSkippedCount: number;
  conflictCount: number;
  sensitiveInterceptedCount: number;
  indexConsistencyFailureCount: number;
};

export type CreateP3OutboxStoreOptions = {
  dbPath: string;
  now?: () => number;
};

export type P3EnqueueInput = {
  idempotencyKey: string;
  sessionKey: string;
  sourceRef: string;
  sourceTier: P3SourceTier;
  payload: P3CandidatePayload;
  writeMode: P3WriteMode;
  effectiveModel: string;
};

export type P3EnqueueResult = {
  inserted: boolean;
  eventId: string;
};

export type P3OutboxStore = ReturnType<typeof createP3OutboxStore>;

const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  return value;
};

const generateEventId = (idempotencyKey: string): string => {
  return createHash("sha1").update(idempotencyKey, "utf8").digest("hex").slice(0, 24);
};

const normalizeCount = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  return 0;
};

const mapEventRow = (row: Record<string, unknown>): P3OutboxEventRecord => {
  return {
    event_id: String(row.event_id ?? ""),
    idempotency_key: String(row.idempotency_key ?? ""),
    session_key: String(row.session_key ?? ""),
    source_ref: String(row.source_ref ?? ""),
    source_tier: String(row.source_tier ?? "online_incremental") as P3SourceTier,
    payload: parseJson<P3CandidatePayload>(String(row.payload_json ?? "{}"), {
      candidate: {
        memory_id: "",
        fact_key: "",
        fact_value: "",
        ttl_class: "conversation",
        confidence: 0,
        status: "active",
        source_event_id: "",
        detail_path: "",
        trigger_keywords: [],
        active_context: false,
        event_time: new Date(0).toISOString(),
        ingest_time: new Date(0).toISOString(),
      },
    }),
    write_mode: String(row.write_mode ?? "off") as P3WriteMode,
    effective_model: String(row.effective_model ?? ""),
    status: String(row.status ?? "pending") as P3EventStatus,
    mem0_status: String(row.mem0_status ?? "pending") as P3TargetStatus,
    graphiti_status: String(row.graphiti_status ?? "pending") as P3TargetStatus,
    attempt_count: normalizeCount(row.attempt_count),
    next_retry_at: normalizeCount(row.next_retry_at),
    last_error: normalizeText(row.last_error),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    closed_at: normalizeText(row.closed_at),
  };
};

const mapAttemptRow = (row: Record<string, unknown>): P3OutboxAttemptRecord => {
  return {
    attempt_id: normalizeCount(row.attempt_id),
    event_id: String(row.event_id ?? ""),
    target: String(row.target ?? "mem0") as "mem0" | "graphiti",
    status: String(row.status ?? "error") as "ok" | "error" | "skipped",
    latency_ms: typeof row.latency_ms === "number" ? row.latency_ms : null,
    error_message: normalizeText(row.error_message),
    created_at: String(row.created_at ?? ""),
  };
};

const mapDeadLetterRow = (row: Record<string, unknown>): P3DeadLetterRecord => {
  return {
    event_id: String(row.event_id ?? ""),
    idempotency_key: String(row.idempotency_key ?? ""),
    session_key: String(row.session_key ?? ""),
    source_ref: String(row.source_ref ?? ""),
    source_tier: String(row.source_tier ?? "online_incremental") as P3SourceTier,
    payload: parseJson<P3CandidatePayload>(String(row.payload_json ?? "{}"), {
      candidate: {
        memory_id: "",
        fact_key: "",
        fact_value: "",
        ttl_class: "conversation",
        confidence: 0,
        status: "active",
        source_event_id: "",
        detail_path: "",
        trigger_keywords: [],
        active_context: false,
        event_time: new Date(0).toISOString(),
        ingest_time: new Date(0).toISOString(),
      },
    }),
    attempt_count: normalizeCount(row.attempt_count),
    last_error: normalizeText(row.last_error),
    failed_at: String(row.failed_at ?? ""),
  };
};

const mapProposalStateRow = (row: Record<string, unknown>): P3ProposalStateRecord => {
  return {
    proposal_id: String(row.proposal_id ?? ""),
    event_id: String(row.event_id ?? ""),
    session_key: String(row.session_key ?? ""),
    fact_key: normalizeText(row.fact_key),
    candidate_memory_id: normalizeText(row.candidate_memory_id),
    status: String(row.status ?? "proposed") as ProposalStateStatus,
    supersedes_id: normalizeText(row.supersedes_id),
    superseded_by_id: normalizeText(row.superseded_by_id),
    review_reason: normalizeText(row.review_reason),
    payload: parseJson<P3CandidatePayload>(String(row.payload_json ?? "{}"), {
      candidate: {
        memory_id: "",
        fact_key: "",
        fact_value: "",
        ttl_class: "conversation",
        confidence: 0,
        status: "active",
        source_event_id: "",
        detail_path: "",
        trigger_keywords: [],
        active_context: false,
        event_time: new Date(0).toISOString(),
        ingest_time: new Date(0).toISOString(),
      },
    }),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
};

const ensureSchema = (db: DatabaseSync): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS outbox_events (
      event_id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      session_key TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      source_tier TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      write_mode TEXT NOT NULL,
      effective_model TEXT NOT NULL,
      status TEXT NOT NULL,
      mem0_status TEXT NOT NULL,
      graphiti_status TEXT NOT NULL,
      attempt_count INTEGER NOT NULL,
      next_retry_at INTEGER NOT NULL,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_at TEXT
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS outbox_attempts (
      attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      target TEXT NOT NULL,
      status TEXT NOT NULL,
      latency_ms INTEGER,
      error_message TEXT,
      created_at TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS outbox_dead_letter (
      event_id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL,
      session_key TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      source_tier TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      attempt_count INTEGER NOT NULL,
      last_error TEXT,
      failed_at TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS proposal_state (
      proposal_id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL UNIQUE,
      session_key TEXT NOT NULL,
      fact_key TEXT,
      candidate_memory_id TEXT,
      status TEXT NOT NULL,
      supersedes_id TEXT,
      superseded_by_id TEXT,
      review_reason TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS canonical_facts (
      memory_id TEXT PRIMARY KEY,
      fact_key TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_counters (
      run_date TEXT PRIMARY KEY,
      candidate_count INTEGER NOT NULL DEFAULT 0,
      added_count INTEGER NOT NULL DEFAULT 0,
      duplicate_skipped_count INTEGER NOT NULL DEFAULT 0,
      conflict_count INTEGER NOT NULL DEFAULT 0,
      sensitive_intercepted_count INTEGER NOT NULL DEFAULT 0,
      index_consistency_failure_count INTEGER NOT NULL DEFAULT 0
    );
  `);
};

export function createP3OutboxStore(options: CreateP3OutboxStoreOptions) {
  const now = options.now ?? Date.now;
  mkdirSync(path.dirname(options.dbPath), { recursive: true });
  const { DatabaseSync } = requireNodeSqlite();
  const db = new DatabaseSync(options.dbPath);
  ensureSchema(db);

  const getEventByIdempotency = db.prepare(
    `SELECT * FROM outbox_events WHERE idempotency_key = ? LIMIT 1`,
  );
  const getEventById = db.prepare(`SELECT * FROM outbox_events WHERE event_id = ? LIMIT 1`);
  const listEventsStmt = db.prepare(`SELECT * FROM outbox_events ORDER BY created_at ASC`);
  const listAttemptsStmt = db.prepare(
    `SELECT * FROM outbox_attempts WHERE event_id = ? ORDER BY attempt_id ASC`,
  );
  const listDeadStmt = db.prepare(`SELECT * FROM outbox_dead_letter ORDER BY failed_at ASC`);
  const claimDueStmt = db.prepare(
    `SELECT event_id FROM outbox_events
     WHERE status IN ('pending', 'failed')
       AND next_retry_at <= ?
     ORDER BY created_at ASC
     LIMIT ?`,
  );
  const markInflightStmt = db.prepare(
    `UPDATE outbox_events
     SET status = 'inflight', updated_at = ?
     WHERE event_id = ? AND status IN ('pending', 'failed')`,
  );
  const upsertCanonicalStmt = db.prepare(
    `INSERT INTO canonical_facts(memory_id, fact_key, status, payload_json, updated_at)
     VALUES(?, ?, ?, ?, ?)
     ON CONFLICT(memory_id)
     DO UPDATE SET
       fact_key = excluded.fact_key,
       status = excluded.status,
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`,
  );

  return {
    enqueue(input: P3EnqueueInput): P3EnqueueResult {
      const timestamp = now();
      const iso = new Date(timestamp).toISOString();
      const eventId = generateEventId(input.idempotencyKey);
      const insertResult = db
        .prepare(
          `INSERT INTO outbox_events (
             event_id,
             idempotency_key,
             session_key,
             source_ref,
             source_tier,
             payload_json,
             write_mode,
             effective_model,
             status,
             mem0_status,
             graphiti_status,
             attempt_count,
             next_retry_at,
             last_error,
             created_at,
             updated_at,
             closed_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', 'pending', 0, ?, NULL, ?, ?, NULL)
           ON CONFLICT(idempotency_key) DO NOTHING`,
        )
        .run(
          eventId,
          input.idempotencyKey,
          input.sessionKey,
          input.sourceRef,
          input.sourceTier,
          JSON.stringify(input.payload),
          input.writeMode,
          input.effectiveModel,
          timestamp,
          iso,
          iso,
        ) as SqliteRunResult;

      if ((insertResult.changes ?? 0) > 0) {
        const runDate = iso.slice(0, 10);
        this.incrementAuditCounters(runDate, { candidateCount: 1 });
        return {
          inserted: true,
          eventId,
        };
      }

      const existing = getEventByIdempotency.get(input.idempotencyKey) as
        | Record<string, unknown>
        | undefined;

      return {
        inserted: false,
        eventId: String(existing?.event_id ?? eventId),
      };
    },

    listEvents(): P3OutboxEventRecord[] {
      const rows = listEventsStmt.all() as Record<string, unknown>[];
      return rows.map((row) => mapEventRow(row));
    },

    getEvent(eventId: string): P3OutboxEventRecord | null {
      const row = getEventById.get(eventId) as Record<string, unknown> | undefined;
      return row ? mapEventRow(row) : null;
    },

    claimDueEvents(params?: { limit?: number; nowMs?: number }): P3OutboxEventRecord[] {
      const claimNowMs = params?.nowMs ?? now();
      const limit = params?.limit ?? 20;
      const iso = new Date(claimNowMs).toISOString();
      const rows = claimDueStmt.all(claimNowMs, limit) as Array<{ event_id: string }>;
      const events: P3OutboxEventRecord[] = [];

      for (const row of rows) {
        const update = markInflightStmt.run(iso, row.event_id) as SqliteRunResult;
        if ((update.changes ?? 0) <= 0) {
          continue;
        }
        const claimed = this.getEvent(row.event_id);
        if (claimed) {
          events.push(claimed);
        }
      }

      return events;
    },

    updateEvent(params: {
      eventId: string;
      status: P3EventStatus;
      mem0Status: P3TargetStatus;
      graphitiStatus: P3TargetStatus;
      attemptCount: number;
      nextRetryAt: number;
      lastError: string | null;
      closedAt?: string | null;
    }): void {
      const updatedAt = new Date(now()).toISOString();
      db.prepare(
        `UPDATE outbox_events
         SET status = ?,
             mem0_status = ?,
             graphiti_status = ?,
             attempt_count = ?,
             next_retry_at = ?,
             last_error = ?,
             updated_at = ?,
             closed_at = ?
         WHERE event_id = ?`,
      ).run(
        params.status,
        params.mem0Status,
        params.graphitiStatus,
        params.attemptCount,
        params.nextRetryAt,
        params.lastError,
        updatedAt,
        params.closedAt ?? null,
        params.eventId,
      );
    },

    appendAttempt(params: {
      eventId: string;
      target: "mem0" | "graphiti";
      status: "ok" | "error" | "skipped";
      latencyMs?: number;
      errorMessage?: string;
    }): void {
      db.prepare(
        `INSERT INTO outbox_attempts(event_id, target, status, latency_ms, error_message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        params.eventId,
        params.target,
        params.status,
        typeof params.latencyMs === "number" ? Math.round(params.latencyMs) : null,
        params.errorMessage ?? null,
        new Date(now()).toISOString(),
      );
    },

    listAttempts(eventId: string): P3OutboxAttemptRecord[] {
      const rows = listAttemptsStmt.all(eventId) as Record<string, unknown>[];
      return rows.map((row) => mapAttemptRow(row));
    },

    moveToDeadLetter(eventId: string, lastError?: string): void {
      const event = this.getEvent(eventId);
      if (!event) {
        return;
      }
      const failedAt = new Date(now()).toISOString();
      db.prepare(
        `INSERT INTO outbox_dead_letter(
           event_id,
           idempotency_key,
           session_key,
           source_ref,
           source_tier,
           payload_json,
           attempt_count,
           last_error,
           failed_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(event_id)
         DO UPDATE SET
           attempt_count = excluded.attempt_count,
           last_error = excluded.last_error,
           failed_at = excluded.failed_at`,
      ).run(
        event.event_id,
        event.idempotency_key,
        event.session_key,
        event.source_ref,
        event.source_tier,
        JSON.stringify(event.payload),
        event.attempt_count,
        lastError ?? event.last_error,
        failedAt,
      );
    },

    listDeadLetters(): P3DeadLetterRecord[] {
      const rows = listDeadStmt.all() as Record<string, unknown>[];
      return rows.map((row) => mapDeadLetterRow(row));
    },

    upsertProposalState(params: {
      eventId: string;
      sessionKey: string;
      payload: P3CandidatePayload;
      status: ProposalStateStatus;
      supersedesId?: string;
      supersededById?: string;
      reviewReason?: string;
    }): void {
      const currentIso = new Date(now()).toISOString();
      const proposalId = params.eventId;

      db.prepare(
        `INSERT INTO proposal_state(
           proposal_id,
           event_id,
           session_key,
           fact_key,
           candidate_memory_id,
           status,
           supersedes_id,
           superseded_by_id,
           review_reason,
           payload_json,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(event_id)
         DO UPDATE SET
           proposal_id = excluded.proposal_id,
           fact_key = excluded.fact_key,
           candidate_memory_id = excluded.candidate_memory_id,
           status = excluded.status,
           supersedes_id = excluded.supersedes_id,
           superseded_by_id = excluded.superseded_by_id,
           review_reason = excluded.review_reason,
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at`,
      ).run(
        proposalId,
        params.eventId,
        params.sessionKey,
        params.payload.candidate.fact_key,
        params.payload.candidate.memory_id,
        params.status,
        params.supersedesId ?? null,
        params.supersededById ?? null,
        params.reviewReason ?? null,
        JSON.stringify(params.payload),
        currentIso,
        currentIso,
      );
    },

    listProposalStates(): P3ProposalStateRecord[] {
      const rows = db
        .prepare(`SELECT * FROM proposal_state ORDER BY created_at ASC`)
        .all() as Record<string, unknown>[];
      return rows.map((row) => mapProposalStateRow(row));
    },

    listCanonicalFacts(): BridgeFactRecord[] {
      const rows = db
        .prepare(`SELECT payload_json FROM canonical_facts ORDER BY updated_at ASC`)
        .all() as Array<{
        payload_json: string;
      }>;
      return rows
        .map((row) => parseJson<BridgeFactRecord | null>(row.payload_json, null))
        .filter((entry): entry is BridgeFactRecord => Boolean(entry));
    },

    upsertCanonicalFacts(records: BridgeFactRecord[]): void {
      const updatedAt = new Date(now()).toISOString();
      for (const record of records) {
        upsertCanonicalStmt.run(
          record.memory_id,
          record.fact_key,
          record.status,
          JSON.stringify(record),
          updatedAt,
        );
      }
    },

    incrementAuditCounters(
      runDate: string,
      delta: Partial<Omit<P3AuditCounters, "runDate">>,
    ): void {
      db.prepare(
        `INSERT INTO audit_counters(
           run_date,
           candidate_count,
           added_count,
           duplicate_skipped_count,
           conflict_count,
           sensitive_intercepted_count,
           index_consistency_failure_count
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(run_date)
         DO UPDATE SET
           candidate_count = candidate_count + excluded.candidate_count,
           added_count = added_count + excluded.added_count,
           duplicate_skipped_count = duplicate_skipped_count + excluded.duplicate_skipped_count,
           conflict_count = conflict_count + excluded.conflict_count,
           sensitive_intercepted_count = sensitive_intercepted_count + excluded.sensitive_intercepted_count,
           index_consistency_failure_count = index_consistency_failure_count + excluded.index_consistency_failure_count`,
      ).run(
        runDate,
        delta.candidateCount ?? 0,
        delta.addedCount ?? 0,
        delta.duplicateSkippedCount ?? 0,
        delta.conflictCount ?? 0,
        delta.sensitiveInterceptedCount ?? 0,
        delta.indexConsistencyFailureCount ?? 0,
      );
    },

    getAuditCounters(runDate: string): P3AuditCounters {
      const row = db
        .prepare(`SELECT * FROM audit_counters WHERE run_date = ? LIMIT 1`)
        .get(runDate) as Record<string, unknown> | undefined;

      if (!row) {
        return {
          runDate,
          candidateCount: 0,
          addedCount: 0,
          duplicateSkippedCount: 0,
          conflictCount: 0,
          sensitiveInterceptedCount: 0,
          indexConsistencyFailureCount: 0,
        };
      }

      return {
        runDate,
        candidateCount: normalizeCount(row.candidate_count),
        addedCount: normalizeCount(row.added_count),
        duplicateSkippedCount: normalizeCount(row.duplicate_skipped_count),
        conflictCount: normalizeCount(row.conflict_count),
        sensitiveInterceptedCount: normalizeCount(row.sensitive_intercepted_count),
        indexConsistencyFailureCount: normalizeCount(row.index_consistency_failure_count),
      };
    },

    getOutboxStatusCounts(): {
      pending: number;
      inflight: number;
      succeeded: number;
      failed: number;
      dead: number;
    } {
      const rows = db
        .prepare(`SELECT status, COUNT(*) as count FROM outbox_events GROUP BY status`)
        .all() as Array<{
        status: string;
        count: number;
      }>;

      const counts = {
        pending: 0,
        inflight: 0,
        succeeded: 0,
        failed: 0,
        dead: 0,
      };

      for (const row of rows) {
        if (row.status === "pending") {
          counts.pending = normalizeCount(row.count);
        } else if (row.status === "inflight") {
          counts.inflight = normalizeCount(row.count);
        } else if (row.status === "succeeded") {
          counts.succeeded = normalizeCount(row.count);
        } else if (row.status === "failed") {
          counts.failed = normalizeCount(row.count);
        } else if (row.status === "dead") {
          counts.dead = normalizeCount(row.count);
        }
      }

      return counts;
    },

    close(): void {
      db.close();
    },
  };
}
