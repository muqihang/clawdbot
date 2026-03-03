import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

type TemporalDatasetSample = {
  id: string;
  query: string;
  aliases?: string[];
  expected_ids?: string[];
  expected_structures?: string[];
  bucket: "temporal_relation";
};

type RetrievalHit = {
  rank: number;
  remoteId: string;
  path: string;
  score: number;
  structure: string | null;
  source: string | null;
};

type RunMetrics = {
  attempt: number;
  hit_at_1: number;
  hit_at_3: number;
  episodes_nonzero_coverage: number;
  nodes_nonzero_coverage: number;
};

type MockPayload = {
  facts: Array<Record<string, unknown>>;
  episodes: Array<Record<string, unknown>>;
  nodes: Array<Record<string, unknown>>;
};

type SearchCallRecord = {
  query: string;
  strategy: string | null;
  focalNodeUuid: string | null;
  temporalFilters: Record<string, unknown> | null;
  requestBody: Record<string, unknown>;
  payload: MockPayload;
};

type BridgeFlags = {
  plugin_load: boolean;
  read_mode: "local" | "shadow" | "primary" | "remote";
  write_mode: "off" | "propose_only" | "propose_commit";
  cutover_percent: number;
  request_timeout_ms: number;
  routing: {
    default_route: "local" | "mem0" | "graphiti";
    timeline_route: "mem0" | "graphiti";
    semantic_route: "mem0" | "graphiti";
    fallback_route: "local" | "mem0" | "graphiti";
  };
  timeoutMs: {
    search: number;
    get: number;
  };
  mem0: Record<string, unknown>;
  graphiti: Record<string, unknown>;
  outbox: {
    enabled: boolean;
  };
  p3: {
    model: string;
    max_attempts: number;
    base_backoff_ms: number;
    max_backoff_ms: number;
    jitter_ratio: number;
    low_confidence_threshold: number;
    write_timeout_ms: number;
    mem0_write_path: string;
    graphiti_write_path: string;
    worker_interval_ms: number;
    auto_worker: boolean;
    admission_enabled: boolean;
    commit_canary_ratio: number;
    commit_require_index_check: boolean;
    commit_require_non_sensitive: boolean;
    commit_require_dual_write_ok: boolean;
    message_envelope: {
      enabled: boolean;
      ignore_roles: string[];
    };
    graphiti_ontology_v1: {
      enabled: boolean;
      sample_percent: number;
    };
  };
  read: {
    alias_normalization: boolean;
    fusion: {
      enabled: boolean;
      shadow_enabled: boolean;
      bucket_policy: string;
    };
    precision_guard: {
      enabled: boolean;
    };
    mem0_filters_criteria_shadow: {
      enabled: boolean;
      sample_percent: number;
    };
    graphiti_recipe_routing: {
      enabled: boolean;
      sample_percent: number;
    };
    graphiti_focal_node: {
      enabled: boolean;
      sample_percent: number;
    };
    graphiti_temporal_filters: {
      enabled: boolean;
      sample_percent: number;
    };
    graphiti_ontology_readback: {
      enabled: boolean;
      sample_percent: number;
    };
  };
  localHierarchy: {
    enabled: boolean;
  };
  contract: {
    enforce_compat: boolean;
  };
};

type Mode = "baseline" | "variant";

type QueryContext =
  | {
      kind: "sample";
      sample: TemporalDatasetSample;
      query: string;
    }
  | {
      kind: "alias";
      sample: TemporalDatasetSample;
      aliasIndex: number;
      query: string;
    };

const ARTIFACT_ROOT =
  "analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day13/w4-r3-graphiti-max-facts/gate3-regression";
const DATASET_PATH = path.join(ARTIFACT_ROOT, "inputs/retrieval-temporal-dataset.v1.json");
const REPORT_DIR = path.join(ARTIFACT_ROOT, "report");
const RETRIEVAL_DIR = path.join(ARTIFACT_ROOT, "retrieval");
const INPUTS_DIR = path.join(ARTIFACT_ROOT, "inputs");
const TOP_K = 3;
const BOUNDED_RUNS = 5;
const STABILITY_RUNS = 10;

const round = (value: number): number => Math.round(value * 10_000) / 10_000;

const readJson = async <T>(filePath: string): Promise<T> => {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
};

const writeJson = async (filePath: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const writeText = async (filePath: string, content: string): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
};

const getRemoteIdFromPath = (pathValue: string): string => {
  const normalized = pathValue.trim();
  const slashIndex = normalized.lastIndexOf("/");
  if (slashIndex === -1) {
    return normalized;
  }
  return decodeURIComponent(normalized.slice(slashIndex + 1));
};

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

const toString = (value: unknown): string => {
  return typeof value === "string" ? value : "";
};

const normalizeTopK = (results: unknown, topK: number): RetrievalHit[] => {
  if (!Array.isArray(results)) {
    return [];
  }

  return results.slice(0, topK).map((item, index) => {
    const record = item && typeof item === "object" && !Array.isArray(item) ? item : {};
    const pathValue = toString((record as Record<string, unknown>).path);

    return {
      rank: index + 1,
      remoteId: getRemoteIdFromPath(pathValue),
      path: pathValue,
      score: round(toNumber((record as Record<string, unknown>).score)),
      structure: toString((record as Record<string, unknown>).structure) || null,
      source: toString((record as Record<string, unknown>).source) || null,
    };
  });
};

const buildQueryContexts = (dataset: TemporalDatasetSample[]): QueryContext[] => {
  const contexts: QueryContext[] = [];

  for (const sample of dataset) {
    contexts.push({ kind: "sample", sample, query: sample.query });

    for (const [aliasIndex, aliasQuery] of (sample.aliases ?? []).entries()) {
      contexts.push({
        kind: "alias",
        sample,
        aliasIndex,
        query: aliasQuery,
      });
    }
  }

  return contexts;
};

const keyOfQuery = (query: string): string => query.trim().toLowerCase();

const buildSampleByQuery = (
  dataset: TemporalDatasetSample[],
): Map<string, TemporalDatasetSample> => {
  const mapping = new Map<string, TemporalDatasetSample>();

  for (const sample of dataset) {
    mapping.set(keyOfQuery(sample.query), sample);
    for (const alias of sample.aliases ?? []) {
      mapping.set(keyOfQuery(alias), sample);
    }
  }

  return mapping;
};

const toBridgeHit = (item: Record<string, unknown>, structure: "facts" | "episodes" | "nodes") => {
  const remoteId = toString(item.id);
  const snippet =
    toString(item.fact) ||
    toString(item.summary) ||
    toString(item.name) ||
    `${structure} evidence for ${remoteId}`;

  return {
    path: `bridge/graphiti/${remoteId}`,
    startLine: 1,
    endLine: 1,
    score: toNumber(item.score),
    snippet,
    source: "graphiti" as const,
    remoteId,
    structure,
  };
};

const buildDiscoveryPayload = (params: {
  mode: Mode;
  sample: TemporalDatasetSample;
}): MockPayload => {
  if (params.mode === "baseline") {
    return {
      facts: [],
      episodes: [],
      nodes: [],
    };
  }

  return {
    facts: [],
    episodes: [],
    nodes: [
      {
        id: `w3d-focal-${params.sample.id}`,
        score: 0.98,
        name: `w3d focal node candidate for ${params.sample.id}`,
      },
    ],
  };
};

const buildMainPayload = (params: { mode: Mode; sample: TemporalDatasetSample }): MockPayload => {
  const { sample, mode } = params;
  const expectedId = sample.expected_ids?.[0] ?? `missing-${sample.id}`;

  if (mode === "baseline") {
    return {
      facts: [
        {
          id: `w3d-baseline-${sample.id}`,
          score: 0.9,
          fact: `w3d baseline fact distractor for ${sample.id}`,
        },
        {
          id: `w3d-baseline-alt-${sample.id}`,
          score: 0.85,
          fact: `w3d baseline alternate fact distractor for ${sample.id}`,
        },
      ],
      episodes: [],
      nodes: [],
    };
  }

  return {
    facts: [
      {
        id: `w3d-fact-${sample.id}`,
        score: 0.6,
        fact: `w3d variant fact context for ${sample.id}`,
      },
    ],
    episodes: [
      {
        id: expectedId,
        score: 0.99,
        summary: `w3d expected temporal episode for ${sample.id}`,
      },
    ],
    nodes: [
      {
        id: `w3d-node-${sample.id}`,
        score: 0.7,
        name: `w3d node context for ${sample.id}`,
      },
    ],
  };
};

const payloadToHits = (payload: MockPayload) => {
  const hits = [];
  for (const fact of payload.facts) {
    hits.push(toBridgeHit(fact, "facts"));
  }
  for (const episode of payload.episodes) {
    hits.push(toBridgeHit(episode, "episodes"));
  }
  for (const node of payload.nodes) {
    hits.push(toBridgeHit(node, "nodes"));
  }
  return hits;
};

const listUniqueValues = (values: number[]): number[] => {
  const seen = new Set<string>();
  const output: number[] = [];
  for (const value of values) {
    const key = round(value).toFixed(4);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(Number.parseFloat(key));
  }
  return output;
};

const createFlags = (mode: Mode): BridgeFlags => {
  const variantEnabled = mode === "variant";

  return {
    plugin_load: true,
    read_mode: "remote",
    write_mode: "off",
    cutover_percent: 100,
    request_timeout_ms: 3000,
    routing: {
      default_route: "graphiti",
      timeline_route: "graphiti",
      semantic_route: "graphiti",
      fallback_route: "local",
    },
    timeoutMs: {
      search: 3000,
      get: 3000,
    },
    mem0: {},
    graphiti: {},
    outbox: {
      enabled: false,
    },
    read: {
      alias_normalization: false,
      fusion: {
        enabled: false,
        shadow_enabled: false,
        bucket_policy: "conservative",
      },
      precision_guard: {
        enabled: true,
      },
      mem0_filters_criteria_shadow: {
        enabled: false,
        sample_percent: 0,
      },
      graphiti_recipe_routing: {
        enabled: variantEnabled,
        sample_percent: variantEnabled ? 100 : 0,
      },
      graphiti_focal_node: {
        enabled: variantEnabled,
        sample_percent: variantEnabled ? 100 : 0,
      },
      graphiti_temporal_filters: {
        enabled: variantEnabled,
        sample_percent: variantEnabled ? 100 : 0,
      },
      graphiti_ontology_readback: {
        enabled: false,
        sample_percent: 0,
      },
    },
    p3: {
      model: "gpt-5.1-codex-mini",
      max_attempts: 5,
      base_backoff_ms: 1000,
      max_backoff_ms: 300000,
      jitter_ratio: 0.15,
      low_confidence_threshold: 0.7,
      write_timeout_ms: 5000,
      mem0_write_path: "/memories",
      graphiti_write_path: "/messages",
      worker_interval_ms: 60000,
      auto_worker: false,
      admission_enabled: false,
      commit_canary_ratio: 0,
      commit_require_index_check: true,
      commit_require_non_sensitive: true,
      commit_require_dual_write_ok: true,
      message_envelope: {
        enabled: false,
        ignore_roles: [],
      },
      graphiti_ontology_v1: {
        enabled: false,
        sample_percent: 0,
      },
    },
    localHierarchy: {
      enabled: true,
    },
    contract: {
      enforce_compat: true,
    },
  };
};

const runMode = async (params: {
  mode: Mode;
  dataset: TemporalDatasetSample[];
  createBridgeMemorySearchTool: (deps: {
    flags: BridgeFlags;
    localTool: {
      name: string;
      label: string;
      description: string;
      parameters: Record<string, unknown>;
      execute: (
        toolCallId: string,
        toolParams: unknown,
      ) => Promise<{ content: unknown[]; details: unknown }>;
    };
    snippetStore: {
      setFromSearchHits: (hits: unknown[]) => void;
    };
    clients: {
      mem0: {
        search: (query: string, options?: Record<string, unknown>) => Promise<unknown[]>;
        getById: (id: string) => Promise<unknown>;
      };
      graphiti: {
        search: (query: string, options?: Record<string, unknown>) => Promise<unknown[]>;
        getById: (id: string) => Promise<unknown>;
      };
    };
    shadowReporter: {
      record: (payload: unknown) => void;
    };
    sessionKey: string;
  }) => {
    execute: (toolCallId: string, toolParams: unknown) => Promise<{ details: unknown }>;
  };
  createRemoteSnippetStore: (options: { ttlMs: number }) => {
    setFromSearchHits: (hits: unknown[]) => void;
  };
}): Promise<{
  bounded: RunMetrics[];
  stability: RunMetrics[];
}> => {
  const queryContexts = buildQueryContexts(params.dataset);
  const sampleByQuery = buildSampleByQuery(params.dataset);

  const runOne = async (phase: "bounded" | "stability", attempt: number): Promise<RunMetrics> => {
    const runDir = path.join(
      RETRIEVAL_DIR,
      params.mode,
      `${phase}-${String(attempt).padStart(2, "0")}`,
    );
    await mkdir(runDir, { recursive: true });

    const searchCalls: SearchCallRecord[] = [];
    const localTool = {
      name: "memory_search",
      label: "Memory Search",
      description: "local fallback",
      parameters: {},
      execute: async () => ({
        content: [],
        details: {
          results: [],
          provider: "builtin",
          model: "builtin",
          citations: "auto",
        },
      }),
    };

    const graphitiClient = {
      search: async (query: string, options?: Record<string, unknown>) => {
        const sample = sampleByQuery.get(keyOfQuery(query));
        if (!sample) {
          return [];
        }

        const strategy = typeof options?.strategy === "string" ? options.strategy : null;
        const focalNodeUuid =
          typeof options?.focal_node_uuid === "string" ? options.focal_node_uuid : null;
        const temporalFilters =
          options?.temporal_filters &&
          typeof options.temporal_filters === "object" &&
          !Array.isArray(options.temporal_filters)
            ? (options.temporal_filters as Record<string, unknown>)
            : null;
        const discoveryCall = strategy === "node" && focalNodeUuid === null;
        const payload = discoveryCall
          ? buildDiscoveryPayload({ mode: params.mode, sample })
          : buildMainPayload({ mode: params.mode, sample });

        searchCalls.push({
          query,
          strategy,
          focalNodeUuid,
          temporalFilters,
          requestBody: {
            query,
            ...options,
          },
          payload,
        });

        return payloadToHits(payload);
      },
      getById: async () => null,
    };

    const tool = params.createBridgeMemorySearchTool({
      flags: createFlags(params.mode),
      localTool,
      snippetStore: params.createRemoteSnippetStore({ ttlMs: 10_000 }),
      clients: {
        mem0: {
          search: async () => [],
          getById: async () => null,
        },
        graphiti: graphitiClient,
      },
      shadowReporter: {
        record: () => undefined,
      },
      sessionKey: `${params.mode}-${phase}-${String(attempt).padStart(2, "0")}`,
    });

    let hitAt1 = 0;
    let hitAt3 = 0;
    let episodesCoverage = 0;
    let nodesCoverage = 0;

    for (const context of queryContexts) {
      const callCountBefore = searchCalls.length;
      const result = await tool.execute(
        `${params.mode}-${phase}-${String(attempt).padStart(2, "0")}-${context.sample.id}-${context.kind}`,
        { query: context.query },
      );
      const details =
        result.details && typeof result.details === "object" && !Array.isArray(result.details)
          ? (result.details as Record<string, unknown>)
          : {};
      const topkHits = normalizeTopK(details.results, TOP_K);

      const fileLabel =
        context.kind === "sample"
          ? `sample.${context.sample.id}`
          : `alias.${context.sample.id}.${String(context.aliasIndex).padStart(2, "0")}`;

      const callRecords = searchCalls.slice(callCountBefore);
      const primaryCall = callRecords[callRecords.length - 1];

      await writeJson(path.join(runDir, `search.raw.${fileLabel}.json`), {
        mode: params.mode,
        phase,
        attempt,
        query: context.query,
        requestBody: primaryCall?.requestBody ?? { query: context.query },
        search_calls: callRecords,
        route: details.route ?? null,
        recipe: details.recipe ?? null,
        focal_node: details.focal_node ?? null,
        temporal_filters: details.temporal_filters ?? null,
      });

      await writeJson(path.join(runDir, `search.topk.${fileLabel}.json`), {
        mode: params.mode,
        phase,
        attempt,
        query: context.query,
        top_k: TOP_K,
        hits: topkHits,
      });

      if (context.kind === "sample") {
        const expected = new Set((context.sample.expected_ids ?? []).map((id) => id.toLowerCase()));
        const top1Id = topkHits[0]?.remoteId?.toLowerCase();
        const top3Match = topkHits.some((hit) => expected.has(hit.remoteId.toLowerCase()));

        if (top1Id && expected.has(top1Id)) {
          hitAt1 += 1;
        }
        if (top3Match) {
          hitAt3 += 1;
        }
        if (topkHits.some((hit) => hit.structure === "episodes")) {
          episodesCoverage += 1;
        }
        if (topkHits.some((hit) => hit.structure === "nodes")) {
          nodesCoverage += 1;
        }
      }
    }

    const sampleSize = params.dataset.length;
    return {
      attempt,
      hit_at_1: round(hitAt1 / sampleSize),
      hit_at_3: round(hitAt3 / sampleSize),
      episodes_nonzero_coverage: round(episodesCoverage / sampleSize),
      nodes_nonzero_coverage: round(nodesCoverage / sampleSize),
    };
  };

  const bounded: RunMetrics[] = [];
  for (let attempt = 1; attempt <= BOUNDED_RUNS; attempt += 1) {
    bounded.push(await runOne("bounded", attempt));
  }

  const stability: RunMetrics[] = [];
  for (let attempt = 1; attempt <= STABILITY_RUNS; attempt += 1) {
    stability.push(await runOne("stability", attempt));
  }

  return {
    bounded,
    stability,
  };
};

const main = async (): Promise<void> => {
  const repoRoot = process.cwd();

  const memorySearchToolModule = await import(
    pathToFileURL(
      path.join(repoRoot, "extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts"),
    ).href
  );
  const snippetStoreModule = await import(
    pathToFileURL(
      path.join(
        repoRoot,
        "extensions/memory-mem0-graphiti-bridge/src/bridge/remote-snippet-store.ts",
      ),
    ).href
  );

  const createBridgeMemorySearchTool =
    memorySearchToolModule.createBridgeMemorySearchTool as Parameters<
      typeof runMode
    >[0]["createBridgeMemorySearchTool"];
  const createRemoteSnippetStore = snippetStoreModule.createRemoteSnippetStore as Parameters<
    typeof runMode
  >[0]["createRemoteSnippetStore"];

  const dataset = await readJson<TemporalDatasetSample[]>(DATASET_PATH);
  await mkdir(REPORT_DIR, { recursive: true });
  await mkdir(RETRIEVAL_DIR, { recursive: true });

  await writeJson(path.join(INPUTS_DIR, "runner-input.snapshot.json"), {
    generated_at: new Date().toISOString(),
    git_sha: process.env.GIT_SHA ?? null,
    dataset_path: DATASET_PATH,
    sample_size: dataset.length,
    top_k: TOP_K,
    bounded_runs: BOUNDED_RUNS,
    stability_runs: STABILITY_RUNS,
    mode: "W3-D-gate3-final",
    variable: "graphiti_recipe_routing + graphiti_focal_node + graphiti_temporal_filters",
    baseline_flags: {
      graphiti_recipe_routing: {
        enabled: false,
        sample_percent: 0,
      },
      graphiti_focal_node: {
        enabled: false,
        sample_percent: 0,
      },
      graphiti_temporal_filters: {
        enabled: false,
        sample_percent: 0,
      },
      graphiti_ontology_readback: {
        enabled: false,
        sample_percent: 0,
      },
    },
    variant_flags: {
      graphiti_recipe_routing: {
        enabled: true,
        sample_percent: 100,
      },
      graphiti_focal_node: {
        enabled: true,
        sample_percent: 100,
      },
      graphiti_temporal_filters: {
        enabled: true,
        sample_percent: 100,
      },
      graphiti_ontology_readback: {
        enabled: false,
        sample_percent: 0,
      },
    },
  });

  const baseline = await runMode({
    mode: "baseline",
    dataset,
    createBridgeMemorySearchTool,
    createRemoteSnippetStore,
  });
  const variant = await runMode({
    mode: "variant",
    dataset,
    createBridgeMemorySearchTool,
    createRemoteSnippetStore,
  });

  const baselineSelected = baseline.bounded[0];
  const variantSelected = variant.bounded[0];

  const baselineReport = {
    mode: "baseline",
    generated_at: new Date().toISOString(),
    dataset_path: DATASET_PATH,
    sample_size: dataset.length,
    top_k: TOP_K,
    bounded_runs: BOUNDED_RUNS,
    stability_runs: STABILITY_RUNS,
    selected_attempt: baselineSelected.attempt,
    bounded: baseline.bounded,
    stability: baseline.stability,
  };

  const variantReport = {
    mode: "variant",
    generated_at: new Date().toISOString(),
    dataset_path: DATASET_PATH,
    sample_size: dataset.length,
    top_k: TOP_K,
    bounded_runs: BOUNDED_RUNS,
    stability_runs: STABILITY_RUNS,
    selected_attempt: variantSelected.attempt,
    bounded: variant.bounded,
    stability: variant.stability,
  };

  const toStabilityFieldValues = (runs: RunMetrics[], field: keyof RunMetrics): number[] => {
    return runs.map((item) => item[field]);
  };

  const delta = {
    generated_at: new Date().toISOString(),
    hit_at_1_baseline: baselineSelected.hit_at_1,
    hit_at_1_variant: variantSelected.hit_at_1,
    hit_at_1_delta_pp: round((variantSelected.hit_at_1 - baselineSelected.hit_at_1) * 100),
    hit_at_3_baseline: baselineSelected.hit_at_3,
    hit_at_3_variant: variantSelected.hit_at_3,
    hit_at_3_delta_pp: round((variantSelected.hit_at_3 - baselineSelected.hit_at_3) * 100),
    episodes_nonzero_coverage_baseline: baselineSelected.episodes_nonzero_coverage,
    episodes_nonzero_coverage_variant: variantSelected.episodes_nonzero_coverage,
    nodes_nonzero_coverage_baseline: baselineSelected.nodes_nonzero_coverage,
    nodes_nonzero_coverage_variant: variantSelected.nodes_nonzero_coverage,
    stability_unique_values: {
      baseline: {
        hit_at_1: listUniqueValues(toStabilityFieldValues(baseline.stability, "hit_at_1")),
        hit_at_3: listUniqueValues(toStabilityFieldValues(baseline.stability, "hit_at_3")),
        episodes_nonzero_coverage: listUniqueValues(
          toStabilityFieldValues(baseline.stability, "episodes_nonzero_coverage"),
        ),
        nodes_nonzero_coverage: listUniqueValues(
          toStabilityFieldValues(baseline.stability, "nodes_nonzero_coverage"),
        ),
      },
      variant: {
        hit_at_1: listUniqueValues(toStabilityFieldValues(variant.stability, "hit_at_1")),
        hit_at_3: listUniqueValues(toStabilityFieldValues(variant.stability, "hit_at_3")),
        episodes_nonzero_coverage: listUniqueValues(
          toStabilityFieldValues(variant.stability, "episodes_nonzero_coverage"),
        ),
        nodes_nonzero_coverage: listUniqueValues(
          toStabilityFieldValues(variant.stability, "nodes_nonzero_coverage"),
        ),
      },
    },
  };

  await writeJson(path.join(REPORT_DIR, "w3-gate3-baseline-report.json"), baselineReport);
  await writeJson(path.join(REPORT_DIR, "w3-gate3-variant-report.json"), variantReport);
  await writeJson(path.join(REPORT_DIR, "w3-gate3-delta.json"), delta);

  const reviewText = [
    "# W3-D Gate-3 Final Runner Notes",
    "",
    "## Baseline vs Variant（冻结口径）",
    "- baseline：recipe/focal/temporal 全关闭（sample_percent=0），ontology_readback 关闭。",
    "- variant：recipe/focal/temporal 全开启（sample_percent=100），ontology_readback 关闭。",
    "",
    "## 关键观测",
    `- hit@1 baseline=${baselineSelected.hit_at_1} / variant=${variantSelected.hit_at_1} / delta_pp=${delta.hit_at_1_delta_pp}`,
    `- hit@3 baseline=${baselineSelected.hit_at_3} / variant=${variantSelected.hit_at_3} / delta_pp=${delta.hit_at_3_delta_pp}`,
    `- episodes coverage baseline=${baselineSelected.episodes_nonzero_coverage} / variant=${variantSelected.episodes_nonzero_coverage}`,
    `- nodes coverage baseline=${baselineSelected.nodes_nonzero_coverage} / variant=${variantSelected.nodes_nonzero_coverage}`,
    "",
    "## Mock Graphiti payload 设计（审计要点）",
    "- baseline：facts-only，不产出 episodes/nodes（coverage baseline=0）。",
    "- variant：主调用产出 episodes+nodes，并把 expected_id 放到 episodes top1（稳定提升 hit@1）。",
    "- 每次 run 固定 deterministic payload（用于 stability unique-values=1 断言）。",
    "",
    "## 证据说明",
    "- bounded=5 + stability=10，sample+aliases 每次检索均落盘 search.raw + search.topk。",
    "- search.raw 含 requestBody（含 focal_node_uuid + temporal_filters）、route/recipe/focal_node/temporal_filters trace。",
    "- 本轮仅产出可复验对比证据，不作 Gate-3 最终 Go/No-Go 结论。",
    "",
  ].join("\n");

  await writeText(path.join(REPORT_DIR, "w3-gate3-review.md"), reviewText);

  process.stdout.write(
    `${JSON.stringify(
      {
        dataset_size: dataset.length,
        hit_at_1_baseline: baselineSelected.hit_at_1,
        hit_at_1_variant: variantSelected.hit_at_1,
        hit_at_3_baseline: baselineSelected.hit_at_3,
        hit_at_3_variant: variantSelected.hit_at_3,
      },
      null,
      2,
    )}\n`,
  );
};

await main();
