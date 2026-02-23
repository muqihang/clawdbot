import type { P3CandidatePayload, P3OutboxEventRecord } from "./types.js";

type FetchLike = typeof fetch;

export type P3RemoteWriteInput = {
  event: P3OutboxEventRecord;
  payload: P3CandidatePayload;
};

export type P3RemoteWriteResult = {
  remoteId?: string;
};

export type P3RemoteWriteFn = (input: P3RemoteWriteInput) => Promise<P3RemoteWriteResult>;

export type CreateHttpBridgeWriterOptions = {
  source: "mem0" | "graphiti";
  baseUrl?: string;
  apiKey?: string;
  path: string;
  timeoutMs: number;
  fetchImpl?: FetchLike;
};

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const trimRightSlash = (value: string): string => value.replace(/\/+$/, "");

const parseRemoteId = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  return (
    normalizeString(record.id) ??
    normalizeString(record.memory_id) ??
    normalizeString(record.uuid) ??
    normalizeString(record.remoteId)
  );
};

export function createHttpBridgeWriter(options: CreateHttpBridgeWriterOptions): P3RemoteWriteFn {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const baseUrl = normalizeString(options.baseUrl);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (options.apiKey) {
    headers.authorization = `Bearer ${options.apiKey}`;
  }

  if (!baseUrl) {
    return async () => {
      throw new Error(`remote ${options.source} writer unavailable: baseUrl missing`);
    };
  }

  const endpoint = `${trimRightSlash(baseUrl)}${options.path.startsWith("/") ? options.path : `/${options.path}`}`;

  return async (input: P3RemoteWriteInput): Promise<P3RemoteWriteResult> => {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(options.timeoutMs),
      body: JSON.stringify({
        source: "openclaw-memory-bridge-p3",
        event_id: input.event.event_id,
        session_key: input.event.session_key,
        mode: input.event.write_mode,
        payload: input.payload,
      }),
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? normalizeString((payload as Record<string, unknown>).message)
          : undefined;
      throw new Error(
        message ??
          `remote ${options.source} proposal write failed: status ${String(response.status)}`,
      );
    }

    return {
      remoteId: parseRemoteId(payload),
    };
  };
}
