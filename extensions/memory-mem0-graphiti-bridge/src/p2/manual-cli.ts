import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import {
  resolveFactConflicts,
  type ConflictResolutionResult,
  type PendingReviewQueueItem,
} from "./conflict-resolver.js";
import { createJsonlBackfillAuditStore, runDailyScan } from "./daily-scan.js";
import {
  buildReconciliationMetrics,
  buildReconciliationReport,
  formatReconciliationReport,
  readReconciliationReport,
  writeReconciliationReport,
  type ReconciliationReport,
} from "./reconciliation-report.js";
import type { BridgeFactRecord } from "./types.js";

type PluginLogger = OpenClawPluginApi["logger"];

type P2StateSnapshot = {
  records: BridgeFactRecord[];
  reviewQueue: PendingReviewQueueItem[];
};

export type RunDailyScanBackfillOptions = {
  workspaceDir: string;
  days: number;
  dryRun: boolean;
  memoryDir?: string;
  lowConfidenceThreshold: number;
  stateFile: string;
  auditFile: string;
  reportFile: string;
  sensitiveInterceptedCount: number;
  indexConsistencyFailureCount: number;
};

export type DailyScanBackfillResult = {
  conflict: ConflictResolutionResult;
  report: ReconciliationReport;
};

const DEFAULT_STATE_RELATIVE_PATH = path.join(".openclaw", "memory-bridge-p2-state.json");
const DEFAULT_AUDIT_RELATIVE_PATH = path.join(".openclaw", "memory-bridge-p2-backfill.audit.jsonl");
const DEFAULT_REPORT_RELATIVE_PATH = path.join(".openclaw", "memory-bridge-p2-reconciliation.json");

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parsePositiveInt = (value: unknown, fallback: number): number => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed < 0 ? 0 : parsed;
};

const parseThreshold = (value: unknown, fallback: number): number => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (parsed <= 0) {
    return 0;
  }
  if (parsed >= 1) {
    return 1;
  }

  return parsed;
};

const resolveWorkspaceDir = (value?: string): string => {
  return value ? path.resolve(value) : process.cwd();
};

const resolveCliPath = (params: {
  workspaceDir: string;
  rawPath: unknown;
  defaultRelativePath: string;
}): string => {
  const normalized = normalizeString(params.rawPath);
  if (!normalized) {
    return path.join(params.workspaceDir, params.defaultRelativePath);
  }

  return path.isAbsolute(normalized)
    ? normalized
    : path.join(params.workspaceDir, normalized.replace(/^\.\//, ""));
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
};

const parseFactRecord = (value: unknown): BridgeFactRecord | null => {
  if (!isRecord(value)) {
    return null;
  }

  const triggerKeywords = Array.isArray(value.trigger_keywords)
    ? value.trigger_keywords.filter((keyword): keyword is string => typeof keyword === "string")
    : [];

  const status =
    value.status === "active" || value.status === "superseded" || value.status === "pending_review"
      ? value.status
      : null;

  if (
    typeof value.memory_id !== "string" ||
    typeof value.fact_key !== "string" ||
    typeof value.fact_value !== "string" ||
    typeof value.ttl_class !== "string" ||
    typeof value.confidence !== "number" ||
    !status ||
    typeof value.source_event_id !== "string" ||
    typeof value.detail_path !== "string" ||
    typeof value.active_context !== "boolean" ||
    typeof value.event_time !== "string" ||
    typeof value.ingest_time !== "string"
  ) {
    return null;
  }

  return {
    memory_id: value.memory_id,
    fact_key: value.fact_key,
    fact_value: value.fact_value,
    ttl_class: value.ttl_class,
    expires_at: typeof value.expires_at === "string" ? value.expires_at : undefined,
    last_confirmed_at:
      typeof value.last_confirmed_at === "string" ? value.last_confirmed_at : undefined,
    confidence: value.confidence,
    status,
    source_event_id: value.source_event_id,
    supersedes_id: typeof value.supersedes_id === "string" ? value.supersedes_id : undefined,
    detail_path: value.detail_path,
    trigger_keywords: triggerKeywords,
    active_context: value.active_context,
    event_time: value.event_time,
    ingest_time: value.ingest_time,
  };
};

const parseReviewQueueItem = (value: unknown): PendingReviewQueueItem | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.candidateId !== "string" ||
    typeof value.factKey !== "string" ||
    typeof value.existingId !== "string" ||
    value.reason !== "low_confidence_conflict" ||
    typeof value.confidence !== "number" ||
    typeof value.createdAt !== "string"
  ) {
    return null;
  }

  return {
    candidateId: value.candidateId,
    factKey: value.factKey,
    existingId: value.existingId,
    reason: "low_confidence_conflict",
    confidence: value.confidence,
    createdAt: value.createdAt,
  };
};

const loadStateSnapshot = async (stateFile: string): Promise<P2StateSnapshot> => {
  try {
    const content = await readFile(stateFile, "utf8");
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed)) {
      return { records: [], reviewQueue: [] };
    }

    const records = Array.isArray(parsed.records)
      ? parsed.records
          .map((record) => parseFactRecord(record))
          .filter((record): record is BridgeFactRecord => Boolean(record))
      : [];

    const reviewQueue = Array.isArray(parsed.reviewQueue)
      ? parsed.reviewQueue
          .map((entry) => parseReviewQueueItem(entry))
          .filter((entry): entry is PendingReviewQueueItem => Boolean(entry))
      : [];

    return {
      records,
      reviewQueue,
    };
  } catch {
    return {
      records: [],
      reviewQueue: [],
    };
  }
};

const writeStateSnapshot = async (stateFile: string, state: P2StateSnapshot): Promise<void> => {
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
};

export async function runDailyScanBackfill(
  options: RunDailyScanBackfillOptions,
): Promise<DailyScanBackfillResult> {
  const currentState = await loadStateSnapshot(options.stateFile);

  const scanResult = await runDailyScan({
    workspaceDir: options.workspaceDir,
    memoryDir: options.memoryDir,
    days: options.days,
    dryRun: options.dryRun,
    auditStore: createJsonlBackfillAuditStore(options.auditFile),
  });

  const conflict = resolveFactConflicts({
    existingRecords: currentState.records,
    candidates: scanResult.candidates,
    lowConfidenceThreshold: options.lowConfidenceThreshold,
    sensitiveInterceptedCount: options.sensitiveInterceptedCount,
    indexConsistencyFailureCount: options.indexConsistencyFailureCount,
  });

  const report = buildReconciliationReport({
    runDate: new Date().toISOString().slice(0, 10),
    runId: scanResult.audit.runId,
    metrics: buildReconciliationMetrics(conflict.metrics),
  });

  await writeReconciliationReport(options.reportFile, report);

  if (!options.dryRun) {
    await writeStateSnapshot(options.stateFile, {
      records: conflict.records,
      reviewQueue: [...currentState.reviewQueue, ...conflict.reviewQueue],
    });
  }

  return {
    conflict,
    report,
  };
}

type DailyScanCliOptions = {
  days?: string;
  dryRun?: boolean;
  memoryDir?: string;
  stateFile?: string;
  auditFile?: string;
  reportFile?: string;
  lowConfidenceThreshold?: string;
  sensitiveIntercepted?: string;
  indexFailures?: string;
};

type ReconciliationCliOptions = {
  reportFile?: string;
};

export function registerMemoryBridgeP2Cli(params: {
  program: Command;
  workspaceDir?: string;
  logger: PluginLogger;
}): void {
  const workspaceDir = resolveWorkspaceDir(params.workspaceDir);

  const root = params.program
    .command("memory-bridge-p2")
    .description("Manual P2 backfill/reconciliation commands for mem0+graphiti bridge");

  root
    .command("daily-scan")
    .description("Run offline daily scan backfill and emit reconciliation report")
    .option("--days <days>", "Scan window in recent days", "3")
    .option("--dry-run", "Scan and report without persisting state", false)
    .option("--memory-dir <path>", "Custom memory directory")
    .option("--state-file <path>", "Local state snapshot path")
    .option("--audit-file <path>", "Audit jsonl path")
    .option("--report-file <path>", "Reconciliation report path")
    .option("--low-confidence-threshold <n>", "Conflict pending-review threshold", "0.7")
    .option("--sensitive-intercepted <n>", "Sensitive interception count", "0")
    .option("--index-failures <n>", "Index consistency failure count", "0")
    .action(async (opts: DailyScanCliOptions) => {
      const days = parsePositiveInt(opts.days, 3);
      const lowConfidenceThreshold = parseThreshold(opts.lowConfidenceThreshold, 0.7);

      const result = await runDailyScanBackfill({
        workspaceDir,
        days,
        dryRun: Boolean(opts.dryRun),
        memoryDir: normalizeString(opts.memoryDir)
          ? resolveCliPath({
              workspaceDir,
              rawPath: opts.memoryDir,
              defaultRelativePath: "memory",
            })
          : undefined,
        lowConfidenceThreshold,
        stateFile: resolveCliPath({
          workspaceDir,
          rawPath: opts.stateFile,
          defaultRelativePath: DEFAULT_STATE_RELATIVE_PATH,
        }),
        auditFile: resolveCliPath({
          workspaceDir,
          rawPath: opts.auditFile,
          defaultRelativePath: DEFAULT_AUDIT_RELATIVE_PATH,
        }),
        reportFile: resolveCliPath({
          workspaceDir,
          rawPath: opts.reportFile,
          defaultRelativePath: DEFAULT_REPORT_RELATIVE_PATH,
        }),
        sensitiveInterceptedCount: parsePositiveInt(opts.sensitiveIntercepted, 0),
        indexConsistencyFailureCount: parsePositiveInt(opts.indexFailures, 0),
      });

      console.log(formatReconciliationReport(result.report));
      if (opts.dryRun) {
        console.log("dry_run: true");
      }

      params.logger.info(
        `memory-mem0-graphiti-bridge: p2 daily-scan completed (dry_run=${String(Boolean(opts.dryRun))}, candidate_count=${String(result.report.metrics.candidateCount)})`,
      );
    });

  root
    .command("reconciliation-report")
    .description("Print latest reconciliation report")
    .option("--report-file <path>", "Reconciliation report path")
    .action(async (opts: ReconciliationCliOptions) => {
      const reportPath = resolveCliPath({
        workspaceDir,
        rawPath: opts.reportFile,
        defaultRelativePath: DEFAULT_REPORT_RELATIVE_PATH,
      });

      const report = await readReconciliationReport(reportPath);
      if (!report) {
        console.log(`reconciliation report not found: ${reportPath}`);
        return;
      }

      console.log(formatReconciliationReport(report));
    });
}
