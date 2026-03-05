import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

type Gate4Bucket = "exact_id" | "decision_reason" | "temporal_relation" | "project_context";

type Gate4DatasetSample = {
  id: string;
  bucket: Gate4Bucket;
  query: string;
  aliases?: string[];
  expected_ids: string[];
  expected_structures?: Array<"facts" | "episodes" | "nodes">;
};

type Mode = "baseline" | "variant";
type Phase = "bounded" | "stability";

type QueryContext =
  | { kind: "sample"; sample: Gate4DatasetSample; query: string }
  | { kind: "alias"; sample: Gate4DatasetSample; aliasIndex: number; query: string };

type NormalizedHit = {
  rank: number;
  remoteId: string;
  path: string;
  score: number;
  source: string | null;
  structure: string | null;
  score_source: string | null;
};

type ProviderCallTrace = {
  query: string;
  options: Record<string, unknown> | null;
  latency_ms: number;
  hits: Array<Record<string, unknown>>;
};

type LocalToolTrace = {
  toolCallId: string;
  query: string;
  latency_ms: number;
  payload: unknown;
};

type PerSampleMetric = {
  sample_id: string;
  bucket: Gate4Bucket;
  query: string;
  expected_ids: string[];
  expected_structures?: Array<"facts" | "episodes" | "nodes">;
  top1_path: string | null;
  top1_remote_id: string | null;
  top1_source: string | null;
  matched_top1: boolean;
};

type RunBucketMetrics = {
  bucket: Gate4Bucket;
  sample_size: number;
  matched_top1: number;
  hit_at_1: number;
};

type RunSummary = {
  mode: Mode;
  phase: Phase;
  attempt: number;
  generated_at: string;
  dataset_size: number;
  sample_size_by_bucket: Record<Gate4Bucket, number>;
  bucket_metrics: RunBucketMetrics[];
  avg_hit_at_1: number;
  fur_proxy: number;
  top1_path_prefix_counts: {
    bridge: number;
    local: number;
    other: number;
    null: number;
  };
  non_bridge_top1_samples: Array<{
    sample_id: string;
    bucket: Gate4Bucket;
    top1_path: string | null;
    top1_source: string | null;
  }>;
};

type ModeReport = {
  mode: Mode;
  generated_at: string;
  dataset_snapshot_path: string;
  bounded_runs: number;
  stability_runs: number;
  selected_bounded_attempt: number;
  selected_bounded_summary: RunSummary;
  bounded_summaries: RunSummary[];
  stability_summaries: RunSummary[];
  stability_unique_values: {
    avg_hit_at_1: number[];
    fur_proxy: number[];
  };
  latency: {
    bounded_sample_count: number;
    p50_total_ms: number;
    p95_total_ms: number;
  };
};

type ModeSeed = {
  selectedBoundedSummary: RunSummary;
  latency: ModeReport["latency"];
};

type DeltaReport = {
  generated_at: string;
  top1: {
    avg_hit_at_1_baseline: number;
    avg_hit_at_1_variant: number;
    top1_avg_delta_pp: number;
    per_bucket_baseline: Record<Gate4Bucket, number>;
    per_bucket_variant: Record<Gate4Bucket, number>;
  };
  fur_proxy: {
    baseline: number;
    variant: number;
    fur_delta_pp: number;
  };
  latency: {
    p50_total_baseline_ms: number;
    p50_total_variant_ms: number;
    p95_total_baseline_ms: number;
    p95_total_variant_ms: number;
    p95_increase_pct: number;
  };
  stability: {
    unique_values: {
      avg_hit_at_1_baseline: number[];
      avg_hit_at_1_variant: number[];
      top1_avg_delta_pp: number[];
      fur_proxy_baseline: number[];
      fur_proxy_variant: number[];
      fur_delta_pp: number[];
    };
    pass: boolean;
  };
  gates: {
    top1_avg_delta_pp_ge_8: boolean;
    fur_delta_pp_ge_10: boolean;
    p95_increase_pct_le_15: boolean;
  };
};

const filePathFromUrl = (value: string): string => fileURLToPath(new URL(value));
const scriptDir = path.dirname(filePathFromUrl(import.meta.url));
const evidenceRoot = path.resolve(scriptDir, "..");

const INPUTS_DIR = path.join(evidenceRoot, "inputs");
const OPENAPI_DIR = path.join(evidenceRoot, "openapi");
const RETRIEVAL_DIR = path.join(evidenceRoot, "retrieval");
const LATENCY_DIR = path.join(evidenceRoot, "latency");
const REPORT_DIR = path.join(evidenceRoot, "report");

const DATASET_SNAPSHOT_PATH = path.join(INPUTS_DIR, "retrieval-gate4-dataset.v1.snapshot.json");

const TOP_K = 5;
const DEFAULT_BOUNDED_RUNS = 5;
const DEFAULT_STABILITY_RUNS = 10;

const parsePositiveInt = (raw: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const STABILITY_ONLY = process.env.GATE4_STABILITY_ONLY === "1";
const BOUNDED_RUNS = STABILITY_ONLY
  ? 0
  : parsePositiveInt(process.env.GATE4_BOUNDED_RUNS, DEFAULT_BOUNDED_RUNS);
const STABILITY_RUNS = parsePositiveInt(process.env.GATE4_STABILITY_RUNS, DEFAULT_STABILITY_RUNS);

const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

const readJson = async <T>(filePath: string): Promise<T> => {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
};

const writeJson = async (filePath: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const writeText = async (filePath: string, value: string): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
};

const appendJsonl = async (filePath: string, line: unknown): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(line)}\n`, { encoding: "utf8", flag: "a" });
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const toString = (value: unknown): string => (typeof value === "string" ? value : "");
const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
};

const getRemoteIdFromPath = (pathValue: string): string => {
  const normalized = pathValue.trim();
  const slashIndex = normalized.lastIndexOf("/");
  if (slashIndex === -1) {
    return normalized;
  }
  return decodeURIComponent(normalized.slice(slashIndex + 1));
};

const normalizeTopKFromResults = (results: unknown, topK: number): NormalizedHit[] => {
  if (!Array.isArray(results)) {
    return [];
  }

  return results.slice(0, topK).map((item, index) => {
    const record = toRecord(item);
    const pathValue = toString(record.path);
    return {
      rank: index + 1,
      remoteId: getRemoteIdFromPath(pathValue),
      path: pathValue,
      score: round4(toNumber(record.score)),
      source: toString(record.source) || null,
      structure: toString(record.structure) || null,
      score_source: toString(record.score_source) || null,
    };
  });
};

const listUniqueValues = (values: number[]): number[] => {
  const seen = new Set<string>();
  const out: number[] = [];
  for (const v of values) {
    const key = round4(v).toFixed(4);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(Number.parseFloat(key));
  }
  return out;
};

const percentile = (values: number[], pct: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].toSorted((a, b) => a - b);
  const pos = (sorted.length - 1) * pct;
  const base = Math.floor(pos);
  const rest = pos - base;
  const left = sorted[base] ?? sorted[0] ?? 0;
  const right = sorted[base + 1] ?? left;
  return left + (right - left) * rest;
};

const buildQueryContexts = (dataset: Gate4DatasetSample[]): QueryContext[] => {
  const contexts: QueryContext[] = [];

  for (const sample of dataset) {
    contexts.push({ kind: "sample", sample, query: sample.query });
    for (const [aliasIndex, aliasQuery] of (sample.aliases ?? []).entries()) {
      contexts.push({ kind: "alias", sample, aliasIndex, query: aliasQuery });
    }
  }

  return contexts;
};

const dedupeDatasetForScoring = (
  dataset: Gate4DatasetSample[],
): {
  dataset: Gate4DatasetSample[];
  dropped: Array<{ id: string; bucket: Gate4Bucket; reason: string }>;
} => {
  const expectedSeenByBucket = new Map<Gate4Bucket, Set<string>>();
  const querySeenByBucket = new Map<Gate4Bucket, Set<string>>();

  const dropped: Array<{ id: string; bucket: Gate4Bucket; reason: string }> = [];
  const out: Gate4DatasetSample[] = [];

  for (const sample of dataset) {
    const bucket = sample.bucket;
    const expectedKey = (sample.expected_ids?.[0] ?? "").trim().toLowerCase();
    const queryKey = sample.query.trim().toLowerCase();

    const expectedSeen = expectedSeenByBucket.get(bucket) ?? new Set<string>();
    const querySeen = querySeenByBucket.get(bucket) ?? new Set<string>();
    expectedSeenByBucket.set(bucket, expectedSeen);
    querySeenByBucket.set(bucket, querySeen);

    if (expectedKey && expectedSeen.has(expectedKey)) {
      dropped.push({ id: sample.id, bucket, reason: "duplicate expected_ids[0] within bucket" });
      continue;
    }
    if (queryKey && querySeen.has(queryKey)) {
      dropped.push({ id: sample.id, bucket, reason: "duplicate query within bucket" });
      continue;
    }

    out.push(sample);
    if (expectedKey) {
      expectedSeen.add(expectedKey);
    }
    if (queryKey) {
      querySeen.add(queryKey);
    }
  }

  return { dataset: out, dropped };
};

const datasetNoAliases = (dataset: Gate4DatasetSample[]): Gate4DatasetSample[] => {
  return dataset.map((sample) => ({ ...sample, aliases: [] }));
};

const sampleSizeByBucket = (dataset: Gate4DatasetSample[]): Record<Gate4Bucket, number> => {
  const out: Record<Gate4Bucket, number> = {
    exact_id: 0,
    decision_reason: 0,
    temporal_relation: 0,
    project_context: 0,
  };
  for (const sample of dataset) {
    out[sample.bucket] += 1;
  }
  return out;
};

const computeRunSummary = (params: {
  mode: Mode;
  phase: Phase;
  attempt: number;
  dataset: Gate4DatasetSample[];
  perSample: PerSampleMetric[];
}): RunSummary => {
  const sizeByBucket = sampleSizeByBucket(params.dataset);
  const matchedByBucket: Record<Gate4Bucket, number> = {
    exact_id: 0,
    decision_reason: 0,
    temporal_relation: 0,
    project_context: 0,
  };

  let matchedTotal = 0;
  for (const metric of params.perSample) {
    if (metric.matched_top1) {
      matchedByBucket[metric.bucket] += 1;
      matchedTotal += 1;
    }
  }

  const bucketMetrics: RunBucketMetrics[] = (Object.keys(sizeByBucket) as Gate4Bucket[]).map(
    (bucket) => {
      const bucketSize = sizeByBucket[bucket];
      const matched = matchedByBucket[bucket];
      return {
        bucket,
        sample_size: bucketSize,
        matched_top1: matched,
        hit_at_1: round4(bucketSize > 0 ? matched / bucketSize : 0),
      };
    },
  );

  const avgHitAt1 =
    bucketMetrics.reduce((sum, item) => sum + item.hit_at_1, 0) / Math.max(1, bucketMetrics.length);

  const furProxy = round4(matchedTotal / Math.max(1, params.perSample.length));

  const prefixCounts = {
    bridge: 0,
    local: 0,
    other: 0,
    null: 0,
  } as const;

  const prefixMutable = { ...prefixCounts };
  const nonBridge: Array<{
    sample_id: string;
    bucket: Gate4Bucket;
    top1_path: string | null;
    top1_source: string | null;
  }> = [];

  for (const metric of params.perSample) {
    const p = metric.top1_path;
    if (!p) {
      prefixMutable.null += 1;
      nonBridge.push({
        sample_id: metric.sample_id,
        bucket: metric.bucket,
        top1_path: metric.top1_path,
        top1_source: metric.top1_source,
      });
      continue;
    }
    if (p.startsWith("bridge/")) {
      prefixMutable.bridge += 1;
      continue;
    }
    if (p.startsWith("local/")) {
      prefixMutable.local += 1;
      nonBridge.push({
        sample_id: metric.sample_id,
        bucket: metric.bucket,
        top1_path: metric.top1_path,
        top1_source: metric.top1_source,
      });
      continue;
    }

    prefixMutable.other += 1;
    nonBridge.push({
      sample_id: metric.sample_id,
      bucket: metric.bucket,
      top1_path: metric.top1_path,
      top1_source: metric.top1_source,
    });
  }

  return {
    mode: params.mode,
    phase: params.phase,
    attempt: params.attempt,
    generated_at: new Date().toISOString(),
    dataset_size: params.dataset.length,
    sample_size_by_bucket: sizeByBucket,
    bucket_metrics: bucketMetrics,
    avg_hit_at_1: round4(avgHitAt1),
    fur_proxy: furProxy,
    top1_path_prefix_counts: prefixMutable,
    non_bridge_top1_samples: nonBridge,
  };
};

const main = async (): Promise<void> => {
  await mkdir(INPUTS_DIR, { recursive: true });
  await mkdir(OPENAPI_DIR, { recursive: true });
  await mkdir(RETRIEVAL_DIR, { recursive: true });
  await mkdir(LATENCY_DIR, { recursive: true });
  await mkdir(REPORT_DIR, { recursive: true });

  const dataset = await readJson<Gate4DatasetSample[]>(DATASET_SNAPSHOT_PATH);
  if (!Array.isArray(dataset) || dataset.length === 0) {
    throw new Error(`dataset missing or empty: ${DATASET_SNAPSHOT_PATH}`);
  }

  // --- load OpenClaw config + bridge flags from user config
  const repoRoot = process.cwd();

  const require = createRequire(import.meta.url);
  const jitiFactory = require("jiti") as (
    filename: string,
    opts?: { interopDefault?: boolean; esmResolve?: boolean },
  ) => (id: string) => unknown;
  const jiti = jitiFactory(filePathFromUrl(import.meta.url), {
    interopDefault: true,
    esmResolve: true,
  });

  const configModule = jiti(path.join(repoRoot, "src/config/io.ts")) as {
    loadConfig: () => unknown;
  };
  const flagsModule = jiti(
    path.join(repoRoot, "extensions/memory-mem0-graphiti-bridge/src/config/flags.ts"),
  ) as { resolveBridgeFlags: (raw: unknown) => unknown };
  const toolModule = jiti(
    path.join(repoRoot, "extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts"),
  ) as {
    createBridgeMemorySearchTool: (deps: unknown) => {
      execute: (toolCallId: string, params: unknown) => Promise<{ details?: unknown }>;
    };
  };
  const remoteStoreModule = jiti(
    path.join(
      repoRoot,
      "extensions/memory-mem0-graphiti-bridge/src/bridge/remote-snippet-store.ts",
    ),
  ) as {
    createRemoteSnippetStore: (opts: { ttlMs: number }) => unknown;
  };
  const mem0ClientModule = jiti(
    path.join(repoRoot, "extensions/memory-mem0-graphiti-bridge/src/client/mem0-client.ts"),
  ) as { createMem0Client: (opts: unknown) => unknown };
  const graphitiClientModule = jiti(
    path.join(repoRoot, "extensions/memory-mem0-graphiti-bridge/src/client/graphiti-client.ts"),
  ) as { createGraphitiClient: (opts: unknown) => unknown };
  const localMemoryToolModule = jiti(path.join(repoRoot, "src/agents/tools/memory-tool.ts")) as {
    createMemorySearchTool: (opts: {
      config?: unknown;
      agentSessionKey?: string;
    }) => { execute: (toolCallId: string, params: unknown) => Promise<unknown> } | null;
  };

  const { loadConfig } = configModule;
  const resolveBridgeFlags = flagsModule.resolveBridgeFlags;
  const { createBridgeMemorySearchTool } = toolModule;
  const { createRemoteSnippetStore } = remoteStoreModule;
  const { createMem0Client } = mem0ClientModule;
  const { createGraphitiClient } = graphitiClientModule;
  const { createMemorySearchTool } = localMemoryToolModule;

  const cfg = loadConfig();
  const pluginEntry =
    toRecord(cfg).plugins && toRecord(toRecord(cfg).plugins).entries
      ? toRecord(toRecord(toRecord(cfg).plugins).entries)["memory-mem0-graphiti-bridge"]
      : null;
  const pluginConfig = toRecord(pluginEntry).config ?? {};
  const baseFlags = resolveBridgeFlags(pluginConfig);

  const flagsForMode = (mode: Mode): unknown => {
    const baseRecord = toRecord(baseFlags);
    const read = toRecord(baseRecord.read);
    const fusion = toRecord(read.fusion);

    return resolveBridgeFlags({
      ...baseRecord,
      read: {
        ...read,
        fusion: {
          ...fusion,
          enabled: mode === "variant",
        },
      },
    });
  };

  const baselineFlags = flagsForMode("baseline");
  const variantFlags = flagsForMode("variant");

  await writeJson(path.join(INPUTS_DIR, "runner-input.snapshot.json"), {
    generated_at: new Date().toISOString(),
    dataset_snapshot_path: DATASET_SNAPSHOT_PATH,
    top_k: TOP_K,
    stability_only: STABILITY_ONLY,
    bounded_runs: BOUNDED_RUNS,
    stability_runs: STABILITY_RUNS,
    baseline: {
      fusion_enabled: false,
      flags: baselineFlags,
    },
    variant: {
      fusion_enabled: true,
      flags: variantFlags,
    },
  });

  const graphitiBaseUrl =
    toString(toRecord(toRecord(baseFlags).graphiti).base_url) || "http://127.0.0.1:8000";
  const mem0BaseUrl =
    toString(toRecord(toRecord(baseFlags).mem0).base_url) || "http://127.0.0.1:8766";

  // --- OpenAPI snapshots (for audit / field alignment)
  const fetchJson = async (url: string, timeoutMs: number): Promise<unknown> => {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return await response.json();
  };

  await writeJson(
    path.join(OPENAPI_DIR, "graphiti-openapi.json"),
    await fetchJson(`${graphitiBaseUrl}/openapi.json`, 20_000),
  );
  await writeJson(
    path.join(OPENAPI_DIR, "mem0-openapi.json"),
    await fetchJson(`${mem0BaseUrl}/openapi.json`, 20_000),
  );

  // --- shared latency samples file
  const latencySamplesPath = path.join(LATENCY_DIR, "latency.samples.jsonl");
  await writeFile(latencySamplesPath, "", "utf8");

  const runMode = async (mode: Mode, flags: unknown, seed?: ModeSeed): Promise<ModeReport> => {
    const sessionKey = `w4-d-gate4:${mode}:direct`;
    const baseLocalTool = createMemorySearchTool({ config: cfg, agentSessionKey: sessionKey });
    if (!baseLocalTool) {
      throw new Error("createMemorySearchTool returned null (local memory tool unavailable)");
    }

    const runOne = async (phase: Phase, attempt: number): Promise<RunSummary> => {
      const runId = `${phase}-${String(attempt).padStart(2, "0")}`;
      const runDir = path.join(RETRIEVAL_DIR, mode, runId);
      await mkdir(runDir, { recursive: true });

      let activeLabel: string | null = null;
      let providerCalls: { mem0: ProviderCallTrace[]; graphiti: ProviderCallTrace[] } = {
        mem0: [],
        graphiti: [],
      };
      let localCalls: LocalToolTrace[] = [];

      const toolRawQueries: Array<{ label: string; query: string; details: unknown }> = [];
      const toolTopkQueries: Array<{ label: string; query: string; hits: NormalizedHit[] }> = [];
      const mem0RawQueries: Array<{ label: string; query: string; calls: ProviderCallTrace[] }> =
        [];
      const mem0TopkQueries: Array<{ label: string; query: string; hits: NormalizedHit[] }> = [];
      const graphitiRawQueries: Array<{
        label: string;
        query: string;
        calls: ProviderCallTrace[];
      }> = [];
      const graphitiTopkQueries: Array<{ label: string; query: string; hits: NormalizedHit[] }> =
        [];
      const localRawQueries: Array<{ label: string; query: string; calls: LocalToolTrace[] }> = [];
      const localTopkQueries: Array<{ label: string; query: string; hits: NormalizedHit[] }> = [];

      const wrappedLocalTool = {
        ...baseLocalTool,
        execute: async (toolCallId: string, params: unknown) => {
          const query = toString(toRecord(params).query);
          const started = performance.now();
          const result = await baseLocalTool.execute(toolCallId, params);
          const elapsed = performance.now() - started;

          if (activeLabel) {
            localCalls.push({
              toolCallId,
              query,
              latency_ms: round4(elapsed),
              payload: result,
            });
          }

          return result;
        },
      };

      const buildProviderClient = (provider: "mem0" | "graphiti") => {
        const timeoutMs = toNumber(toRecord(toRecord(flags).timeoutMs).search) || 3000;
        const getTimeoutMs = toNumber(toRecord(toRecord(flags).timeoutMs).get) || 3000;

        const baseUrl =
          provider === "mem0"
            ? toString(toRecord(toRecord(flags).mem0).base_url) || mem0BaseUrl
            : toString(toRecord(toRecord(flags).graphiti).base_url) || graphitiBaseUrl;
        const apiKey =
          provider === "mem0"
            ? toString(toRecord(toRecord(flags).mem0).api_key) || undefined
            : toString(toRecord(toRecord(flags).graphiti).api_key) || undefined;

        const base =
          provider === "mem0"
            ? (createMem0Client({
                baseUrl,
                apiKey,
                timeoutMs,
                getTimeoutMs,
              }) as {
                search: (query: string, options?: Record<string, unknown>) => Promise<unknown[]>;
              })
            : (createGraphitiClient({
                baseUrl,
                apiKey,
                timeoutMs,
                getTimeoutMs,
              }) as {
                search: (query: string, options?: Record<string, unknown>) => Promise<unknown[]>;
              });

        return {
          ...base,
          search: async (query: string, options?: Record<string, unknown>) => {
            const started = performance.now();
            const hits = await base.search(query, options);
            const elapsed = performance.now() - started;

            if (activeLabel) {
              providerCalls[provider].push({
                query,
                options: options ?? null,
                latency_ms: round4(elapsed),
                hits: (hits as Array<Record<string, unknown>>).map((item) => toRecord(item)),
              });
            }

            return hits;
          },
        };
      };

      const mem0Client = buildProviderClient("mem0");
      const graphitiClient = buildProviderClient("graphiti");

      const tool = createBridgeMemorySearchTool({
        flags,
        localTool: wrappedLocalTool,
        snippetStore: createRemoteSnippetStore({ ttlMs: 5 * 60_000 }),
        clients: {
          mem0: mem0Client,
          graphiti: graphitiClient,
        },
        shadowReporter: { record: () => undefined },
        sessionKey,
      });

      const evalDataset = phase === "bounded" ? dataset : datasetNoAliases(dataset);
      const scoring = dedupeDatasetForScoring(evalDataset);
      const scoringSampleIds = new Set(scoring.dataset.map((sample) => sample.id));
      const queryContexts = buildQueryContexts(evalDataset);

      const perSample: PerSampleMetric[] = [];

      for (const context of queryContexts) {
        const fileLabel =
          context.kind === "sample"
            ? `sample.${context.sample.id}`
            : `alias.${context.sample.id}.${String(context.aliasIndex).padStart(2, "0")}`;

        activeLabel = fileLabel;
        providerCalls = { mem0: [], graphiti: [] };
        localCalls = [];

        const startedTotal = performance.now();
        const result = await tool.execute(`${mode}-${runId}-${fileLabel}`, {
          query: context.query,
        });
        const elapsedTotal = performance.now() - startedTotal;

        const details = toRecord(result.details);
        const toolTopk = normalizeTopKFromResults(details.results, TOP_K);
        toolRawQueries.push({ label: fileLabel, query: context.query, details });
        toolTopkQueries.push({ label: fileLabel, query: context.query, hits: toolTopk });
        mem0RawQueries.push({ label: fileLabel, query: context.query, calls: providerCalls.mem0 });
        graphitiRawQueries.push({
          label: fileLabel,
          query: context.query,
          calls: providerCalls.graphiti,
        });
        localRawQueries.push({ label: fileLabel, query: context.query, calls: localCalls });

        const lastMem0Hits = providerCalls.mem0[providerCalls.mem0.length - 1]?.hits ?? [];
        const lastGraphitiHits =
          providerCalls.graphiti[providerCalls.graphiti.length - 1]?.hits ?? [];
        const localPayload = localCalls[localCalls.length - 1]?.payload ?? null;

        const normalizeProviderTopK = (hits: Array<Record<string, unknown>>): NormalizedHit[] => {
          return hits.slice(0, TOP_K).map((hit, index) => {
            const pathValue = toString(hit.path);
            return {
              rank: index + 1,
              remoteId: toString(hit.remoteId) || getRemoteIdFromPath(pathValue),
              path: pathValue,
              score: round4(toNumber(hit.score)),
              source: toString(hit.source) || null,
              structure: toString(hit.structure) || null,
              score_source: toString(hit.score_source) || null,
            };
          });
        };
        mem0TopkQueries.push({
          label: fileLabel,
          query: context.query,
          hits: normalizeProviderTopK(lastMem0Hits),
        });
        graphitiTopkQueries.push({
          label: fileLabel,
          query: context.query,
          hits: normalizeProviderTopK(lastGraphitiHits),
        });

        // local tool payload has `.details.results` shape.
        const localDetails = toRecord(toRecord(localPayload).details);
        localTopkQueries.push({
          label: fileLabel,
          query: context.query,
          hits: normalizeTopKFromResults(localDetails.results, TOP_K),
        });

        await appendJsonl(latencySamplesPath, {
          generated_at: new Date().toISOString(),
          mode,
          phase,
          attempt,
          context_kind: context.kind,
          sample_id: context.sample.id,
          bucket: context.sample.bucket,
          query: context.query,
          total_ms: round4(elapsedTotal),
          local_ms: round4(localCalls.reduce((sum, c) => sum + c.latency_ms, 0)),
          mem0_ms: round4(providerCalls.mem0.reduce((sum, c) => sum + c.latency_ms, 0)),
          graphiti_ms: round4(providerCalls.graphiti.reduce((sum, c) => sum + c.latency_ms, 0)),
          mem0_calls: providerCalls.mem0.length,
          graphiti_calls: providerCalls.graphiti.length,
          local_calls: localCalls.length,
        });

        // scoring: samples only (aliases are audit-only)
        if (context.kind === "sample" && scoringSampleIds.has(context.sample.id)) {
          const expected = new Set(
            (context.sample.expected_ids ?? []).map((id) => id.toLowerCase()),
          );
          const top1 = toolTopk[0];
          const top1Remote = top1?.remoteId ? top1.remoteId.toLowerCase() : "";
          const matched = Boolean(top1Remote && expected.has(top1Remote));

          perSample.push({
            sample_id: context.sample.id,
            bucket: context.sample.bucket,
            query: context.sample.query,
            expected_ids: context.sample.expected_ids,
            expected_structures: context.sample.expected_structures,
            top1_path: top1?.path ?? null,
            top1_remote_id: top1?.remoteId ?? null,
            top1_source: top1?.source ?? null,
            matched_top1: matched,
          });
        }

        activeLabel = null;
      }

      await writeJson(path.join(runDir, "metrics.per-sample.json"), perSample);

      await writeJson(path.join(runDir, "search.raw.tool.json"), {
        mode,
        phase,
        attempt,
        queries: toolRawQueries,
      });
      await writeJson(path.join(runDir, "search.topk.tool.json"), {
        top_k: TOP_K,
        queries: toolTopkQueries,
      });

      await writeJson(path.join(runDir, "search.raw.mem0.json"), {
        mode,
        phase,
        attempt,
        queries: mem0RawQueries,
      });
      await writeJson(path.join(runDir, "search.topk.mem0.json"), {
        top_k: TOP_K,
        queries: mem0TopkQueries,
      });

      await writeJson(path.join(runDir, "search.raw.graphiti.json"), {
        mode,
        phase,
        attempt,
        queries: graphitiRawQueries,
      });
      await writeJson(path.join(runDir, "search.topk.graphiti.json"), {
        top_k: TOP_K,
        queries: graphitiTopkQueries,
      });

      await writeJson(path.join(runDir, "search.raw.local.json"), {
        mode,
        phase,
        attempt,
        note: "local tool is wrapped; calls[] include payload but not raw HTTP request. Use payload.details.results for local recall audit.",
        queries: localRawQueries,
      });
      await writeJson(path.join(runDir, "search.topk.local.json"), {
        top_k: TOP_K,
        queries: localTopkQueries,
      });

      const summary = computeRunSummary({
        mode,
        phase,
        attempt,
        dataset: scoring.dataset,
        perSample,
      });
      await writeJson(path.join(runDir, "metrics.summary.json"), summary);
      await writeJson(path.join(runDir, "metrics.dedupe.json"), {
        generated_at: new Date().toISOString(),
        dropped_count: scoring.dropped.length,
        dropped: scoring.dropped.slice(0, 50),
      });

      return summary;
    };

    const boundedSummaries: RunSummary[] = [];
    if (BOUNDED_RUNS > 0) {
      for (let attempt = 1; attempt <= BOUNDED_RUNS; attempt += 1) {
        boundedSummaries.push(await runOne("bounded", attempt));
      }
    }

    const stabilitySummaries: RunSummary[] = [];
    for (let attempt = 1; attempt <= STABILITY_RUNS; attempt += 1) {
      stabilitySummaries.push(await runOne("stability", attempt));
    }

    const selectedBoundedAttempt = 1;
    const selectedBoundedSummary =
      boundedSummaries[selectedBoundedAttempt - 1] ??
      boundedSummaries[0] ??
      seed?.selectedBoundedSummary;
    if (!selectedBoundedSummary) {
      throw new Error(
        `missing bounded summary for mode=${mode}; set GATE4_BOUNDED_RUNS>0 or provide seed report`,
      );
    }

    const stabilityAvg = stabilitySummaries.map((s) => s.avg_hit_at_1);
    const stabilityFur = stabilitySummaries.map((s) => s.fur_proxy);

    // latency: bounded phase only, sample-only contexts
    const latencyLines = (await readFile(latencySamplesPath, "utf8"))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((line): line is Record<string, unknown> => Boolean(line))
      .filter(
        (line) => line.mode === mode && line.phase === "bounded" && line.context_kind === "sample",
      );

    const totalMs = latencyLines
      .map((line) => toNumber(line.total_ms))
      .filter((n) => Number.isFinite(n));
    const fallbackLatency = seed?.latency;
    const p50 =
      totalMs.length > 0 ? percentile(totalMs, 0.5) : (fallbackLatency?.p50_total_ms ?? 0);
    const p95 =
      totalMs.length > 0 ? percentile(totalMs, 0.95) : (fallbackLatency?.p95_total_ms ?? 0);
    const boundedSampleCount =
      totalMs.length > 0 ? totalMs.length : (fallbackLatency?.bounded_sample_count ?? 0);

    return {
      mode,
      generated_at: new Date().toISOString(),
      dataset_snapshot_path: DATASET_SNAPSHOT_PATH,
      bounded_runs: BOUNDED_RUNS,
      stability_runs: STABILITY_RUNS,
      selected_bounded_attempt: selectedBoundedAttempt,
      selected_bounded_summary: selectedBoundedSummary,
      bounded_summaries: boundedSummaries,
      stability_summaries: stabilitySummaries,
      stability_unique_values: {
        avg_hit_at_1: listUniqueValues(stabilityAvg),
        fur_proxy: listUniqueValues(stabilityFur),
      },
      latency: {
        bounded_sample_count: boundedSampleCount,
        p50_total_ms: round4(p50),
        p95_total_ms: round4(p95),
      },
    } satisfies ModeReport;
  };

  const loadModeSeed = async (filePath: string): Promise<ModeSeed> => {
    const report = await readJson<ModeReport>(filePath);
    if (!report?.selected_bounded_summary) {
      throw new Error(`invalid seed report (missing selected_bounded_summary): ${filePath}`);
    }
    return {
      selectedBoundedSummary: report.selected_bounded_summary,
      latency: report.latency,
    };
  };

  let baselineSeed: ModeSeed | undefined;
  let variantSeed: ModeSeed | undefined;
  if (STABILITY_ONLY) {
    const baselineSeedPath =
      process.env.GATE4_BASELINE_REPORT_PATH ??
      path.join(REPORT_DIR, "w4-gate4-baseline-report.base.json");
    const variantSeedPath =
      process.env.GATE4_VARIANT_REPORT_PATH ??
      path.join(REPORT_DIR, "w4-gate4-variant-report.base.json");

    baselineSeed = await loadModeSeed(baselineSeedPath);
    variantSeed = await loadModeSeed(variantSeedPath);
  }

  const baselineReport = await runMode("baseline", baselineFlags, baselineSeed);
  const variantReport = await runMode("variant", variantFlags, variantSeed);

  const baselineSelected = baselineReport.selected_bounded_summary;
  const variantSelected = variantReport.selected_bounded_summary;

  const bucketToHit = (summary: RunSummary): Record<Gate4Bucket, number> => {
    const out: Record<Gate4Bucket, number> = {
      exact_id: 0,
      decision_reason: 0,
      temporal_relation: 0,
      project_context: 0,
    };
    for (const item of summary.bucket_metrics) {
      out[item.bucket] = item.hit_at_1;
    }
    return out;
  };

  const perBucketBaseline = bucketToHit(baselineSelected);
  const perBucketVariant = bucketToHit(variantSelected);

  const top1AvgDeltaPp = round4(
    (variantSelected.avg_hit_at_1 - baselineSelected.avg_hit_at_1) * 100,
  );
  const furDeltaPp = round4((variantSelected.fur_proxy - baselineSelected.fur_proxy) * 100);

  const p95IncreasePct = round4(
    baselineReport.latency.p95_total_ms > 0
      ? ((variantReport.latency.p95_total_ms - baselineReport.latency.p95_total_ms) /
          baselineReport.latency.p95_total_ms) *
          100
      : 0,
  );

  // stability unique-values across paired stability runs (attempt i baseline vs attempt i variant)
  const stabilityDeltasTop1 = baselineReport.stability_summaries.map((base, idx) => {
    const v = variantReport.stability_summaries[idx];
    return round4(((v?.avg_hit_at_1 ?? 0) - base.avg_hit_at_1) * 100);
  });
  const stabilityDeltasFur = baselineReport.stability_summaries.map((base, idx) => {
    const v = variantReport.stability_summaries[idx];
    return round4(((v?.fur_proxy ?? 0) - base.fur_proxy) * 100);
  });

  const stabilityUnique = {
    avg_hit_at_1_baseline: baselineReport.stability_unique_values.avg_hit_at_1,
    avg_hit_at_1_variant: variantReport.stability_unique_values.avg_hit_at_1,
    top1_avg_delta_pp: listUniqueValues(stabilityDeltasTop1),
    fur_proxy_baseline: baselineReport.stability_unique_values.fur_proxy,
    fur_proxy_variant: variantReport.stability_unique_values.fur_proxy,
    fur_delta_pp: listUniqueValues(stabilityDeltasFur),
  };

  const stabilityPass =
    stabilityUnique.avg_hit_at_1_baseline.length === 1 &&
    stabilityUnique.avg_hit_at_1_variant.length === 1 &&
    stabilityUnique.top1_avg_delta_pp.length === 1 &&
    stabilityUnique.fur_proxy_baseline.length === 1 &&
    stabilityUnique.fur_proxy_variant.length === 1 &&
    stabilityUnique.fur_delta_pp.length === 1;

  const deltaReport: DeltaReport = {
    generated_at: new Date().toISOString(),
    top1: {
      avg_hit_at_1_baseline: baselineSelected.avg_hit_at_1,
      avg_hit_at_1_variant: variantSelected.avg_hit_at_1,
      top1_avg_delta_pp: top1AvgDeltaPp,
      per_bucket_baseline: perBucketBaseline,
      per_bucket_variant: perBucketVariant,
    },
    fur_proxy: {
      baseline: baselineSelected.fur_proxy,
      variant: variantSelected.fur_proxy,
      fur_delta_pp: furDeltaPp,
    },
    latency: {
      p50_total_baseline_ms: baselineReport.latency.p50_total_ms,
      p50_total_variant_ms: variantReport.latency.p50_total_ms,
      p95_total_baseline_ms: baselineReport.latency.p95_total_ms,
      p95_total_variant_ms: variantReport.latency.p95_total_ms,
      p95_increase_pct: p95IncreasePct,
    },
    stability: {
      unique_values: stabilityUnique,
      pass: stabilityPass,
    },
    gates: {
      top1_avg_delta_pp_ge_8: top1AvgDeltaPp >= 8,
      fur_delta_pp_ge_10: furDeltaPp >= 10,
      p95_increase_pct_le_15: p95IncreasePct <= 15,
    },
  };

  await writeJson(path.join(REPORT_DIR, "w4-gate4-baseline-report.json"), baselineReport);
  await writeJson(path.join(REPORT_DIR, "w4-gate4-variant-report.json"), variantReport);
  await writeJson(path.join(REPORT_DIR, "w4-gate4-delta.json"), deltaReport);

  const reviewMd = [
    "# W4-D Gate-4 Runner Review Notes",
    "",
    "## Single Variable (frozen discipline)",
    "- baseline: `read.fusion.enabled=false`",
    "- variant: `read.fusion.enabled=true`",
    "- all other bridge flags are identical (loaded from `~/.openclaw/openclaw.json` plugin entry).",
    "",
    "## Scoring (frozen formula)",
    "- Per bucket: `hit_at_1(bucket) = matched_top1 / sample_size(bucket)` (sample queries only; aliases are audit-only).",
    "- `avg_hit_at_1 = mean_over_buckets(hit_at_1(bucket))`",
    "- `top1_avg_delta_pp = (avg_hit_at_1_variant - avg_hit_at_1_baseline) * 100`",
    "- FUR proxy: `fur_proxy = overall_hit_at_1` (explicit proxy; see delta json).",
    "- `p95_increase_pct = ((p95_total_variant_ms - p95_total_baseline_ms) / p95_total_baseline_ms) * 100`",
    "- Dedupe (aligned with dataset-notes): within each bucket, `expected_ids[0]` and `query` are de-duped for scoring (see `metrics.dedupe.json` per run).",
    "",
    "## Parsing Top1 remoteId",
    "- Tool results emit `path` like `bridge/<source>/<remoteId>`; runner extracts remoteId using the last path segment.",
    "",
    "## TopK normalization / tie-break",
    "- Runner preserves tool/provider result order and only truncates to TOP_K; no additional tie-break is applied beyond the upstream ordering.",
    "",
    "## Evidence layout",
    `- dataset snapshot: ${DATASET_SNAPSHOT_PATH}`,
    `- openapi: ${OPENAPI_DIR}`,
    `- retrieval: ${RETRIEVAL_DIR}`,
    `- latency samples: ${path.join(LATENCY_DIR, "latency.samples.jsonl")}`,
    `- reports: ${REPORT_DIR}`,
    "",
    "## Outputs (quick numbers)",
    `- top1_avg_delta_pp=${deltaReport.top1.top1_avg_delta_pp}`,
    `- fur_delta_pp=${deltaReport.fur_proxy.fur_delta_pp}`,
    `- p95_increase_pct=${deltaReport.latency.p95_increase_pct}`,
    `- stability_pass=${deltaReport.stability.pass}`,
    "",
  ].join("\n");

  await writeText(path.join(REPORT_DIR, "w4-gate4-review.md"), reviewMd);

  process.stdout.write(
    `${JSON.stringify(
      {
        dataset_size: dataset.length,
        top1_avg_delta_pp: deltaReport.top1.top1_avg_delta_pp,
        fur_delta_pp: deltaReport.fur_proxy.fur_delta_pp,
        p95_increase_pct: deltaReport.latency.p95_increase_pct,
        stability_pass: deltaReport.stability.pass,
      },
      null,
      2,
    )}\n`,
  );
};

await main();
process.exit(typeof process.exitCode === "number" ? process.exitCode : 0);
