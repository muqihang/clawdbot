import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type SourceSample = {
  id: string;
  query: string;
  aliases?: string[];
  expected_ids?: string[];
  expected_structures?: string[];
};

type TemporalSample = {
  id: string;
  query: string;
  aliases: string[];
  expected_ids: string[];
  expected_structures: string[];
  bucket: "temporal_relation";
};

const SOURCE_DATASET =
  "analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day23/w2-gate2-final-verify/inputs/retrieval-dataset.v2.json";
const TARGET_DATASET =
  "analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day2/w3-a-recipe-routing/inputs/retrieval-temporal-dataset.v1.json";

const readJson = async <T>(filePath: string): Promise<T> => {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
};

const writeJson = async (filePath: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const sanitizeAlias = (value: string): string => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length === 0) {
    return "timeline 查询";
  }
  return compact.length > 64 ? `${compact.slice(0, 61)}...` : compact;
};

const toTemporalSample = (sample: SourceSample, index: number): TemporalSample => {
  const expectedIds = (sample.expected_ids ?? []).filter((item) => item.trim().length > 0);
  const expectedStructures = (sample.expected_structures ?? []).filter(
    (item) => item.trim().length > 0,
  );
  const aliasSeed = sanitizeAlias(sample.aliases?.[0] ?? sample.query);
  const dayAnchor = (index % 7) + 1;

  let query = `在时间线中，${sample.query} 之前发生了什么？`;
  let aliases = [`在时间线中，${aliasSeed} 之后发生了什么？`, `timeline: ${aliasSeed}`];

  if (index % 4 === 1) {
    query = `在依赖顺序里，${sample.query} 先于哪个事件，后于哪个事件？`;
    aliases = [`请说明 ${aliasSeed} 的 precedes/follows 关系`, `${aliasSeed} 先于什么`];
  } else if (index % 4 === 2) {
    query = `在 timeline 第${dayAnchor}天 里程碑中，${sample.query} 属于哪个阶段？`;
    aliases = [`${aliasSeed} 第${dayAnchor}天`, `${aliasSeed} milestone timeline`];
  } else if (index % 4 === 3) {
    query = `因为 ${sample.query}，之后触发了什么变化？`;
    aliases = [`${aliasSeed} 导致什么`, `${aliasSeed} 触发后事件`];
  }

  return {
    id: `w3a-tr-${sample.id}`,
    query,
    aliases,
    expected_ids: expectedIds,
    expected_structures: expectedStructures.length > 0 ? expectedStructures : ["facts"],
    bucket: "temporal_relation",
  };
};

const dedupeByExpectedId = (dataset: TemporalSample[]): TemporalSample[] => {
  const seen = new Set<string>();
  const output: TemporalSample[] = [];

  for (const sample of dataset) {
    const dedupedIds = sample.expected_ids.filter((id) => {
      const key = id.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    if (dedupedIds.length === 0) {
      continue;
    }

    output.push({
      ...sample,
      expected_ids: dedupedIds,
    });
  }

  return output;
};

const main = async (): Promise<void> => {
  const source = await readJson<SourceSample[]>(SOURCE_DATASET);
  const temporalDataset = dedupeByExpectedId(source.map((sample, index) => toTemporalSample(sample, index)));

  const querySet = new Set<string>();
  const expectedIdSet = new Set<string>();
  for (const sample of temporalDataset) {
    querySet.add(sample.query.trim().toLowerCase());
    for (const expectedId of sample.expected_ids) {
      expectedIdSet.add(expectedId.toLowerCase());
    }
  }

  const summary = {
    source_dataset: SOURCE_DATASET,
    target_dataset: TARGET_DATASET,
    sample_size: temporalDataset.length,
    unique_queries: querySet.size,
    unique_expected_ids: expectedIdSet.size,
    generated_at: new Date().toISOString(),
  };

  await writeJson(TARGET_DATASET, temporalDataset);
  await writeJson(
    "analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day2/w3-a-recipe-routing/inputs/retrieval-temporal-dataset.summary.json",
    summary,
  );

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
};

await main();
