import type { ChatType } from "../channels/chat-type.js";
import { parseAgentSessionKey, type ParsedAgentSessionKey } from "../sessions/session-key-utils.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "./account-id.js";

export {
  getSubagentDepth,
  isCronSessionKey,
  isAcpSessionKey,
  isSubagentSessionKey,
  parseAgentSessionKey,
  type ParsedAgentSessionKey,
} from "../sessions/session-key-utils.js";
export {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  normalizeOptionalAccountId,
} from "./account-id.js";

export const DEFAULT_AGENT_ID = "main";
export const DEFAULT_MAIN_KEY = "main";
export type SessionKeyShape = "missing" | "agent" | "legacy_or_alias" | "malformed_agent";

// Pre-compiled regex
const VALID_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const INVALID_CHARS_RE = /[^a-z0-9_-]+/g;
const LEADING_DASH_RE = /^-+/;
const TRAILING_DASH_RE = /-+$/;

function normalizeToken(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeMainKey(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed.toLowerCase() : DEFAULT_MAIN_KEY;
}

export function toAgentRequestSessionKey(storeKey: string | undefined | null): string | undefined {
  const raw = (storeKey ?? "").trim();
  if (!raw) {
    return undefined;
  }
  return parseAgentSessionKey(raw)?.rest ?? raw;
}

export function toAgentStoreSessionKey(params: {
  agentId: string;
  requestKey: string | undefined | null;
  mainKey?: string | undefined;
}): string {
  const raw = (params.requestKey ?? "").trim();
  if (!raw || raw === DEFAULT_MAIN_KEY) {
    return buildAgentMainSessionKey({ agentId: params.agentId, mainKey: params.mainKey });
  }
  const lowered = raw.toLowerCase();
  if (lowered.startsWith("agent:")) {
    return lowered;
  }
  if (lowered.startsWith("subagent:")) {
    return `agent:${normalizeAgentId(params.agentId)}:${lowered}`;
  }
  return `agent:${normalizeAgentId(params.agentId)}:${lowered}`;
}

export function resolveAgentIdFromSessionKey(sessionKey: string | undefined | null): string {
  const parsed = parseAgentSessionKey(sessionKey);
  return normalizeAgentId(parsed?.agentId ?? DEFAULT_AGENT_ID);
}

export function classifySessionKeyShape(sessionKey: string | undefined | null): SessionKeyShape {
  const raw = (sessionKey ?? "").trim();
  if (!raw) {
    return "missing";
  }
  if (parseAgentSessionKey(raw)) {
    return "agent";
  }
  return raw.toLowerCase().startsWith("agent:") ? "malformed_agent" : "legacy_or_alias";
}

export function normalizeAgentId(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return DEFAULT_AGENT_ID;
  }
  // Keep it path-safe + shell-friendly.
  if (VALID_ID_RE.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  // Best-effort fallback: collapse invalid characters to "-"
  return (
    trimmed
      .toLowerCase()
      .replace(INVALID_CHARS_RE, "-")
      .replace(LEADING_DASH_RE, "")
      .replace(TRAILING_DASH_RE, "")
      .slice(0, 64) || DEFAULT_AGENT_ID
  );
}

export function sanitizeAgentId(value: string | undefined | null): string {
  return normalizeAgentId(value);
}

export function buildAgentMainSessionKey(params: {
  agentId: string;
  mainKey?: string | undefined;
}): string {
  const agentId = normalizeAgentId(params.agentId);
  const mainKey = normalizeMainKey(params.mainKey);
  return `agent:${agentId}:${mainKey}`;
}

export function buildAgentPeerSessionKey(params: {
  agentId: string;
  mainKey?: string | undefined;
  channel: string;
  accountId?: string | null;
  peerKind?: ChatType | null;
  peerId?: string | null;
  identityLinks?: Record<string, string[]>;
  /** DM session scope. */
  dmScope?: "main" | "per-peer" | "per-channel-peer" | "per-account-channel-peer";
}): string {
  const peerKind = params.peerKind ?? "direct";
  if (peerKind === "direct") {
    const dmScope = params.dmScope ?? "main";
    let peerId = (params.peerId ?? "").trim();
    const linkedPeerId =
      dmScope === "main"
        ? null
        : resolveLinkedPeerId({
            identityLinks: params.identityLinks,
            channel: params.channel,
            peerId,
          });
    if (linkedPeerId) {
      peerId = linkedPeerId;
    }
    peerId = peerId.toLowerCase();
    if (dmScope === "per-account-channel-peer" && peerId) {
      const channel = (params.channel ?? "").trim().toLowerCase() || "unknown";
      const accountId = normalizeAccountId(params.accountId);
      return `agent:${normalizeAgentId(params.agentId)}:${channel}:${accountId}:direct:${peerId}`;
    }
    if (dmScope === "per-channel-peer" && peerId) {
      const channel = (params.channel ?? "").trim().toLowerCase() || "unknown";
      return `agent:${normalizeAgentId(params.agentId)}:${channel}:direct:${peerId}`;
    }
    if (dmScope === "per-peer" && peerId) {
      return `agent:${normalizeAgentId(params.agentId)}:direct:${peerId}`;
    }
    return buildAgentMainSessionKey({
      agentId: params.agentId,
      mainKey: params.mainKey,
    });
  }
  const channel = (params.channel ?? "").trim().toLowerCase() || "unknown";
  const peerId = ((params.peerId ?? "").trim() || "unknown").toLowerCase();
  return `agent:${normalizeAgentId(params.agentId)}:${channel}:${peerKind}:${peerId}`;
}

function resolveLinkedPeerId(params: {
  identityLinks?: Record<string, string[]>;
  channel: string;
  peerId: string;
}): string | null {
  const identityLinks = params.identityLinks;
  if (!identityLinks) {
    return null;
  }
  const peerId = params.peerId.trim();
  if (!peerId) {
    return null;
  }
  const candidates = new Set<string>();
  const rawCandidate = normalizeToken(peerId);
  if (rawCandidate) {
    candidates.add(rawCandidate);
  }
  const channel = normalizeToken(params.channel);
  if (channel) {
    const scopedCandidate = normalizeToken(`${channel}:${peerId}`);
    if (scopedCandidate) {
      candidates.add(scopedCandidate);
    }
  }
  if (candidates.size === 0) {
    return null;
  }
  for (const [canonical, ids] of Object.entries(identityLinks)) {
    const canonicalName = canonical.trim();
    if (!canonicalName) {
      continue;
    }
    if (!Array.isArray(ids)) {
      continue;
    }
    for (const id of ids) {
      const normalized = normalizeToken(id);
      if (normalized && candidates.has(normalized)) {
        return canonicalName;
      }
    }
  }
  return null;
}

export function buildGroupHistoryKey(params: {
  channel: string;
  accountId?: string | null;
  peerKind: "group" | "channel";
  peerId: string;
}): string {
  const channel = normalizeToken(params.channel) || "unknown";
  const accountId = normalizeAccountId(params.accountId);
  const peerId = params.peerId.trim().toLowerCase() || "unknown";
  return `${channel}:${accountId}:${params.peerKind}:${peerId}`;
}

export function resolveThreadSessionKeys(params: {
  baseSessionKey: string;
  threadId?: string | null;
  parentSessionKey?: string;
  useSuffix?: boolean;
  normalizeThreadId?: (threadId: string) => string;
}): { sessionKey: string; parentSessionKey?: string } {
  const threadId = (params.threadId ?? "").trim();
  if (!threadId) {
    return { sessionKey: params.baseSessionKey, parentSessionKey: undefined };
  }
  const normalizedThreadId = (params.normalizeThreadId ?? ((value: string) => value.toLowerCase()))(
    threadId,
  );
  const useSuffix = params.useSuffix ?? true;
  const sessionKey = useSuffix
    ? `${params.baseSessionKey}:thread:${normalizedThreadId}`
    : params.baseSessionKey;
  return { sessionKey, parentSessionKey: params.parentSessionKey };
}

const OC_CHANNELS = [
  "telegram",
  "whatsapp",
  "discord",
  "irc",
  "googlechat",
  "slack",
  "signal",
  "imessage",
] as const;

type OcChannel = (typeof OC_CHANNELS)[number];

const OC_CHANNEL_SET: ReadonlySet<string> = new Set<string>(OC_CHANNELS);
const OC_SANITIZE_RE = /[^a-z0-9:_\-.]+/g;
const OC_LEADING_NON_ALNUM_RE = /^[^a-z0-9]+/;
const OC_TRAILING_SEPARATOR_RE = /[:._-]+$/;

export const OC_USER_ID_REGEX =
  /^ocu_v1:(telegram|whatsapp|discord|irc|googlechat|slack|signal|imessage):[a-z0-9][a-z0-9:_\-.]{0,127}$/;
export const OC_THREAD_ID_REGEX =
  /^oct_v1:(telegram|whatsapp|discord|irc|googlechat|slack|signal|imessage):[a-z0-9][a-z0-9:_\-.]{0,191}$/;
export const OC_MESSAGE_ID_REGEX =
  /^ocm_v1:(telegram|whatsapp|discord|irc|googlechat|slack|signal|imessage):[a-z0-9][a-z0-9:_\-.]{0,191}$/;

const normalizeOcPart = (value: string, maxLength: number): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(OC_SANITIZE_RE, "-")
    .replace(OC_LEADING_NON_ALNUM_RE, "")
    .replace(OC_TRAILING_SEPARATOR_RE, "");
  const sliced = normalized.slice(0, maxLength).replace(OC_TRAILING_SEPARATOR_RE, "");
  return sliced || "0";
};

const resolveOcChannel = (sessionKey: string): OcChannel => {
  const requestKey = toAgentRequestSessionKey(sessionKey) ?? sessionKey;
  const tokens = requestKey
    .split(":")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
  for (const token of tokens) {
    if (OC_CHANNEL_SET.has(token)) {
      return token as OcChannel;
    }
  }
  return "telegram";
};

const resolveOcUserSeed = (sessionKey: string): string => {
  const requestKey = toAgentRequestSessionKey(sessionKey) ?? sessionKey;
  const tokens = requestKey
    .split(":")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  const directIndex = tokens.findIndex((token) => token.toLowerCase() === "direct");
  if (directIndex >= 0 && directIndex < tokens.length - 1) {
    return tokens[directIndex + 1] ?? requestKey;
  }
  return requestKey;
};

const buildOcIdentityId = (params: {
  prefix: "ocu_v1" | "oct_v1" | "ocm_v1";
  channel: OcChannel;
  seed: string;
  maxLength: number;
}): string => {
  const part = normalizeOcPart(params.seed, params.maxLength);
  return `${params.prefix}:${params.channel}:${part}`;
};

export type OcIdentityFields = {
  oc_user_id: string;
  oc_thread_id: string;
  oc_message_id: string;
};

export function buildOcIdentityFields(params: {
  sessionKey: string;
  sourceRef?: string | null;
  idempotencyKey?: string | null;
  candidateMemoryId?: string | null;
}): OcIdentityFields {
  const sessionKey = (params.sessionKey ?? "").trim() || "session";
  const requestKey = toAgentRequestSessionKey(sessionKey) ?? sessionKey;
  const channel = resolveOcChannel(sessionKey);
  const messageSeed =
    (params.sourceRef ?? "").trim() ||
    (params.idempotencyKey ?? "").trim() ||
    (params.candidateMemoryId ?? "").trim() ||
    requestKey;

  return {
    oc_user_id: buildOcIdentityId({
      prefix: "ocu_v1",
      channel,
      seed: resolveOcUserSeed(sessionKey),
      maxLength: 128,
    }),
    oc_thread_id: buildOcIdentityId({
      prefix: "oct_v1",
      channel,
      seed: requestKey,
      maxLength: 192,
    }),
    oc_message_id: buildOcIdentityId({
      prefix: "ocm_v1",
      channel,
      seed: messageSeed,
      maxLength: 192,
    }),
  };
}

export function isValidOcUserId(value: unknown): value is string {
  return typeof value === "string" && OC_USER_ID_REGEX.test(value);
}

export function isValidOcThreadId(value: unknown): value is string {
  return typeof value === "string" && OC_THREAD_ID_REGEX.test(value);
}

export function isValidOcMessageId(value: unknown): value is string {
  return typeof value === "string" && OC_MESSAGE_ID_REGEX.test(value);
}
