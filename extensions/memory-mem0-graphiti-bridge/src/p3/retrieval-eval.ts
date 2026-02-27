import type { BridgeSearchHit, RemoteMemoryClient } from "../client/mem0-client.js";

type RetrievalStructure = "facts" | "episodes" | "nodes";

export type RetrievalEvalSample = {
  id: string;
  query: string;
  aliases?: string[];
  expected_ids?: string[];
  expected_structures?: RetrievalStructure[];
};

export type RetrievalEvalSummary = {
  generated_at: string;
  sample_size: number;
  top_k: number;
  hit_at_1: number;
  hit_at_3: number;
  structure_coverage: number;
  alias_recall: number;
};

export type RunRetrievalEvaluationOptions = {
  dataset: RetrievalEvalSample[];
  client: RemoteMemoryClient;
  topK?: number;
};

const round = (value: number): number => Math.round(value * 10_000) / 10_000;

const isRetrievalStructure = (value: string): value is RetrievalStructure => {
  return value === "facts" || value === "episodes" || value === "nodes";
};

const normalizeSample = (value: unknown): RetrievalEvalSample | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.query !== "string") {
    return null;
  }

  const aliases = Array.isArray(record.aliases)
    ? record.aliases
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
    : [];

  const expectedIds = Array.isArray(record.expected_ids)
    ? record.expected_ids
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
    : [];

  const expectedStructures = Array.isArray(record.expected_structures)
    ? record.expected_structures
        .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
        .filter(isRetrievalStructure)
    : [];

  return {
    id: record.id,
    query: record.query,
    aliases,
    expected_ids: expectedIds,
    expected_structures: expectedStructures,
  };
};

export const parseRetrievalDataset = (value: unknown): RetrievalEvalSample[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeSample(item))
    .filter((item): item is RetrievalEvalSample => Boolean(item));
};

const hitWithinTopK = (hits: BridgeSearchHit[], expectedIds: string[], topK: number): boolean => {
  if (expectedIds.length === 0) {
    return false;
  }

  const expected = new Set(expectedIds.map((item) => item.toLowerCase()));
  return hits.slice(0, topK).some((hit) => expected.has(hit.remoteId.toLowerCase()));
};

const structureScore = (
  hits: BridgeSearchHit[],
  expectedStructures: RetrievalStructure[],
  topK: number,
): number => {
  const hitStructures = new Set(
    hits
      .slice(0, topK)
      .map((hit) => String(hit.structure ?? "").toLowerCase())
      .filter(isRetrievalStructure),
  );

  if (expectedStructures.length === 0) {
    return hitStructures.size > 0 ? 1 : 0;
  }

  const expected = new Set(expectedStructures);
  let matched = 0;

  for (const structure of expected) {
    if (hitStructures.has(structure)) {
      matched += 1;
    }
  }

  return expected.size > 0 ? matched / expected.size : 0;
};

export async function runRetrievalEvaluation(
  options: RunRetrievalEvaluationOptions,
): Promise<RetrievalEvalSummary> {
  const topK = options.topK ?? 3;

  let hitAt1Matched = 0;
  let hitAt3Matched = 0;
  let expectedIdSamples = 0;

  let structureScoreSum = 0;
  let structureSamples = 0;

  let aliasMatched = 0;
  let aliasSamples = 0;

  for (const sample of options.dataset) {
    const hits = await options.client.search(sample.query);

    if ((sample.expected_ids ?? []).length > 0) {
      expectedIdSamples += 1;
      if (hitWithinTopK(hits, sample.expected_ids ?? [], 1)) {
        hitAt1Matched += 1;
      }
      if (hitWithinTopK(hits, sample.expected_ids ?? [], topK)) {
        hitAt3Matched += 1;
      }
    }

    structureSamples += 1;
    structureScoreSum += structureScore(hits, sample.expected_structures ?? [], topK);

    for (const aliasQuery of sample.aliases ?? []) {
      aliasSamples += 1;
      const aliasHits = await options.client.search(aliasQuery);
      if (hitWithinTopK(aliasHits, sample.expected_ids ?? [], topK)) {
        aliasMatched += 1;
      }
    }
  }

  return {
    generated_at: new Date().toISOString(),
    sample_size: options.dataset.length,
    top_k: topK,
    hit_at_1: round(expectedIdSamples > 0 ? hitAt1Matched / expectedIdSamples : 0),
    hit_at_3: round(expectedIdSamples > 0 ? hitAt3Matched / expectedIdSamples : 0),
    structure_coverage: round(structureSamples > 0 ? structureScoreSum / structureSamples : 0),
    alias_recall: round(aliasSamples > 0 ? aliasMatched / aliasSamples : 0),
  };
}
