import { createHash } from "node:crypto";
import { buildOcIdentityFields } from "../../../../src/routing/session-key.js";
import type { BridgeFactRecord } from "../p2/types.js";
import type { P3OutboxStore } from "./outbox-store.js";
import { P3_MESSAGE_ROLE_VALUES, type P3MessageRole, type P3WriteMode } from "./types.js";

type AgentLikeMessage = {
  role?: string;
  content?: unknown;
};

const normalizeText = (value: unknown): string => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (!Array.isArray(value)) {
    return "";
  }

  const chunks: string[] = [];
  for (const block of value) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const record = block as Record<string, unknown>;
    if (record.type === "text" && typeof record.text === "string") {
      chunks.push(record.text);
    }
  }

  return chunks.join("\n").trim();
};

const buildMemoryId = (parts: string[]): string => {
  return createHash("sha1").update(parts.join("|"), "utf8").digest("hex").slice(0, 16);
};

const shortHash = (value: string): string => {
  return createHash("sha1").update(value, "utf8").digest("hex").slice(0, 8);
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

export type ExtractedTurnCandidate = {
  candidate: BridgeFactRecord;
  userText: string;
  assistantText: string;
  sourceRef: string;
  idempotencyKey: string;
};

export function extractCandidateFromTurn(params: {
  messages: unknown[];
  sessionKey: string;
  now: Date;
}): ExtractedTurnCandidate | null {
  const typedMessages = params.messages.filter((item): item is AgentLikeMessage =>
    Boolean(item && typeof item === "object"),
  );

  const lastUser = [...typedMessages]
    .reverse()
    .find((message) => message.role === "user" && normalizeText(message.content).length > 0);
  const lastAssistant = [...typedMessages]
    .reverse()
    .find((message) => message.role === "assistant" && normalizeText(message.content).length > 0);

  const userText = normalizeText(lastUser?.content ?? "");
  const assistantText = normalizeText(lastAssistant?.content ?? "");
  const baseText = `${userText}\n${assistantText}`.trim();

  if (!baseText) {
    return null;
  }

  const explicitPreference = userText.match(/my\s+([a-z0-9_.-]+)\s+is\s+([^.!?\n]+)/i);
  const softPreference = userText.match(/i\s+(?:prefer|like|use)\s+([^.!?\n]+)/i);

  let factKey = "conversation.summary";
  let factValue = (assistantText || userText).slice(0, 220).trim();
  let confidence = 0.62;

  if (explicitPreference) {
    factKey = `prefs.${String(explicitPreference[1] ?? "preference").toLowerCase()}`;
    factValue = String(explicitPreference[2] ?? "").trim();
    confidence = 0.92;
  } else if (softPreference) {
    factKey = "prefs.preference";
    factValue = String(softPreference[1] ?? "").trim();
    confidence = 0.8;
  }

  if (!factValue) {
    return null;
  }

  const nowIso = params.now.toISOString();
  const dayKey = nowIso.slice(0, 10);
  const sourceRef = `agent_end:${params.sessionKey}:${typedMessages.length}:${shortHash(baseText)}`;
  const idempotencyKey = `${params.sessionKey}:${sourceRef}`;
  const candidate: BridgeFactRecord = {
    memory_id: buildMemoryId([params.sessionKey, factKey, factValue]),
    fact_key: factKey,
    fact_value: factValue,
    ttl_class: "online_incremental",
    confidence,
    status: "active",
    source_event_id: sourceRef,
    detail_path: `memory/online/${dayKey}.md`,
    trigger_keywords: [],
    active_context: true,
    event_time: nowIso,
    ingest_time: nowIso,
  };

  return {
    candidate,
    userText,
    assistantText,
    sourceRef,
    idempotencyKey,
  };
}

export type OnlineIndexCheckProvider = (params: {
  sessionKey: string;
  sourceRef: string;
}) => Promise<boolean>;

const resolveIndexCheckOk = async (
  provider: OnlineIndexCheckProvider | undefined,
  params: { sessionKey: string; sourceRef: string },
): Promise<boolean> => {
  if (!provider) {
    return false;
  }

  try {
    return (await provider(params)) === true;
  } catch {
    return false;
  }
};

export function createOnlineIncrementalCapture(params: {
  writeMode: P3WriteMode;
  outbox: P3OutboxStore;
  now?: () => number;
  effectiveModel: string;
  indexCheckProvider?: OnlineIndexCheckProvider;
  messageEnvelope?: {
    enabled?: boolean;
    ignoreRoles?: unknown;
  };
}) {
  const now = params.now ?? Date.now;

  return {
    async onAgentEnd(
      event: {
        messages?: unknown[];
        success?: boolean;
      },
      ctx: { sessionKey?: string },
    ): Promise<void> {
      if (params.writeMode === "off") {
        return;
      }
      if (!event.success || !ctx.sessionKey || !Array.isArray(event.messages)) {
        return;
      }

      const extracted = extractCandidateFromTurn({
        messages: event.messages,
        sessionKey: ctx.sessionKey,
        now: new Date(now()),
      });

      if (!extracted) {
        return;
      }

      const indexCheckOk = await resolveIndexCheckOk(params.indexCheckProvider, {
        sessionKey: ctx.sessionKey,
        sourceRef: extracted.sourceRef,
      });
      const ocIdentity = buildOcIdentityFields({
        sessionKey: ctx.sessionKey,
        sourceRef: extracted.sourceRef,
        idempotencyKey: extracted.idempotencyKey,
        candidateMemoryId: extracted.candidate.memory_id,
      });
      const envelopeEnabled = params.messageEnvelope?.enabled === true;
      const envelopeIgnoreRoles = normalizeIgnoreRoles(params.messageEnvelope?.ignoreRoles);
      const messageEnvelope = envelopeEnabled
        ? {
            role: "user" as const,
            name: ocIdentity.oc_user_id ?? `session:${ctx.sessionKey}`,
            created_at: extracted.candidate.event_time,
            metadata: {
              session_key: ctx.sessionKey,
              source_ref: extracted.sourceRef,
              model: params.effectiveModel,
              ...ocIdentity,
            },
            ignore_roles: envelopeIgnoreRoles,
          }
        : undefined;

      params.outbox.enqueue({
        idempotencyKey: extracted.idempotencyKey,
        sessionKey: ctx.sessionKey,
        sourceRef: extracted.sourceRef,
        sourceTier: "online_incremental",
        writeMode: params.writeMode,
        effectiveModel: params.effectiveModel,
        payload: {
          candidate: extracted.candidate,
          metadata: {
            userText: extracted.userText,
            assistantText: extracted.assistantText,
            indexCheckOk,
            ...ocIdentity,
          },
          ...(messageEnvelope ? { message_envelope: messageEnvelope } : {}),
        },
      });
    },
  };
}
