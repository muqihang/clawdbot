import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeAndRankCandidates,
  type NormalizationCandidate,
} from "../../../../../../extensions/memory-mem0-graphiti-bridge/src/fusion/normalize.js";

type ToolDetails = Record<string, unknown>;

const filePathFromUrl = (value: string): string => fileURLToPath(new URL(value));

const scriptDir = path.dirname(filePathFromUrl(import.meta.url));
const evidenceDir = path.resolve(scriptDir, "..");
const retrievalDir = path.join(evidenceDir, "retrieval");

const writeJson = async (targetPath: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const hashToUint32 = (seed: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number): (() => number) => {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffle = <T>(items: readonly T[], seed: string): T[] => {
  const prng = mulberry32(hashToUint32(seed));
  const output = [...items];

  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(prng() * (index + 1));
    const tmp = output[index];
    output[index] = output[swapIndex];
    output[swapIndex] = tmp;
  }

  return output;
};

const canonicalCandidates: NormalizationCandidate[] = [
  {
    source: "graphiti",
    remoteId: "SHARED",
    path: "bridge/graphiti/shared",
    score: 0,
    score_source: "score",
  },
  {
    source: "mem0",
    remoteId: "shared",
    path: "bridge/mem0/shared",
    score: 0,
    score_source: "rank_score",
  },
  {
    source: "mem0",
    remoteId: "a-hit",
    path: "bridge/mem0/a-hit",
    score: 0,
    score_source: "missing",
  },
  {
    source: "graphiti",
    remoteId: "z-hit",
    path: "bridge/graphiti/z-hit",
    score: 0,
    score_source: "missing",
  },
];

const toCandidateSummary = (candidate: NormalizationCandidate): ToolDetails => {
  return {
    source: candidate.source,
    remote_id: candidate.remoteId,
    path: candidate.path,
    score: candidate.score,
    score_source: candidate.score_source ?? "missing",
  };
};

const baselineTop1 = (candidates: readonly NormalizationCandidate[]): ToolDetails | null => {
  const first = candidates[0];
  return first ? toCandidateSummary(first) : null;
};

const variantTop1 = (
  candidates: readonly NormalizationCandidate[],
  topK: number,
): ToolDetails | null => {
  const normalized = normalizeAndRankCandidates({
    candidates: [...candidates],
    topK,
  });
  const top1 = normalized.topk[0];
  return top1
    ? {
        source: top1.source,
        remote_id: top1.remoteId,
        path: top1.path,
        score: top1.score,
        score_source: top1.score_source,
      }
    : null;
};

const runOnce = (params: {
  runId: string;
  seed: string;
  topK: number;
}): { baseline: ToolDetails; variant: ToolDetails; baselineTop1: string; variantTop1: string } => {
  const candidates = shuffle(canonicalCandidates, params.seed);

  const baseline = {
    generated_at: new Date().toISOString(),
    run_id: params.runId,
    seed: params.seed,
    top_k: params.topK,
    mode: "baseline/raw_first",
    candidates: candidates.map(toCandidateSummary),
    top1: baselineTop1(candidates),
  };

  const normalized = normalizeAndRankCandidates({
    candidates: [...candidates],
    topK: params.topK,
  });
  const variant = {
    generated_at: new Date().toISOString(),
    run_id: params.runId,
    seed: params.seed,
    top_k: params.topK,
    mode: "variant/normalizeAndRankCandidates",
    candidates: candidates.map(toCandidateSummary),
    top1: variantTop1(candidates, params.topK),
    normalized_topk: normalized.topk.map((candidate) => ({
      source: candidate.source,
      remote_id: candidate.remoteId,
      path: candidate.path,
      score: candidate.score,
      score_source: candidate.score_source,
    })),
    tie: normalized.tie,
    dedupe: {
      input_count: normalized.dedupe.input_count,
      unique_count: normalized.dedupe.unique_count,
      collisions: normalized.dedupe.collisions.map((collision) => ({
        normalized_key: collision.normalized_key,
        kept: {
          source: collision.kept.source,
          remote_id: collision.kept.remoteId,
          path: collision.kept.path,
          score: collision.kept.score,
          score_source: collision.kept.score_source,
        },
        dropped: collision.dropped.map((dropped) => ({
          source: dropped.source,
          remote_id: dropped.remoteId,
          path: dropped.path,
          score: dropped.score,
          score_source: dropped.score_source,
        })),
      })),
    },
    score_source_counts: normalized.score_source_counts,
  };

  const baselineId =
    baseline.top1 && typeof baseline.top1.remote_id === "string" ? baseline.top1.remote_id : "";
  const variantId =
    variant.top1 && typeof variant.top1.remote_id === "string" ? variant.top1.remote_id : "";

  return {
    baseline,
    variant,
    baselineTop1: baselineId,
    variantTop1: variantId,
  };
};

const runBounded = async (): Promise<void> => {
  for (let index = 0; index < 5; index += 1) {
    const runId = String(index + 1).padStart(2, "0");
    const runDir = path.join(retrievalDir, `bounded-${runId}`);

    const run = runOnce({
      runId: `bounded-${runId}`,
      seed: `bounded-${runId}`,
      topK: 5,
    });

    await writeJson(path.join(runDir, "baseline.details.json"), run.baseline);
    await writeJson(path.join(runDir, "variant.details.json"), run.variant);
  }
};

const runStability = async (): Promise<{
  baselineTop1: string[];
  variantTop1: string[];
  expectedVariantTop1: string;
}> => {
  const baselineTop1Values: string[] = [];
  const variantTop1Values: string[] = [];

  const expectedVariantTop1 =
    normalizeAndRankCandidates({ candidates: [...canonicalCandidates], topK: 5 }).topk[0]
      ?.remoteId ?? "";

  for (let index = 0; index < 10; index += 1) {
    const runId = String(index + 1).padStart(2, "0");
    const runDir = path.join(retrievalDir, `stability-${runId}`);

    const run = runOnce({
      runId: `stability-${runId}`,
      seed: `stability-${runId}`,
      topK: 5,
    });

    baselineTop1Values.push(run.baselineTop1);
    variantTop1Values.push(run.variantTop1);

    await writeJson(path.join(runDir, "baseline.details.json"), run.baseline);
    await writeJson(path.join(runDir, "variant.details.json"), run.variant);
  }

  return {
    baselineTop1: baselineTop1Values,
    variantTop1: variantTop1Values,
    expectedVariantTop1,
  };
};

const main = async (): Promise<void> => {
  await mkdir(retrievalDir, { recursive: true });

  await runBounded();
  const stability = await runStability();

  const baselineUnique = new Set(stability.baselineTop1.filter(Boolean));
  const variantUnique = new Set(stability.variantTop1.filter(Boolean));
  const invariantTop1 =
    stability.expectedVariantTop1.length > 0 &&
    stability.variantTop1.every((value) => value === stability.expectedVariantTop1);

  const summary = {
    generated_at: new Date().toISOString(),
    bounded_runs: 5,
    stability_runs: 10,
    baseline_top1_unique: baselineUnique.size,
    variant_top1_unique: variantUnique.size,
    invariant_top1: invariantTop1,
    expected_variant_top1: stability.expectedVariantTop1,
    baseline_top1: stability.baselineTop1,
    variant_top1: stability.variantTop1,
  };

  await writeJson(path.join(retrievalDir, "stability-summary.json"), summary);

  console.log(JSON.stringify(summary, null, 2));

  if (baselineUnique.size <= 1 || variantUnique.size !== 1 || !invariantTop1) {
    process.exitCode = 1;
  }
};

await main();
