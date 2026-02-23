import { createHash } from "node:crypto";
import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { BridgeFactRecord, DailyScanAuditRecord } from "./types.js";

type DailyScanFileEntry = {
  absolutePath: string;
  relativePath: string;
  dateKey: string;
};

export type DailyScanOptions = {
  workspaceDir: string;
  memoryDir?: string;
  days: number;
  dryRun: boolean;
  now?: Date;
  candidateSink?: DailyScanCandidateSink;
  auditStore: BackfillAuditStore;
};

export type DailyScanCandidateSink = {
  enqueue: (candidates: BridgeFactRecord[]) => Promise<void>;
};

export type BackfillAuditStore = {
  append: (record: DailyScanAuditRecord) => Promise<void>;
};

export type InMemoryBackfillAuditStore = BackfillAuditStore & {
  records: DailyScanAuditRecord[];
};

export type DailyScanResult = {
  scannedFiles: string[];
  candidates: BridgeFactRecord[];
  audit: DailyScanAuditRecord;
};

const MEMORY_FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.md$/;

const normalizeDays = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 1;
  }

  const normalized = Math.floor(value);
  return normalized < 1 ? 1 : normalized;
};

const startOfUtcDay = (value: Date): Date => {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
};

const resolveWindowStart = (params: { now: Date; days: number }): Date => {
  const nowDay = startOfUtcDay(params.now);
  const backfillDays = normalizeDays(params.days) - 1;
  return new Date(nowDay.getTime() - backfillDays * 24 * 60 * 60 * 1000);
};

const parseConfidence = (value: string): { confidence: number; cleanedValue: string } => {
  const match = value.match(/\[\s*confidence\s*=\s*(\d+(?:\.\d+)?)\s*\]/i);
  if (!match) {
    return {
      confidence: 0.75,
      cleanedValue: value.trim(),
    };
  }

  const parsed = Number.parseFloat(match[1] ?? "");
  const confidence = Number.isFinite(parsed)
    ? Math.max(0, Math.min(1, Math.round(parsed * 1000) / 1000))
    : 0.75;

  return {
    confidence,
    cleanedValue: value.replace(match[0], "").trim(),
  };
};

const normalizeFactKey = (value: string): string => {
  const trimmed = value.trim().replace(/^[-*]\s*/, "");
  return trimmed.toLowerCase().replace(/\s+/g, "_");
};

const buildMemoryId = (parts: string[]): string => {
  return createHash("sha1").update(parts.join("|"), "utf8").digest("hex").slice(0, 16);
};

const parseLineToCandidate = (params: {
  line: string;
  lineNumber: number;
  dateKey: string;
  relativePath: string;
  ingestTime: string;
}): BridgeFactRecord | null => {
  const trimmed = params.line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
    return null;
  }

  const factKey = normalizeFactKey(trimmed.slice(0, separatorIndex));
  const rawValue = trimmed.slice(separatorIndex + 1).trim();
  const { confidence, cleanedValue } = parseConfidence(rawValue);

  if (!factKey || !cleanedValue) {
    return null;
  }

  return {
    memory_id: buildMemoryId([params.dateKey, String(params.lineNumber), factKey, cleanedValue]),
    fact_key: factKey,
    fact_value: cleanedValue,
    ttl_class: "daily_scan",
    confidence,
    status: "active",
    source_event_id: `${params.dateKey}:${params.lineNumber}`,
    detail_path: params.relativePath,
    trigger_keywords: [],
    active_context: false,
    event_time: `${params.dateKey}T00:00:00.000Z`,
    ingest_time: params.ingestTime,
  };
};

const listDailyMemoryFiles = async (params: {
  memoryDir: string;
  workspaceDir: string;
  now: Date;
  days: number;
}): Promise<DailyScanFileEntry[]> => {
  let entries: string[];
  try {
    entries = await readdir(params.memoryDir);
  } catch {
    return [];
  }

  const windowStart = resolveWindowStart({ now: params.now, days: params.days }).getTime();
  const nowStart = startOfUtcDay(params.now).getTime();

  return entries
    .map((name) => {
      const match = name.match(MEMORY_FILE_PATTERN);
      if (!match) {
        return null;
      }

      const dateKey = match[1] ?? "";
      const timestamp = Date.parse(`${dateKey}T00:00:00.000Z`);
      if (!Number.isFinite(timestamp)) {
        return null;
      }

      if (timestamp < windowStart || timestamp > nowStart) {
        return null;
      }

      const absolutePath = path.join(params.memoryDir, name);

      return {
        absolutePath,
        relativePath: path.relative(params.workspaceDir, absolutePath),
        dateKey,
      } satisfies DailyScanFileEntry;
    })
    .filter((entry): entry is DailyScanFileEntry => Boolean(entry))
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));
};

export function createInMemoryBackfillAuditStore(): InMemoryBackfillAuditStore {
  const records: DailyScanAuditRecord[] = [];

  return {
    records,
    async append(record) {
      records.push(record);
    },
  };
}

export function createJsonlBackfillAuditStore(filePath: string): BackfillAuditStore {
  return {
    async append(record) {
      await mkdir(path.dirname(filePath), { recursive: true });
      await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
    },
  };
}

export async function runDailyScan(options: DailyScanOptions): Promise<DailyScanResult> {
  const now = options.now ?? new Date();
  const memoryDir = options.memoryDir ?? path.join(options.workspaceDir, "memory");
  const days = normalizeDays(options.days);
  const ingestTime = now.toISOString();

  const files = await listDailyMemoryFiles({
    memoryDir,
    workspaceDir: options.workspaceDir,
    now,
    days,
  });

  const candidates: BridgeFactRecord[] = [];

  for (const file of files) {
    const content = await readFile(file.absolutePath, "utf8");
    const lines = content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const candidate = parseLineToCandidate({
        line: lines[index] ?? "",
        lineNumber: index + 1,
        dateKey: file.dateKey,
        relativePath: file.relativePath,
        ingestTime,
      });

      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  const shouldEnqueue = !options.dryRun && Boolean(options.candidateSink);

  if (shouldEnqueue && options.candidateSink && candidates.length > 0) {
    await options.candidateSink.enqueue(candidates);
  }

  const audit: DailyScanAuditRecord = {
    runId: `${ingestTime}-${days}`,
    createdAt: ingestTime,
    dryRun: options.dryRun,
    days,
    scannedFiles: files.map((file) => file.relativePath),
    metrics: {
      candidateCount: candidates.length,
      scannedFileCount: files.length,
      enqueuedCount: shouldEnqueue ? candidates.length : 0,
    },
  };

  await options.auditStore.append(audit);

  return {
    scannedFiles: audit.scannedFiles,
    candidates,
    audit,
  };
}
