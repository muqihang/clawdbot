import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createGraphitiClient } from "../client/graphiti-client.js";
import { createMem0Client } from "../client/mem0-client.js";
import type { BridgeFlags } from "../config/flags.js";
import { runWritePathAbEvaluation, type AbValidationSample } from "./ab-eval.js";
import { createCheckpointStore } from "./checkpoint-store.js";
import { runIndexConsistencyCheck } from "./index-check.js";
import { createP3OutboxStore } from "./outbox-store.js";
import { createHttpBridgeWriter } from "./remote-writer.js";
import { buildP3RunSummary, buildP3SnapshotMetrics, buildP3WeeklyGateFields } from "./reporting.js";
import { parseRetrievalDataset, runRetrievalEvaluation } from "./retrieval-eval.js";
import { createP3Worker } from "./worker.js";

type PluginLogger = OpenClawPluginApi["logger"];

const DEFAULT_DB_RELATIVE_PATH = path.join(".openclaw", "memory-bridge-p3.sqlite");
const DEFAULT_REPORT_JSON_RELATIVE_PATH = path.join(
  ".openclaw",
  "memory-bridge-p3-reconciliation.json",
);
const DEFAULT_REPORT_TXT_RELATIVE_PATH = path.join(
  ".openclaw",
  "memory-bridge-p3-reconciliation.txt",
);
const DEFAULT_AB_DATASET_RELATIVE_PATH = path.join(
  "extensions",
  "memory-mem0-graphiti-bridge",
  "src",
  "p3",
  "fixtures",
  "ab-validation-set.json",
);
const DEFAULT_RETRIEVAL_DATASET_RELATIVE_PATH = path.join(
  ".openclaw",
  "memory-bridge-p3-retrieval-dataset.json",
);

const toInt = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const resolveWorkspaceDir = (workspaceDir?: string): string => {
  return workspaceDir ? path.resolve(workspaceDir) : process.cwd();
};

const resolveCliPath = (params: {
  workspaceDir: string;
  value?: string;
  defaultRelativePath: string;
}): string => {
  const normalized = normalizeString(params.value);
  if (!normalized) {
    return path.join(params.workspaceDir, params.defaultRelativePath);
  }
  return path.isAbsolute(normalized)
    ? normalized
    : path.join(params.workspaceDir, normalized.replace(/^\.\//, ""));
};

const resolveReportOutputPath = (params: {
  workspaceDir: string;
  value?: string;
  defaultRelativePath: string;
}): string => {
  const normalized = normalizeString(params.value);
  if (!normalized) {
    return path.join(params.workspaceDir, params.defaultRelativePath);
  }

  return path.isAbsolute(normalized) ? normalized : path.resolve(process.cwd(), normalized);
};

const parseJsonSafe = <T>(text: string, fallback: T): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

type WorkerCliOptions = {
  once?: boolean;
  daemon?: boolean;
  intervalMs?: string;
  maxAttempts?: string;
  baseBackoffMs?: string;
  maxBackoffMs?: string;
  dbPath?: string;
  model?: string;
  reportJson?: string;
  reportText?: string;
};

type CheckpointSaveCliOptions = {
  taskId?: string;
  intent?: string;
  state?: string;
  expectedOutcome?: string;
  workingFiles?: string[];
  ttlMs?: string;
  dbPath?: string;
};

type CheckpointRestoreCliOptions = {
  taskId?: string;
  dbPath?: string;
};

type IndexCheckCliOptions = {
  workspace?: string;
  indexPath?: string;
  json?: boolean;
  dbPath?: string;
};

type ReportCliOptions = {
  runDate?: string;
  dbPath?: string;
  reportJson?: string;
  reportText?: string;
  model?: string;
};

type AbCliOptions = {
  mode?: string;
  dataset?: string;
  modelA?: string;
  modelB?: string;
  out?: string;
};

type RetrievalEvalCliOptions = {
  dataset?: string;
  out?: string;
  route?: string;
  topK?: string;
};

type P3OutboxStatusCounts = {
  pending: number;
  inflight: number;
  succeeded: number;
  failed: number;
  dead: number;
};

const deriveWeeklyGateFields = (params: {
  outbox: ReturnType<typeof createP3OutboxStore>;
  outboxCounts: P3OutboxStatusCounts;
  flags: BridgeFlags;
}) => {
  const events = params.outbox.listEvents();
  const proposalStates = params.outbox.listProposalStates();

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
    (proposalState) => proposalState.status === "pending_review",
  ).length;

  return buildP3WeeklyGateFields({
    proposal_count: proposalStates.length,
    canary_commit_count: canaryCommitCount,
    manual_propose_commit_count: manualProposeCommitCount,
    pending_review_count: pendingReviewCount,
    failed_count: params.outboxCounts.failed,
    dead_count: params.outboxCounts.dead,
    admission_enabled: params.flags.p3.admission_enabled,
    commit_canary_ratio: params.flags.p3.commit_canary_ratio,
    effective_write_mode: params.flags.write_mode,
  });
};

const loadValidationSet = async (datasetPath: string): Promise<AbValidationSample[]> => {
  const content = await readFile(datasetPath, "utf8");
  const parsed = parseJsonSafe<unknown>(content, []);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      if (
        typeof record.id !== "string" ||
        typeof record.user !== "string" ||
        typeof record.assistant !== "string"
      ) {
        return null;
      }

      const expected =
        record.expected && typeof record.expected === "object" && !Array.isArray(record.expected)
          ? (record.expected as Record<string, unknown>)
          : {};

      return {
        id: record.id,
        user: record.user,
        assistant: record.assistant,
        expected: {
          extractable: expected.extractable !== false,
          conflict: expected.conflict === true,
          pendingReview: expected.pendingReview === true,
          supersedeCorrect: expected.supersedeCorrect !== false,
        },
      } satisfies AbValidationSample;
    })
    .filter((item): item is AbValidationSample => Boolean(item));
};

export function registerMemoryBridgeP3Cli(params: {
  program: Command;
  workspaceDir?: string;
  logger: PluginLogger;
  flags: BridgeFlags;
}): void {
  const workspaceDir = resolveWorkspaceDir(params.workspaceDir);

  const root = params.program
    .command("memory-bridge-p3")
    .description("P3 governance commands for mem0 + graphiti bridge");

  root
    .command("worker")
    .description("Run P3 outbox worker (--once or --daemon)")
    .option("--once", "Process due events once", true)
    .option("--daemon", "Run loop until interrupted", false)
    .option("--interval-ms <n>", "Daemon polling interval ms", "60000")
    .option("--max-attempts <n>", "Max retries before dead-letter", "5")
    .option("--base-backoff-ms <n>", "Retry base backoff", "1000")
    .option("--max-backoff-ms <n>", "Retry max backoff", "300000")
    .option("--db-path <path>", "Outbox sqlite path")
    .option("--model <id>", "Override effective model in summary")
    .option("--report-json <path>", "JSON report output")
    .option("--report-text <path>", "Text report output")
    .action(async (opts: WorkerCliOptions) => {
      const dbPath = resolveCliPath({
        workspaceDir,
        value: opts.dbPath ?? params.flags.outbox.db_path,
        defaultRelativePath: DEFAULT_DB_RELATIVE_PATH,
      });

      const effectiveModel =
        normalizeString(opts.model) ?? params.flags.p3.model ?? "gpt-5.1-codex-mini";
      const reportJsonPath = resolveCliPath({
        workspaceDir,
        value: opts.reportJson,
        defaultRelativePath: DEFAULT_REPORT_JSON_RELATIVE_PATH,
      });
      const reportTextPath = resolveCliPath({
        workspaceDir,
        value: opts.reportText,
        defaultRelativePath: DEFAULT_REPORT_TXT_RELATIVE_PATH,
      });

      const outbox = createP3OutboxStore({ dbPath });
      const worker = createP3Worker({
        outbox,
        now: Date.now,
        maxAttempts: toInt(opts.maxAttempts, params.flags.p3.max_attempts),
        baseBackoffMs: toInt(opts.baseBackoffMs, params.flags.p3.base_backoff_ms),
        maxBackoffMs: toInt(opts.maxBackoffMs, params.flags.p3.max_backoff_ms),
        jitterRatio: params.flags.p3.jitter_ratio,
        lowConfidenceThreshold: params.flags.p3.low_confidence_threshold,
        admissionEnabled: params.flags.p3.admission_enabled,
        commitCanaryRatio: params.flags.p3.commit_canary_ratio,
        commitRequireIndexCheck: params.flags.p3.commit_require_index_check,
        commitRequireNonSensitive: params.flags.p3.commit_require_non_sensitive,
        commitRequireDualWriteOk: params.flags.p3.commit_require_dual_write_ok,
        mem0Write: createHttpBridgeWriter({
          source: "mem0",
          baseUrl: params.flags.mem0.base_url,
          apiKey: params.flags.mem0.api_key,
          timeoutMs: params.flags.p3.write_timeout_ms,
          path: params.flags.p3.mem0_write_path,
        }),
        graphitiWrite: createHttpBridgeWriter({
          source: "graphiti",
          baseUrl: params.flags.graphiti.base_url,
          apiKey: params.flags.graphiti.api_key,
          timeoutMs: params.flags.p3.write_timeout_ms,
          path: params.flags.p3.graphiti_write_path,
        }),
      });

      const runReport = async () => {
        const runDate = new Date().toISOString().slice(0, 10);
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
        const weeklyGateFields = deriveWeeklyGateFields({
          outbox,
          outboxCounts,
          flags: params.flags,
        });

        const report = {
          runDate,
          generatedAt: new Date().toISOString(),
          effectiveModel,
          metrics,
          weekly_gate_fields: weeklyGateFields,
        };

        await mkdir(path.dirname(reportJsonPath), { recursive: true });
        await writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
        const summaryText = buildP3RunSummary({
          metrics,
          runDate,
          effectiveModel,
          weeklyGateFields,
        });
        await writeFile(reportTextPath, `${summaryText}\n`, "utf8");

        console.log(summaryText);
      };

      const runOnce = async () => {
        const summary = await worker.processOnce();
        console.log(`effective_model: ${effectiveModel}`);
        console.log(
          `worker_summary: processed=${String(summary.processed)} succeeded=${String(summary.succeeded)} failed=${String(summary.failed)} dead=${String(summary.dead)} skipped=${String(summary.skipped)}`,
        );
        await runReport();
      };

      if (!opts.daemon) {
        await runOnce();
        return;
      }

      const intervalMs = Math.max(1000, toInt(opts.intervalMs, 60_000));
      params.logger.info(`memory-mem0-graphiti-bridge: p3 worker daemon started (${intervalMs}ms)`);

      let stopped = false;
      const stop = () => {
        stopped = true;
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);

      while (!stopped) {
        await runOnce();
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }

      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      params.logger.info("memory-mem0-graphiti-bridge: p3 worker daemon stopped");
    });

  const checkpoint = root.command("checkpoint").description("Save/restore P3 task checkpoints");

  checkpoint
    .command("save")
    .requiredOption("--task-id <id>", "Checkpoint task id")
    .requiredOption("--intent <text>", "Task intent")
    .requiredOption("--expected-outcome <text>", "Expected outcome")
    .option("--state <json>", "JSON state payload", "{}")
    .option("--working-files <csv>", "Comma-separated working files", "")
    .option("--ttl-ms <n>", "TTL in milliseconds (default 4h)")
    .option("--db-path <path>", "Outbox sqlite path")
    .action(async (opts: CheckpointSaveCliOptions) => {
      const dbPath = resolveCliPath({
        workspaceDir,
        value: opts.dbPath ?? params.flags.outbox.db_path,
        defaultRelativePath: DEFAULT_DB_RELATIVE_PATH,
      });
      const store = createCheckpointStore({ dbPath });
      const workingFiles = normalizeString(opts.workingFiles)
        ? String(opts.workingFiles)
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
        : [];

      const record = store.save({
        taskId: String(opts.taskId ?? ""),
        intent: String(opts.intent ?? ""),
        state: parseJsonSafe(String(opts.state ?? "{}"), { raw: String(opts.state ?? "{}") }),
        expectedOutcome: String(opts.expectedOutcome ?? ""),
        workingFiles,
        ttlMs: toInt(opts.ttlMs, 0) > 0 ? toInt(opts.ttlMs, 0) : undefined,
      });

      console.log(JSON.stringify(record, null, 2));
      console.log(`effective_model: ${params.flags.p3.model}`);
    });

  checkpoint
    .command("restore")
    .requiredOption("--task-id <id>", "Checkpoint task id")
    .option("--db-path <path>", "Outbox sqlite path")
    .action(async (opts: CheckpointRestoreCliOptions) => {
      const dbPath = resolveCliPath({
        workspaceDir,
        value: opts.dbPath ?? params.flags.outbox.db_path,
        defaultRelativePath: DEFAULT_DB_RELATIVE_PATH,
      });
      const store = createCheckpointStore({ dbPath });
      const restored = store.restore({
        taskId: String(opts.taskId ?? ""),
      });

      if (!restored) {
        console.log("checkpoint_restore: miss_or_expired");
        console.log(`effective_model: ${params.flags.p3.model}`);
        return;
      }

      console.log(JSON.stringify(restored, null, 2));
      console.log(`effective_model: ${params.flags.p3.model}`);
    });

  root
    .command("index-check")
    .description("Validate MEMORY.md references and P1.5-lite index constraints")
    .option("--workspace <path>", "Workspace directory override")
    .option("--index-path <path>", "Custom MEMORY.md path")
    .option("--json", "Emit JSON output", false)
    .option("--db-path <path>", "Outbox sqlite path")
    .action(async (opts: IndexCheckCliOptions) => {
      const workspace = resolveWorkspaceDir(opts.workspace ?? workspaceDir);
      const result = await runIndexConsistencyCheck({
        workspaceDir: workspace,
        indexPath: normalizeString(opts.indexPath),
      });

      if (!result.ok) {
        const dbPath = resolveCliPath({
          workspaceDir,
          value: opts.dbPath ?? params.flags.outbox.db_path,
          defaultRelativePath: DEFAULT_DB_RELATIVE_PATH,
        });
        const outbox = createP3OutboxStore({ dbPath });
        outbox.incrementAuditCounters(new Date().toISOString().slice(0, 10), {
          indexConsistencyFailureCount:
            result.metrics.topicRuleViolationCount +
            result.metrics.missingReferenceCount +
            result.metrics.missingMetadataCount,
        });
      }

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`index_check_ok: ${String(result.ok)}`);
        console.log(`index_reference_count: ${String(result.metrics.indexReferenceCount)}`);
        console.log(`missing_reference_count: ${String(result.metrics.missingReferenceCount)}`);
        console.log(`missing_metadata_count: ${String(result.metrics.missingMetadataCount)}`);
        console.log(
          `topic_rule_violation_count: ${String(result.metrics.topicRuleViolationCount)}`,
        );
        for (const failure of result.failures) {
          console.log(`- ${failure}`);
        }
      }
      console.log(`effective_model: ${params.flags.p3.model}`);
    });

  root
    .command("report")
    .description("Write reconciliation report (JSON + human summary)")
    .option("--run-date <yyyy-mm-dd>", "Report date (UTC)")
    .option("--db-path <path>", "Outbox sqlite path")
    .option("--report-json <path>", "JSON report output")
    .option("--report-text <path>", "Text report output")
    .option("--model <id>", "Effective model shown in summary")
    .action(async (opts: ReportCliOptions) => {
      const dbPath = resolveCliPath({
        workspaceDir,
        value: opts.dbPath ?? params.flags.outbox.db_path,
        defaultRelativePath: DEFAULT_DB_RELATIVE_PATH,
      });
      const reportJsonPath = resolveReportOutputPath({
        workspaceDir,
        value: opts.reportJson,
        defaultRelativePath: DEFAULT_REPORT_JSON_RELATIVE_PATH,
      });
      const reportTextPath = resolveReportOutputPath({
        workspaceDir,
        value: opts.reportText,
        defaultRelativePath: DEFAULT_REPORT_TXT_RELATIVE_PATH,
      });
      const runDate = normalizeString(opts.runDate) ?? new Date().toISOString().slice(0, 10);
      const effectiveModel = normalizeString(opts.model) ?? params.flags.p3.model;

      const outbox = createP3OutboxStore({ dbPath });
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
      const weeklyGateFields = deriveWeeklyGateFields({
        outbox,
        outboxCounts,
        flags: params.flags,
      });

      const report = {
        runDate,
        generatedAt: new Date().toISOString(),
        effectiveModel,
        metrics,
        weekly_gate_fields: weeklyGateFields,
      };
      const summary = buildP3RunSummary({
        runDate,
        effectiveModel,
        metrics,
        weeklyGateFields,
      });

      await mkdir(path.dirname(reportJsonPath), { recursive: true });
      await writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      await writeFile(reportTextPath, `${summary}\n`, "utf8");

      console.log(summary);
    });

  root
    .command("retrieval-eval")
    .description("Evaluate retrieval quality (hit@k + structure coverage + alias recall)")
    .option("--dataset <path>", "Retrieval eval dataset path")
    .option("--out <path>", "Output JSON path")
    .option("--route <provider>", "Provider: graphiti|mem0", "graphiti")
    .option("--top-k <n>", "Top-k for hit metrics", "3")
    .action(async (opts: RetrievalEvalCliOptions) => {
      const datasetPath = resolveReportOutputPath({
        workspaceDir,
        value: opts.dataset,
        defaultRelativePath: DEFAULT_RETRIEVAL_DATASET_RELATIVE_PATH,
      });
      const outputPath = resolveReportOutputPath({
        workspaceDir,
        value: opts.out,
        defaultRelativePath: path.join(".openclaw", "memory-bridge-p3-retrieval-eval.json"),
      });
      const provider = normalizeString(opts.route) === "mem0" ? "mem0" : "graphiti";
      const topK = Math.max(1, toInt(opts.topK, 3));
      const mem0BaseUrl = params.flags.mem0.base_url ?? "http://127.0.0.1:8766";
      const graphitiBaseUrl = params.flags.graphiti.base_url ?? "http://127.0.0.1:8000";

      const rawDataset = await readFile(datasetPath, "utf8");
      const dataset = parseRetrievalDataset(parseJsonSafe(rawDataset, []));
      const client =
        provider === "mem0"
          ? createMem0Client({
              baseUrl: mem0BaseUrl,
              apiKey: params.flags.mem0.api_key,
              timeoutMs: params.flags.timeoutMs.search,
              getTimeoutMs: params.flags.timeoutMs.get,
            })
          : createGraphitiClient({
              baseUrl: graphitiBaseUrl,
              apiKey: params.flags.graphiti.api_key,
              timeoutMs: params.flags.timeoutMs.search,
              getTimeoutMs: params.flags.timeoutMs.get,
            });

      const summary = await runRetrievalEvaluation({
        dataset,
        client,
        topK,
      });

      const report = {
        provider,
        dataset_path: datasetPath,
        ...summary,
      };

      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

      console.log(`provider: ${provider}`);
      console.log(`sample_size: ${String(summary.sample_size)}`);
      console.log(`hit_at_1: ${String(summary.hit_at_1)}`);
      console.log(`hit_at_3: ${String(summary.hit_at_3)}`);
      console.log(`structure_coverage: ${String(summary.structure_coverage)}`);
      console.log(`alias_recall: ${String(summary.alias_recall)}`);
      console.log(JSON.stringify(report, null, 2));
    });

  root
    .command("ab-eval")
    .description("Run write-path A/B quality evaluation on fixed validation set")
    .option("--mode <mode>", "Evaluation mode: simulated|real", "simulated")
    .option("--dataset <path>", "Validation dataset path")
    .option("--model-a <id>", "Model A id", "gpt-5.1-codex-mini")
    .option("--model-b <id>", "Model B id", "gpt-5.3-codex")
    .option("--out <path>", "Output JSON path")
    .action(async (opts: AbCliOptions) => {
      const datasetPath = resolveCliPath({
        workspaceDir,
        value: opts.dataset,
        defaultRelativePath: DEFAULT_AB_DATASET_RELATIVE_PATH,
      });
      const outputPath = resolveCliPath({
        workspaceDir,
        value: opts.out,
        defaultRelativePath: path.join(".openclaw", "memory-bridge-p3-ab-eval.json"),
      });

      const validationSet = await loadValidationSet(datasetPath);
      const mode = normalizeString(opts.mode) === "real" ? "real" : "simulated";
      const report = await runWritePathAbEvaluation({
        mode,
        modelA: normalizeString(opts.modelA) ?? "gpt-5.1-codex-mini",
        modelB: normalizeString(opts.modelB) ?? "gpt-5.3-codex",
        validationSet,
        realOptions:
          mode === "real"
            ? {
                mem0BaseUrl: params.flags.mem0.base_url ?? "http://127.0.0.1:8766",
                mem0ApiKey: params.flags.mem0.api_key,
                mem0Path: params.flags.p3.mem0_write_path || "/memories",
                graphitiBaseUrl: params.flags.graphiti.base_url ?? "http://127.0.0.1:8000",
                graphitiApiKey: params.flags.graphiti.api_key,
                graphitiPath:
                  params.flags.p3.graphiti_write_path === "/items"
                    ? "/messages"
                    : params.flags.p3.graphiti_write_path,
                timeoutMs: params.flags.p3.write_timeout_ms,
                maxAttempts: params.flags.p3.max_attempts,
                baseBackoffMs: params.flags.p3.base_backoff_ms,
                maxBackoffMs: params.flags.p3.max_backoff_ms,
                jitterRatio: 0,
                lowConfidenceThreshold: params.flags.p3.low_confidence_threshold,
              }
            : undefined,
      });

      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

      console.log(`evaluation_mode: ${report.evaluationMode}`);
      console.log(`data_source: ${report.dataSource}`);
      console.log(`cost_assumption: ${report.costAssumption}`);
      console.log(`ab_eval_sample_size: ${String(report.sampleSize)}`);
      console.log(`model_a: ${report.modelA.model}`);
      console.log(`model_b: ${report.modelB.model}`);
      console.log(JSON.stringify(report, null, 2));
    });

  root
    .command("rollback-hints")
    .description("Print emergency rollback switches for P3 write governance")
    .action(() => {
      console.log("rollback_read_mode: local");
      console.log("rollback_write_mode: off");
      console.log("rollback_worker: pause memory-bridge-p3 worker/service");
      console.log("rollback_outbox: preserved (safe for replay)");
      console.log(`effective_model: ${params.flags.p3.model}`);
    });
}
