import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type GraphitiEdge = {
  uuid: string;
  name?: string | null;
  fact?: string | null;
};

type GraphitiSearchResponse = {
  facts?: GraphitiEdge[];
  episodes?: Array<Record<string, unknown>>;
  nodes?: Array<Record<string, unknown>>;
};

type DatasetSample = {
  id: string;
  query: string;
  aliases: string[];
  expected_ids: string[];
  expected_structures: Array<"facts">;
};

const parseCsvList = (value: string | undefined): string[] | null => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  const parts = trimmed
    .split(/[,\n]/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : null;
};

const asTrimmedString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const containsCjk = (value: string): boolean => /[\u4e00-\u9fff]/.test(value);

const truncateWords = (value: string, maxWords: number): string => {
  const words = value
    .split(/\s+/g)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
  return words.slice(0, maxWords).join(" ");
};

const truncateChars = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) {
    return value;
  }
  return value.slice(0, Math.max(0, maxChars)).trim();
};

const normalizeQueryKey = (value: string): string => value.trim().toLowerCase();

const stableCompareAscii = (left: string, right: string): number => {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
};

const fetchJson = async (url: string, init: RequestInit, timeoutMs: number): Promise<unknown> => {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text) as unknown;
};

const graphitiBaseUrl = process.env.GRAPHITI_BASE_URL ?? "http://127.0.0.1:8000";
const graphitiGroupIds = parseCsvList(process.env.GRAPHITI_GROUP_IDS) ?? [
  "agent_main_main",
  "openclaw-backfill-canonical",
];
const maxFacts = Math.max(10, Number.parseInt(process.env.GRAPHITI_MAX_FACTS ?? "50", 10) || 50);
const timeoutMs = Math.max(
  1000,
  Number.parseInt(process.env.GRAPHITI_TIMEOUT_MS ?? "20000", 10) || 20000,
);
const targetSize = Math.max(30, Number.parseInt(process.env.DATASET_TARGET_SIZE ?? "34", 10) || 34);

const scriptDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const evidenceDir = path.resolve(scriptDir, "..");
const inputsDir = path.join(evidenceDir, "inputs");

const datasetPath = path.join(inputsDir, "retrieval-dataset.v2.json");
const notesPath = path.join(evidenceDir, "dataset-notes.md");
const buildLogPath = path.join(inputsDir, "retrieval-dataset.v2.build.log");
const candidatesPath = path.join(inputsDir, "retrieval-dataset.v2.candidates.json");

const seeds: string[] = [
  // Agent main (Chinese + English)
  "assistant(assistant)",
  "SoE",
  "System of Engagement",
  "SoR",
  "System of Record",
  "经营 OS",
  "北极星",
  "ERP",
  "CRM",
  "SOP",
  // Backfill anchors
  "Gate-2",
  "PRD",
  "PRFAQ",
  "BMAD",
  "text-embedding-v4",
  "Telegram",
  "sub2api",
  "graphiti",
  "mem0",
];

const searchOnce = async (query: string): Promise<GraphitiSearchResponse> => {
  const requestBody: Record<string, unknown> = {
    query,
    max_facts: maxFacts,
  };

  if (graphitiGroupIds.length > 0) {
    requestBody.group_ids = graphitiGroupIds;
  }

  const payload = await fetchJson(
    `${graphitiBaseUrl.replace(/\/+$/, "")}/search`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    },
    timeoutMs,
  );

  const record = asRecord(payload);
  if (!record) {
    return {};
  }

  const facts = Array.isArray(record.facts)
    ? (
        record.facts.map((item) => {
          const itemRecord = asRecord(item);
          if (!itemRecord) {
            return null;
          }
          const uuid = asTrimmedString(itemRecord.uuid);
          if (!uuid) {
            return null;
          }
          return {
            uuid,
            name: asTrimmedString(itemRecord.name),
            fact: asTrimmedString(itemRecord.fact),
          } satisfies GraphitiEdge;
        }) as Array<GraphitiEdge | null>
      ).filter((item): item is GraphitiEdge => Boolean(item))
    : [];

  return { facts };
};

const fetchEdge = async (uuid: string): Promise<GraphitiEdge | null> => {
  try {
    const payload = await fetchJson(
      `${graphitiBaseUrl.replace(/\/+$/, "")}/entity-edge/${encodeURIComponent(uuid)}`,
      { method: "GET", headers: { accept: "application/json" } },
      timeoutMs,
    );
    const record = asRecord(payload);
    if (!record) {
      return null;
    }
    const resolvedUuid = asTrimmedString(record.uuid) ?? uuid;
    const fact = asTrimmedString(record.fact);
    if (!fact) {
      return null;
    }
    return {
      uuid: resolvedUuid,
      name: asTrimmedString(record.name),
      fact,
    };
  } catch {
    return null;
  }
};

const isAllowedFact = (fact: string): boolean => {
  const lowered = fact.toLowerCase();
  if (fact.includes("/Users/") || fact.includes("C:\\\\Users\\\\")) {
    return false;
  }
  if (lowered.includes("password") || lowered.includes("api_key=")) {
    return false;
  }
  return fact.trim().length >= 12 && fact.trim().length <= 280;
};

const buildAliasFromFact = (fact: string): string => {
  if (containsCjk(fact)) {
    return truncateChars(fact, 24);
  }
  return truncateWords(fact, 8);
};

const chooseAlias = (params: { fact: string; seed: string }): string | null => {
  const candidates = [params.seed.trim(), buildAliasFromFact(params.fact)];
  const factKey = normalizeQueryKey(params.fact);

  for (const candidate of candidates) {
    if (candidate.length === 0) {
      continue;
    }
    if (candidate.length > 80) {
      continue;
    }
    if (normalizeQueryKey(candidate) === factKey) {
      continue;
    }
    return candidate;
  }

  return null;
};

const buildSampleId = (edge: GraphitiEdge): string => {
  const name = (edge.name ?? "fact").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const prefix = edge.uuid.slice(0, 8);
  return `g2v2-${name}-${prefix}`;
};

const main = async (): Promise<void> => {
  await mkdir(inputsDir, { recursive: true });

  const buildLog: string[] = [];
  buildLog.push(`[dataset-v2] generated_at_utc=${new Date().toISOString()}`);
  buildLog.push(`[dataset-v2] graphiti_base_url=${graphitiBaseUrl}`);
  buildLog.push(`[dataset-v2] graphiti_group_ids=${JSON.stringify(graphitiGroupIds)}`);
  buildLog.push(`[dataset-v2] max_facts=${String(maxFacts)}`);
  buildLog.push(`[dataset-v2] timeout_ms=${String(timeoutMs)}`);
  buildLog.push(`[dataset-v2] target_size=${String(targetSize)}`);
  buildLog.push(`[dataset-v2] seeds_count=${String(seeds.length)}`);

  const candidateByUuid = new Map<
    string,
    { uuid: string; seed: string; payloadFact?: string | null }
  >();

  for (const seed of seeds) {
    let response: GraphitiSearchResponse = {};
    try {
      response = await searchOnce(seed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      buildLog.push(
        `[seed] query=${JSON.stringify(seed)} status=error message=${JSON.stringify(message)}`,
      );
      continue;
    }

    buildLog.push(
      `[seed] query=${JSON.stringify(seed)} facts=${String(response.facts?.length ?? 0)}`,
    );

    for (const fact of response.facts ?? []) {
      const key = fact.uuid.toLowerCase();
      if (candidateByUuid.has(key)) {
        continue;
      }
      candidateByUuid.set(key, { uuid: fact.uuid, seed, payloadFact: fact.fact ?? null });
    }
  }

  const candidateUuids = Array.from(candidateByUuid.values());
  candidateUuids.sort((left, right) => stableCompareAscii(left.uuid, right.uuid));

  buildLog.push(`[candidates] unique_uuids=${String(candidateUuids.length)}`);

  const verifiedEdges: Array<{ edge: GraphitiEdge; seed: string }> = [];
  for (const candidate of candidateUuids) {
    const edge = await fetchEdge(candidate.uuid);
    if (!edge?.fact) {
      continue;
    }
    if (!isAllowedFact(edge.fact)) {
      continue;
    }

    verifiedEdges.push({ edge, seed: candidate.seed });
  }

  const verified = verifiedEdges
    .map((item) => item.edge)
    .map((edge) => ({
      uuid: edge.uuid,
      name: edge.name ?? null,
      fact: edge.fact ?? null,
    }));
  await writeFile(
    candidatesPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), graphitiBaseUrl, seeds, verified }, null, 2)}\n`,
    "utf8",
  );

  const maxPerName = 4;
  const selected: Array<{ edge: GraphitiEdge; seed: string }> = [];
  const usedUuid = new Set<string>();
  const usedQuery = new Set<string>();
  const perNameCount = new Map<string, number>();

  const sortedVerified = [...verifiedEdges].toSorted((left, right) => {
    const leftKey = `${(left.edge.name ?? "").toLowerCase()}:${left.edge.uuid.toLowerCase()}`;
    const rightKey = `${(right.edge.name ?? "").toLowerCase()}:${right.edge.uuid.toLowerCase()}`;
    return stableCompareAscii(leftKey, rightKey);
  });

  const pushIfAllowed = (item: { edge: GraphitiEdge; seed: string }): void => {
    const uuidKey = item.edge.uuid.toLowerCase();
    if (usedUuid.has(uuidKey)) {
      return;
    }
    const fact = item.edge.fact ?? "";
    const queryKey = normalizeQueryKey(fact);
    if (usedQuery.has(queryKey)) {
      return;
    }

    const nameKey = (item.edge.name ?? "fact").toLowerCase();
    const currentCount = perNameCount.get(nameKey) ?? 0;
    if (currentCount >= maxPerName) {
      return;
    }

    usedUuid.add(uuidKey);
    usedQuery.add(queryKey);
    perNameCount.set(nameKey, currentCount + 1);
    selected.push(item);
  };

  // Prefer some Chinese facts for coverage first.
  for (const item of sortedVerified) {
    const fact = item.edge.fact ?? "";
    if (!containsCjk(fact)) {
      continue;
    }
    pushIfAllowed(item);
    if (selected.length >= Math.min(targetSize, 12)) {
      break;
    }
  }

  // Fill remaining with all facts (stable order).
  for (const item of sortedVerified) {
    if (selected.length >= targetSize) {
      break;
    }
    pushIfAllowed(item);
  }

  if (selected.length < 30) {
    buildLog.push(
      `[error] selected=${String(selected.length)} (<30); consider adding more seeds or relaxing filters`,
    );
    await writeFile(buildLogPath, `${buildLog.join("\n")}\n`, "utf8");
    throw new Error(`dataset-v2: selected ${selected.length} (<30)`);
  }

  const dataset: DatasetSample[] = selected.map((item) => {
    const fact = item.edge.fact ?? "";
    const alias = chooseAlias({ fact, seed: item.seed });
    const aliases = alias ? [alias] : [];
    return {
      id: buildSampleId(item.edge),
      query: fact,
      aliases,
      expected_ids: [item.edge.uuid],
      expected_structures: ["facts"],
    };
  });

  // Final deterministic ordering.
  dataset.sort((left, right) => stableCompareAscii(left.id, right.id));

  await writeFile(datasetPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  await writeFile(buildLogPath, `${buildLog.join("\n")}\n`, "utf8");

  const chineseCount = dataset.filter((sample) => containsCjk(sample.query)).length;
  const aliasCount = dataset.reduce((sum, sample) => sum + sample.aliases.length, 0);

  const notes = [
    "# Gate-2 Retrieval Dataset v2 (Step 1 Re-run)",
    "",
    "- goal: expand dataset to `>=30` with auditable ground truth via Graphiti `/entity-edge/{uuid}`",
    `- generated_at_utc: \`${new Date().toISOString()}\``,
    `- graphiti_base_url: \`${graphitiBaseUrl}\``,
    `- graphiti_group_ids_used_for_sampling: \`${graphitiGroupIds.join(",")}\``,
    `- max_facts_used_for_sampling: \`${String(maxFacts)}\``,
    "",
    "## Outputs",
    "",
    `- dataset: \`${path.relative(evidenceDir, datasetPath)}\``,
    `- candidates snapshot: \`${path.relative(evidenceDir, candidatesPath)}\``,
    `- build log: \`${path.relative(evidenceDir, buildLogPath)}\``,
    "",
    "## Repro command",
    "",
    "```bash",
    `node --import tsx ${path.relative(process.cwd(), path.join(scriptDir, "build-retrieval-dataset-v2.ts"))}`,
    "```",
    "",
    "## Source",
    "",
    "- candidate discovery: POST `/search` with seed queries (see script `seeds` list)",
    "- ground truth validation: GET `/entity-edge/{uuid}` for every `expected_id`",
    "",
    "## Dedup rules",
    "",
    "- `expected_id` (uuid) is unique (case-insensitive) across dataset",
    "- `query` is unique after `trim + lower`",
    "",
    "## Coverage",
    "",
    `- sample_size: \`${String(dataset.length)}\``,
    `- chinese_queries: \`${String(chineseCount)}\``,
    `- aliases_total: \`${String(aliasCount)}\` (<=1 per sample)`,
    "- topic coverage is approximated via seed diversity + per-name cap (max 4 per `edge.name`)",
    "",
    "## Validation",
    "",
    "- every sample uses `query = fact text` from `/entity-edge/{uuid}` (semantic match by construction)",
    "- samples failing `/entity-edge` fetch or filtered by safety heuristics are excluded",
    "",
  ].join("\n");

  await writeFile(notesPath, `${notes}\n`, "utf8");
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exitCode = 1;
});
