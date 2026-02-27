export type BridgeRemoteSource = "mem0" | "graphiti";

export type BridgeSearchHit = {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: BridgeRemoteSource;
  remoteId: string;
  structure?: string;
};

export type RemoteSnippetRecord = {
  text: string;
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
  search(query: string): Promise<BridgeSearchHit[]>;
  getById(id: string): Promise<RemoteSnippetRecord | null>;
}

type FetchLike = typeof fetch;

export type CreateRemoteClientOptions = {
  source: BridgeRemoteSource;
  baseUrl?: string;
  apiKey?: string;
  timeoutMs: number;
  getTimeoutMs?: number;
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

const chooseBetterHit = (
  candidate: BridgeSearchHit,
  existing: BridgeSearchHit,
): BridgeSearchHit => {
  if (candidate.score !== existing.score) {
    return candidate.score > existing.score ? candidate : existing;
  }

  // Prefer the hit with the longer snippet on ties to keep more context.
  if (candidate.snippet.length !== existing.snippet.length) {
    return candidate.snippet.length > existing.snippet.length ? candidate : existing;
  }

  // Final deterministic tie-breaker for identical remoteId: keep the lexicographically smallest snippet.
  const snippetCompare = compareAsciiStrings(candidate.snippet, existing.snippet);
  return snippetCompare < 0 ? candidate : existing;
};

const normalizeSearchHits = (hits: BridgeSearchHit[]): BridgeSearchHit[] => {
  if (hits.length <= 1) {
    return hits;
  }

  const bestByRemoteId = new Map<string, BridgeSearchHit>();
  for (const hit of hits) {
    const key = hit.remoteId.toLowerCase();
    const existing = bestByRemoteId.get(key);
    if (!existing) {
      bestByRemoteId.set(key, hit);
      continue;
    }
    bestByRemoteId.set(key, chooseBetterHit(hit, existing));
  }

  const deduped = Array.from(bestByRemoteId.values());
  deduped.sort((left, right) => {
    const scoreCompare = compareScoresDesc(left.score, right.score);
    if (scoreCompare !== 0) {
      return scoreCompare;
    }

    const remoteIdCompare = compareRemoteIds(left.remoteId, right.remoteId);
    if (remoteIdCompare !== 0) {
      return remoteIdCompare;
    }

    return compareAsciiStrings(left.path, right.path);
  });

  return deduped;
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

  return {
    path: toBridgePath(source, id),
    startLine: 1,
    endLine: 1,
    score: parseScore(record.score ?? record.rank_score),
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

  return {
    async search(query: string): Promise<BridgeSearchHit[]> {
      try {
        const response = await fetchImpl(`${resolvedBaseUrl}${searchPath}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(options.timeoutMs),
        });

        const payload = await readJsonSafe(response);
        if (!response.ok) {
          reportError(
            options.errorReporter,
            toHttpError({
              source: options.source,
              operation: "search",
              payload,
              status: response.status,
            }),
          );
          return [];
        }

        const searchItems = options.extractSearchItems
          ? options.extractSearchItems(payload)
          : parseSearchItems(payload);

        const hits = searchItems
          .map((item) => parseSearchHit(options.source, item))
          .filter((item): item is BridgeSearchHit => Boolean(item));

        return normalizeSearchHits(hits);
      } catch (error) {
        reportError(
          options.errorReporter,
          mapThrownError({
            source: options.source,
            operation: "search",
            error,
          }),
        );
        return [];
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
