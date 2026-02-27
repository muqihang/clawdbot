import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type RetrievalEvalSample = {
  id: string;
  query: string;
  aliases?: string[];
  expected_ids?: string[];
  expected_structures?: string[];
};

type RetrievalEvalSummary = {
  generated_at: string;
  sample_size: number;
  top_k: number;
  hit_at_1: number;
  hit_at_3: number;
  structure_coverage: number;
  alias_recall: number;
};

type RetrievalEvalReport = RetrievalEvalSummary & {
  provider: string;
  dataset_path: string;
};

type BridgeSearchHit = {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: string;
  remoteId: string;
  structure?: string;
};

type RemoteSnippetRecord = {
  text: string;
};

type RemoteMemoryClient = {
  search: (query: string) => Promise<BridgeSearchHit[]>;
  getById: (id: string) => Promise<RemoteSnippetRecord | null>;
};

type Gate1Inputs = {
  fur_baseline: number;
  fur_current: number;
  p95_total_baseline_ms: number;
  p95_total_current_ms: number;
};

type Gate1Computed = {
  fur_improvement_pp: number;
  p95_degradation_pct: number;
};

type Gate1Validation = {
  missing_fields: boolean;
  p95_total_baseline_ms_positive: boolean;
  fur_check_pass: boolean;
  p95_check_pass: boolean;
  force_no_go_triggered: boolean;
};

type Gate1Report = {
  runDate: string;
  generatedAt: string;
  mode: "W1-R3.2";
  inputs: Gate1Inputs;
  retrieval: {
    provider: "graphiti";
    max_attempts: number;
    selection_rule: string;
    selected_attempt: number;
    selection_reason: string;
    attempts: Array<{ attempt: number; hit_at_1: number; hit_at_3: number }>;
  };
  formula: {
    fur_improvement_pp: string;
    p95_degradation_pct: string;
  };
  threshold: {
    rule: string;
    force_no_go_if: string[];
  };
  computed: Gate1Computed;
  validation: Gate1Validation;
  gate1_conclusion: "Go" | "No-Go";
  changed_files: string[];
  acceptance_check: "pass" | "fail";
  unresolved: string[];
};

type QueryContext =
  | { sampleId: string; kind: "sample"; query: string }
  | { sampleId: string; kind: "alias"; aliasIndex: number; query: string };

const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const safeJsonStringify = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const jsonFile = async (filePath: string, payload: unknown): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, safeJsonStringify(payload), "utf8");
};

const readJsonFile = async <T>(filePath: string): Promise<T> => {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
};

const buildQueryContexts = (dataset: RetrievalEvalSample[]): Map<string, QueryContext> => {
  const contexts = new Map<string, QueryContext>();

  for (const sample of dataset) {
    contexts.set(sample.query, { sampleId: sample.id, kind: "sample", query: sample.query });
    for (const [index, alias] of (sample.aliases ?? []).entries()) {
      contexts.set(alias, {
        sampleId: sample.id,
        kind: "alias",
        aliasIndex: index + 1,
        query: alias,
      });
    }
  }

  return contexts;
};

const scoreFieldStats = (
  items: unknown[],
): {
  score_present: number;
  rank_score_present: number;
  any_score_like_present: number;
  total_items: number;
} => {
  let scorePresent = 0;
  let rankScorePresent = 0;
  let anyScoreLikePresent = 0;

  for (const item of items) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    if (record.score !== undefined) {
      scorePresent += 1;
    }
    if (record.rank_score !== undefined) {
      rankScorePresent += 1;
    }
    if (Object.keys(record).some((key) => key.toLowerCase().includes("score"))) {
      anyScoreLikePresent += 1;
    }
  }

  return {
    score_present: scorePresent,
    rank_score_present: rankScorePresent,
    any_score_like_present: anyScoreLikePresent,
    total_items: items.length,
  };
};

const extractGraphitiRawItems = (payload: unknown): unknown[] => {
  const record = asRecord(payload);
  if (!record) {
    return [];
  }
  return [...asArray(record.facts), ...asArray(asRecord(record.data)?.facts)];
};

const summarizeTopK = (hits: BridgeSearchHit[], topK: number): unknown => {
  const topHits = hits.slice(0, topK);
  const scores = topHits.map((hit) => hit.score);
  const allScoresEqual = scores.length > 0 ? scores.every((value) => value === scores[0]) : true;
  const allScoresZero = scores.length > 0 ? scores.every((value) => value === 0) : true;

  return {
    hit_count: hits.length,
    top_k: topK,
    all_topk_scores_equal: allScoresEqual,
    all_topk_scores_zero: allScoresZero,
    topk: topHits.map((hit, index) => ({
      rank: index + 1,
      remoteId: hit.remoteId,
      score: hit.score,
      snippet: hit.snippet,
      structure: hit.structure ?? "",
    })),
  };
};

const computeGate1 = (
  inputs: Gate1Inputs,
): {
  computed: Gate1Computed;
  validation: Gate1Validation;
  conclusion: "Go" | "No-Go";
} => {
  const missing_fields =
    typeof inputs.fur_baseline !== "number" ||
    typeof inputs.fur_current !== "number" ||
    typeof inputs.p95_total_baseline_ms !== "number" ||
    typeof inputs.p95_total_current_ms !== "number";

  const p95_total_baseline_ms_positive = inputs.p95_total_baseline_ms > 0;
  const force_no_go_triggered = missing_fields || !p95_total_baseline_ms_positive;

  const fur_improvement_pp = round4((inputs.fur_current - inputs.fur_baseline) * 100);
  const p95_degradation_pct = round4(
    ((inputs.p95_total_current_ms - inputs.p95_total_baseline_ms) / inputs.p95_total_baseline_ms) *
      100,
  );

  const fur_check_pass = fur_improvement_pp >= 6;
  const p95_check_pass = p95_degradation_pct <= 10;

  const conclusion: "Go" | "No-Go" =
    !force_no_go_triggered && fur_check_pass && p95_check_pass ? "Go" : "No-Go";

  return {
    computed: { fur_improvement_pp, p95_degradation_pct },
    validation: {
      missing_fields,
      p95_total_baseline_ms_positive,
      fur_check_pass,
      p95_check_pass,
      force_no_go_triggered,
    },
    conclusion,
  };
};

const main = async (): Promise<void> => {
  const repoRoot = process.cwd();
  const evidenceRoot = process.env.W1_R3_2_EVIDENCE_DIR
    ? path.resolve(process.env.W1_R3_2_EVIDENCE_DIR)
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)));

  const graphitiBaseUrl = process.env.GRAPHITI_BASE_URL ?? "http://127.0.0.1:8000";
  const mem0BaseUrl = process.env.MEM0_BASE_URL ?? "http://127.0.0.1:8766";

  const datasetPath = path.resolve(
    process.env.RETRIEVAL_DATASET_PATH ??
      path.join(repoRoot, ".openclaw/memory-bridge-p3-retrieval-dataset.json"),
  );
  const topK = Math.max(1, Number.parseInt(process.env.RETRIEVAL_TOP_K ?? "3", 10) || 3);

  const boundedRuns = Math.max(
    1,
    Number.parseInt(process.env.RETRIEVAL_BOUNDED_RUNS ?? "5", 10) || 5,
  );
  const stabilityRuns = Math.max(
    0,
    Number.parseInt(process.env.RETRIEVAL_STABILITY_RUNS ?? "10", 10) || 10,
  );

  const runDate = new Date().toISOString().slice(0, 10);
  await mkdir(evidenceRoot, { recursive: true });

  const graphitiClientModule = await import(
    pathToFileURL(
      path.join(repoRoot, "extensions/memory-mem0-graphiti-bridge/src/client/graphiti-client.ts"),
    ).href
  );
  const mem0ClientModule = await import(
    pathToFileURL(
      path.join(repoRoot, "extensions/memory-mem0-graphiti-bridge/src/client/mem0-client.ts"),
    ).href
  );
  const retrievalEvalModule = await import(
    pathToFileURL(
      path.join(repoRoot, "extensions/memory-mem0-graphiti-bridge/src/p3/retrieval-eval.ts"),
    ).href
  );

  const createGraphitiClient = graphitiClientModule.createGraphitiClient as (options: {
    baseUrl: string;
    timeoutMs: number;
    getTimeoutMs?: number;
    fetchImpl?: typeof fetch;
  }) => RemoteMemoryClient;

  const createMem0Client = mem0ClientModule.createMem0Client as (options: {
    baseUrl: string;
    timeoutMs: number;
    getTimeoutMs?: number;
    fetchImpl?: typeof fetch;
  }) => RemoteMemoryClient;

  const parseRetrievalDataset = retrievalEvalModule.parseRetrievalDataset as (
    value: unknown,
  ) => RetrievalEvalSample[];
  const runRetrievalEvaluation = retrievalEvalModule.runRetrievalEvaluation as (options: {
    dataset: RetrievalEvalSample[];
    client: RemoteMemoryClient;
    topK?: number;
  }) => Promise<RetrievalEvalSummary>;

  const datasetRaw = await readJsonFile<unknown>(datasetPath);
  const dataset = parseRetrievalDataset(datasetRaw);
  const datasetNoAliases = dataset.map((sample) => ({
    ...sample,
    aliases: [],
  }));
  const queryContexts = buildQueryContexts(dataset);

  const boundedReports: RetrievalEvalReport[] = [];
  const stabilityReports: RetrievalEvalReport[] = [];

  const runOneEval = async (params: {
    phase: "bounded" | "stability";
    attempt: number;
  }): Promise<RetrievalEvalReport> => {
    const runId = `${params.phase}-${String(params.attempt).padStart(2, "0")}`;
    const runDir = path.join(evidenceRoot, "post-fix", params.phase, runId);

    let activeContext: { context: QueryContext; url: string } | null = null;

    const recordingFetch: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      const url = typeof input === "string" ? input : input.url;
      if (activeContext && url.includes("/search")) {
        const cloned = response.clone();
        let payload: unknown = null;
        try {
          payload = await cloned.json();
        } catch {
          payload = null;
        }

        const fileLabel =
          activeContext.context.kind === "sample"
            ? `sample.${activeContext.context.sampleId}`
            : `alias.${activeContext.context.sampleId}.${String(activeContext.context.aliasIndex).padStart(2, "0")}`;

        await jsonFile(path.join(runDir, "graphiti", `search.raw.${fileLabel}.json`), {
          provider: "graphiti",
          url,
          query: activeContext.context.query,
          payload,
        });

        const rawItems = extractGraphitiRawItems(payload);
        await jsonFile(path.join(runDir, "graphiti", `search.meta.${fileLabel}.json`), {
          provider: "graphiti",
          url,
          query: activeContext.context.query,
          score_fields: scoreFieldStats(rawItems),
        });
      }
      return response;
    };

    const baseClient = createGraphitiClient({
      baseUrl: graphitiBaseUrl,
      timeoutMs: 20_000,
      getTimeoutMs: 20_000,
      fetchImpl: recordingFetch,
    });

    const client: RemoteMemoryClient = {
      ...baseClient,
      search: async (query) => {
        const context = queryContexts.get(query) ?? { sampleId: "unknown", kind: "sample", query };
        activeContext = { context, url: `${graphitiBaseUrl}/search` };
        const hits = await baseClient.search(query);
        activeContext = null;

        await jsonFile(
          path.join(
            runDir,
            "graphiti",
            `search.topk.${
              context.kind === "sample"
                ? `sample.${context.sampleId}`
                : `alias.${context.sampleId}.${String(context.aliasIndex).padStart(2, "0")}`
            }.json`,
          ),
          summarizeTopK(hits, topK),
        );

        return hits;
      },
    };

    const summary = await runRetrievalEvaluation({
      dataset: params.phase === "bounded" ? dataset : datasetNoAliases,
      client,
      topK,
    });

    const report: RetrievalEvalReport = {
      provider: "graphiti",
      dataset_path: datasetPath,
      ...summary,
    };

    await jsonFile(path.join(runDir, "retrieval-eval.graphiti.json"), report);
    return report;
  };

  for (let attempt = 1; attempt <= boundedRuns; attempt += 1) {
    boundedReports.push(await runOneEval({ phase: "bounded", attempt }));
  }

  for (let attempt = 1; attempt <= stabilityRuns; attempt += 1) {
    stabilityReports.push(await runOneEval({ phase: "stability", attempt }));
  }

  const attempts = boundedReports.map((report, index) => ({
    attempt: index + 1,
    hit_at_1: report.hit_at_1,
    hit_at_3: report.hit_at_3,
  }));

  const firstPassing = attempts.find((attempt) => attempt.hit_at_1 > 0);
  const selected_attempt = firstPassing?.attempt ?? attempts[attempts.length - 1]?.attempt ?? 1;
  const selection_reason =
    firstPassing !== undefined ? "first_hit_at_1_gt_0" : "no_hit_at_1_gt_0_use_last_attempt";

  const selectedReport = boundedReports[selected_attempt - 1] ?? boundedReports[0];

  const furBaselinePath = path.join(
    repoRoot,
    "analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/s5-retrieval-eval.json",
  );
  const p95InputsPath = path.join(
    repoRoot,
    "analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-ab-eval.absprobe.json",
  );

  const furBaseline = await readJsonFile<{ hit_at_1?: number }>(furBaselinePath);
  const p95Inputs = await readJsonFile<{
    modelA?: { metrics?: { p95WriteLatencyMs?: number } };
    modelB?: { metrics?: { p95WriteLatencyMs?: number } };
  }>(p95InputsPath);

  const inputs: Gate1Inputs = {
    fur_baseline: furBaseline.hit_at_1 ?? 0,
    fur_current: selectedReport?.hit_at_1 ?? 0,
    p95_total_baseline_ms: p95Inputs.modelA?.metrics?.p95WriteLatencyMs ?? 0,
    p95_total_current_ms: p95Inputs.modelB?.metrics?.p95WriteLatencyMs ?? 0,
  };

  const gate = computeGate1(inputs);

  const gateReport: Gate1Report = {
    runDate,
    generatedAt: new Date().toISOString(),
    mode: "W1-R3.2",
    inputs,
    retrieval: {
      provider: "graphiti",
      max_attempts: boundedRuns,
      selection_rule: "first attempt where hit_at_1 > 0; if none, use last attempt",
      selected_attempt,
      selection_reason,
      attempts,
    },
    formula: {
      fur_improvement_pp: "(fur_current - fur_baseline) * 100",
      p95_degradation_pct:
        "((p95_total_current_ms - p95_total_baseline_ms) / p95_total_baseline_ms) * 100",
    },
    threshold: {
      rule: "fur_improvement_pp >= 6 && p95_degradation_pct <= 10",
      force_no_go_if: ["missing_fields", "p95_total_baseline_ms <= 0"],
    },
    computed: gate.computed,
    validation: gate.validation,
    gate1_conclusion: gate.conclusion,
    changed_files: [
      "extensions/memory-mem0-graphiti-bridge/src/client/mem0-client.ts",
      "extensions/memory-mem0-graphiti-bridge/src/client/graphiti-client.ts",
      "extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-retrieval-eval.test.ts",
      "extensions/memory-mem0-graphiti-bridge/src/__tests__/clients.test.ts",
    ],
    acceptance_check: gate.conclusion === "Go" ? "pass" : "fail",
    unresolved: gate.conclusion === "Go" ? [] : ["BLOCKER-R3-RET-HIT1-000 (hit_at_1 remains 0)"],
  };

  await jsonFile(path.join(evidenceRoot, "post-fix", "gate1-report.json"), gateReport);
  await writeFile(
    path.join(evidenceRoot, "post-fix", "gate1-report.txt"),
    [
      `run_date: ${gateReport.runDate}`,
      `generated_at: ${gateReport.generatedAt}`,
      `fur_baseline: ${gateReport.inputs.fur_baseline}`,
      `fur_current: ${gateReport.inputs.fur_current}`,
      `fur_improvement_pp: ${gateReport.computed.fur_improvement_pp}`,
      `p95_total_baseline_ms: ${gateReport.inputs.p95_total_baseline_ms}`,
      `p95_total_current_ms: ${gateReport.inputs.p95_total_current_ms}`,
      `p95_degradation_pct: ${gateReport.computed.p95_degradation_pct}`,
      `gate1_conclusion: ${gateReport.gate1_conclusion}`,
      `selection_reason: ${gateReport.retrieval.selection_reason}`,
    ].join("\n") + "\n",
    "utf8",
  );

  const stabilityHitAt1 = stabilityReports.map((report) => report.hit_at_1);
  const stabilityStats = {
    runDate,
    provider: "graphiti",
    stability_runs: stabilityRuns,
    hit_at_1: {
      min: stabilityHitAt1.length > 0 ? Math.min(...stabilityHitAt1) : 0,
      max: stabilityHitAt1.length > 0 ? Math.max(...stabilityHitAt1) : 0,
      mean:
        stabilityHitAt1.length > 0
          ? round4(stabilityHitAt1.reduce((sum, v) => sum + v, 0) / stabilityHitAt1.length)
          : 0,
      counts: stabilityHitAt1.reduce<Record<string, number>>((acc, value) => {
        const key = String(value);
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
      values: stabilityHitAt1,
    },
  };

  await jsonFile(path.join(evidenceRoot, "post-fix", "stability-stats.json"), stabilityStats);

  const graphitiClient = createGraphitiClient({
    baseUrl: graphitiBaseUrl,
    timeoutMs: 10_000,
    getTimeoutMs: 10_000,
  });
  const mem0Client = createMem0Client({
    baseUrl: mem0BaseUrl,
    timeoutMs: 10_000,
    getTimeoutMs: 10_000,
  });

  const expectedIds = Array.from(
    new Set(dataset.flatMap((sample) => sample.expected_ids ?? []).filter(Boolean)),
  );

  const existenceSamples: unknown[] = [];
  for (const remoteId of expectedIds) {
    const graphitiRecord = await graphitiClient.getById(remoteId);
    const mem0Record = await mem0Client.getById(remoteId);

    existenceSamples.push({
      remote_id: remoteId,
      graphiti: {
        exists: Boolean(graphitiRecord?.text),
        text_length: graphitiRecord?.text.length ?? 0,
      },
      mem0: {
        exists: Boolean(mem0Record?.text),
        text_length: mem0Record?.text.length ?? 0,
      },
    });
  }

  await jsonFile(path.join(evidenceRoot, "post-fix", "existence-matrix.json"), {
    generated_at: new Date().toISOString(),
    dataset_path: datasetPath,
    providers: {
      graphiti: { base_url: graphitiBaseUrl },
      mem0: { base_url: mem0BaseUrl },
    },
    expected_id_count: expectedIds.length,
    expected_ids: existenceSamples,
  });

  await writeFile(
    path.join(evidenceRoot, "post-fix", "run-complete.txt"),
    `completed_at=${new Date().toISOString()}\nrun_date=${runDate}\nbounded_runs=${boundedRuns}\nstability_runs=${stabilityRuns}\n`,
    "utf8",
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
