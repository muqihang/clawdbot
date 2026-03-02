import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Gate4Bucket = "exact_id" | "decision_reason" | "temporal_relation" | "project_context";

type Gate4DatasetSample = {
  id: string;
  bucket: Gate4Bucket;
  query: string;
  aliases?: string[];
  expected_ids: string[];
  expected_structures?: Array<"facts" | "episodes" | "nodes">;
};

type GraphitiFact = {
  uuid?: string;
  id?: string;
  fact?: string;
  name?: string;
  summary?: string;
};

type GraphitiSearchResponse = {
  facts?: GraphitiFact[];
};

type Candidate = {
  structure: "facts" | "episodes" | "nodes";
  uuid: string;
  text: string;
};

const DEFAULT_GRAPHITI_BASE_URL = "http://127.0.0.1:8000";
const DEFAULT_OUT_PATH =
  "analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day2/inputs/retrieval-gate4-dataset.v1.json";
const W3_TEMPORAL_DATASET_PATH =
  "analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day10/w3-d-gate3-final/inputs/retrieval-temporal-dataset.v1.json";

const readJson = async <T>(filePath: string): Promise<T> => {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
};

const writeJson = async (filePath: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const sanitizeText = (value: string): string => {
  return value.replace(/\s+/g, " ").trim();
};

const clampLen = (value: string, maxLen: number): string => {
  const normalized = sanitizeText(value);
  if (normalized.length <= maxLen) {
    return normalized;
  }
  return normalized
    .slice(0, Math.max(0, maxLen))
    .replace(/\s+\S*$/, "")
    .trim();
};

const toNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toUuid = (record: { uuid?: unknown; id?: unknown }): string | null => {
  return toNonEmptyString(record.uuid) ?? toNonEmptyString(record.id);
};

const fetchGraphitiSearch = async (params: {
  baseUrl: string;
  query: string;
  maxFacts?: number;
}): Promise<GraphitiSearchResponse> => {
  const response = await fetch(`${params.baseUrl.replace(/\/+$/, "")}/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: params.query,
      max_facts: params.maxFacts ?? 50,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Graphiti /search failed: HTTP ${response.status} ${response.statusText} ${text}`,
    );
  }

  return (await response.json()) as GraphitiSearchResponse;
};

const toCandidates = (payload: GraphitiSearchResponse): Candidate[] => {
  const output: Candidate[] = [];

  for (const item of payload.facts ?? []) {
    const uuid = toUuid(item);
    const text =
      toNonEmptyString(item.fact) ?? toNonEmptyString(item.summary) ?? toNonEmptyString(item.name);
    if (!uuid || !text) {
      continue;
    }
    output.push({ structure: "facts", uuid, text });
  }

  return output;
};

const stableSampleId = (params: { bucket: Gate4Bucket; uuid: string; index: number }): string => {
  return `g4v1-${params.bucket}-${params.uuid.slice(0, 8)}-${String(params.index).padStart(2, "0")}`;
};

const addSamplesFromCandidates = (params: {
  bucket: Gate4Bucket;
  candidates: Candidate[];
  desiredCount: number;
  buildQuery: (candidate: Candidate) => string | null;
  output: Gate4DatasetSample[];
}): void => {
  const expectedSeen = new Set(
    params.output.map((sample) => sample.expected_ids[0]?.toLowerCase() ?? ""),
  );
  const querySeen = new Set(params.output.map((sample) => sample.query.trim().toLowerCase()));

  for (const candidate of params.candidates) {
    if (params.output.length >= params.desiredCount) {
      return;
    }

    const expectedId = candidate.uuid.trim();
    if (!expectedId) {
      continue;
    }

    const expectedKey = expectedId.toLowerCase();
    if (expectedSeen.has(expectedKey)) {
      continue;
    }

    const query = params.buildQuery(candidate);
    if (!query) {
      continue;
    }

    const queryKey = query.trim().toLowerCase();
    if (!queryKey || querySeen.has(queryKey)) {
      continue;
    }

    params.output.push({
      id: stableSampleId({
        bucket: params.bucket,
        uuid: expectedId,
        index: params.output.length + 1,
      }),
      bucket: params.bucket,
      query,
      expected_ids: [expectedId],
      expected_structures: [candidate.structure],
    });

    expectedSeen.add(expectedKey);
    querySeen.add(queryKey);
  }
};

const main = async (): Promise<void> => {
  const graphitiBaseUrl = process.env.GRAPHITI_BASE_URL ?? DEFAULT_GRAPHITI_BASE_URL;
  const outPath = path.resolve(process.env.OUT_PATH ?? DEFAULT_OUT_PATH);

  const exactIdSeeds = [
    // We need enough distinct fact UUIDs; use a wide seed list to harvest candidates,
    // then turn each sample into an "exact_id" style query by prepending the UUID prefix
    // (commit_sha precision key).
    "/Users",
    "/Users/muqihang",
    "/docs",
    "/messages",
    "调研报告",
    "OpenClaw",
    "assistant",
    "decision",
    "原因",
    "为什么",
    "documentation first freeze decision",
    "qdrant",
    "neo4j",
    "phase",
  ];
  const decisionReasonSeeds = [
    "为什么",
    "原因",
    "决策",
    "decision",
    "reason",
    "因为",
    "选型",
    "reason to",
    "documentation first freeze decision",
  ];
  const projectContextSeeds = [
    "OpenClaw",
    "openclaw",
    "assistant",
    "agent",
    "workspace",
    "telegram",
    "version",
    "qdrant",
    "neo4j",
    "phase",
    "decision_reason",
    "plugin",
    "timeline",
  ];

  const bucketTargets: Record<Exclude<Gate4Bucket, "temporal_relation">, number> = {
    exact_id: 30,
    decision_reason: 30,
    project_context: 30,
  };

  const exactIdSamples: Gate4DatasetSample[] = [];
  const decisionReasonSamples: Gate4DatasetSample[] = [];
  const projectContextSamples: Gate4DatasetSample[] = [];

  // --- exact_id: bias toward endpoint_path (file paths / endpoints) so query_signature resolves `precisionKey`.
  for (const seed of exactIdSeeds) {
    const payload = await fetchGraphitiSearch({
      baseUrl: graphitiBaseUrl,
      query: seed,
      maxFacts: 50,
    });
    const candidates = toCandidates(payload);

    addSamplesFromCandidates({
      bucket: "exact_id",
      candidates,
      desiredCount: bucketTargets.exact_id,
      output: exactIdSamples,
      buildQuery: (candidate) => {
        const prefix = candidate.uuid.split("-")[0] ?? "";
        if (!prefix || prefix.length < 7 || prefix.length > 40) {
          return null;
        }
        // Keep parity with `matchCommitSha`: reject all-digit tokens (needs at least one hex alpha).
        if (!/[a-f]/i.test(prefix)) {
          return null;
        }

        const normalized = clampLen(`${prefix} ${candidate.text}`, 180);
        return normalized.length > 0 ? normalized : null;
      },
    });

    if (exactIdSamples.length >= bucketTargets.exact_id) {
      break;
    }
  }

  // --- decision_reason: ensure query contains a decision_reason marker (why/原因/因为/决策...).
  for (const seed of decisionReasonSeeds) {
    const payload = await fetchGraphitiSearch({
      baseUrl: graphitiBaseUrl,
      query: seed,
      maxFacts: 50,
    });
    const candidates = toCandidates(payload);

    addSamplesFromCandidates({
      bucket: "decision_reason",
      candidates,
      desiredCount: bucketTargets.decision_reason,
      output: decisionReasonSamples,
      buildQuery: (candidate) => {
        const prompt = `为什么 ${candidate.text}`;
        const normalized = clampLen(prompt, 180);
        return normalized.length > 0 ? normalized : null;
      },
    });

    if (decisionReasonSamples.length >= bucketTargets.decision_reason) {
      break;
    }
  }

  // --- project_context: ensure query matches entity_attribute patterns (`what is`, `who is`, `config`, etc.).
  for (const seed of projectContextSeeds) {
    const payload = await fetchGraphitiSearch({
      baseUrl: graphitiBaseUrl,
      query: seed,
      maxFacts: 50,
    });
    const candidates = toCandidates(payload);

    addSamplesFromCandidates({
      bucket: "project_context",
      candidates,
      desiredCount: bucketTargets.project_context,
      output: projectContextSamples,
      buildQuery: (candidate) => {
        const prompt = `what is ${candidate.text}`;
        const normalized = clampLen(prompt, 180);
        return normalized.length > 0 ? normalized : null;
      },
    });

    if (projectContextSamples.length >= bucketTargets.project_context) {
      break;
    }
  }

  // --- temporal_relation: reuse Wave3 temporal dataset (already >=30) to keep continuity.
  const temporal = await readJson<Gate4DatasetSample[]>(W3_TEMPORAL_DATASET_PATH);
  const temporalSamples: Gate4DatasetSample[] = temporal.map((sample) => ({
    id: `g4v1-temporal-${sample.id}`,
    bucket: "temporal_relation",
    query: sample.query,
    aliases: sample.aliases,
    expected_ids: sample.expected_ids,
    expected_structures: sample.expected_structures,
  }));

  const dataset = [
    ...exactIdSamples,
    ...decisionReasonSamples,
    ...temporalSamples,
    ...projectContextSamples,
  ];

  const countByBucket = dataset.reduce(
    (acc, sample) => {
      acc[sample.bucket] = (acc[sample.bucket] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  await writeJson(outPath, dataset);

  process.stdout.write(
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        graphiti_base_url: graphitiBaseUrl,
        out_path: outPath,
        count_by_bucket: countByBucket,
      },
      null,
      2,
    )}\n`,
  );

  const insufficient: string[] = [];
  for (const [bucket, minSize] of Object.entries({
    exact_id: 30,
    decision_reason: 30,
    temporal_relation: 30,
    project_context: 30,
  })) {
    const actual = countByBucket[bucket] ?? 0;
    if (actual < minSize) {
      insufficient.push(`${bucket}=${actual} (<${minSize})`);
    }
  }

  if (insufficient.length > 0) {
    process.stderr.write(`dataset insufficient: ${insufficient.join(", ")}\n`);
    process.exitCode = 2;
  }
};

await main();
