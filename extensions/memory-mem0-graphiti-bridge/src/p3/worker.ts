import { resolveFactConflicts } from "../p2/conflict-resolver.js";
import type { BridgeFactRecord } from "../p2/types.js";
import type { P3OutboxStore } from "./outbox-store.js";
import type { P3RemoteWriteFn } from "./remote-writer.js";
import { createSensitiveInterceptor } from "./sensitive-interceptor.js";
import type { P3OutboxEventRecord, P3TargetStatus } from "./types.js";

export type P3WorkerSummary = {
  processed: number;
  succeeded: number;
  failed: number;
  dead: number;
  skipped: number;
  effectiveModels: string[];
};

export type CreateP3WorkerOptions = {
  outbox: P3OutboxStore;
  mem0Write: P3RemoteWriteFn;
  graphitiWrite: P3RemoteWriteFn;
  maxAttempts: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
  jitterRatio?: number;
  lowConfidenceThreshold?: number;
  now?: () => number;
  onReport?: (summary: P3WorkerSummary) => Promise<void>;
};

type TargetResult = {
  status: P3TargetStatus;
  error?: string;
};

const clampAttempts = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 3;
  }
  const normalized = Math.floor(value);
  if (normalized < 1) {
    return 1;
  }
  return normalized;
};

const toIsoDate = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 10);

const computeBackoff = (params: {
  attemptCount: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
  jitterRatio: number;
}): number => {
  const exponent = Math.max(0, params.attemptCount - 1);
  const baseDelay = Math.min(params.maxBackoffMs, params.baseBackoffMs * 2 ** exponent);
  if (params.jitterRatio <= 0) {
    return Math.floor(baseDelay);
  }

  const spread = baseDelay * params.jitterRatio;
  const min = Math.max(0, baseDelay - spread);
  const max = baseDelay + spread;
  return Math.floor(min + Math.random() * (max - min));
};

const mergeLastError = (current: string | null, next?: string): string | null => {
  if (!next) {
    return current;
  }
  return next;
};

const processTarget = async (params: {
  event: P3OutboxEventRecord;
  target: "mem0" | "graphiti";
  status: P3TargetStatus;
  write: P3RemoteWriteFn;
  outbox: P3OutboxStore;
}): Promise<TargetResult> => {
  if (params.status === "succeeded" || params.status === "skipped") {
    params.outbox.appendAttempt({
      eventId: params.event.event_id,
      target: params.target,
      status: "skipped",
      latencyMs: 0,
    });
    return {
      status: params.status,
    };
  }

  const startedAt = Date.now();
  try {
    await params.write({
      event: params.event,
      payload: params.event.payload,
    });
    params.outbox.appendAttempt({
      eventId: params.event.event_id,
      target: params.target,
      status: "ok",
      latencyMs: Date.now() - startedAt,
    });
    return {
      status: "succeeded",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    params.outbox.appendAttempt({
      eventId: params.event.event_id,
      target: params.target,
      status: "error",
      latencyMs: Date.now() - startedAt,
      errorMessage: message,
    });
    return {
      status: "failed",
      error: message,
    };
  }
};

const resolveCandidateState = (
  records: BridgeFactRecord[],
  candidateId: string,
): BridgeFactRecord | null => {
  return records.find((record) => record.memory_id === candidateId) ?? null;
};

export function createP3Worker(options: CreateP3WorkerOptions) {
  const now = options.now ?? Date.now;
  const maxAttempts = clampAttempts(options.maxAttempts);
  const jitterRatio = options.jitterRatio ?? 0.15;
  const lowConfidenceThreshold = options.lowConfidenceThreshold ?? 0.7;
  const sensitiveInterceptor = createSensitiveInterceptor();

  return {
    async processOnce(params?: { limit?: number }): Promise<P3WorkerSummary> {
      const currentNow = now();
      const events = options.outbox.claimDueEvents({
        nowMs: currentNow,
        limit: params?.limit,
      });

      const summary: P3WorkerSummary = {
        processed: events.length,
        succeeded: 0,
        failed: 0,
        dead: 0,
        skipped: 0,
        effectiveModels: Array.from(new Set(events.map((event) => event.effective_model))),
      };

      for (const event of events) {
        const attemptCount = event.attempt_count + 1;
        const runDate = toIsoDate(currentNow);
        const sensitiveText = `${event.payload.candidate.fact_value}\n${event.payload.metadata?.userText ?? ""}\n${event.payload.metadata?.assistantText ?? ""}`;
        const sensitivity = sensitiveInterceptor.inspect(sensitiveText);

        if (sensitivity.intercepted) {
          options.outbox.appendAttempt({
            eventId: event.event_id,
            target: "mem0",
            status: "skipped",
            latencyMs: 0,
          });
          options.outbox.appendAttempt({
            eventId: event.event_id,
            target: "graphiti",
            status: "skipped",
            latencyMs: 0,
          });
          options.outbox.upsertProposalState({
            eventId: event.event_id,
            sessionKey: event.session_key,
            payload: event.payload,
            status: "sensitive_intercepted",
            reviewReason: sensitivity.reasons.join("; "),
          });
          options.outbox.incrementAuditCounters(runDate, {
            sensitiveInterceptedCount: 1,
          });

          options.outbox.updateEvent({
            eventId: event.event_id,
            status: "succeeded",
            mem0Status: "skipped",
            graphitiStatus: "skipped",
            attemptCount,
            nextRetryAt: currentNow,
            lastError: null,
            closedAt: new Date(currentNow).toISOString(),
          });
          summary.skipped += 1;
          continue;
        }

        options.outbox.upsertProposalState({
          eventId: event.event_id,
          sessionKey: event.session_key,
          payload: event.payload,
          status: "proposed",
        });

        const mem0Result = await processTarget({
          event,
          target: "mem0",
          status: event.mem0_status,
          write: options.mem0Write,
          outbox: options.outbox,
        });
        const graphitiResult = await processTarget({
          event,
          target: "graphiti",
          status: event.graphiti_status,
          write: options.graphitiWrite,
          outbox: options.outbox,
        });

        const mem0Status = mem0Result.status;
        const graphitiStatus = graphitiResult.status;
        const allSucceeded =
          (mem0Status === "succeeded" || mem0Status === "skipped") &&
          (graphitiStatus === "succeeded" || graphitiStatus === "skipped");

        let lastError = mergeLastError(event.last_error, mem0Result.error);
        lastError = mergeLastError(lastError, graphitiResult.error);

        if (allSucceeded) {
          if (event.write_mode === "propose_commit") {
            const existingRecords = options.outbox.listCanonicalFacts();
            const resolved = resolveFactConflicts({
              existingRecords,
              candidates: [event.payload.candidate],
              lowConfidenceThreshold,
              now: new Date(currentNow),
            });

            options.outbox.upsertCanonicalFacts(resolved.records);
            options.outbox.incrementAuditCounters(runDate, {
              addedCount: resolved.metrics.addedCount,
              duplicateSkippedCount: resolved.metrics.duplicateSkippedCount,
              conflictCount: resolved.metrics.conflictCount,
            });

            const candidateState = resolveCandidateState(
              resolved.records,
              event.payload.candidate.memory_id,
            );
            if (candidateState?.status === "pending_review") {
              options.outbox.upsertProposalState({
                eventId: event.event_id,
                sessionKey: event.session_key,
                payload: event.payload,
                status: "pending_review",
                supersedesId: candidateState.supersedes_id,
                reviewReason: "low_confidence_conflict",
              });
            } else {
              options.outbox.upsertProposalState({
                eventId: event.event_id,
                sessionKey: event.session_key,
                payload: event.payload,
                status: "committed",
                supersedesId: candidateState?.supersedes_id,
              });
            }
          }

          options.outbox.updateEvent({
            eventId: event.event_id,
            status: "succeeded",
            mem0Status,
            graphitiStatus,
            attemptCount,
            nextRetryAt: currentNow,
            lastError: null,
            closedAt: new Date(currentNow).toISOString(),
          });
          summary.succeeded += 1;
          continue;
        }

        if (attemptCount >= maxAttempts) {
          options.outbox.updateEvent({
            eventId: event.event_id,
            status: "dead",
            mem0Status,
            graphitiStatus,
            attemptCount,
            nextRetryAt: currentNow,
            lastError,
            closedAt: new Date(currentNow).toISOString(),
          });
          options.outbox.moveToDeadLetter(event.event_id, lastError ?? undefined);
          options.outbox.upsertProposalState({
            eventId: event.event_id,
            sessionKey: event.session_key,
            payload: event.payload,
            status: "failed",
            reviewReason: lastError ?? undefined,
          });
          summary.dead += 1;
          continue;
        }

        const backoffMs = computeBackoff({
          attemptCount,
          baseBackoffMs: options.baseBackoffMs,
          maxBackoffMs: options.maxBackoffMs,
          jitterRatio,
        });

        options.outbox.updateEvent({
          eventId: event.event_id,
          status: "failed",
          mem0Status,
          graphitiStatus,
          attemptCount,
          nextRetryAt: currentNow + backoffMs,
          lastError,
          closedAt: null,
        });
        summary.failed += 1;
      }

      if (options.onReport) {
        await options.onReport(summary);
      }

      return summary;
    },
  };
}
