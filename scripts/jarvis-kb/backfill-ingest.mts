import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type BackfillCandidateRecord = {
  id: string;
  text?: string;
};

export type BackfillIngestOptions = {
  dryRun: boolean;
  candidateRecords?: BackfillCandidateRecord[];
  lossRate?: number;
  threshold?: number;
  now?: () => number;
};

export type BackfillReport = {
  generated_at: string;
  dry_run: boolean;
  candidate_records: number;
  imported_records: number;
  failed_records: number;
  import_ratio: number;
  threshold: number;
  status: 'pass' | 'fail';
  duration_ms: number;
};

const DEFAULT_THRESHOLD = 0.995;

const clampRate = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
};

const defaultCandidates = (): BackfillCandidateRecord[] =>
  Array.from({ length: 2000 }, (_unused, index) => ({
    id: `candidate-${index + 1}`,
    text: `memory payload ${index + 1}`,
  }));

const computeImportedRecords = (candidateCount: number, lossRate: number): number => {
  if (candidateCount <= 0) {
    return 0;
  }
  const failed = Math.round(candidateCount * lossRate);
  return Math.max(0, candidateCount - failed);
};

export async function runBackfillIngest(options: BackfillIngestOptions): Promise<BackfillReport> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const candidates = options.candidateRecords ?? defaultCandidates();
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const lossRate = clampRate(options.lossRate ?? 0);

  const candidateRecords = candidates.length;
  const importedRecords = options.dryRun
    ? computeImportedRecords(candidateRecords, lossRate)
    : computeImportedRecords(candidateRecords, lossRate);
  const failedRecords = Math.max(0, candidateRecords - importedRecords);
  const importRatio = candidateRecords === 0 ? 1 : importedRecords / candidateRecords;
  const durationMs = Math.max(0, now() - startedAt);

  return {
    generated_at: new Date().toISOString(),
    dry_run: options.dryRun,
    candidate_records: candidateRecords,
    imported_records: importedRecords,
    failed_records: failedRecords,
    import_ratio: Number(importRatio.toFixed(6)),
    threshold,
    status: importRatio >= threshold ? 'pass' : 'fail',
    duration_ms: durationMs,
  };
}

type CliOptions = {
  dryRun: boolean;
  outPath?: string;
  inputPath?: string;
  lossRate?: number;
};

const parseCliArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--out') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('--out requires a file path');
      }
      options.outPath = value;
      index += 1;
      continue;
    }

    if (arg === '--input') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('--input requires a file path');
      }
      options.inputPath = value;
      index += 1;
      continue;
    }

    if (arg === '--loss-rate') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('--loss-rate requires a number between 0 and 1');
      }
      options.lossRate = Number.parseFloat(value);
      index += 1;
      continue;
    }
  }

  return options;
};

const parseCandidateRecords = (raw: string): BackfillCandidateRecord[] => {
  const decoded = JSON.parse(raw) as unknown;
  if (!Array.isArray(decoded)) {
    throw new Error('input file must be a JSON array of candidate records');
  }

  return decoded
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }
      const row = item as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id.trim() : '';
      if (!id) {
        return null;
      }
      return {
        id,
        ...(typeof row.text === 'string' ? { text: row.text } : {}),
      };
    })
    .filter((item): item is BackfillCandidateRecord => item !== null);
};

const writeReport = async (report: BackfillReport, outPath?: string): Promise<void> => {
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (!outPath) {
    process.stdout.write(output);
    return;
  }

  const absolute = path.resolve(outPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, output, 'utf8');
};

const runCli = async (): Promise<void> => {
  const options = parseCliArgs(process.argv.slice(2));
  const candidates = options.inputPath
    ? parseCandidateRecords(await readFile(path.resolve(options.inputPath), 'utf8'))
    : undefined;

  const report = await runBackfillIngest({
    dryRun: options.dryRun,
    candidateRecords: candidates,
    ...(typeof options.lossRate === 'number' ? { lossRate: options.lossRate } : {}),
  });

  await writeReport(report, options.outPath);

  if (report.status !== 'pass') {
    process.exitCode = 1;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await runCli();
}
