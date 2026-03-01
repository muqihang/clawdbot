import { readFile } from "node:fs/promises";

type DatasetSample = {
  id: string;
  query: string;
  aliases?: string[];
  expected_ids?: string[];
  expected_structures?: string[];
  bucket?: string;
};

const SOURCE_DATASET =
  "analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day23/w2-gate2-final-verify/inputs/retrieval-dataset.v2.json";
const TARGET_DATASET =
  "analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day2/w3-a-recipe-routing/inputs/retrieval-temporal-dataset.v1.json";

const readJson = async <T>(filePath: string): Promise<T> => {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
};

const fail = (message: string): never => {
  throw new Error(message);
};

const main = async (): Promise<void> => {
  const source = await readJson<DatasetSample[]>(SOURCE_DATASET);
  const target = await readJson<DatasetSample[]>(TARGET_DATASET);

  if (target.length < 30) {
    fail(`sample_size must be >= 30, received ${target.length}`);
  }

  const sourceExpectedIds = new Set<string>();
  for (const sample of source) {
    for (const expectedId of sample.expected_ids ?? []) {
      sourceExpectedIds.add(expectedId.toLowerCase());
    }
  }

  const querySet = new Set<string>();
  const expectedIdSet = new Set<string>();
  const coverage = {
    beforeAfter: 0,
    precedesFollows: 0,
    milestoneTimeline: 0,
    causalTemporal: 0,
    shortQuery: 0,
    properNoun: 0,
    anchoredTime: 0,
  };

  for (const sample of target) {
    const query = sample.query.trim();
    const queryKey = query.toLowerCase();
    if (querySet.has(queryKey)) {
      fail(`duplicated query found: ${query}`);
    }
    querySet.add(queryKey);

    if (sample.bucket !== "temporal_relation") {
      fail(`sample ${sample.id} bucket must be temporal_relation`);
    }

    for (const expectedId of sample.expected_ids ?? []) {
      const expectedKey = expectedId.toLowerCase();
      if (expectedIdSet.has(expectedKey)) {
        fail(`duplicated expected_id found: ${expectedId}`);
      }
      expectedIdSet.add(expectedKey);

      if (!sourceExpectedIds.has(expectedKey)) {
        fail(
          `expected_id ${expectedId} is not in ${SOURCE_DATASET}; transitive ground truth check failed`,
        );
      }
    }

    const lowered = query.toLowerCase();
    if (/(before|after|之前|之后|后发生)/i.test(query)) {
      coverage.beforeAfter += 1;
    }
    if (/(precede|follow|先于|后于)/i.test(query)) {
      coverage.precedesFollows += 1;
    }
    if (/(timeline|里程碑|第\d+天|阶段)/i.test(query)) {
      coverage.milestoneTimeline += 1;
    }
    if (/(导致|触发|because|因此|causal)/i.test(query)) {
      coverage.causalTemporal += 1;
    }

    const tokenCount = query.split(/\s+/g).filter((item) => item.length > 0).length;
    if (tokenCount <= 12 || query.length <= 24) {
      coverage.shortQuery += 1;
    }
    if (/OpenClaw|Graphiti|Mem0|assistant\(assistant\)/.test(query)) {
      coverage.properNoun += 1;
    }
    if (/timeline|第\d+天|day\s*\d+|\d{4}-\d{2}-\d{2}/i.test(query)) {
      coverage.anchoredTime += 1;
    }
  }

  const result = {
    source_dataset: SOURCE_DATASET,
    target_dataset: TARGET_DATASET,
    sample_size: target.length,
    unique_queries: querySet.size,
    unique_expected_ids: expectedIdSet.size,
    coverage,
    generated_at: new Date().toISOString(),
    passed: true,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

await main();
