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

export type P3RemoteWriteErrorBucket = "4xx" | "5xx" | "timeout" | "contract" | "unknown";

export class P3RemoteWriteError extends Error {
  source: "mem0" | "graphiti";
  bucket: P3RemoteWriteErrorBucket;
  status?: number;

  constructor(params: {
    source: "mem0" | "graphiti";
    bucket: P3RemoteWriteErrorBucket;
    message: string;
    status?: number;
  }) {
    super(params.message);
    this.name = "P3RemoteWriteError";
    this.source = params.source;
    this.bucket = params.bucket;
    this.status = params.status;
  }
}

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
  const nested =
    record.result && typeof record.result === "object" && !Array.isArray(record.result)
      ? (record.result as Record<string, unknown>)
      : null;

  return (
    normalizeString(record.id) ??
    normalizeString(record.memory_id) ??
    normalizeString(record.uuid) ??
    normalizeString(record.remoteId) ??
    normalizeString(nested?.id) ??
    normalizeString(nested?.memory_id) ??
    normalizeString(nested?.uuid)
  );
};

const parsePayloadMessage = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const direct = normalizeString(record.message) ?? normalizeString(record.detail);
  if (direct) {
    return direct;
  }

  const errorValue = record.error;
  if (errorValue && typeof errorValue === "object" && !Array.isArray(errorValue)) {
    return normalizeString((errorValue as Record<string, unknown>).message);
  }

  return undefined;
};

const resolveWriteTexts = (
  payload: P3CandidatePayload,
): { userText: string; assistantText: string } => {
  const userText =
    normalizeString(payload.metadata?.userText) ??
    normalizeString(payload.candidate.fact_value) ??
    "";
  const assistantText =
    normalizeString(payload.metadata?.assistantText) ??
    normalizeString(payload.candidate.fact_value) ??
    userText;

  return {
    userText,
    assistantText,
  };
};

const buildMem0Body = (input: P3RemoteWriteInput): Record<string, unknown> => {
  const { userText, assistantText } = resolveWriteTexts(input.payload);

  if (userText.length === 0 || assistantText.length === 0) {
    throw new P3RemoteWriteError({
      source: "mem0",
      bucket: "contract",
      message: "mem0 write contract invalid: messages content is empty",
    });
  }

  return {
    messages: [
      {
        role: "user",
        content: userText,
      },
      {
        role: "assistant",
        content: assistantText,
      },
    ],
    user_id: input.event.session_key,
    agent_id: "openclaw-memory-bridge-p3",
    run_id: input.event.event_id,
    metadata: {
      source: "openclaw-memory-bridge-p3",
      event_id: input.event.event_id,
      session_key: input.event.session_key,
      model: input.event.effective_model,
      write_mode: input.event.write_mode,
      source_ref: input.event.source_ref,
      source_tier: input.event.source_tier,
      candidate_memory_id: input.payload.candidate.memory_id,
      fact_key: input.payload.candidate.fact_key,
    },
  };
};

const buildGraphitiBody = (input: P3RemoteWriteInput): Record<string, unknown> => {
  const { userText, assistantText } = resolveWriteTexts(input.payload);

  if (!normalizeString(input.event.session_key)) {
    throw new P3RemoteWriteError({
      source: "graphiti",
      bucket: "contract",
      message: "graphiti write contract invalid: group_id missing",
    });
  }

  if (userText.length === 0 || assistantText.length === 0) {
    throw new P3RemoteWriteError({
      source: "graphiti",
      bucket: "contract",
      message: "graphiti write contract invalid: messages content is empty",
    });
  }

  return {
    group_id: input.event.session_key,
    messages: [
      {
        content: userText,
        role_type: "user",
        role: "user",
        timestamp: input.payload.candidate.event_time,
      },
      {
        content: assistantText,
        role_type: "assistant",
        role: "assistant",
        timestamp: input.payload.candidate.ingest_time,
      },
    ],
  };
};

const classifyHttpBucket = (status: number): P3RemoteWriteErrorBucket => {
  if (status >= 500) {
    return "5xx";
  }
  if (status >= 400) {
    if (status === 400 || status === 404 || status === 409 || status === 415 || status === 422) {
      return "contract";
    }
    return "4xx";
  }
  return "unknown";
};

const isTimeoutError = (error: unknown): boolean => {
  if (error instanceof Error) {
    const lowered = `${error.name} ${error.message}`.toLowerCase();
    return (
      lowered.includes("timeout") ||
      lowered.includes("timed out") ||
      lowered.includes("abort") ||
      lowered.includes("aborted")
    );
  }
  return false;
};

const readJsonSafe = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const toRequestBody = (
  source: "mem0" | "graphiti",
  input: P3RemoteWriteInput,
): Record<string, unknown> => {
  if (source === "mem0") {
    return buildMem0Body(input);
  }
  return buildGraphitiBody(input);
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
      throw new P3RemoteWriteError({
        source: options.source,
        bucket: "contract",
        message: `remote ${options.source} writer unavailable: baseUrl missing`,
      });
    };
  }

  const endpoint = `${trimRightSlash(baseUrl)}${options.path.startsWith("/") ? options.path : `/${options.path}`}`;

  return async (input: P3RemoteWriteInput): Promise<P3RemoteWriteResult> => {
    let response: Response;

    try {
      const body = toRequestBody(options.source, input);
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(options.timeoutMs),
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (error instanceof P3RemoteWriteError) {
        throw error;
      }

      if (isTimeoutError(error)) {
        throw new P3RemoteWriteError({
          source: options.source,
          bucket: "timeout",
          message: error instanceof Error ? error.message : String(error),
        });
      }

      throw new P3RemoteWriteError({
        source: options.source,
        bucket: "unknown",
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const payload = await readJsonSafe(response);

    if (!response.ok) {
      throw new P3RemoteWriteError({
        source: options.source,
        bucket: classifyHttpBucket(response.status),
        status: response.status,
        message:
          parsePayloadMessage(payload) ??
          `remote ${options.source} proposal write failed: status ${String(response.status)}`,
      });
    }

    return {
      remoteId: parseRemoteId(payload),
    };
  };
}
