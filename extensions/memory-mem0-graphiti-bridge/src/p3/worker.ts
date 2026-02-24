import { createHash } from "node:crypto";
import { resolveFactConflicts } from "../p2/conflict-resolver.js";
import type { BridgeFactRecord } from "../p2/types.js";
import type { P3OutboxStore } from "./outbox-store.js";
import { P3RemoteWriteError, type P3RemoteWriteFn } from "./remote-writer.js";
import { createSensitiveInterceptor } from "./sensitive-interceptor.js";
import type { P3AttemptErrorBucket, P3OutboxEventRecord, P3TargetStatus } from "./types.js";

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
  admissionEnabled?: boolean;
  commitCanaryRatio?: number;
  commitRequireIndexCheck?: boolean;
  commitRequireNonSensitive?: boolean;
  commitRequireDualWriteOk?: boolean;
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

const clampRatio = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
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

const resolveErrorBucket = (error: unknown): P3AttemptErrorBucket => {
  if (error instanceof P3RemoteWriteError) {
    return error.bucket;
  }

  if (error instanceof Error) {
    const message = `${error.name} ${error.message}`.toLowerCase();

    if (
      message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("abort") ||
      message.includes("aborted")
    ) {
      return "timeout";
    }

    const statusMatch = message.match(/status\s+(\d{3})/);
    if (statusMatch) {
      const statusCode = Number.parseInt(statusMatch[1] ?? "", 10);
      if (Number.isFinite(statusCode)) {
        if (statusCode >= 500) {
          return "5xx";
        }
        if (
          statusCode === 400 ||
          statusCode === 404 ||
          statusCode === 409 ||
          statusCode === 415 ||
          statusCode === 422
        ) {
          return "contract";
        }
        if (statusCode >= 400) {
          return "4xx";
        }
      }
    }
  }

  return "unknown";
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
    const bucket = resolveErrorBucket(error);
    params.outbox.appendAttempt({
      eventId: params.event.event_id,
      target: params.target,
      status: "error",
      latencyMs: Date.now() - startedAt,
      errorMessage: message,
      errorBucket: bucket,
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

const shouldPassCanary = (eventId: string, ratio: number): boolean => {
  if (ratio <= 0) {
    return false;
  }
  if (ratio >= 1) {
    return true;
  }

  const digest = createHash("sha1").update(eventId, "utf8").digest();
  const score = digest.readUInt32BE(0) / 0xffffffff;
  return score < ratio;
};

const readIndexCheckFlag = (event: P3OutboxEventRecord): boolean => {
  const metadata = event.payload.metadata;
  if (!metadata) {
    return false;
  }

  const metadataRecord = metadata as unknown as Record<string, unknown>;
  if (typeof metadataRecord.indexCheckOk === "boolean") {
    return metadataRecord.indexCheckOk;
  }

  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  return tags.some((tag) => {
    const normalized = String(tag).trim().toLowerCase();
    return normalized === "index_check_ok" || normalized === "index:ok";
  });
};

const commitCandidate = (params: {
  event: P3OutboxEventRecord;
  currentNow: number;
  runDate: string;
  outbox: P3OutboxStore;
  lowConfidenceThreshold: number;
}): void => {
  const existingRecords = params.outbox.listCanonicalFacts();
  const resolved = resolveFactConflicts({
    existingRecords,
    candidates: [params.event.payload.candidate],
    lowConfidenceThreshold: params.lowConfidenceThreshold,
    now: new Date(params.currentNow),
  });

  params.outbox.upsertCanonicalFacts(resolved.records);
  params.outbox.incrementAuditCounters(params.runDate, {
    addedCount: resolved.metrics.addedCount,
    duplicateSkippedCount: resolved.metrics.duplicateSkippedCount,
    conflictCount: resolved.metrics.conflictCount,
  });

  const candidateState = resolveCandidateState(
    resolved.records,
    params.event.payload.candidate.memory_id,
  );

  if (candidateState?.status === "pending_review") {
    params.outbox.upsertProposalState({
      eventId: params.event.event_id,
      sessionKey: params.event.session_key,
      payload: params.event.payload,
      status: "pending_review",
      supersedesId: candidateState.supersedes_id,
      reviewReason: "low_confidence_conflict",
    });
    return;
  }

  params.outbox.upsertProposalState({
    eventId: params.event.event_id,
    sessionKey: params.event.session_key,
    payload: params.event.payload,
    status: "committed",
    supersedesId: candidateState?.supersedes_id,
  });
};

export function createP3Worker(options: CreateP3WorkerOptions) {
  const now = options.now ?? Date.now;
  const maxAttempts = clampAttempts(options.maxAttempts);
  const jitterRatio = options.jitterRatio ?? 0.15;
  const lowConfidenceThreshold = options.lowConfidenceThreshold ?? 0.7;
  const admissionEnabled = options.admissionEnabled ?? false;
  const commitCanaryRatio = clampRatio(options.commitCanaryRatio ?? 0);
  const commitRequireIndexCheck = options.commitRequireIndexCheck ?? true;
  const commitRequireNonSensitive = options.commitRequireNonSensitive ?? true;
  const commitRequireDualWriteOk = options.commitRequireDualWriteOk ?? true;
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
          const requiresCommitEvaluation =
            event.write_mode === "propose_commit" || admissionEnabled;
          let commitApplied = false;

          if (requiresCommitEvaluation) {
            const missingDualWrite =
              commitRequireDualWriteOk &&
              !(mem0Status === "succeeded" && graphitiStatus === "succeeded");
            const missingIndexCheck = commitRequireIndexCheck && !readIndexCheckFlag(event);
            const nonSensitiveRejected = commitRequireNonSensitive && sensitivity.intercepted;
            const blockedByCanary =
              event.write_mode === "propose_only" &&
              !shouldPassCanary(event.event_id, commitCanaryRatio);

            const admissionReasons: string[] = [];
            if (missingDualWrite) {
              admissionReasons.push("require_dual_write_ok");
            }
            if (missingIndexCheck) {
              admissionReasons.push("require_index_check");
            }
            if (nonSensitiveRejected) {
              admissionReasons.push("require_non_sensitive");
            }
            if (blockedByCanary) {
              admissionReasons.push("canary_filtered");
            }

            if (event.write_mode === "propose_commit" && !admissionEnabled) {
              commitCandidate({
                event,
                currentNow,
                runDate,
                outbox: options.outbox,
                lowConfidenceThreshold,
              });
              commitApplied = true;
            } else if (admissionEnabled && admissionReasons.length === 0) {
              commitCandidate({
                event,
                currentNow,
                runDate,
                outbox: options.outbox,
                lowConfidenceThreshold,
              });
              commitApplied = true;
            } else if (admissionReasons.length > 0) {
              options.outbox.upsertProposalState({
                eventId: event.event_id,
                sessionKey: event.session_key,
                payload: event.payload,
                status: "proposed",
                reviewReason: `admission_blocked:${admissionReasons.join(",")}`,
              });
            }
          }

          if (!commitApplied && event.write_mode === "propose_commit" && !admissionEnabled) {
            commitCandidate({
              event,
              currentNow,
              runDate,
              outbox: options.outbox,
              lowConfidenceThreshold,
            });
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
