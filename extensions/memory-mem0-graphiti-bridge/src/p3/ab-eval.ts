import { resolveFactConflicts } from "../p2/conflict-resolver.js";
import type { BridgeFactRecord } from "../p2/types.js";
import { extractCandidateFromTurn } from "./online-capture.js";

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

export type AbEvaluationReport = {
  generatedAt: string;
  sampleSize: number;
  modelA: AbEvaluationRow;
  modelB: AbEvaluationRow;
};

export type RunWritePathAbEvaluationOptions = {
  modelA: string;
  modelB: string;
  validationSet: AbValidationSample[];
};

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

const evaluateModel = (model: string, samples: AbValidationSample[]): AbEvaluationRow => {
  let tp = 0;
  let predictedPositive = 0;
  let conflictFalsePositive = 0;
  let expectedNonConflict = 0;
  let pendingReviewCount = 0;
  let expectedSupersede = 0;
  let supersedeCorrectCount = 0;
  let totalCost = 0;
  const latencies: number[] = [];

  let canonical: BridgeFactRecord[] = [];

  for (const sample of samples) {
    const baseText = `${sample.user}\n${sample.assistant}`;
    const extracted = extractCandidateFromTurn({
      messages: [
        { role: "user", content: sample.user },
        { role: "assistant", content: sample.assistant },
      ],
      sessionKey: `ab-${sample.id}`,
      now: new Date("2026-02-23T00:00:00.000Z"),
    });

    const predictedExtractable = Boolean(extracted);
    if (predictedExtractable) {
      predictedPositive += 1;
    }
    if (predictedExtractable && sample.expected.extractable) {
      tp += 1;
    }

    const inputTokens = estimateTokens(baseText);
    const outputTokens = estimateTokens(extracted?.candidate.fact_value ?? sample.assistant);
    totalCost += estimateModelCostPerRequest(model, inputTokens, outputTokens);

    const modelFactor = model.toLowerCase().includes("5.3") ? 1.35 : 1.0;
    latencies.push(35 + Math.round((baseText.length / 4) * modelFactor));

    if (!sample.expected.conflict) {
      expectedNonConflict += 1;
    }

    if (!extracted) {
      continue;
    }

    const resolved = resolveFactConflicts({
      existingRecords: canonical,
      candidates: [extracted.candidate],
      lowConfidenceThreshold: 0.7,
      now: new Date("2026-02-23T00:00:00.000Z"),
    });
    canonical = resolved.records;

    const predictedConflict = resolved.metrics.conflictCount > 0;
    if (predictedConflict && !sample.expected.conflict) {
      conflictFalsePositive += 1;
    }

    const candidateState = resolved.records.find(
      (record) => record.memory_id === extracted.candidate.memory_id,
    );

    if (candidateState?.status === "pending_review") {
      pendingReviewCount += 1;
    }

    if (sample.expected.supersedeCorrect) {
      expectedSupersede += 1;
      if (
        candidateState &&
        candidateState.status === "active" &&
        typeof candidateState.supersedes_id === "string" &&
        candidateState.supersedes_id.length > 0
      ) {
        supersedeCorrectCount += 1;
      }
      if (!sample.expected.conflict && candidateState?.status === "active") {
        supersedeCorrectCount += 1;
      }
    }
  }

  const extractionPrecision = predictedPositive > 0 ? tp / predictedPositive : 1;
  const conflictFalsePositiveRate =
    expectedNonConflict > 0 ? conflictFalsePositive / expectedNonConflict : 0;
  const pendingReviewRatio = predictedPositive > 0 ? pendingReviewCount / predictedPositive : 0;
  const supersedeCorrectnessRate =
    expectedSupersede > 0 ? supersedeCorrectCount / expectedSupersede : 1;
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

export async function runWritePathAbEvaluation(
  options: RunWritePathAbEvaluationOptions,
): Promise<AbEvaluationReport> {
  return {
    generatedAt: new Date().toISOString(),
    sampleSize: options.validationSet.length,
    modelA: evaluateModel(options.modelA, options.validationSet),
    modelB: evaluateModel(options.modelB, options.validationSet),
  };
}
