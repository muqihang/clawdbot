import type { SsrFPolicy } from "../infra/net/ssrf.js";
import {
  resolveRemoteEmbeddingBearerClient,
  type RemoteEmbeddingProviderId,
} from "./embeddings-remote-client.js";
import { fetchRemoteEmbeddingVectors } from "./embeddings-remote-fetch.js";
import type { EmbeddingProvider, EmbeddingProviderOptions } from "./embeddings.js";

export type RemoteEmbeddingClient = {
  baseUrl: string;
  headers: Record<string, string>;
  ssrfPolicy?: SsrFPolicy;
  model: string;
};

const DASHSCOPE_EMBEDDING_MODEL = "text-embedding-v4";
const DASHSCOPE_EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_EMBEDDING_CACHE_MAX_ENTRIES = 512;

export function createRemoteEmbeddingProvider(params: {
  id: string;
  client: RemoteEmbeddingClient;
  errorPrefix: string;
  maxInputTokens?: number;
  cacheMaxEntries?: number;
}): EmbeddingProvider {
  const { client } = params;
  const url = `${client.baseUrl.replace(/\/$/, "")}/embeddings`;
  const cacheMaxEntries =
    typeof params.cacheMaxEntries === "number" && Number.isFinite(params.cacheMaxEntries)
      ? Math.max(0, Math.floor(params.cacheMaxEntries))
      : DEFAULT_EMBEDDING_CACHE_MAX_ENTRIES;
  const cache = new Map<string, number[]>();

  const readCached = (key: string): number[] | null => {
    if (!cache.has(key)) {
      return null;
    }
    const hit = cache.get(key);
    if (!hit) {
      return null;
    }
    // Refresh insertion order for best-effort LRU behavior.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  };

  const writeCached = (key: string, value: number[]): void => {
    if (cacheMaxEntries <= 0) {
      return;
    }
    cache.set(key, value);
    while (cache.size > cacheMaxEntries) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      cache.delete(oldestKey);
    }
  };

  const embed = async (input: string[]): Promise<number[][]> => {
    if (input.length === 0) {
      return [];
    }

    const output: Array<number[] | undefined> = Array.from({ length: input.length });
    const misses: string[] = [];
    const missIndexes: number[] = [];

    for (let index = 0; index < input.length; index += 1) {
      const text = input[index] ?? "";
      const cached = cacheMaxEntries > 0 ? readCached(text) : null;
      if (cached !== null) {
        output[index] = cached;
      } else {
        misses.push(text);
        missIndexes.push(index);
      }
    }

    if (misses.length > 0) {
      const body: {
        model: string;
        input: string[];
        dimensions?: number;
      } = { model: client.model, input: misses };
      if (client.model === DASHSCOPE_EMBEDDING_MODEL) {
        body.dimensions = DASHSCOPE_EMBEDDING_DIMENSIONS;
      }

      const vectors = await fetchRemoteEmbeddingVectors({
        url,
        headers: client.headers,
        ssrfPolicy: client.ssrfPolicy,
        body,
        errorPrefix: params.errorPrefix,
      });

      for (let i = 0; i < missIndexes.length; i += 1) {
        const outIndex = missIndexes[i] ?? 0;
        const text = misses[i] ?? "";
        const vec = vectors[i] ?? [];
        output[outIndex] = vec;
        writeCached(text, vec);
      }
    }

    // Ensure no holes.
    for (let i = 0; i < output.length; i += 1) {
      output[i] ??= [];
    }

    return output as number[][];
  };

  return {
    id: params.id,
    model: client.model,
    ...(typeof params.maxInputTokens === "number" ? { maxInputTokens: params.maxInputTokens } : {}),
    embedQuery: async (text) => {
      const [vec] = await embed([text]);
      return vec ?? [];
    },
    embedBatch: embed,
  };
}

export async function resolveRemoteEmbeddingClient(params: {
  provider: RemoteEmbeddingProviderId;
  options: EmbeddingProviderOptions;
  defaultBaseUrl: string;
  normalizeModel: (model: string) => string;
}): Promise<RemoteEmbeddingClient> {
  const { baseUrl, headers, ssrfPolicy } = await resolveRemoteEmbeddingBearerClient({
    provider: params.provider,
    options: params.options,
    defaultBaseUrl: params.defaultBaseUrl,
  });
  const model = params.normalizeModel(params.options.model);
  return { baseUrl, headers, ssrfPolicy, model };
}
