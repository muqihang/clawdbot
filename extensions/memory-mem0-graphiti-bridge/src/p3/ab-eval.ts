import os from "node:os";
import path from "node:path";
import { extractCandidateFromTurn } from "./online-capture.js";
import { createP3OutboxStore, type P3ProposalStateRecord } from "./outbox-store.js";
import type { P3RemoteWriteFn } from "./remote-writer.js";
import { createP3Worker } from "./worker.js";

export type AbValidationSample = {
  id: string;
  user: string;
  assistant: string;
  expected: {
    extractable: boolean;
    conflict: boolean;
    pendingReview: boolean;
    supersedeCorrect: boolean;
  };
};

export type AbEvaluationMetrics = {
  extractionPrecision: number;
  conflictFalsePositiveRate: number;
  pendingReviewRatio: number;
  supersedeCorrectnessRate: number;
  p95WriteLatencyMs: number;
  estimatedCostPer1kChunksUsd: number;
};

export type AbEvaluationRow = {
  model: string;
  metrics: AbEvaluationMetrics;
};

export type AbEvaluationMode = "simulated" | "real";

export type AbRealEvaluationOptions = {
  dbPathPrefix?: string;
  mem0BaseUrl?: string;
  mem0ApiKey?: string;
  mem0Path?: string;
  graphitiBaseUrl?: string;
  graphitiApiKey?: string;
  graphitiPath?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  jitterRatio?: number;
  lowConfidenceThreshold?: number;
};

export type AbEvaluationReport = {
  generatedAt: string;
  sampleSize: number;
  evaluationMode: AbEvaluationMode;
  dataSource: string;
  costAssumption: string;
  modelA: AbEvaluationRow;
  modelB: AbEvaluationRow;
};

export type RunWritePathAbEvaluationOptions = {
  mode?: AbEvaluationMode;
  modelA: string;
  modelB: string;
  validationSet: AbValidationSample[];
  realOptions?: AbRealEvaluationOptions;
};

const DEFAULT_EVAL_NOW = Date.parse("2026-02-23T00:00:00.000Z");
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_BASE_BACKOFF_MS = 50;
const DEFAULT_MAX_BACKOFF_MS = 1_000;
const DEFAULT_COST_ASSUMPTION =
  "estimated from heuristic token count (chars/4) with static per-model USD rates";

const round = (value: number): number => Math.round(value * 10_000) / 10_000;

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
};

const estimateTokens = (text: string): number => {
  return Math.max(1, Math.ceil(text.length / 4));
};

const estimateModelCostPerRequest = (
  model: string,
  inputTokens: number,
  outputTokens: number,
): number => {
  const normalized = model.toLowerCase();
  const rates = normalized.includes("5.3")
    ? { inputPer1M: 1.2, outputPer1M: 4.8 }
    : { inputPer1M: 0.4, outputPer1M: 1.6 };

  return (
    (inputTokens / 1_000_000) * rates.inputPer1M + (outputTokens / 1_000_000) * rates.outputPer1M
  );
};

const trimRightSlash = (value: string): string => value.replace(/\/+$/, "");

const normalizeModelForPath = (model: string): string => {
  const normalized = model
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  return normalized.length > 0 ? normalized : "model";
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseRemoteId = (payload: unknown): string | undefined => {
  const record = asRecord(payload);

  const direct =
    normalizeString(record.id) ??
    normalizeString(record.memory_id) ??
    normalizeString(record.uuid) ??
    normalizeString(record.remoteId);
  if (direct) {
    return direct;
  }

  const results = record.results;
  if (!Array.isArray(results) || results.length === 0) {
    return undefined;
  }

  const first = asRecord(results[0]);
  return (
    normalizeString(first.id) ??
    normalizeString(first.memory_id) ??
    normalizeString(first.uuid) ??
    normalizeString(first.remoteId)
  );
};

const safeReadJson = async (response: Response): Promise<unknown> => {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
};

const buildHeaders = (apiKey?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (apiKey && apiKey.trim().length > 0) {
    headers.authorization = `Bearer ${apiKey.trim()}`;
  }

  return headers;
};

const createMem0RealWriter = (params: {
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
  path: string;
}): P3RemoteWriteFn => {
  const endpoint = `${trimRightSlash(params.baseUrl)}${params.path.startsWith("/") ? params.path : `/${params.path}`}`;
  const headers = buildHeaders(params.apiKey);

  return async ({ event, payload }) => {
    const userText = payload.metadata?.userText ?? payload.candidate.fact_value;
    const assistantText = payload.metadata?.assistantText ?? payload.candidate.fact_value;

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(params.timeoutMs),
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: userText,
          },
          {
            role: "assistant",
            content: assistantText,
          },
        ],
        user_id: event.session_key,
        metadata: {
          source: "openclaw-memory-bridge-p3-ab-real",
          event_id: event.event_id,
          model: event.effective_model,
          candidate_memory_id: payload.candidate.memory_id,
          fact_key: payload.candidate.fact_key,
        },
      }),
    });

    const body = await safeReadJson(response);
    if (!response.ok) {
      const message = normalizeString(asRecord(body).message);
      throw new Error(message ?? `real mem0 write failed: status ${String(response.status)}`);
    }

    return {
      remoteId: parseRemoteId(body),
    };
  };
};

const createGraphitiRealWriter = (params: {
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
  path: string;
}): P3RemoteWriteFn => {
  const endpoint = `${trimRightSlash(params.baseUrl)}${params.path.startsWith("/") ? params.path : `/${params.path}`}`;
  const headers = buildHeaders(params.apiKey);

  return async ({ event, payload }) => {
    const userText = payload.metadata?.userText ?? payload.candidate.fact_value;
    const assistantText = payload.metadata?.assistantText ?? payload.candidate.fact_value;

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(params.timeoutMs),
      body: JSON.stringify({
        group_id: event.session_key,
        messages: [
          {
            content: userText,
            role_type: "user",
            role: "user",
            timestamp: payload.candidate.event_time,
          },
          {
            content: assistantText,
            role_type: "assistant",
            role: "assistant",
            timestamp: payload.candidate.ingest_time,
          },
        ],
      }),
    });

    const body = await safeReadJson(response);
    if (!response.ok) {
      const message = normalizeString(asRecord(body).message);
      throw new Error(message ?? `real graphiti write failed: status ${String(response.status)}`);
    }

    return {
      remoteId: parseRemoteId(body),
    };
  };
};

const evaluateModelSimulated = (model: string, samples: AbValidationSample[]): AbEvaluationRow => {
  let truePositiveCount = 0;
  let predictedPositiveCount = 0;
  let conflictFalsePositiveCount = 0;
  let expectedNonConflictCount = 0;
  let pendingReviewCount = 0;
  let expectedSupersedeCount = 0;
  let supersedeCorrectCount = 0;
  let totalCost = 0;
  const latencies: number[] = [];

  const canonicalByFactKey = new Map<string, { memoryId: string; confidence: number }>();

  for (const sample of samples) {
    const baseText = `${sample.user}\n${sample.assistant}`;
    const extracted = extractCandidateFromTurn({
      messages: [
        { role: "user", content: sample.user },
        { role: "assistant", content: sample.assistant },
      ],
      sessionKey: `ab-sim-${sample.id}`,
      now: new Date(DEFAULT_EVAL_NOW),
    });

    const predictedExtractable = Boolean(extracted);
    if (predictedExtractable) {
      predictedPositiveCount += 1;
    }
    if (predictedExtractable && sample.expected.extractable) {
      truePositiveCount += 1;
    }

    const inputTokens = estimateTokens(baseText);
    const outputTokens = estimateTokens(extracted?.candidate.fact_value ?? sample.assistant);
    totalCost += estimateModelCostPerRequest(model, inputTokens, outputTokens);

    const modelFactor = model.toLowerCase().includes("5.3") ? 1.35 : 1;
    latencies.push(35 + Math.round((baseText.length / 4) * modelFactor));

    if (!sample.expected.conflict) {
      expectedNonConflictCount += 1;
    }

    if (!extracted) {
      continue;
    }

    const existing = canonicalByFactKey.get(extracted.candidate.fact_key);
    const predictedConflict =
      existing !== undefined &&
      existing.memoryId !== extracted.candidate.memory_id &&
      existing.confidence > 0;

    if (predictedConflict && !sample.expected.conflict) {
      conflictFalsePositiveCount += 1;
    }

    if (predictedConflict && extracted.candidate.confidence < 0.7) {
      pendingReviewCount += 1;
    }

    canonicalByFactKey.set(extracted.candidate.fact_key, {
      memoryId: extracted.candidate.memory_id,
      confidence: extracted.candidate.confidence,
    });

    if (sample.expected.supersedeCorrect) {
      expectedSupersedeCount += 1;
      if (!sample.expected.conflict || predictedConflict) {
        supersedeCorrectCount += 1;
      }
    }
  }

  const extractionPrecision =
    predictedPositiveCount > 0 ? truePositiveCount / predictedPositiveCount : 1;
  const conflictFalsePositiveRate =
    expectedNonConflictCount > 0 ? conflictFalsePositiveCount / expectedNonConflictCount : 0;
  const pendingReviewRatio =
    predictedPositiveCount > 0 ? pendingReviewCount / predictedPositiveCount : 0;
  const supersedeCorrectnessRate =
    expectedSupersedeCount > 0 ? supersedeCorrectCount / expectedSupersedeCount : 1;
  const p95WriteLatencyMs = percentile(latencies, 95);
  const estimatedCostPer1kChunksUsd = samples.length > 0 ? (totalCost / samples.length) * 1000 : 0;

  return {
    model,
    metrics: {
      extractionPrecision: round(extractionPrecision),
      conflictFalsePositiveRate: round(conflictFalsePositiveRate),
      pendingReviewRatio: round(pendingReviewRatio),
      supersedeCorrectnessRate: round(supersedeCorrectnessRate),
      p95WriteLatencyMs: round(p95WriteLatencyMs),
      estimatedCostPer1kChunksUsd: round(estimatedCostPer1kChunksUsd),
    },
  };
};

const resolveProposalConflict = (proposal: P3ProposalStateRecord | undefined): boolean => {
  if (!proposal) {
    return false;
  }
  if (proposal.status === "pending_review") {
    return true;
  }
  return typeof proposal.supersedes_id === "string" && proposal.supersedes_id.length > 0;
};

const evaluateModelReal = async (params: {
  model: string;
  samples: AbValidationSample[];
  options: AbRealEvaluationOptions;
}): Promise<AbEvaluationRow> => {
  const basePrefix =
    params.options.dbPathPrefix ?? path.join(os.tmpdir(), "openclaw-memory-bridge-p3-ab-real");
  const modelPathToken = normalizeModelForPath(params.model);
  const dbPath = `${basePrefix}-${modelPathToken}-${String(Date.now())}.sqlite`;

  let nowMs = DEFAULT_EVAL_NOW;
  const outbox = createP3OutboxStore({
    dbPath,
    now: () => nowMs,
  });

  const mem0BaseUrl = params.options.mem0BaseUrl ?? "http://127.0.0.1:8766";
  const graphitiBaseUrl = params.options.graphitiBaseUrl ?? "http://127.0.0.1:8000";
  const timeoutMs = params.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const worker = createP3Worker({
    outbox,
    now: () => nowMs,
    maxAttempts: params.options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    baseBackoffMs: params.options.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS,
    maxBackoffMs: params.options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS,
    jitterRatio: params.options.jitterRatio ?? 0,
    lowConfidenceThreshold: params.options.lowConfidenceThreshold ?? 0.7,
    mem0Write: createMem0RealWriter({
      baseUrl: mem0BaseUrl,
      apiKey: params.options.mem0ApiKey,
      timeoutMs,
      path: params.options.mem0Path ?? "/memories",
    }),
    graphitiWrite: createGraphitiRealWriter({
      baseUrl: graphitiBaseUrl,
      apiKey: params.options.graphitiApiKey,
      timeoutMs,
      path: params.options.graphitiPath ?? "/messages",
    }),
  });

  const eventIdBySample = new Map<string, string>();
  const inputOutputTokens: Array<{ inputTokens: number; outputTokens: number }> = [];

  for (const sample of params.samples) {
    const extracted = extractCandidateFromTurn({
      messages: [
        { role: "user", content: sample.user },
        { role: "assistant", content: sample.assistant },
      ],
      sessionKey: `ab-real-${params.model}-${sample.id}`,
      now: new Date(nowMs),
    });

    const inputTokens = estimateTokens(`${sample.user}\n${sample.assistant}`);
    const outputTokens = estimateTokens(extracted?.candidate.fact_value ?? sample.assistant);
    inputOutputTokens.push({ inputTokens, outputTokens });

    if (!extracted) {
      nowMs += 1_000;
      continue;
    }

    const enqueueResult = outbox.enqueue({
      idempotencyKey: `ab-real:${params.model}:${sample.id}:${String(nowMs)}`,
      sessionKey: `ab-real-${sample.id}`,
      sourceRef: `ab-real:${sample.id}`,
      sourceTier: "online_incremental",
      writeMode: "propose_commit",
      effectiveModel: params.model,
      payload: {
        candidate: extracted.candidate,
        metadata: {
          userText: sample.user,
          assistantText: sample.assistant,
        },
      },
    });

    eventIdBySample.set(sample.id, enqueueResult.eventId);
    nowMs += 1_000;
  }

  for (let i = 0; i < 20; i += 1) {
    const summary = await worker.processOnce({ limit: 100 });
    if (summary.processed === 0) {
      break;
    }
    nowMs += 60_000;
  }

  const events = outbox.listEvents();
  const proposals = outbox.listProposalStates();
  const proposalsByEvent = new Map<string, P3ProposalStateRecord>();
  for (const proposal of proposals) {
    proposalsByEvent.set(proposal.event_id, proposal);
  }

  const attemptLatencies: number[] = [];
  for (const event of events) {
    const attempts = outbox.listAttempts(event.event_id);
    for (const attempt of attempts) {
      if (typeof attempt.latency_ms === "number" && Number.isFinite(attempt.latency_ms)) {
        attemptLatencies.push(attempt.latency_ms);
      }
    }
  }

  const runDate = new Date(DEFAULT_EVAL_NOW).toISOString().slice(0, 10);
  outbox.getAuditCounters(runDate);

  let truePositiveCount = 0;
  let predictedPositiveCount = 0;
  let conflictFalsePositiveCount = 0;
  let expectedNonConflictCount = 0;
  let pendingReviewCount = 0;
  let expectedSupersedeCount = 0;
  let supersedeCorrectCount = 0;

  params.samples.forEach((sample) => {
    const eventId = eventIdBySample.get(sample.id);
    const event = eventId ? events.find((item) => item.event_id === eventId) : undefined;
    const proposal = eventId ? proposalsByEvent.get(eventId) : undefined;
    const predictedExtractable = Boolean(event);

    if (predictedExtractable) {
      predictedPositiveCount += 1;
    }
    if (predictedExtractable && sample.expected.extractable) {
      truePositiveCount += 1;
    }

    if (!sample.expected.conflict) {
      expectedNonConflictCount += 1;
    }

    if (!event) {
      return;
    }

    const predictedConflict = resolveProposalConflict(proposal);
    if (predictedConflict && !sample.expected.conflict) {
      conflictFalsePositiveCount += 1;
    }

    if (proposal?.status === "pending_review") {
      pendingReviewCount += 1;
    }

    if (sample.expected.supersedeCorrect) {
      expectedSupersedeCount += 1;
      if (!sample.expected.conflict) {
        if (!predictedConflict && proposal?.status !== "failed") {
          supersedeCorrectCount += 1;
        }
      } else if (predictedConflict) {
        supersedeCorrectCount += 1;
      }
    }
  });

  let totalCost = 0;
  for (const entry of inputOutputTokens) {
    totalCost += estimateModelCostPerRequest(params.model, entry.inputTokens, entry.outputTokens);
  }

  const extractionPrecision =
    predictedPositiveCount > 0 ? truePositiveCount / predictedPositiveCount : 1;
  const conflictFalsePositiveRate =
    expectedNonConflictCount > 0 ? conflictFalsePositiveCount / expectedNonConflictCount : 0;
  const pendingReviewRatio =
    predictedPositiveCount > 0 ? pendingReviewCount / predictedPositiveCount : 0;
  const supersedeCorrectnessRate =
    expectedSupersedeCount > 0 ? supersedeCorrectCount / expectedSupersedeCount : 1;
  const p95WriteLatencyMs = percentile(attemptLatencies, 95);
  const estimatedCostPer1kChunksUsd =
    params.samples.length > 0 ? (totalCost / params.samples.length) * 1000 : 0;

  outbox.close();

  return {
    model: params.model,
    metrics: {
      extractionPrecision: round(extractionPrecision),
      conflictFalsePositiveRate: round(conflictFalsePositiveRate),
      pendingReviewRatio: round(pendingReviewRatio),
      supersedeCorrectnessRate: round(supersedeCorrectnessRate),
      p95WriteLatencyMs: round(p95WriteLatencyMs),
      estimatedCostPer1kChunksUsd: round(estimatedCostPer1kChunksUsd),
    },
  };
};

export async function runWritePathAbEvaluation(
  options: RunWritePathAbEvaluationOptions,
): Promise<AbEvaluationReport> {
  const mode = options.mode ?? "simulated";

  if (mode === "real") {
    const modelA = await evaluateModelReal({
      model: options.modelA,
      samples: options.validationSet,
      options: options.realOptions ?? {},
    });
    const modelB = await evaluateModelReal({
      model: options.modelB,
      samples: options.validationSet,
      options: options.realOptions ?? {},
    });

    return {
      generatedAt: new Date().toISOString(),
      sampleSize: options.validationSet.length,
      evaluationMode: "real",
      dataSource: "outbox_attempts + proposal_state + audit_counters",
      costAssumption: DEFAULT_COST_ASSUMPTION,
      modelA,
      modelB,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    sampleSize: options.validationSet.length,
    evaluationMode: "simulated",
    dataSource: "local_simulated_estimator",
    costAssumption: DEFAULT_COST_ASSUMPTION,
    modelA: evaluateModelSimulated(options.modelA, options.validationSet),
    modelB: evaluateModelSimulated(options.modelB, options.validationSet),
  };
}
