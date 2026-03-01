import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

type DatasetSample = {
  id: string;
  query: string;
  aliases?: string[];
  expected_remote_ids: string[];
  bucket: "decision_reason";
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
  ontology_marker_presence_rate: number;
  ontology_parse_success_rate: number;
  top1_hit_rate: number;
};

type MockPayload = {
  facts: Array<Record<string, unknown>>;
  episodes: Array<Record<string, unknown>>;
  nodes: Array<Record<string, unknown>>;
};

type SearchCallRecord = {
  query: string;
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
      sample: DatasetSample;
      query: string;
    }
  | {
      kind: "alias";
      sample: DatasetSample;
      aliasIndex: number;
      query: string;
    };

const ITER_ROOT =
  "analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day4/w3-c-ontology-v1/iter-2-ontology-readback-eval";
const DATASET_PATH = path.join(ITER_ROOT, "inputs/ontology-readback-dataset.v1.json");
const REPORT_DIR = path.join(ITER_ROOT, "report");
const RETRIEVAL_DIR = path.join(ITER_ROOT, "retrieval");
const INPUTS_DIR = path.join(ITER_ROOT, "inputs");
const TOP_K = 3;
const BOUNDED_RUNS = 5;
const STABILITY_RUNS = 10;
const MARKER_PREFIX = "OC_ONTOLOGY_V1:";

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

const toString = (value: unknown): string => {
  return typeof value === "string" ? value : "";
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

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const getRemoteIdFromPath = (pathValue: string): string => {
  const normalized = pathValue.trim();
  const slashIndex = normalized.lastIndexOf("/");
  if (slashIndex === -1) {
    return normalized;
  }
  return decodeURIComponent(normalized.slice(slashIndex + 1));
};

const normalizeTopK = (results: unknown, topK: number): RetrievalHit[] => {
  if (!Array.isArray(results)) {
    return [];
  }

  return results.slice(0, topK).map((item, index) => {
    const record = asRecord(item);
    const pathValue = toString(record.path);

    return {
      rank: index + 1,
      remoteId: getRemoteIdFromPath(pathValue),
      path: pathValue,
      score: round(toNumber(record.score)),
      structure: toString(record.structure) || null,
      source: toString(record.source) || null,
    };
  });
};

const buildQueryContexts = (dataset: DatasetSample[]): QueryContext[] => {
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

const buildSampleByQuery = (dataset: DatasetSample[]): Map<string, DatasetSample> => {
  const mapping = new Map<string, DatasetSample>();

  for (const sample of dataset) {
    mapping.set(keyOfQuery(sample.query), sample);
    for (const alias of sample.aliases ?? []) {
      mapping.set(keyOfQuery(alias), sample);
    }
  }

  return mapping;
};

const toBridgeHit = (
  item: Record<string, unknown>,
  structure: "facts" | "episodes" | "nodes",
): Record<string, unknown> => {
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

const buildMarkerPayload = (sample: DatasetSample): Record<string, unknown> => {
  return {
    version: "1",
    group_id: "session-w3c",
    session_key: "session-w3c",
    decision: {
      type: "Decision",
      id: `decision:${sample.id}`,
      name: "decision.rollout",
      summary: `decision summary for ${sample.id}`,
      source_ref: `agent_end:${sample.id}`,
      created_at: "2026-02-24T00:00:00.000Z",
      group_id: "session-w3c",
      session_key: "session-w3c",
    },
    project: {
      type: "Project",
      id: `project:${sample.id}`,
      name: "memory-bridge",
      summary: "memory-bridge",
      source_ref: `agent_end:${sample.id}`,
      created_at: "2026-02-24T00:00:00.000Z",
      group_id: "session-w3c",
      session_key: "session-w3c",
    },
    reasons: [
      {
        type: "Reason",
        id: `reason:${sample.id}`,
        name: "auditability",
        summary: "auditability",
        source_ref: `agent_end:${sample.id}`,
        created_at: "2026-02-24T00:00:00.000Z",
        group_id: "session-w3c",
        session_key: "session-w3c",
      },
    ],
    rejected: [
      {
        type: "RejectedOption",
        id: `rejected:${sample.id}`,
        name: "local-only",
        summary: "local-only",
        source_ref: `agent_end:${sample.id}`,
        created_at: "2026-02-24T00:00:00.000Z",
        group_id: "session-w3c",
        session_key: "session-w3c",
      },
    ],
    relations: [
      {
        type: "Decision->Project",
        from_id: `decision:${sample.id}`,
        to_id: `project:${sample.id}`,
      },
      {
        type: "Decision->Reason",
        from_id: `decision:${sample.id}`,
        to_id: `reason:${sample.id}`,
      },
      {
        type: "Decision->RejectedOption",
        from_id: `decision:${sample.id}`,
        to_id: `rejected:${sample.id}`,
      },
    ],
  };
};

const buildMockPayload = (sample: DatasetSample): MockPayload => {
  const expectedId = sample.expected_remote_ids[0] ?? `decision-${sample.id}`;
  const markerPayload = buildMarkerPayload(sample);
  const markerLine = `${MARKER_PREFIX}${JSON.stringify(markerPayload)}`;

  return {
    facts: [
      {
        id: expectedId,
        score: 0.97,
        fact: `decision rationale for ${sample.id}\n${markerLine}`,
      },
      {
        id: `distractor-${sample.id}`,
        score: 0.92,
        fact: `distractor for ${sample.id}`,
      },
      {
        id: `support-${sample.id}`,
        score: 0.9,
        fact: `supporting reason for ${sample.id}`,
      },
    ],
    episodes: [],
    nodes: [],
  };
};

const payloadToHits = (payload: MockPayload): Array<Record<string, unknown>> => {
  const hits: Array<Record<string, unknown>> = [];
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
  const readbackEnabled = mode === "variant";
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
      precision_guard: {
        enabled: true,
      },
      mem0_filters_criteria_shadow: {
        enabled: false,
        sample_percent: 0,
      },
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
        enabled: readbackEnabled,
        sample_percent: readbackEnabled ? 100 : 0,
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
  dataset: DatasetSample[];
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

        const payload = buildMockPayload(sample);
        searchCalls.push({
          query,
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

    let sampleCount = 0;
    let top1HitCount = 0;
    let markerPresenceRateSum = 0;
    let parseSuccessRateSum = 0;

    for (const context of queryContexts) {
      const callCountBefore = searchCalls.length;
      const result = await tool.execute(
        `${params.mode}-${phase}-${String(attempt).padStart(2, "0")}-${context.sample.id}-${context.kind}`,
        { query: context.query },
      );
      const details = asRecord(result.details);
      const ontologyTrace = asRecord(details.ontology_v1);
      const topkHits = normalizeTopK(details.results, TOP_K);

      const fileLabel =
        context.kind === "sample"
          ? `sample.${context.sample.id}`
          : `alias.${context.sample.id}.${String(context.aliasIndex).padStart(2, "0")}`;

      const callRecord = searchCalls.slice(callCountBefore)[0];
      await writeJson(path.join(runDir, `search.raw.${fileLabel}.json`), {
        mode: params.mode,
        phase,
        attempt,
        query: context.query,
        requestBody: callRecord?.requestBody ?? { query: context.query },
        route: details.route ?? null,
        recipe: details.recipe ?? null,
        focal_node: details.focal_node ?? null,
        temporal_filters: details.temporal_filters ?? null,
        ontology_v1: ontologyTrace,
        payload: callRecord?.payload ?? { facts: [], episodes: [], nodes: [] },
      });

      await writeJson(path.join(runDir, `search.topk.${fileLabel}.json`), {
        mode: params.mode,
        phase,
        attempt,
        query: context.query,
        top_k: TOP_K,
        hits: topkHits,
      });

      if (context.kind !== "sample") {
        continue;
      }

      sampleCount += 1;
      const expectedIds = new Set(context.sample.expected_remote_ids.map((id) => id.toLowerCase()));
      const top1 = topkHits[0]?.remoteId?.toLowerCase();
      if (top1 && expectedIds.has(top1)) {
        top1HitCount += 1;
      }

      markerPresenceRateSum += toNumber(ontologyTrace.marker_presence_rate);
      parseSuccessRateSum += toNumber(ontologyTrace.parse_success_rate);
    }

    return {
      attempt,
      ontology_marker_presence_rate:
        sampleCount > 0 ? round(markerPresenceRateSum / sampleCount) : 0,
      ontology_parse_success_rate: sampleCount > 0 ? round(parseSuccessRateSum / sampleCount) : 0,
      top1_hit_rate: sampleCount > 0 ? round(top1HitCount / sampleCount) : 0,
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

  const dataset = await readJson<DatasetSample[]>(DATASET_PATH);
  await mkdir(REPORT_DIR, { recursive: true });
  await mkdir(RETRIEVAL_DIR, { recursive: true });

  await writeJson(path.join(INPUTS_DIR, "runner-input.snapshot.json"), {
    generated_at: new Date().toISOString(),
    dataset_path: DATASET_PATH,
    sample_size: dataset.length,
    top_k: TOP_K,
    bounded_runs: BOUNDED_RUNS,
    stability_runs: STABILITY_RUNS,
    mode: "W3-C",
    variable: "graphiti_ontology_readback_and_reporting",
    baseline: {
      graphiti_ontology_readback: {
        enabled: false,
        sample_percent: 0,
      },
    },
    variant: {
      graphiti_ontology_readback: {
        enabled: true,
        sample_percent: 100,
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

  const baselineStabilityPresence = baseline.stability.map(
    (item) => item.ontology_marker_presence_rate,
  );
  const baselineStabilityParse = baseline.stability.map((item) => item.ontology_parse_success_rate);
  const variantStabilityPresence = variant.stability.map(
    (item) => item.ontology_marker_presence_rate,
  );
  const variantStabilityParse = variant.stability.map((item) => item.ontology_parse_success_rate);

  const delta = {
    generated_at: new Date().toISOString(),
    ontology_marker_presence_rate: {
      baseline: baselineSelected.ontology_marker_presence_rate,
      variant: variantSelected.ontology_marker_presence_rate,
      delta_pp: round(
        (variantSelected.ontology_marker_presence_rate -
          baselineSelected.ontology_marker_presence_rate) *
          100,
      ),
    },
    ontology_parse_success_rate: {
      baseline: baselineSelected.ontology_parse_success_rate,
      variant: variantSelected.ontology_parse_success_rate,
      delta_pp: round(
        (variantSelected.ontology_parse_success_rate -
          baselineSelected.ontology_parse_success_rate) *
          100,
      ),
    },
    top1_hit_rate: {
      baseline: baselineSelected.top1_hit_rate,
      variant: variantSelected.top1_hit_rate,
    },
    stability_unique_values: {
      baseline: {
        ontology_marker_presence_rate: listUniqueValues(baselineStabilityPresence),
        ontology_parse_success_rate: listUniqueValues(baselineStabilityParse),
      },
      variant: {
        ontology_marker_presence_rate: listUniqueValues(variantStabilityPresence),
        ontology_parse_success_rate: listUniqueValues(variantStabilityParse),
      },
    },
  };

  await writeJson(path.join(REPORT_DIR, "w3-ontology-baseline-report.json"), baselineReport);
  await writeJson(path.join(REPORT_DIR, "w3-ontology-variant-report.json"), variantReport);
  await writeJson(path.join(REPORT_DIR, "w3-ontology-delta.json"), delta);

  const reviewText = [
    "# W3-C Iter-2 Review (Ontology Readback + Reporting)",
    "",
    "## Single Variable Boundary",
    "- This iteration only enables/disables `read.graphiti_ontology_readback` and audits the parse/report path.",
    "- Query routing, ranking, recipe/focal/temporal logic remain unchanged.",
    "",
    "## Key Metrics",
    `- ontology_marker_presence_rate baseline=${baselineSelected.ontology_marker_presence_rate} variant=${variantSelected.ontology_marker_presence_rate}`,
    `- ontology_parse_success_rate baseline=${baselineSelected.ontology_parse_success_rate} variant=${variantSelected.ontology_parse_success_rate}`,
    `- top1_hit_rate baseline=${baselineSelected.top1_hit_rate} variant=${variantSelected.top1_hit_rate}`,
    "",
    "## Notes",
    "- baseline vs variant uses same dataset, same mock retrieval payload, same bounded/stability runs.",
    "- Raw retrieval artifacts include request body and route/recipe/focal/temporal/ontology traces.",
    "- Gate-3 decision remains out of scope for W3-C.",
    "",
  ].join("\n");

  await writeText(path.join(REPORT_DIR, "w3-ontology-review.md"), reviewText);

  process.stdout.write(
    `${JSON.stringify(
      {
        sample_size: dataset.length,
        baseline_presence: baselineSelected.ontology_marker_presence_rate,
        variant_presence: variantSelected.ontology_marker_presence_rate,
        baseline_parse_success: baselineSelected.ontology_parse_success_rate,
        variant_parse_success: variantSelected.ontology_parse_success_rate,
      },
      null,
      2,
    )}\n`,
  );
};

await main();
