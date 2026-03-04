export type BridgeRemoteSource = "mem0" | "graphiti";

export type BridgeSearchHit = {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  score_source?: "score" | "rank_score" | "missing";
  snippet: string;
  source: BridgeRemoteSource;
  remoteId: string;
  structure?: string;
};

export type RemoteSnippetRecord = {
  text: string;
};

export type RemoteSearchFilters = Record<string, unknown>;
export type RemoteSearchCriteria = Record<string, unknown>;

export type RemoteSearchOptions = {
  filters?: RemoteSearchFilters;
  criteria?: RemoteSearchCriteria;
  strategy?: string;
  focal_node_uuid?: string;
  temporal_filters?: Record<string, unknown>;
  user_id?: string;
  agent_id?: string;
  run_id?: string;
};

export type RemoteClientOperation = "search" | "get";

export type RemoteClientErrorCode =
  | "REMOTE_TIMEOUT"
  | "REMOTE_UNAVAILABLE"
  | "REMOTE_HTTP_ERROR"
  | "REMOTE_INVALID_RESPONSE";

export type RemoteClientError = {
  source: BridgeRemoteSource;
  operation: RemoteClientOperation;
  code: RemoteClientErrorCode;
  message: string;
  status?: number;
};

export type RemoteErrorReporter = (error: RemoteClientError) => void;

export interface RemoteMemoryClient {
  search(query: string, options?: RemoteSearchOptions): Promise<BridgeSearchHit[]>;
  getById(id: string): Promise<RemoteSnippetRecord | null>;
}

type FetchLike = typeof fetch;

export type CreateRemoteClientOptions = {
  source: BridgeRemoteSource;
  baseUrl?: string;
  apiKey?: string;
  timeoutMs: number;
  getTimeoutMs?: number;
  retry?: {
    enabled: boolean;
    timeoutMultiplier?: number;
  };
  defaultSearchBody?: Record<string, unknown>;
  fetchImpl?: FetchLike;
  errorReporter?: RemoteErrorReporter;
  searchPath?: string;
  getPath?: (id: string) => string;
  extractSearchItems?: (payload: unknown) => unknown[];
};

export type CreateMem0ClientOptions = Omit<CreateRemoteClientOptions, "source">;

const trimRightSlash = (value: string): string => value.replace(/\/+$/, "");

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const parsePayloadMessage = (payload: unknown): string | undefined => {
  const record = asRecord(payload);
  if (!record) {
    return undefined;
  }
  const error = asRecord(record.error);
  const direct = normalizeString(record.message);
  const nested = normalizeString(error?.message);
  return nested ?? direct;
};

const parseSearchItems = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }
  const record = asRecord(payload);
  if (!record) {
    return [];
  }
  if (Array.isArray(record.results)) {
    return record.results;
  }
  if (Array.isArray(record.items)) {
    return record.items;
  }
  if (Array.isArray(record.hits)) {
    return record.hits;
  }
  return [];
};

const parseScore = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
};

const compareAsciiStrings = (left: string, right: string): number => {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
};

const compareRemoteIds = (left: string, right: string): number => {
  const leftLowered = left.toLowerCase();
  const rightLowered = right.toLowerCase();

  const loweredCompare = compareAsciiStrings(leftLowered, rightLowered);
  if (loweredCompare !== 0) {
    return loweredCompare;
  }

  return compareAsciiStrings(left, right);
};

const compareScoresDesc = (left: number, right: number): number => {
  if (left === right) {
    return 0;
  }
  return left > right ? -1 : 1;
};

type RankedSearchHit = {
  hit: BridgeSearchHit;
  rank: number;
  structurePriority: number;
};

const normalizeStructure = (value: string | undefined): string => {
  return value?.trim().toLowerCase() ?? "";
};

const structurePriority = (structure: string | undefined): number => {
  const normalized = normalizeStructure(structure);

  if (normalized === "facts" || normalized === "fact") {
    return 0;
  }
  if (normalized === "episodes" || normalized === "episode") {
    return 1;
  }
  if (normalized === "nodes" || normalized === "node") {
    return 2;
  }

  return 3;
};

const chooseBetterHit = (
  candidate: RankedSearchHit,
  existing: RankedSearchHit,
): RankedSearchHit => {
  if (candidate.hit.score !== existing.hit.score) {
    return candidate.hit.score > existing.hit.score ? candidate : existing;
  }

  if (candidate.rank !== existing.rank) {
    return candidate.rank < existing.rank ? candidate : existing;
  }

  const pathCompare = compareAsciiStrings(candidate.hit.path, existing.hit.path);
  return pathCompare <= 0 ? candidate : existing;
};

const normalizeSearchHits = (hits: BridgeSearchHit[]): BridgeSearchHit[] => {
  if (hits.length <= 1) {
    return hits;
  }

  const bestByRemoteId = new Map<string, RankedSearchHit>();
  for (const [index, hit] of hits.entries()) {
    const rankedHit: RankedSearchHit = {
      hit,
      rank: index,
      structurePriority: structurePriority(hit.structure),
    };

    const key = hit.remoteId.toLowerCase();
    const existing = bestByRemoteId.get(key);
    if (!existing) {
      bestByRemoteId.set(key, rankedHit);
      continue;
    }
    bestByRemoteId.set(key, chooseBetterHit(rankedHit, existing));
  }

  const deduped = Array.from(bestByRemoteId.values());
  deduped.sort((left, right) => {
    const scoreCompare = compareScoresDesc(left.hit.score, right.hit.score);
    if (scoreCompare !== 0) {
      return scoreCompare;
    }

    if (left.structurePriority !== right.structurePriority) {
      return left.structurePriority < right.structurePriority ? -1 : 1;
    }

    if (left.rank !== right.rank) {
      return left.rank < right.rank ? -1 : 1;
    }

    const remoteIdCompare = compareRemoteIds(left.hit.remoteId, right.hit.remoteId);
    if (remoteIdCompare !== 0) {
      return remoteIdCompare;
    }

    return compareAsciiStrings(left.hit.path, right.hit.path);
  });

  return deduped.map((item) => item.hit);
};

const toBridgePath = (source: BridgeRemoteSource, id: string): string => `bridge/${source}/${id}`;

const parseSearchHit = (source: BridgeRemoteSource, item: unknown): BridgeSearchHit | null => {
  const record = asRecord(item);
  if (!record) {
    return null;
  }

  const id =
    normalizeString(record.id) ??
    normalizeString(record.remoteId) ??
    normalizeString(record.memory_id) ??
    normalizeString(record.uuid) ??
    normalizeString(record.fact_id);
  if (!id) {
    return null;
  }

  const snippet =
    normalizeString(record.snippet) ??
    normalizeString(record.text) ??
    normalizeString(record.content) ??
    normalizeString(record.memory) ??
    normalizeString(record.summary) ??
    normalizeString(record.name) ??
    normalizeString(record.fact) ??
    "";

  const structure =
    normalizeString(record.structure) ??
    normalizeString(record.structure_type) ??
    normalizeString(record.type);

  const score_source: BridgeSearchHit["score_source"] =
    record.score !== undefined
      ? "score"
      : record.rank_score !== undefined
        ? "rank_score"
        : "missing";

  return {
    path: toBridgePath(source, id),
    startLine: 1,
    endLine: 1,
    score: parseScore(record.score ?? record.rank_score),
    score_source,
    snippet,
    source,
    remoteId: id,
    structure,
  };
};

const mapThrownError = (params: {
  source: BridgeRemoteSource;
  operation: RemoteClientOperation;
  error: unknown;
}): RemoteClientError => {
  const message = params.error instanceof Error ? params.error.message : String(params.error);
  const name = params.error instanceof Error ? params.error.name.toLowerCase() : "";
  const lowered = message.toLowerCase();
  const timedOut =
    name.includes("timeout") ||
    name.includes("abort") ||
    lowered.includes("timeout") ||
    lowered.includes("timed out") ||
    lowered.includes("aborted");

  return {
    source: params.source,
    operation: params.operation,
    code: timedOut ? "REMOTE_TIMEOUT" : "REMOTE_UNAVAILABLE",
    message,
  };
};

const parseTextRecord = (payload: unknown): string | undefined => {
  const record = asRecord(payload);
  if (!record) {
    return undefined;
  }
  return (
    normalizeString(record.text) ??
    normalizeString(record.snippet) ??
    normalizeString(record.content) ??
    normalizeString(record.memory) ??
    normalizeString(record.fact) ??
    normalizeString(record.summary) ??
    normalizeString(record.name)
  );
};

const toHttpError = (params: {
  source: BridgeRemoteSource;
  operation: RemoteClientOperation;
  payload: unknown;
  status: number;
}): RemoteClientError => {
  return {
    source: params.source,
    operation: params.operation,
    code: "REMOTE_HTTP_ERROR",
    status: params.status,
    message:
      parsePayloadMessage(params.payload) ??
      `remote ${params.source} ${params.operation} request failed with status ${params.status}`,
  };
};

const toInvalidResponseError = (params: {
  source: BridgeRemoteSource;
  operation: RemoteClientOperation;
  message: string;
}): RemoteClientError => {
  return {
    source: params.source,
    operation: params.operation,
    code: "REMOTE_INVALID_RESPONSE",
    message: params.message,
  };
};

const readJsonSafe = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const createHeaders = (apiKey?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  return headers;
};

const reportError = (reporter: RemoteErrorReporter | undefined, error: RemoteClientError): void => {
  reporter?.(error);
};

class RemoteClientRequestError extends Error implements RemoteClientError {
  source: BridgeRemoteSource;
  operation: RemoteClientOperation;
  code: RemoteClientErrorCode;
  status?: number;

  constructor(error: RemoteClientError) {
    super(error.message);
    this.name = "RemoteClientRequestError";
    this.source = error.source;
    this.operation = error.operation;
    this.code = error.code;
    this.status = error.status;
  }
}

const isRemoteClientRequestError = (error: unknown): error is RemoteClientRequestError => {
  return error instanceof RemoteClientRequestError;
};

const toSearchBody = (
  query: string,
  options?: RemoteSearchOptions,
  defaultSearchBody?: Record<string, unknown>,
): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    ...(defaultSearchBody ?? {}),
    query,
  };

  if (options?.filters !== undefined) {
    body.filters = options.filters;
  }
  if (options?.criteria !== undefined) {
    body.criteria = options.criteria;
  }
  if (options?.strategy !== undefined) {
    body.strategy = options.strategy;
  }
  if (options?.focal_node_uuid !== undefined) {
    body.focal_node_uuid = options.focal_node_uuid;
  }
  if (options?.temporal_filters !== undefined) {
    body.temporal_filters = options.temporal_filters;
  }
  const user_id = normalizeString(options?.user_id);
  if (user_id) {
    body.user_id = user_id;
  }
  const agent_id = normalizeString(options?.agent_id);
  if (agent_id) {
    body.agent_id = agent_id;
  }
  const run_id = normalizeString(options?.run_id);
  if (run_id) {
    body.run_id = run_id;
  }

  return body;
};

export function createRemoteClient(options: CreateRemoteClientOptions): RemoteMemoryClient {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const baseUrl = normalizeString(options.baseUrl);
  const searchPath = options.searchPath ?? "/search";
  const getPath = options.getPath ?? ((id: string) => `/items/${encodeURIComponent(id)}`);
  const getTimeoutMs = options.getTimeoutMs ?? options.timeoutMs;

  if (!baseUrl) {
    return {
      async search() {
        return [];
      },
      async getById() {
        return null;
      },
    };
  }

  const resolvedBaseUrl = trimRightSlash(baseUrl);
  const headers = createHeaders(options.apiKey);
  const retryEnabled = options.retry?.enabled ?? true;
  const retryMultiplier = Math.max(1, options.retry?.timeoutMultiplier ?? 3);

  return {
    async search(query: string, searchOptions?: RemoteSearchOptions): Promise<BridgeSearchHit[]> {
      const requestBody = JSON.stringify(
        toSearchBody(query, searchOptions, options.defaultSearchBody),
      );

      const runOnce = async (timeoutMs: number): Promise<BridgeSearchHit[]> => {
        const response = await fetchImpl(`${resolvedBaseUrl}${searchPath}`, {
          method: "POST",
          headers,
          body: requestBody,
          signal: AbortSignal.timeout(timeoutMs),
        });

        const payload = await readJsonSafe(response);
        if (!response.ok) {
          const error = new RemoteClientRequestError(
            toHttpError({
              source: options.source,
              operation: "search",
              payload,
              status: response.status,
            }),
          );
          reportError(options.errorReporter, error);
          throw error;
        }

        const searchItems = options.extractSearchItems
          ? options.extractSearchItems(payload)
          : parseSearchItems(payload);

        const hits = searchItems
          .map((item) => parseSearchHit(options.source, item))
          .filter((item): item is BridgeSearchHit => Boolean(item));

        return normalizeSearchHits(hits);
      };

      try {
        return await runOnce(options.timeoutMs);
      } catch (error) {
        if (isRemoteClientRequestError(error)) {
          throw error;
        }
        const mapped = mapThrownError({
          source: options.source,
          operation: "search",
          error,
        });

        const retryable = mapped.code === "REMOTE_TIMEOUT" || mapped.code === "REMOTE_UNAVAILABLE";
        if (retryable && retryEnabled) {
          const retryTimeoutMs = Math.min(
            Math.max(options.timeoutMs * retryMultiplier, options.timeoutMs),
            120_000,
          );
          try {
            return await runOnce(retryTimeoutMs);
          } catch (retryError) {
            if (isRemoteClientRequestError(retryError)) {
              throw retryError;
            }
            const retryMapped = mapThrownError({
              source: options.source,
              operation: "search",
              error: retryError,
            });
            const clientError = new RemoteClientRequestError(retryMapped);
            reportError(options.errorReporter, clientError);
            throw clientError;
          }
        }

        const clientError = new RemoteClientRequestError(mapped);
        reportError(options.errorReporter, clientError);
        throw clientError;
      }
    },

    async getById(id: string): Promise<RemoteSnippetRecord | null> {
      try {
        const response = await fetchImpl(`${resolvedBaseUrl}${getPath(id)}`, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(getTimeoutMs),
        });

        const payload = await readJsonSafe(response);
        if (!response.ok) {
          if (response.status === 404) {
            return null;
          }
          reportError(
            options.errorReporter,
            toHttpError({
              source: options.source,
              operation: "get",
              payload,
              status: response.status,
            }),
          );
          return null;
        }

        const text = parseTextRecord(payload);
        if (!text) {
          reportError(
            options.errorReporter,
            toInvalidResponseError({
              source: options.source,
              operation: "get",
              message: `remote ${options.source} get response missing text field`,
            }),
          );
          return null;
        }

        return { text };
      } catch (error) {
        reportError(
          options.errorReporter,
          mapThrownError({
            source: options.source,
            operation: "get",
            error,
          }),
        );
        return null;
      }
    },
  };
}

export function createMem0Client(options: CreateMem0ClientOptions): RemoteMemoryClient {
  return createRemoteClient({
    source: "mem0",
    searchPath: "/search",
    getPath: (id) => `/memories/${encodeURIComponent(id)}`,
    ...options,
  });
}
