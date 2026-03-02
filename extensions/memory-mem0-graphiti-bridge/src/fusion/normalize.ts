import type { BridgeRoute } from "../config/flags.js";

export type CandidateScoreSource = "score" | "rank_score" | "missing";

export type NormalizationCandidate = {
  source: BridgeRoute;
  remoteId: string;
  path: string;
  score: number;
  score_source?: CandidateScoreSource;
};

export type RankedCandidate = {
  source: BridgeRoute;
  remoteId: string;
  path: string;
  score: number;
  score_source: CandidateScoreSource;
  original_index: number;
};

export type ScoreSourceCounts = {
  score: number;
  rank_score: number;
  missing: number;
};

export type DedupeCollision = {
  normalized_key: string;
  kept: RankedCandidate;
  dropped: RankedCandidate[];
};

export type DedupeReport = {
  input_count: number;
  unique_count: number;
  kept: RankedCandidate[];
  dropped: RankedCandidate[];
  collisions: DedupeCollision[];
};

export type TieReport = {
  top_k: number;
  size: number;
  top_score: number;
  top_score_count: number;
  unique_score_count: number;
  unique_scores: number[];
  all_zero: boolean;
  all_same_score: boolean;
};

const compareAsciiStrings = (left: string, right: string): number => {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
};

const normalizeScore = (value: number): number => {
  return Number.isFinite(value) ? value : 0;
};

const normalizeRemoteIdKey = (remoteId: string): string => {
  return remoteId.trim().toLowerCase();
};

const sourcePriority = (source: BridgeRoute): number => {
  if (source === "local") {
    return 0;
  }
  if (source === "mem0") {
    return 1;
  }
  if (source === "graphiti") {
    return 2;
  }
  return 9;
};

type CandidateWithKey = RankedCandidate & {
  normalized_key: string;
};

const compareCandidatesDesc = (left: CandidateWithKey, right: CandidateWithKey): number => {
  if (left === right) {
    return 0;
  }

  const leftScore = normalizeScore(left.score);
  const rightScore = normalizeScore(right.score);
  if (leftScore !== rightScore) {
    return leftScore > rightScore ? -1 : 1;
  }

  const leftSourcePriority = sourcePriority(left.source);
  const rightSourcePriority = sourcePriority(right.source);
  if (leftSourcePriority !== rightSourcePriority) {
    return leftSourcePriority < rightSourcePriority ? -1 : 1;
  }

  const pathLowerCompare = compareAsciiStrings(left.path.toLowerCase(), right.path.toLowerCase());
  if (pathLowerCompare !== 0) {
    return pathLowerCompare;
  }
  const pathCompare = compareAsciiStrings(left.path, right.path);
  if (pathCompare !== 0) {
    return pathCompare;
  }

  const remoteLowerCompare = compareAsciiStrings(
    left.remoteId.toLowerCase(),
    right.remoteId.toLowerCase(),
  );
  if (remoteLowerCompare !== 0) {
    return remoteLowerCompare;
  }
  const remoteCompare = compareAsciiStrings(left.remoteId, right.remoteId);
  if (remoteCompare !== 0) {
    return remoteCompare;
  }

  if (left.original_index !== right.original_index) {
    return left.original_index < right.original_index ? -1 : 1;
  }

  // Should be unreachable because original_index is unique per candidate input.
  return compareAsciiStrings(left.normalized_key, right.normalized_key) || 1;
};

const countScoreSources = (candidates: NormalizationCandidate[]): ScoreSourceCounts => {
  const counts: ScoreSourceCounts = {
    score: 0,
    rank_score: 0,
    missing: 0,
  };

  for (const candidate of candidates) {
    const source = candidate.score_source ?? "missing";
    if (source === "score") {
      counts.score += 1;
    } else if (source === "rank_score") {
      counts.rank_score += 1;
    } else {
      counts.missing += 1;
    }
  }

  return counts;
};

const buildTieReport = (params: { topk: RankedCandidate[]; requestedTopK: number }): TieReport => {
  const scores = params.topk.map((entry) => normalizeScore(entry.score));
  const uniqueScores = Array.from(new Set(scores)).sort((a, b) => (a === b ? 0 : a > b ? -1 : 1));

  const topScore = scores[0] ?? 0;
  const topScoreCount = scores.reduce((sum, score) => sum + (score === topScore ? 1 : 0), 0);

  return {
    top_k: params.requestedTopK,
    size: params.topk.length,
    top_score: topScore,
    top_score_count: topScoreCount,
    unique_score_count: uniqueScores.length,
    unique_scores: uniqueScores,
    all_zero: scores.length > 0 && scores.every((score) => score === 0),
    all_same_score: uniqueScores.length === 1 && scores.length > 0,
  };
};

export function normalizeAndRankCandidates(params: {
  candidates: NormalizationCandidate[];
  topK: number;
}): {
  ranked: RankedCandidate[];
  topk: RankedCandidate[];
  dedupe: DedupeReport;
  tie: TieReport;
  score_source_counts: ScoreSourceCounts;
} {
  const requestedTopK = Number.isFinite(params.topK) ? Math.max(1, Math.floor(params.topK)) : 1;
  const score_source_counts = countScoreSources(params.candidates);

  const grouped = new Map<string, { kept: CandidateWithKey; dropped: CandidateWithKey[] }>();
  const droppedAll: CandidateWithKey[] = [];

  for (const [index, candidate] of params.candidates.entries()) {
    const normalized_key = normalizeRemoteIdKey(candidate.remoteId);
    const scored: CandidateWithKey = {
      source: candidate.source,
      remoteId: candidate.remoteId,
      path: candidate.path,
      score: normalizeScore(candidate.score),
      score_source: candidate.score_source ?? "missing",
      original_index: index,
      normalized_key,
    };

    const existing = grouped.get(normalized_key);
    if (!existing) {
      grouped.set(normalized_key, { kept: scored, dropped: [] });
      continue;
    }

    const cmp = compareCandidatesDesc(scored, existing.kept);
    if (cmp < 0) {
      existing.dropped.push(existing.kept);
      droppedAll.push(existing.kept);
      existing.kept = scored;
    } else {
      existing.dropped.push(scored);
      droppedAll.push(scored);
    }
  }

  const keptAll: CandidateWithKey[] = Array.from(grouped.values()).map((entry) => entry.kept);
  keptAll.sort(compareCandidatesDesc);

  const ranked: RankedCandidate[] = keptAll.map(
    ({ normalized_key: _key, ...candidate }) => candidate,
  );
  const topk: RankedCandidate[] = ranked.slice(0, requestedTopK);

  const collisions: DedupeCollision[] = Array.from(grouped.entries())
    .filter(([, entry]) => entry.dropped.length > 0)
    .sort(([leftKey], [rightKey]) => compareAsciiStrings(leftKey, rightKey))
    .map(([normalized_key, entry]) => {
      const kept = (({ normalized_key: _key, ...candidate }) => candidate)(entry.kept);
      const dropped = entry.dropped
        .slice()
        .sort(compareCandidatesDesc)
        .map(({ normalized_key: _key, ...candidate }) => candidate);
      return { normalized_key, kept, dropped };
    });

  const dedupe: DedupeReport = {
    input_count: params.candidates.length,
    unique_count: ranked.length,
    kept: ranked,
    dropped: droppedAll.map(({ normalized_key: _key, ...candidate }) => candidate),
    collisions,
  };

  const tie = buildTieReport({ topk, requestedTopK });

  return {
    ranked,
    topk,
    dedupe,
    tie,
    score_source_counts,
  };
}
