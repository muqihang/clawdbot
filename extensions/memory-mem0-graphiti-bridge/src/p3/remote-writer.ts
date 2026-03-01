import {
  isValidOcMessageId,
  isValidOcThreadId,
  isValidOcUserId,
} from "../../../../src/routing/session-key.js";
import {
  appendOntologyMarkerLine,
  buildOntologyV1WriteResult,
  type GraphitiOntologyV1WriteOptions,
  type GraphitiOntologyV1WriteTrace,
} from "./ontology-v1.js";
import {
  P3_MESSAGE_ROLE_VALUES,
  type P3CandidatePayload,
  type P3MessageEnvelope,
  type P3MessageRole,
  type P3OutboxEventRecord,
} from "./types.js";

export type { GraphitiOntologyV1WriteTrace } from "./ontology-v1.js";

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
  ontologyV1?: GraphitiOntologyV1WriteOptions & {
    onTrace?: (trace: GraphitiOntologyV1WriteTrace) => void;
  };
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

const MESSAGE_ROLE_SET = new Set<P3MessageRole>(P3_MESSAGE_ROLE_VALUES);

const normalizeMessageRole = (value: unknown): P3MessageRole | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (!MESSAGE_ROLE_SET.has(normalized as P3MessageRole)) {
    return undefined;
  }
  return normalized as P3MessageRole;
};

const normalizeIgnoreRoles = (value: unknown): P3MessageRole[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Set<P3MessageRole>();
  for (const item of value) {
    const role = normalizeMessageRole(item);
    if (role) {
      deduped.add(role);
    }
  }

  return Array.from(deduped);
};

const normalizeEnvelopeMetadata = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

type ResolvedMessageEnvelope = {
  role: P3MessageRole;
  name?: string;
  created_at: string;
  metadata: Record<string, unknown>;
  ignore_roles: P3MessageRole[];
};

const resolveMessageEnvelope = (payload: P3CandidatePayload): ResolvedMessageEnvelope | null => {
  const envelope = payload.message_envelope;
  if (!envelope) {
    return null;
  }

  const role = normalizeMessageRole(envelope.role) ?? "user";
  const createdAt = normalizeString(envelope.created_at) ?? payload.candidate.event_time;
  const createdAtFallback = Number.isFinite(Date.parse(createdAt))
    ? createdAt
    : payload.candidate.event_time;

  return {
    role,
    name: normalizeString(envelope.name),
    created_at: createdAtFallback,
    metadata: normalizeEnvelopeMetadata(envelope.metadata),
    ignore_roles: normalizeIgnoreRoles(envelope.ignore_roles),
  };
};

type BaseWriteMessage = {
  role: P3MessageRole;
  content: string;
  timestamp: string;
};

type FilteredWriteMessages = {
  messages: BaseWriteMessage[];
  filteredRoles: P3MessageRole[];
  effectiveRoles: P3MessageRole[];
};

const filterWriteMessages = (params: {
  source: "mem0" | "graphiti";
  messages: BaseWriteMessage[];
  envelope: ResolvedMessageEnvelope | null;
}): FilteredWriteMessages => {
  const ignoreRoleSet = new Set<P3MessageRole>(params.envelope?.ignore_roles ?? []);

  const filteredRoles = Array.from(
    new Set(
      params.messages
        .filter((message) => ignoreRoleSet.has(message.role))
        .map((message) => message.role),
    ),
  );
  const effectiveMessages = params.messages.filter((message) => !ignoreRoleSet.has(message.role));

  if (effectiveMessages.length === 0) {
    throw new P3RemoteWriteError({
      source: params.source,
      bucket: "contract",
      message: `${params.source} write contract invalid: ignore_roles filtered all messages (${filteredRoles.join(",") || "none"})`,
    });
  }

  return {
    messages: effectiveMessages,
    filteredRoles,
    effectiveRoles: effectiveMessages.map((message) => message.role),
  };
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

const resolveOcIdentityMetadata = (
  payload: P3CandidatePayload,
): Partial<{
  oc_user_id: string;
  oc_thread_id: string;
  oc_message_id: string;
}> => {
  const metadata = payload.metadata;
  if (!metadata) {
    return {};
  }

  const identity: Partial<{
    oc_user_id: string;
    oc_thread_id: string;
    oc_message_id: string;
  }> = {};

  if (isValidOcUserId(metadata.oc_user_id)) {
    identity.oc_user_id = metadata.oc_user_id;
  }
  if (isValidOcThreadId(metadata.oc_thread_id)) {
    identity.oc_thread_id = metadata.oc_thread_id;
  }
  if (isValidOcMessageId(metadata.oc_message_id)) {
    identity.oc_message_id = metadata.oc_message_id;
  }

  return identity;
};

const buildMem0Body = (input: P3RemoteWriteInput): Record<string, unknown> => {
  const { userText, assistantText } = resolveWriteTexts(input.payload);
  const envelope = resolveMessageEnvelope(input.payload);

  if (userText.length === 0 || assistantText.length === 0) {
    throw new P3RemoteWriteError({
      source: "mem0",
      bucket: "contract",
      message: "mem0 write contract invalid: messages content is empty",
    });
  }

  const filtered = filterWriteMessages({
    source: "mem0",
    envelope,
    messages: [
      {
        role: "user",
        content: userText,
        timestamp: input.payload.candidate.event_time,
      },
      {
        role: "assistant",
        content: assistantText,
        timestamp: input.payload.candidate.ingest_time,
      },
    ],
  });

  return {
    messages: filtered.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
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
      ...(envelope
        ? {
            message_envelope: {
              role: envelope.role,
              name: envelope.name,
              created_at: envelope.created_at,
              metadata: envelope.metadata,
              ignore_roles: envelope.ignore_roles,
              filtered_roles: filtered.filteredRoles,
              effective_roles: filtered.effectiveRoles,
            } satisfies P3MessageEnvelope & {
              filtered_roles: P3MessageRole[];
              effective_roles: P3MessageRole[];
            },
          }
        : {}),
      ...resolveOcIdentityMetadata(input.payload),
    },
  };
};

const buildGraphitiBody = (params: {
  input: P3RemoteWriteInput;
  ontologyV1?: CreateHttpBridgeWriterOptions["ontologyV1"];
}): Record<string, unknown> => {
  const { input } = params;
  const { userText, assistantText } = resolveWriteTexts(input.payload);
  const envelope = resolveMessageEnvelope(input.payload);

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

  const filtered = filterWriteMessages({
    source: "graphiti",
    envelope,
    messages: [
      {
        role: "user",
        content: userText,
        timestamp: input.payload.candidate.event_time,
      },
      {
        role: "assistant",
        content: assistantText,
        timestamp: input.payload.candidate.ingest_time,
      },
    ],
  });

  let ontologyMarkerLine: string | null = null;
  if (params.ontologyV1) {
    const ontologyResult = buildOntologyV1WriteResult({
      event: input.event,
      payload: input.payload,
      options: params.ontologyV1,
    });
    ontologyMarkerLine = ontologyResult.marker_line;
    params.ontologyV1.onTrace?.(ontologyResult.trace);
  }

  const messages = filtered.messages.map((message) => ({
    content: message.content,
    role_type: message.role,
    role: message.role,
    timestamp: message.timestamp,
  }));
  if (ontologyMarkerLine && messages.length > 0) {
    const assistantIndex = messages.findLastIndex((message) => message.role === "assistant");
    const targetIndex = assistantIndex >= 0 ? assistantIndex : messages.length - 1;
    const target = messages[targetIndex];
    if (target) {
      target.content = appendOntologyMarkerLine(target.content, ontologyMarkerLine);
    }
  }

  return {
    group_id: input.event.session_key,
    messages,
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

const toRequestBody = (params: {
  source: "mem0" | "graphiti";
  input: P3RemoteWriteInput;
  options: CreateHttpBridgeWriterOptions;
}): Record<string, unknown> => {
  if (params.source === "mem0") {
    return buildMem0Body(params.input);
  }
  return buildGraphitiBody({
    input: params.input,
    ontologyV1: params.options.ontologyV1,
  });
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
      const body = toRequestBody({
        source: options.source,
        input,
        options,
      });
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
