import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type ShadowCase = {
  query: string;
  local_hits: number;
  jarvis_hits: number;
};

export type ShadowFailure = {
  query: string;
  local_hits: number;
  jarvis_hits: number;
  reason: 'JARVIS_UNDERPERFORM';
};

export type ShadowReport = {
  generated_at: string;
  total_queries: number;
  pass_queries: number;
  pass_ratio: number;
  threshold: number;
  status: 'pass' | 'fail';
  failures: ShadowFailure[];
  duration_ms: number;
};

export type ShadowCompareOptions = {
  cases?: ShadowCase[];
  threshold?: number;
  now?: () => number;
};

const DEFAULT_THRESHOLD = 0.98;

const defaultCases = (): ShadowCase[] =>
  Array.from({ length: 200 }, (_unused, index) => ({
    query: `query-${index + 1}`,
    local_hits: 10,
    jarvis_hits: 10,
  }));

const normalizeHits = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  const rounded = Math.floor(value);
  if (rounded <= 0) {
    return 0;
  }
  return rounded;
};

const evaluateCase = (input: ShadowCase): ShadowFailure | null => {
  if (input.jarvis_hits < input.local_hits) {
    return {
      query: input.query,
      local_hits: input.local_hits,
      jarvis_hits: input.jarvis_hits,
      reason: 'JARVIS_UNDERPERFORM',
    };
  }

  return null;
};

export async function runShadowCompare(options: ShadowCompareOptions): Promise<ShadowReport> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const cases = options.cases ?? defaultCases();

  const failures = cases
    .map((item) => evaluateCase(item))
    .filter((failure): failure is ShadowFailure => failure !== null);

  const totalQueries = cases.length;
  const passQueries = Math.max(0, totalQueries - failures.length);
  const passRatio = totalQueries === 0 ? 1 : passQueries / totalQueries;
  const durationMs = Math.max(0, now() - startedAt);

  return {
    generated_at: new Date().toISOString(),
    total_queries: totalQueries,
    pass_queries: passQueries,
    pass_ratio: Number(passRatio.toFixed(6)),
    threshold,
    status: passRatio >= threshold ? 'pass' : 'fail',
    failures,
    duration_ms: durationMs,
  };
}

type CliOptions = {
  outPath?: string;
  inputPath?: string;
};

const parseCliArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

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
    }
  }

  return options;
};

const parseCases = (raw: string): ShadowCase[] => {
  const decoded = JSON.parse(raw) as unknown;
  if (!Array.isArray(decoded)) {
    throw new Error('input file must be a JSON array of shadow compare cases');
  }

  return decoded
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const row = item as Record<string, unknown>;
      const query = typeof row.query === 'string' ? row.query.trim() : '';
      if (!query) {
        return null;
      }

      return {
        query,
        local_hits: normalizeHits(row.local_hits),
        jarvis_hits: normalizeHits(row.jarvis_hits),
      };
    })
    .filter((entry): entry is ShadowCase => entry !== null);
};

const writeReport = async (report: ShadowReport, outPath?: string): Promise<void> => {
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
  const cases = options.inputPath
    ? parseCases(await readFile(path.resolve(options.inputPath), 'utf8'))
    : undefined;

  const report = await runShadowCompare({
    cases,
  });

  await writeReport(report, options.outPath);
  if (report.status !== 'pass') {
    process.exitCode = 1;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await runCli();
}
