import { createTokenIssuer, type TokenIssueInput, type TokenIssuer } from "../auth/token-issuer.js";
import { buildLocalRollbackFlags, type JarvisBridgeFlags } from "../config/flags.js";

type FetchLike = typeof fetch;

type JsonObject = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeScope = (value: unknown): string[] | undefined => {
  if (typeof value === "string") {
    const normalized = value
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    return normalized.length > 0 ? normalized : undefined;
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
    return normalized.length > 0 ? normalized : undefined;
  }

  return undefined;
};

const normalizeAuthContext = (value: unknown): TokenIssueInput | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const sub = normalizeString(value.sub);
  const tenantId = normalizeString(value.tenant_id);
  const workspaceId = normalizeString(value.workspace_id);
  const actorRole = normalizeString(value.actor_role);
  const scope = normalizeScope(value.scope);
  if (!sub || !tenantId || !workspaceId || !actorRole || !scope) {
    return undefined;
  }

  return {
    sub,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    actor_role: actorRole,
    scope,
  };
};

const inferAuthContextFromPayload = (payload: unknown): Partial<TokenIssueInput> | undefined => {
  if (!isRecord(payload)) {
    return undefined;
  }

  const envelope = isRecord(payload.envelope) ? payload.envelope : undefined;
  const actor = isRecord(payload.actor) ? payload.actor : undefined;

  return {
    sub: normalizeString(actor?.actor_id) ?? "memory-jarvis-bridge",
    tenant_id: normalizeString(envelope?.tenant_id),
    workspace_id: normalizeString(envelope?.workspace_id),
  };
};

const mergeAuthContext = (
  payload: unknown,
  explicitContext: TokenIssueInput | undefined,
  fallbackContext: Partial<TokenIssueInput> | undefined,
  defaultScope: string,
): TokenIssueInput | undefined => {
  const inferredContext = inferAuthContextFromPayload(payload);
  const merged = {
    ...(fallbackContext ?? {}),
    ...(inferredContext ?? {}),
    ...(explicitContext ?? {}),
  };

  return normalizeAuthContext({
    sub: merged.sub,
    tenant_id: merged.tenant_id,
    workspace_id: merged.workspace_id,
    actor_role: merged.actor_role ?? "agent",
    scope: merged.scope ?? [defaultScope],
  });
};

const createDefaultTokenIssuer = (flags: JarvisBridgeFlags): TokenIssuer | undefined => {
  const signingKey = normalizeString(flags.jarvis_api_key);
  const issuer = normalizeString(process.env.JARVIS_TOKEN_ISSUER) ?? "https://clawdbot.local";
  const audience = normalizeString(process.env.JARVIS_TOKEN_AUDIENCE) ?? "jarvis-kb-v0";
  if (!signingKey) {
    return undefined;
  }

  return createTokenIssuer({
    issuer,
    audience,
    signingKey,
  });
};

export type JarvisAuthContext = TokenIssueInput;

export type JarvisReadRoute = "local" | "jarvis";

export type JarvisReadRoutingDecision = {
  route: JarvisReadRoute;
  shadow_compare: boolean;
  cutover_percent: number;
  read_mode: JarvisBridgeFlags["read_mode"];
};

const hashToPercentBucket = (seed: string): number => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % 100;
};

const resolveReadRoutingDecision = (
  flags: JarvisBridgeFlags,
  hasRemoteBaseUrl: boolean,
  routeKey: string,
): JarvisReadRoutingDecision => {
  if (!hasRemoteBaseUrl || flags.read_mode === "local") {
    return {
      route: "local",
      shadow_compare: false,
      cutover_percent: flags.cutover_percent,
      read_mode: flags.read_mode,
    };
  }

  if (flags.read_mode === "shadow") {
    return {
      route: "local",
      shadow_compare: true,
      cutover_percent: flags.cutover_percent,
      read_mode: flags.read_mode,
    };
  }

  if (flags.read_mode === "remote") {
    return {
      route: "jarvis",
      shadow_compare: false,
      cutover_percent: 100,
      read_mode: flags.read_mode,
    };
  }

  if (flags.cutover_percent <= 0) {
    return {
      route: "local",
      shadow_compare: false,
      cutover_percent: 0,
      read_mode: flags.read_mode,
    };
  }

  if (flags.cutover_percent >= 100) {
    return {
      route: "jarvis",
      shadow_compare: false,
      cutover_percent: 100,
      read_mode: flags.read_mode,
    };
  }

  const bucket = hashToPercentBucket(routeKey);
  return {
    route: bucket < flags.cutover_percent ? "jarvis" : "local",
    shadow_compare: false,
    cutover_percent: flags.cutover_percent,
    read_mode: flags.read_mode,
  };
};

export type JarvisClient = {
  canReadRemote(): boolean;
  canWriteRemote(): boolean;
  resolveReadRoute(routeKey: string): JarvisReadRoutingDecision;
  buildEmergencyRollbackFlags(): JarvisBridgeFlags;
  read(query: string, authContext?: JarvisAuthContext): Promise<unknown[] | null>;
  write(payload: unknown, authContext?: JarvisAuthContext): Promise<boolean>;
};

type CreateJarvisClientOptions = {
  fetchImpl?: FetchLike;
  tokenIssuer?: TokenIssuer;
  defaultAuthContext?: Partial<JarvisAuthContext>;
};

const buildHeaders = (params: {
  flags: JarvisBridgeFlags;
  tokenIssuer?: TokenIssuer;
  authContext?: JarvisAuthContext;
}): Record<string, string> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const tokenResult = params.authContext
    ? params.tokenIssuer?.issueToken(params.authContext)
    : undefined;
  if (tokenResult?.ok) {
    headers.Authorization = `Bearer ${tokenResult.token}`;
    return headers;
  }

  if (params.flags.jarvis_api_key) {
    headers.Authorization = `Bearer ${params.flags.jarvis_api_key}`;
  }

  return headers;
};

const trimRightSlash = (value: string): string => value.replace(/\/$/, "");

export function createJarvisClient(
  flags: JarvisBridgeFlags,
  options: CreateJarvisClientOptions = {},
): JarvisClient {
  const baseUrl = flags.jarvis_base_url ? trimRightSlash(flags.jarvis_base_url) : undefined;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const tokenIssuer = options.tokenIssuer ?? createDefaultTokenIssuer(flags);
  const defaultAuthContext = options.defaultAuthContext;

  const canReadRemote = (): boolean => {
    if (!baseUrl || flags.read_mode === "local") {
      return false;
    }

    if (flags.read_mode === "primary") {
      return flags.cutover_percent > 0;
    }

    return true;
  };
  const canWriteRemote = (): boolean => flags.write_mode === "remote" && Boolean(baseUrl);

  return {
    canReadRemote,
    canWriteRemote,
    resolveReadRoute(routeKey: string): JarvisReadRoutingDecision {
      return resolveReadRoutingDecision(flags, Boolean(baseUrl), routeKey);
    },
    buildEmergencyRollbackFlags(): JarvisBridgeFlags {
      return buildLocalRollbackFlags(flags);
    },
    async read(query: string, authContext?: JarvisAuthContext): Promise<unknown[] | null> {
      const decision = resolveReadRoutingDecision(flags, Boolean(baseUrl), query);
      if (decision.route !== "jarvis" || !baseUrl) {
        return null;
      }

      const resolvedAuthContext = mergeAuthContext(
        {
          query,
        },
        authContext,
        defaultAuthContext,
        "kb:read",
      );

      const response = await fetchImpl(`${baseUrl}/memory/read`, {
        method: "POST",
        headers: buildHeaders({
          flags,
          tokenIssuer,
          authContext: resolvedAuthContext,
        }),
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(flags.request_timeout_ms),
      });

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as { items?: unknown[] };
      return Array.isArray(payload.items) ? payload.items : [];
    },
    async write(payload: unknown, authContext?: JarvisAuthContext): Promise<boolean> {
      if (!canWriteRemote() || !baseUrl) {
        return false;
      }

      const resolvedAuthContext = mergeAuthContext(
        payload,
        authContext,
        defaultAuthContext,
        "kb:write",
      );

      const response = await fetchImpl(`${baseUrl}/memory/write`, {
        method: "POST",
        headers: buildHeaders({
          flags,
          tokenIssuer,
          authContext: resolvedAuthContext,
        }),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(flags.request_timeout_ms),
      });

      return response.ok;
    },
  };
}
