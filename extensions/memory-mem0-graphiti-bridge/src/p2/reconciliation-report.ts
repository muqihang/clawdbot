import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReconciliationMetrics } from "./types.js";

export type ReconciliationReport = {
  runDate: string;
  runId?: string;
  generatedAt: string;
  metrics: ReconciliationMetrics;
};

export type ReconciliationReportInput = {
  runDate: string;
  runId?: string;
  generatedAt?: string;
  metrics: ReconciliationMetrics;
};

const toNonNegativeInt = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : 0;
};

export function buildReconciliationMetrics(
  input: Partial<ReconciliationMetrics>,
): ReconciliationMetrics {
  return {
    candidateCount: toNonNegativeInt(input.candidateCount ?? 0),
    addedCount: toNonNegativeInt(input.addedCount ?? 0),
    duplicateSkippedCount: toNonNegativeInt(input.duplicateSkippedCount ?? 0),
    conflictCount: toNonNegativeInt(input.conflictCount ?? 0),
    sensitiveInterceptedCount: toNonNegativeInt(input.sensitiveInterceptedCount ?? 0),
    indexConsistencyFailureCount: toNonNegativeInt(input.indexConsistencyFailureCount ?? 0),
  };
}

export function buildReconciliationReport(input: ReconciliationReportInput): ReconciliationReport {
  return {
    runDate: input.runDate,
    runId: input.runId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    metrics: buildReconciliationMetrics(input.metrics),
  };
}

export function formatReconciliationReport(report: ReconciliationReport): string {
  const lines = [
    `reconciliation_report_date: ${report.runDate}`,
    `generated_at: ${report.generatedAt}`,
  ];

  if (report.runId) {
    lines.push(`run_id: ${report.runId}`);
  }

  lines.push(`candidate_count: ${report.metrics.candidateCount}`);
  lines.push(`added_count: ${report.metrics.addedCount}`);
  lines.push(`duplicate_skipped_count: ${report.metrics.duplicateSkippedCount}`);
  lines.push(`conflict_count: ${report.metrics.conflictCount}`);
  lines.push(`sensitive_intercepted_count: ${report.metrics.sensitiveInterceptedCount}`);
  lines.push(`index_consistency_failure_count: ${report.metrics.indexConsistencyFailureCount}`);

  return lines.join("\n");
}

export async function writeReconciliationReport(
  filePath: string,
  report: ReconciliationReport,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export async function readReconciliationReport(
  filePath: string,
): Promise<ReconciliationReport | null> {
  try {
    const content = await readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    const runDate = typeof record.runDate === "string" ? record.runDate : undefined;
    const generatedAt = typeof record.generatedAt === "string" ? record.generatedAt : undefined;
    const metricsRaw =
      record.metrics && typeof record.metrics === "object" && !Array.isArray(record.metrics)
        ? (record.metrics as Record<string, unknown>)
        : {};

    if (!runDate || !generatedAt) {
      return null;
    }

    return {
      runDate,
      runId: typeof record.runId === "string" ? record.runId : undefined,
      generatedAt,
      metrics: buildReconciliationMetrics({
        candidateCount:
          typeof metricsRaw.candidateCount === "number" ? metricsRaw.candidateCount : undefined,
        addedCount: typeof metricsRaw.addedCount === "number" ? metricsRaw.addedCount : undefined,
        duplicateSkippedCount:
          typeof metricsRaw.duplicateSkippedCount === "number"
            ? metricsRaw.duplicateSkippedCount
            : undefined,
        conflictCount:
          typeof metricsRaw.conflictCount === "number" ? metricsRaw.conflictCount : undefined,
        sensitiveInterceptedCount:
          typeof metricsRaw.sensitiveInterceptedCount === "number"
            ? metricsRaw.sensitiveInterceptedCount
            : undefined,
        indexConsistencyFailureCount:
          typeof metricsRaw.indexConsistencyFailureCount === "number"
            ? metricsRaw.indexConsistencyFailureCount
            : undefined,
      }),
    };
  } catch {
    return null;
  }
}
