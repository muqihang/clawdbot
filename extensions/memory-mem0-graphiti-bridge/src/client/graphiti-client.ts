import {
  createRemoteClient,
  type CreateRemoteClientOptions,
  type RemoteMemoryClient,
} from "./mem0-client.js";

export type CreateGraphitiClientOptions = Omit<CreateRemoteClientOptions, "source">;

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const asArray = (value: unknown): unknown[] => {
  return Array.isArray(value) ? value : [];
};

const appendStructuredItems = (params: {
  payload: Record<string, unknown>;
  key: "facts" | "episodes" | "nodes";
  output: unknown[];
}): void => {
  for (const item of asArray(params.payload[params.key])) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    params.output.push({
      ...(item as Record<string, unknown>),
      structure: params.key,
      structure_type: params.key,
    });
  }
};

const extractGraphitiSearchItems = (payload: unknown): unknown[] => {
  const withRankScoreFallback = (items: unknown[]): unknown[] => {
    return items.map((item, index) => {
      const record = asRecord(item);
      if (!record) {
        return item;
      }
      if (record.score !== undefined || record.rank_score !== undefined) {
        return item;
      }
      return {
        ...record,
        rank_score: 1 / (index + 1),
      };
    });
  };

  if (Array.isArray(payload)) {
    return withRankScoreFallback(payload);
  }

  const record = asRecord(payload);
  if (!record) {
    return [];
  }

  const output: unknown[] = [];
  output.push(...asArray(record.results));
  output.push(...asArray(record.items));
  output.push(...asArray(record.hits));

  appendStructuredItems({ payload: record, key: "facts", output });
  appendStructuredItems({ payload: record, key: "episodes", output });
  appendStructuredItems({ payload: record, key: "nodes", output });

  const dataRecord = asRecord(record.data);
  if (dataRecord) {
    appendStructuredItems({ payload: dataRecord, key: "facts", output });
    appendStructuredItems({ payload: dataRecord, key: "episodes", output });
    appendStructuredItems({ payload: dataRecord, key: "nodes", output });
  }

  return withRankScoreFallback(output);
};

export function createGraphitiClient(options: CreateGraphitiClientOptions): RemoteMemoryClient {
  return createRemoteClient({
    source: "graphiti",
    searchPath: "/search",
    getPath: (id) => `/entity-edge/${encodeURIComponent(id)}`,
    extractSearchItems: extractGraphitiSearchItems,
    defaultSearchBody: {
      max_facts: 1,
    },
    retry: {
      enabled: false,
    },
    ...options,
  });
}
