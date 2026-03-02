import { readFile } from "node:fs/promises";
import path from "node:path";

type Gate4DatasetSample = {
  id: string;
  bucket: "exact_id" | "decision_reason" | "temporal_relation" | "project_context";
  query: string;
  aliases?: string[];
  expected_ids: string[];
  expected_structures?: string[];
};

const DEFAULT_GRAPHITI_BASE_URL = "http://127.0.0.1:8000";

const readJson = async <T>(filePath: string): Promise<T> => {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const main = async (): Promise<void> => {
  const datasetPath = path.resolve(
    process.env.DATASET_PATH ??
      process.argv[2] ??
      "analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day2/inputs/retrieval-gate4-dataset.v1.json",
  );

  const graphitiBaseUrl = (process.env.GRAPHITI_BASE_URL ?? DEFAULT_GRAPHITI_BASE_URL).replace(
    /\/+$/,
    "",
  );

  const dataset = await readJson<Gate4DatasetSample[]>(datasetPath);
  if (!Array.isArray(dataset)) {
    process.stderr.write(`dataset is not an array: ${datasetPath}\n`);
    process.exitCode = 2;
    return;
  }

  const expectedIds: string[] = [];
  const seen = new Set<string>();

  for (const sample of dataset) {
    if (!sample || typeof sample !== "object") {
      continue;
    }
    for (const id of sample.expected_ids ?? []) {
      const normalized = normalizeString(id);
      if (!normalized) {
        continue;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      expectedIds.push(normalized);
    }
  }

  const failures: Array<{ id: string; status: number; statusText: string }> = [];
  let ok = 0;

  for (const id of expectedIds) {
    const url = `${graphitiBaseUrl}/entity-edge/${encodeURIComponent(id)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (response.ok) {
      ok += 1;
      continue;
    }

    failures.push({ id, status: response.status, statusText: response.statusText });
  }

  const report = {
    generated_at: new Date().toISOString(),
    dataset_path: datasetPath,
    graphiti_base_url: graphitiBaseUrl,
    unique_expected_id_count: expectedIds.length,
    ok_count: ok,
    fail_count: failures.length,
    failures: failures.slice(0, 50),
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
};

await main();
