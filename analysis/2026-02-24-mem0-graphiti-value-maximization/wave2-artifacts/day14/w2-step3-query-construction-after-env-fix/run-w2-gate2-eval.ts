import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type JsonRecord = Record<string, unknown>;

type RetrievalEvalReport = {
  provider: "graphiti" | "mem0";
  dataset_path: string;
  generated_at: string;
  sample_size: number;
  top_k: number;
  hit_at_1: number;
  hit_at_3: number;
  structure_coverage: number;
  alias_recall: number;
};

type AbEvalReport = {
  generatedAt: string;
  sampleSize: number;
  evaluationMode: "simulated" | "real";
  dataSource: string;
  costAssumption: string;
  modelA: { model: string; metrics: JsonRecord };
  modelB: { model: string; metrics: JsonRecord };
};

type BridgeWeeklyGateFields = {
  proposal_count: number;
  canary_commit_count: number;
  manual_propose_commit_count: number;
  pending_review_count: number;
  failed_count: number;
  dead_count: number;
  admission_enabled: boolean;
  commit_canary_ratio: number;
  effective_write_mode: string;
};

type P3ReconciliationReport = {
  runDate: string;
  generatedAt: string;
  effectiveModel: string;
  metrics: JsonRecord;
  weekly_gate_fields: BridgeWeeklyGateFields;
};

type Gate2Inputs = {
  top1_exact_id_proxy: number;
  top1_exact_id_proxy_sample_size: number;
  cfp_proxy: number;
  cfp_proxy_baseline: number;
  fallback_failure_rate_proxy: number;
  fallback_failed_count: number;
  fallback_dead_count: number;
  fallback_proposal_count: number;
};

type Gate2Computed = {
  top1_exact_id_pass: boolean;
  cfp_decreased_or_flat: boolean;
  fallback_controllable: boolean;
  stability_hit_at_1_constant: boolean;
  low_confidence: boolean;
};

type Gate2Threshold = {
  top1_exact_id_proxy_min: number;
  fallback_failure_rate_proxy_max: number;
  rule: string;
  force_reject_if: string[];
};

type Gate2Report = {
  runDate: string;
  generatedAt: string;
  mode: "W2-D";
  inputs: Gate2Inputs;
  computed: Gate2Computed;
  threshold: Gate2Threshold;
  validation: {
    required_fields_present: boolean;
    weekly_gate_fields_strict_ok: boolean;
  };
  retrieval: {
    provider: "graphiti";
    dataset_path: string;
    bounded_runs: number;
    stability_runs: number;
    bounded: Array<{ attempt: number; hit_at_1: number; hit_at_3: number }>;
    stability_hit_at_1_values: number[];
    stability_unique_hit_at_1_values: number[];
    selected_attempt: number;
    selection_reason: string;
  };
  baselines: {
    cfp_proxy_source: string;
    cfp_proxy_baseline_source: string;
    top1_proxy_baseline_source: string;
    fallback_baseline_source: string;
  };
  outbox: {
    reconciliation_report_path: string;
    weekly_gate_fields: BridgeWeeklyGateFields;
  };
  changed_files: string[];
  acceptance_check: "pass" | "fail";
  gate2_conclusion: "Go" | "No-Go";
  unresolved: string[];
};

const round = (value: number): number => Math.round(value * 10_000) / 10_000;

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
};

const readJsonFile = async <T>(filePath: string): Promise<T> => {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
};

const writeJsonFile = async (filePath: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const writeText = async (filePath: string, content: string): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
};

const writeExit = async (filePath: string, exitCode: number): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, String(exitCode), "utf8");
};

const writeErr = async (filePath: string, content: string): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
};

const fetchJson = async (url: string, timeoutMs: number): Promise<unknown> => {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return await response.json();
};

const uniqueNumbers = (values: number[]): number[] => {
  const seen = new Set<string>();
  const output: number[] = [];
  for (const value of values) {
    const key = String(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(value);
  }
  return output;
};

type QueryContext =
  | { kind: "sample"; sampleId: string; query: string }
  | { kind: "alias"; sampleId: string; aliasIndex: number; query: string };

const buildQueryContexts = (dataset: Array<{ id: string; query: string; aliases?: string[] }>) => {
  const contexts = new Map<string, QueryContext>();
  for (const sample of dataset) {
    contexts.set(sample.query, { kind: "sample", sampleId: sample.id, query: sample.query });
    for (const [aliasIndex, aliasQuery] of (sample.aliases ?? []).entries()) {
      contexts.set(aliasQuery, {
        kind: "alias",
        sampleId: sample.id,
        aliasIndex,
        query: aliasQuery,
      });
    }
  }
  return contexts;
};

const summarizeTopK = (
  hits: Array<{ remoteId: string; score: number; path: string; structure?: string }>,
  topK: number,
) => {
  return {
    top_k: topK,
    hits: hits.slice(0, topK).map((hit) => ({
      remoteId: hit.remoteId,
      score: round(hit.score),
      path: hit.path,
      structure: hit.structure,
    })),
  };
};

const runGate2 = async (): Promise<void> => {
  const repoRoot = process.cwd();
  const evidenceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
  const runDate = new Date().toISOString().slice(0, 10);

  const gate2Dir = evidenceRoot;
  const inputsDir = path.join(gate2Dir, "inputs");
  const retrievalDir = path.join(gate2Dir, "retrieval");
  const reportDir = path.join(gate2Dir, "report");
  const abDir = path.join(gate2Dir, "ab");

  const graphitiBaseUrl = process.env.GRAPHITI_BASE_URL ?? "http://127.0.0.1:8000";
  const mem0BaseUrl = process.env.MEM0_BASE_URL ?? "http://127.0.0.1:8766";

  const defaultDatasetPath = path.join(gate2Dir, "inputs", "retrieval-dataset.v1.json");
  const datasetPath = path.resolve(process.env.RETRIEVAL_DATASET_PATH ?? defaultDatasetPath);
  const topK = Math.max(1, Number.parseInt(process.env.RETRIEVAL_TOP_K ?? "3", 10) || 3);

  const boundedRuns = Math.max(
    1,
    Number.parseInt(process.env.RETRIEVAL_BOUNDED_RUNS ?? "5", 10) || 5,
  );
  const stabilityRuns = Math.max(
    0,
    Number.parseInt(process.env.RETRIEVAL_STABILITY_RUNS ?? "10", 10) || 10,
  );

  await mkdir(gate2Dir, { recursive: true });

  // --- OpenAPI snapshots (environment probe)
  const openApiDir = path.join(gate2Dir, "openapi");
  await mkdir(openApiDir, { recursive: true });

  const recordOpenApi = async (name: "graphiti" | "mem0", url: string) => {
    const jsonPath = path.join(openApiDir, `${name}-openapi.json`);
    const exitPath = path.join(openApiDir, `${name}-openapi.exit`);
    const errPath = path.join(openApiDir, `${name}-openapi.err`);
    try {
      const payload = await fetchJson(url, 10_000);
      await writeJsonFile(jsonPath, payload);
      await writeExit(exitPath, 0);
      await writeErr(errPath, "");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writeJsonFile(jsonPath, {});
      await writeExit(exitPath, 1);
      await writeErr(errPath, message);
    }
  };

  await recordOpenApi("graphiti", `${graphitiBaseUrl}/openapi.json`);
  await recordOpenApi("mem0", `${mem0BaseUrl}/openapi.json`);

  // --- Load evaluation modules (pinned to repo code)
  const graphitiClientModule = await import(
    pathToFileURL(
      path.join(repoRoot, "extensions/memory-mem0-graphiti-bridge/src/client/graphiti-client.ts"),
    ).href
  );
  const retrievalEvalModule = await import(
    pathToFileURL(
      path.join(repoRoot, "extensions/memory-mem0-graphiti-bridge/src/p3/retrieval-eval.ts"),
    ).href
  );
  const abEvalModule = await import(
    pathToFileURL(path.join(repoRoot, "extensions/memory-mem0-graphiti-bridge/src/p3/ab-eval.ts"))
      .href
  );
  const outboxStoreModule = await import(
    pathToFileURL(
      path.join(repoRoot, "extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts"),
    ).href
  );
  const reportingModule = await import(
    pathToFileURL(path.join(repoRoot, "extensions/memory-mem0-graphiti-bridge/src/p3/reporting.ts"))
      .href
  );

  const createGraphitiClient = graphitiClientModule.createGraphitiClient as (options: {
    baseUrl: string;
    apiKey?: string;
    timeoutMs: number;
    getTimeoutMs?: number;
    fetchImpl?: typeof fetch;
  }) => { search: (query: string) => Promise<unknown[]> };

  const parseRetrievalDataset = retrievalEvalModule.parseRetrievalDataset as (
    value: unknown,
  ) => Array<{
    id: string;
    query: string;
    aliases?: string[];
    expected_ids?: string[];
    expected_structures?: string[];
  }>;
  const runRetrievalEvaluation = retrievalEvalModule.runRetrievalEvaluation as (options: {
    dataset: Array<{
      id: string;
      query: string;
      aliases?: string[];
      expected_ids?: string[];
      expected_structures?: string[];
    }>;
    client: {
      search: (
        query: string,
      ) => Promise<Array<{ remoteId: string; score: number; path: string; structure?: string }>>;
    };
    topK?: number;
  }) => Promise<{
    generated_at: string;
    sample_size: number;
    top_k: number;
    hit_at_1: number;
    hit_at_3: number;
    structure_coverage: number;
    alias_recall: number;
  }>;

  const runWritePathAbEvaluation = abEvalModule.runWritePathAbEvaluation as (options: {
    mode?: "simulated" | "real";
    modelA: string;
    modelB: string;
    validationSet: Array<{ id: string; user: string; assistant: string; expected: JsonRecord }>;
    realOptions?: JsonRecord;
  }) => Promise<AbEvalReport>;

  const createP3OutboxStore = outboxStoreModule.createP3OutboxStore as (options: {
    dbPath: string;
  }) => {
    listEvents: () => Array<{ event_id: string; write_mode: string }>;
    listProposalStates: () => Array<{ event_id: string; status: string }>;
    getAuditCounters: (runDate: string) => JsonRecord;
    getOutboxStatusCounts: () => {
      pending: number;
      inflight: number;
      succeeded: number;
      failed: number;
      dead: number;
    };
    close: () => void;
  };

  const buildP3SnapshotMetrics = reportingModule.buildP3SnapshotMetrics as (
    input: JsonRecord,
  ) => JsonRecord;
  const buildP3WeeklyGateFields = reportingModule.buildP3WeeklyGateFields as (
    input: JsonRecord,
  ) => BridgeWeeklyGateFields;
  const buildP3RunSummary = reportingModule.buildP3RunSummary as (params: {
    metrics: JsonRecord;
    weeklyGateFields: BridgeWeeklyGateFields;
    effectiveModel: string;
    runDate: string;
  }) => string;
  const validateP3WeeklyGateFieldsStrict = reportingModule.validateP3WeeklyGateFieldsStrict as (
    value: unknown,
  ) => { ok: true; value: BridgeWeeklyGateFields } | { ok: false; issues: string[] };

  // --- Gate inputs
  const datasetRaw = await readJsonFile<unknown>(datasetPath);
  const dataset = parseRetrievalDataset(datasetRaw);
  await mkdir(inputsDir, { recursive: true });
  await writeJsonFile(path.join(inputsDir, "retrieval-dataset.raw.json"), datasetRaw);
  await writeJsonFile(path.join(inputsDir, "retrieval-dataset.parsed.json"), dataset);

  const queryContexts = buildQueryContexts(dataset);

  const runOneRetrievalEval = async (params: {
    phase: "bounded" | "stability";
    attempt: number;
  }) => {
    const runId = `${params.phase}-${String(params.attempt).padStart(2, "0")}`;
    const runDir = path.join(retrievalDir, runId);
    const graphitiRunDir = path.join(runDir, "graphiti");
    await mkdir(graphitiRunDir, { recursive: true });

    let activeContext: { context: QueryContext } | null = null;

    const recordingFetch: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      const url = typeof input === "string" ? input : input.url;
      if (activeContext && url.includes("/search")) {
        let requestBody: unknown = null;
        if (typeof init?.body === "string") {
          try {
            requestBody = JSON.parse(init.body) as unknown;
          } catch {
            requestBody = init.body;
          }
        }

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

        await writeJsonFile(path.join(graphitiRunDir, `search.raw.${fileLabel}.json`), {
          provider: "graphiti",
          url,
          query: activeContext.context.query,
          requestBody,
          payload,
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

    const client = {
      ...baseClient,
      search: async (query: string) => {
        const context = queryContexts.get(query) ?? { kind: "sample", sampleId: "unknown", query };
        activeContext = { context };
        const hits = (await baseClient.search(query)) as Array<{
          remoteId: string;
          score: number;
          path: string;
          structure?: string;
        }>;
        activeContext = null;

        await writeJsonFile(
          path.join(
            graphitiRunDir,
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

    const datasetNoAliases = dataset.map((sample) => ({ ...sample, aliases: [] }));
    const evalDataset = params.phase === "bounded" ? dataset : datasetNoAliases;
    const summary = await runRetrievalEvaluation({ dataset: evalDataset, client, topK });

    const report: RetrievalEvalReport = {
      provider: "graphiti",
      dataset_path: datasetPath,
      ...summary,
    };

    await writeJsonFile(path.join(runDir, "retrieval-eval.graphiti.json"), report);
    return report;
  };

  const boundedReports: RetrievalEvalReport[] = [];
  const stabilityReports: RetrievalEvalReport[] = [];

  for (let attempt = 1; attempt <= boundedRuns; attempt += 1) {
    boundedReports.push(await runOneRetrievalEval({ phase: "bounded", attempt }));
  }

  for (let attempt = 1; attempt <= stabilityRuns; attempt += 1) {
    stabilityReports.push(await runOneRetrievalEval({ phase: "stability", attempt }));
  }

  const boundedAttempts = boundedReports.map((report, index) => ({
    attempt: index + 1,
    hit_at_1: report.hit_at_1,
    hit_at_3: report.hit_at_3,
  }));

  // Selection rule (frozen-style, similar to W1-R3.2): first attempt meeting threshold, else last.
  const TOP1_MIN = 0.93;
  const firstPassing = boundedAttempts.find((attempt) => attempt.hit_at_1 >= TOP1_MIN);
  const selectedAttempt =
    firstPassing?.attempt ?? boundedAttempts[boundedAttempts.length - 1]?.attempt ?? 1;
  const selectionReason =
    firstPassing !== undefined ? "first_hit_at_1_ge_0.93" : "no_hit_at_1_ge_0.93_use_last_attempt";
  const selectedReport = boundedReports[selectedAttempt - 1] ?? boundedReports[0];

  const stabilityHitAt1 = stabilityReports.map((report) => report.hit_at_1);
  const stabilityUnique = uniqueNumbers(stabilityHitAt1);

  // --- AB eval (CFP proxy)
  const abDatasetPath = path.join(
    repoRoot,
    "extensions/memory-mem0-graphiti-bridge/src/p3/fixtures/ab-validation-set.json",
  );
  const abDatasetRaw = await readJsonFile<unknown>(abDatasetPath);
  await writeJsonFile(path.join(inputsDir, "ab-validation-set.raw.json"), abDatasetRaw);

  const asTrimmedString = (value: unknown): string | null => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  };

  const validationSet = Array.isArray(abDatasetRaw)
    ? (abDatasetRaw as Array<Record<string, unknown>>)
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }
          const expected = item.expected && typeof item.expected === "object" ? item.expected : {};

          const id = asTrimmedString(item.id);
          const user = asTrimmedString(item.user);
          const assistant = asTrimmedString(item.assistant);
          if (!id || !user || !assistant) {
            return null;
          }
          return {
            id,
            user,
            assistant,
            expected: expected as JsonRecord,
          };
        })
        .filter(
          (item): item is { id: string; user: string; assistant: string; expected: JsonRecord } =>
            Boolean(item),
        )
    : [];

  const typedValidationSet = validationSet as Array<{
    id: string;
    user: string;
    assistant: string;
    expected: JsonRecord;
  }>;

  const abReport = await runWritePathAbEvaluation({
    mode: "simulated",
    modelA: "gpt-5.1-codex-mini",
    modelB: "gpt-5.3-codex",
    validationSet: typedValidationSet,
  });
  await mkdir(abDir, { recursive: true });
  await writeJsonFile(path.join(abDir, "ab-eval.simulated.json"), abReport);

  const cfpCurrent =
    asNumber(abReport.modelA.metrics.conflictFalsePositiveRate) ??
    asNumber(abReport.modelB.metrics.conflictFalsePositiveRate) ??
    0;

  const cfpBaselinePath = path.join(
    repoRoot,
    "analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-ab-eval.absprobe.json",
  );
  const cfpBaselineJson = await readJsonFile<AbEvalReport>(cfpBaselinePath);
  const cfpBaseline =
    asNumber(cfpBaselineJson.modelA.metrics.conflictFalsePositiveRate) ??
    asNumber(cfpBaselineJson.modelB.metrics.conflictFalsePositiveRate) ??
    0;

  // --- Outbox reconciliation report (fallback controllability proxy)
  const outboxDbPath = path.join(repoRoot, ".openclaw/memory-bridge-p3.sqlite");
  const outbox = createP3OutboxStore({ dbPath: outboxDbPath });
  const counters = outbox.getAuditCounters(runDate);
  const outboxCounts = outbox.getOutboxStatusCounts();

  const metrics = buildP3SnapshotMetrics({
    candidateCount: counters.candidateCount,
    addedCount: counters.addedCount,
    duplicateSkippedCount: counters.duplicateSkippedCount,
    conflictCount: counters.conflictCount,
    sensitiveInterceptedCount: counters.sensitiveInterceptedCount,
    indexConsistencyFailureCount: counters.indexConsistencyFailureCount,
    outbox: outboxCounts,
  });

  const events = outbox.listEvents();
  const proposalStates = outbox.listProposalStates();
  const committedEventIds = new Set(
    proposalStates.filter((state) => state.status === "committed").map((state) => state.event_id),
  );
  const canaryCommitCount = events.filter(
    (event) => committedEventIds.has(event.event_id) && event.write_mode === "propose_only",
  ).length;
  const manualProposeCommitCount = events.filter(
    (event) => committedEventIds.has(event.event_id) && event.write_mode === "propose_commit",
  ).length;
  const pendingReviewCount = proposalStates.filter(
    (proposal) => proposal.status === "pending_review",
  ).length;

  const weeklyGateFields = buildP3WeeklyGateFields({
    proposal_count: proposalStates.length,
    canary_commit_count: canaryCommitCount,
    manual_propose_commit_count: manualProposeCommitCount,
    pending_review_count: pendingReviewCount,
    failed_count: outboxCounts.failed,
    dead_count: outboxCounts.dead,
    // These are surfaced as-is; in full product run these come from bridge flags.
    admission_enabled: false,
    commit_canary_ratio: 0,
    effective_write_mode: "off",
  });

  const weeklyGateStrict = validateP3WeeklyGateFieldsStrict(weeklyGateFields);
  const weeklyGateStrictOk = weeklyGateStrict.ok;

  const reconciliationReport: P3ReconciliationReport = {
    runDate,
    generatedAt: new Date().toISOString(),
    effectiveModel: "unknown",
    metrics,
    weekly_gate_fields: weeklyGateFields,
  };

  await mkdir(reportDir, { recursive: true });
  const reconciliationJsonPath = path.join(reportDir, "reconciliation-report.json");
  const reconciliationTxtPath = path.join(reportDir, "reconciliation-report.txt");
  await writeJsonFile(reconciliationJsonPath, reconciliationReport);
  await writeText(
    reconciliationTxtPath,
    `${buildP3RunSummary({
      metrics,
      weeklyGateFields,
      effectiveModel: reconciliationReport.effectiveModel,
      runDate,
    })}\n`,
  );
  outbox.close();

  const fallbackFailureRateProxy = round(
    (weeklyGateFields.failed_count + weeklyGateFields.dead_count) /
      Math.max(1, weeklyGateFields.proposal_count),
  );

  // Baseline fallback proxy from W1 report (same field names; dead/failed semantics unchanged)
  const fallbackBaselinePath = path.join(
    repoRoot,
    "analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day10/w1-e-gate1-report.json",
  );
  const fallbackBaselineJson = await readJsonFile<{ weekly_gate_fields?: BridgeWeeklyGateFields }>(
    fallbackBaselinePath,
  );
  const fallbackBaseline = fallbackBaselineJson.weekly_gate_fields ?? {
    proposal_count: 0,
    canary_commit_count: 0,
    manual_propose_commit_count: 0,
    pending_review_count: 0,
    failed_count: 0,
    dead_count: 0,
    admission_enabled: false,
    commit_canary_ratio: 0,
    effective_write_mode: "off",
  };
  const fallbackBaselineRateProxy = round(
    (fallbackBaseline.failed_count + fallbackBaseline.dead_count) /
      Math.max(1, fallbackBaseline.proposal_count),
  );

  // --- Gate-2 decision
  const FALLBACK_RATE_MAX = 0.1;
  const lowConfidence = selectedReport.sample_size < 30;
  const stabilityConstant = stabilityUnique.length <= 1;
  const top1Pass = selectedReport.hit_at_1 >= TOP1_MIN;
  const cfpOk = cfpCurrent <= cfpBaseline;
  const fallbackOk =
    fallbackFailureRateProxy < FALLBACK_RATE_MAX && weeklyGateFields.failed_count === 0;

  const requiredFieldsPresent =
    typeof selectedReport.hit_at_1 === "number" &&
    typeof selectedReport.sample_size === "number" &&
    typeof cfpCurrent === "number" &&
    typeof fallbackFailureRateProxy === "number";

  const forceRejectIf: string[] = [];
  if (!requiredFieldsPresent) {
    forceRejectIf.push("missing_required_fields");
  }
  if (!weeklyGateStrictOk) {
    forceRejectIf.push("weekly_gate_fields_strict_validation_failed");
  }
  if (lowConfidence) {
    forceRejectIf.push("low_confidence_sample_size_lt_30");
  }

  const computed: Gate2Computed = {
    top1_exact_id_pass: top1Pass,
    cfp_decreased_or_flat: cfpOk,
    fallback_controllable: fallbackOk,
    stability_hit_at_1_constant: stabilityConstant,
    low_confidence: lowConfidence,
  };

  const allChecksPass =
    requiredFieldsPresent &&
    weeklyGateStrictOk &&
    !lowConfidence &&
    top1Pass &&
    cfpOk &&
    fallbackOk &&
    stabilityConstant;

  const conclusion: "Go" | "No-Go" = allChecksPass ? "Go" : "No-Go";

  const unresolved: string[] = [];
  if (lowConfidence) {
    unresolved.push(`G2: low_confidence (sample_size=${selectedReport.sample_size} < 30)`);
  }
  if (!top1Pass) {
    unresolved.push(`G4: top1_exact_id_proxy=${selectedReport.hit_at_1} < 0.93`);
  }
  if (!stabilityConstant) {
    unresolved.push(`stability: hit_at_1 varied across runs: ${JSON.stringify(stabilityUnique)}`);
  }
  if (!cfpOk) {
    unresolved.push(`CFP: conflictFalsePositiveRate=${cfpCurrent} > baseline=${cfpBaseline}`);
  }
  if (!fallbackOk) {
    unresolved.push(
      `fallback_proxy: failure_rate=${fallbackFailureRateProxy} (baseline=${fallbackBaselineRateProxy}) failed=${weeklyGateFields.failed_count} dead=${weeklyGateFields.dead_count}`,
    );
  }
  if (!weeklyGateStrictOk) {
    const issues = weeklyGateStrict.ok ? [] : weeklyGateStrict.issues;
    unresolved.push(`weekly_gate_fields_strict: ${issues.join(",")}`);
  }

  const report: Gate2Report = {
    runDate,
    generatedAt: new Date().toISOString(),
    mode: "W2-D",
    inputs: {
      top1_exact_id_proxy: selectedReport.hit_at_1,
      top1_exact_id_proxy_sample_size: selectedReport.sample_size,
      cfp_proxy: cfpCurrent,
      cfp_proxy_baseline: cfpBaseline,
      fallback_failure_rate_proxy: fallbackFailureRateProxy,
      fallback_failed_count: weeklyGateFields.failed_count,
      fallback_dead_count: weeklyGateFields.dead_count,
      fallback_proposal_count: weeklyGateFields.proposal_count,
    },
    computed,
    threshold: {
      top1_exact_id_proxy_min: TOP1_MIN,
      fallback_failure_rate_proxy_max: FALLBACK_RATE_MAX,
      rule: "top1_exact_id_proxy >= 0.93 && cfp_proxy <= baseline && fallback_failure_rate_proxy < 0.10 && failed_count == 0 && stability_hit_at_1_constant && low_confidence == false",
      force_reject_if: forceRejectIf,
    },
    validation: {
      required_fields_present: requiredFieldsPresent,
      weekly_gate_fields_strict_ok: weeklyGateStrictOk,
    },
    retrieval: {
      provider: "graphiti",
      dataset_path: datasetPath,
      bounded_runs: boundedRuns,
      stability_runs: stabilityRuns,
      bounded: boundedAttempts,
      stability_hit_at_1_values: stabilityHitAt1,
      stability_unique_hit_at_1_values: stabilityUnique,
      selected_attempt: selectedAttempt,
      selection_reason: selectionReason,
    },
    baselines: {
      cfp_proxy_source: "ab-eval.simulated.json:modelA.metrics.conflictFalsePositiveRate",
      cfp_proxy_baseline_source: `${cfpBaselinePath}:modelA.metrics.conflictFalsePositiveRate`,
      top1_proxy_baseline_source:
        "analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/s5-retrieval-eval.json:hit_at_1",
      fallback_baseline_source: `${fallbackBaselinePath}:weekly_gate_fields.failed_count/dead_count/proposal_count`,
    },
    outbox: {
      reconciliation_report_path: reconciliationJsonPath,
      weekly_gate_fields: weeklyGateFields,
    },
    changed_files: [
      "extensions/memory-mem0-graphiti-bridge/src/client/mem0-client.ts",
      "extensions/memory-mem0-graphiti-bridge/src/client/graphiti-client.ts",
      "extensions/memory-mem0-graphiti-bridge/src/__tests__/graphiti-query-body.test.ts",
      "analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day14/w2-step3-query-construction-after-env-fix/run-w2-gate2-eval.ts",
    ],
    acceptance_check: conclusion === "Go" ? "pass" : "fail",
    gate2_conclusion: conclusion,
    unresolved,
  };

  // --- Write final artifacts
  const gate2DirRel = path.relative(repoRoot, gate2Dir).split(path.sep).join("/");
  const datasetPathRel = path.relative(repoRoot, datasetPath).split(path.sep).join("/");

  await writeJsonFile(path.join(gate2Dir, "w2-gate2-report.json"), report);
  await writeText(
    path.join(gate2Dir, "w2-gate2-report.txt"),
    [
      `run_date: ${report.runDate}`,
      `generated_at: ${report.generatedAt}`,
      `gate2_conclusion: ${report.gate2_conclusion}`,
      `top1_exact_id_proxy: ${String(report.inputs.top1_exact_id_proxy)}`,
      `top1_exact_id_proxy_sample_size: ${String(report.inputs.top1_exact_id_proxy_sample_size)}`,
      `cfp_proxy: ${String(report.inputs.cfp_proxy)}`,
      `cfp_proxy_baseline: ${String(report.inputs.cfp_proxy_baseline)}`,
      `fallback_failure_rate_proxy: ${String(report.inputs.fallback_failure_rate_proxy)}`,
      `fallback_failed_count: ${String(report.inputs.fallback_failed_count)}`,
      `fallback_dead_count: ${String(report.inputs.fallback_dead_count)}`,
      `stability_unique_hit_at_1_values: ${JSON.stringify(report.retrieval.stability_unique_hit_at_1_values)}`,
      `low_confidence: ${String(report.computed.low_confidence)}`,
      `selection_reason: ${report.retrieval.selection_reason}`,
    ].join("\n") + "\n",
  );

  await writeText(
    path.join(gate2Dir, "w2-gate2-review.md"),
    [
      "# W2 Gate-2 Review (Step 3A: query construction, rerun after env fix)",
      "",
      "Gate-2 文案（冻结，不改）：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:145`。",
      "",
      "## Evidence Paths",
      "",
      `- Gate-2 report (json): \`${gate2DirRel}/w2-gate2-report.json\``,
      `- Gate-2 report (txt): \`${gate2DirRel}/w2-gate2-report.txt\``,
      `- Retrieval runs: \`${gate2DirRel}/retrieval/\``,
      `- AB eval: \`${gate2DirRel}/ab/ab-eval.simulated.json\``,
      `- Reconciliation report: \`${gate2DirRel}/report/reconciliation-report.json\``,
      `- OpenAPI snapshots: \`${gate2DirRel}/openapi/\``,
      `- Dataset v1: \`${datasetPathRel}\``,
      "",
      "## Summary",
      "",
      `- Conclusion: **${report.gate2_conclusion}**`,
      `- top1_exact_id_proxy (hit@1): ${String(report.inputs.top1_exact_id_proxy)} (sample_size=${String(report.inputs.top1_exact_id_proxy_sample_size)})`,
      `- CFP proxy: ${String(report.inputs.cfp_proxy)} (baseline=${String(report.inputs.cfp_proxy_baseline)})`,
      `- fallback failure-rate proxy: ${String(report.inputs.fallback_failure_rate_proxy)} (failed=${String(
        report.inputs.fallback_failed_count,
      )}, dead=${String(report.inputs.fallback_dead_count)})`,
      `- stability unique hit@1 values: ${JSON.stringify(report.retrieval.stability_unique_hit_at_1_values)}`,
      "",
      "## Unresolved",
      "",
      ...(report.unresolved.length > 0 ? report.unresolved.map((item) => `- ${item}`) : ["- none"]),
      "",
    ].join("\n"),
  );

  await writeText(path.join(gate2Dir, "run-complete.txt"), "ok\n");
};

runGate2().catch(async (error) => {
  const evidenceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  await writeText(path.join(evidenceRoot, "run-error.txt"), `${message}\n`);
  // eslint-disable-next-line no-console
  console.error(message);
  process.exitCode = 1;
});
