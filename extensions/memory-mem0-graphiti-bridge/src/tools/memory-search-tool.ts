import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { RemoteSnippetStore } from "../bridge/remote-snippet-store.js";
import type {
  BridgeSearchHit,
  RemoteMemoryClient,
  RemoteSearchOptions,
} from "../client/mem0-client.js";
import type { BridgeFlags, BridgeRoute } from "../config/flags.js";
import type { ShadowReporter } from "../metrics/shadow-reporter.js";
import { contextAssemble } from "../p3/context-assemble.js";
import type {
  P3ContextAssembleInput,
  P3ContextAssembleResult,
  P3ContextBucket,
  P3MessageEnvelope,
} from "../p3/types.js";
import type { PrecisionKeyMatch, QuerySignature } from "../router/query-signature.js";
import { resolveReadPlan } from "../router/read-router.js";
import { resolveQuerySignature } from "../router/query-signature.js";

type BridgeSearchToolDeps = {
  flags: BridgeFlags;
  localTool: AnyAgentTool;
  snippetStore: RemoteSnippetStore;
  clients: {
    mem0: RemoteMemoryClient;
    graphiti: RemoteMemoryClient;
  };
  shadowReporter: ShadowReporter;
  sessionKey?: string;
};

const ALIAS_GROUPS = [
  ["telegram", "tg", "电报"],
  ["imessage", "苹果短信"],
  ["graphiti", "知识图谱", "图谱"],
  ["topology", "拓扑"],
  ["memory upgrade", "记忆升级"],
  ["openclaw", "clawdbot", "open claw"],
] as const;

const CONTEXT_BUCKETS = ["exact_id", "timeline", "decision_reason"] as const;

const MESSAGE_ROLES = ["user", "assistant", "system", "tool"] as const;

const ISO_TIME_PATTERN = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z/;

const compareAsciiStrings = (left: string, right: string): number => {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
};

const compareNumbersDesc = (left: number, right: number): number => {
  if (left === right) {
    return 0;
  }
  return left > right ? -1 : 1;
};

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 100) {
    return 100;
  }
  return Math.floor(value);
};

const hashToPercentBucket = (seed: string): number => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % 100;
};

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const buildPrecisionKeyPattern = (match: PrecisionKeyMatch): RegExp => {
  const escaped = escapeRegExp(match.value);
  if (match.kind === "endpoint_path") {
    return new RegExp(escaped, "i");
  }
  return new RegExp(`\\b${escaped}\\b`, "i");
};

const isPrecisionKeyHit = (params: {
  pattern: RegExp;
  snippet: string;
  path: string;
}): boolean => {
  return params.pattern.test(params.snippet) || params.pattern.test(params.path);
};

const isContextBucket = (value: string): value is P3ContextBucket => {
  return CONTEXT_BUCKETS.some((bucket) => bucket === value);
};

const asString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => asString(item)).filter((item): item is string => Boolean(item));
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const asNonEmptyRecord = (value: unknown): Record<string, unknown> | undefined => {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  return Object.keys(record).length > 0 ? record : undefined;
};

const asArray = (value: unknown): unknown[] => {
  return Array.isArray(value) ? value : [];
};

type RankedLocalResult = {
  index: number;
  record: Record<string, unknown>;
  path: string;
  snippet: string;
  score: number;
  exactMatch: boolean;
};

const rerankLocalResults = (params: {
  rawResults: unknown[];
  precisionPattern: RegExp | null;
}): { results: Array<Record<string, unknown>>; exactMatchCount: number } => {
  const ranked: RankedLocalResult[] = [];

  for (const [index, item] of params.rawResults.entries()) {
    const record = asRecord(item) ?? {};
    const path = asString(record.path) ?? "";
    const snippet = asString(record.snippet) ?? "";
    const score = asNumber(record.score) ?? 0;
    const exactMatch = params.precisionPattern
      ? isPrecisionKeyHit({ pattern: params.precisionPattern, snippet, path })
      : false;

    ranked.push({
      index,
      record,
      path,
      snippet,
      score,
      exactMatch,
    });
  }

  ranked.sort((left, right) => {
    if (left.exactMatch !== right.exactMatch) {
      return left.exactMatch ? -1 : 1;
    }

    const scoreCompare = compareNumbersDesc(left.score, right.score);
    if (scoreCompare !== 0) {
      return scoreCompare;
    }

    const pathLowerCompare = compareAsciiStrings(left.path.toLowerCase(), right.path.toLowerCase());
    if (pathLowerCompare !== 0) {
      return pathLowerCompare;
    }
    const pathCompare = compareAsciiStrings(left.path, right.path);
    if (pathCompare !== 0) {
      return pathCompare;
    }

    const snippetLowerCompare = compareAsciiStrings(
      left.snippet.toLowerCase(),
      right.snippet.toLowerCase(),
    );
    if (snippetLowerCompare !== 0) {
      return snippetLowerCompare;
    }
    const snippetCompare = compareAsciiStrings(left.snippet, right.snippet);
    if (snippetCompare !== 0) {
      return snippetCompare;
    }

    return left.index - right.index;
  });

  const exactMatchCount = ranked.reduce((sum, item) => sum + (item.exactMatch ? 1 : 0), 0);
  return {
    results: ranked.map((item) => item.record),
    exactMatchCount,
  };
};

type RankedRemoteHit = {
  index: number;
  hit: BridgeSearchHit;
  path: string;
  remoteId: string;
  score: number;
  snippet: string;
  exactMatch: boolean;
};

const rerankRemoteHits = (params: {
  hits: BridgeSearchHit[];
  precisionPattern: RegExp | null;
}): { hits: BridgeSearchHit[]; exactMatchCount: number } => {
  const ranked: RankedRemoteHit[] = params.hits.map((hit, index) => {
    const exactMatch = params.precisionPattern
      ? isPrecisionKeyHit({
          pattern: params.precisionPattern,
          snippet: hit.snippet,
          path: hit.path,
        })
      : false;

    return {
      index,
      hit,
      path: hit.path,
      remoteId: hit.remoteId,
      score: hit.score,
      snippet: hit.snippet,
      exactMatch,
    };
  });

  ranked.sort((left, right) => {
    if (left.exactMatch !== right.exactMatch) {
      return left.exactMatch ? -1 : 1;
    }

    const scoreCompare = compareNumbersDesc(left.score, right.score);
    if (scoreCompare !== 0) {
      return scoreCompare;
    }

    const remoteLowerCompare = compareAsciiStrings(
      left.remoteId.toLowerCase(),
      right.remoteId.toLowerCase(),
    );
    if (remoteLowerCompare !== 0) {
      return remoteLowerCompare;
    }
    const remoteCompare = compareAsciiStrings(left.remoteId, right.remoteId);
    if (remoteCompare !== 0) {
      return remoteCompare;
    }

    const pathLowerCompare = compareAsciiStrings(left.path.toLowerCase(), right.path.toLowerCase());
    if (pathLowerCompare !== 0) {
      return pathLowerCompare;
    }
    const pathCompare = compareAsciiStrings(left.path, right.path);
    if (pathCompare !== 0) {
      return pathCompare;
    }

    const snippetLowerCompare = compareAsciiStrings(
      left.snippet.toLowerCase(),
      right.snippet.toLowerCase(),
    );
    if (snippetLowerCompare !== 0) {
      return snippetLowerCompare;
    }
    const snippetCompare = compareAsciiStrings(left.snippet, right.snippet);
    if (snippetCompare !== 0) {
      return snippetCompare;
    }

    return left.index - right.index;
  });

  const exactMatchCount = ranked.reduce((sum, item) => sum + (item.exactMatch ? 1 : 0), 0);
  return {
    hits: ranked.map((item) => item.hit),
    exactMatchCount,
  };
};

const jsonResult = (payload: unknown): AgentToolResult<unknown> => {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    details: payload,
  };
};

const readQuery = (params: unknown): string | null => {
  const record = asRecord(params);
  if (!record) {
    return null;
  }
  const query = record.query;
  if (typeof query !== "string") {
    return null;
  }
  const normalized = query.trim();
  return normalized.length > 0 ? normalized : null;
};

const readFilters = (params: unknown): Record<string, unknown> | undefined => {
  const record = asRecord(params);
  if (!record) {
    return undefined;
  }
  const metadata = asRecord(record.metadata);
  return asNonEmptyRecord(record.filters) ?? asNonEmptyRecord(metadata?.filters);
};

const readCriteria = (params: unknown): Record<string, unknown> | undefined => {
  const record = asRecord(params);
  if (!record) {
    return undefined;
  }
  const metadata = asRecord(record.metadata);
  return asNonEmptyRecord(record.criteria) ?? asNonEmptyRecord(metadata?.criteria);
};

const readContextBucket = (params: unknown): P3ContextBucket | null => {
  const record = asRecord(params);
  if (!record) {
    return null;
  }
  const bucket = asString(record.bucket)?.toLowerCase();
  if (!bucket || !isContextBucket(bucket)) {
    return null;
  }
  return bucket;
};

const parseMessageEnvelope = (value: unknown): P3MessageEnvelope | undefined => {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const roleValue = asString(record.role)?.toLowerCase();
  const role = MESSAGE_ROLES.find((candidate) => candidate === roleValue);
  const name = asString(record.name);
  const createdAt = asString(record.created_at);
  const metadata = asRecord(record.metadata);
  const ignoreRoles = asStringArray(record.ignore_roles)
    .map((ignoreRole) => ignoreRole.toLowerCase())
    .filter((ignoreRole): ignoreRole is (typeof MESSAGE_ROLES)[number] => {
      return MESSAGE_ROLES.some((candidate) => candidate === ignoreRole);
    });

  const envelope: P3MessageEnvelope = {};
  if (role) {
    envelope.role = role;
  }
  if (name) {
    envelope.name = name;
  }
  if (createdAt) {
    envelope.created_at = createdAt;
  }
  if (metadata) {
    envelope.metadata = metadata;
  }
  if (ignoreRoles.length > 0) {
    envelope.ignore_roles = ignoreRoles;
  }

  return Object.keys(envelope).length > 0 ? envelope : undefined;
};

const extractCreatedAt = (snippet: string): string | undefined => {
  const matched = snippet.match(ISO_TIME_PATTERN);
  if (!matched) {
    return undefined;
  }

  const parsed = Date.parse(matched[0]);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return new Date(parsed).toISOString();
};

const toContextAssembleInput = (params: {
  toolCallId: string;
  query: string;
  bucket: P3ContextBucket;
  rawParams: unknown;
  remoteHits: BridgeSearchHit[];
}): P3ContextAssembleInput => {
  const record = asRecord(params.rawParams);
  const metadataRecord = asRecord(record?.metadata);

  const messageEnvelope =
    parseMessageEnvelope(record?.message_envelope) ??
    parseMessageEnvelope(metadataRecord?.message_envelope);

  return {
    query_id: params.toolCallId,
    query_text: params.query,
    bucket: params.bucket,
    retrieval_hits: params.remoteHits.map((hit) => ({
      source_id: hit.path,
      snippet: hit.snippet,
      score: hit.score,
      created_at: extractCreatedAt(hit.snippet),
    })),
    oc_user_id: asString(record?.oc_user_id) ?? asString(metadataRecord?.oc_user_id),
    oc_thread_id: asString(record?.oc_thread_id) ?? asString(metadataRecord?.oc_thread_id),
    oc_message_id: asString(record?.oc_message_id) ?? asString(metadataRecord?.oc_message_id),
    aliases: asStringArray(record?.aliases),
    message_envelope: messageEnvelope,
    timezone_hint: asString(record?.timezone_hint),
    max_events: asNumber(record?.max_events),
    constraints: asStringArray(record?.constraints),
    risk_flags: asStringArray(record?.risk_flags),
  };
};

const uniqueQueries = (queries: string[]): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const query of queries) {
    const normalized = query.trim();
    if (normalized.length === 0) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized);
  }

  return output;
};

const expandAliasQueries = (query: string): string[] => {
  const variants = [query];
  const lowered = query.toLowerCase();

  for (const group of ALIAS_GROUPS) {
    const matched = group.find((alias) => lowered.includes(alias.toLowerCase()));
    if (!matched) {
      continue;
    }

    for (const alias of group) {
      if (alias.toLowerCase() === matched.toLowerCase()) {
        continue;
      }

      variants.push(query.replace(new RegExp(matched, "ig"), alias));
    }
  }

  return uniqueQueries(variants).slice(0, 4);
};

const dedupeHits = (hits: BridgeSearchHit[]): BridgeSearchHit[] => {
  const seen = new Set<string>();
  const output: BridgeSearchHit[] = [];

  for (const hit of hits) {
    const key = `${hit.source}:${hit.remoteId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(hit);
  }

  return output;
};

const searchRemote = async (params: {
  route: BridgeRoute;
  query: string;
  clients: BridgeSearchToolDeps["clients"];
  aliasNormalization: boolean;
  searchOptions?: RemoteSearchOptions;
}): Promise<BridgeSearchHit[]> => {
  const searchQueries = params.aliasNormalization
    ? expandAliasQueries(params.query)
    : [params.query];
  const allHits: BridgeSearchHit[] = [];

  for (const query of searchQueries) {
    const hits =
      params.route === "mem0"
        ? await params.clients.mem0.search(query, params.searchOptions)
        : params.route === "graphiti"
          ? await params.clients.graphiti.search(query, params.searchOptions)
          : [];

    allHits.push(...hits);
  }

  return dedupeHits(allHits);
};

type RemoteSearchAttempt = {
  route: BridgeRoute;
  hits: BridgeSearchHit[];
  latencyMs: number;
  error?: unknown;
};

const searchRemoteWithDiagnostics = async (params: {
  route: BridgeRoute;
  query: string;
  clients: BridgeSearchToolDeps["clients"];
  aliasNormalization: boolean;
  searchOptions?: RemoteSearchOptions;
}): Promise<RemoteSearchAttempt> => {
  const startedAt = Date.now();
  try {
    const hits = await searchRemote(params);
    return {
      route: params.route,
      hits,
      latencyMs: Math.max(0, Date.now() - startedAt),
    };
  } catch (error) {
    return {
      route: params.route,
      hits: [],
      latencyMs: Math.max(0, Date.now() - startedAt),
      error,
    };
  }
};

const readErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const readErrorStatus = (error: unknown): number | null => {
  const record = asRecord(error);
  const direct = asNumber(record?.status ?? record?.statusCode);
  if (typeof direct === "number") {
    return Math.floor(direct);
  }

  const message = readErrorMessage(error);
  const match = message.match(/\b([45]\d{2})\b/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const isTimeoutError = (error: unknown): boolean => {
  const name = error instanceof Error ? error.name : "";
  const message = readErrorMessage(error);
  const lowered = `${name} ${message}`.toLowerCase();
  return (
    lowered.includes("timeout") ||
    lowered.includes("timed out") ||
    lowered.includes("abort") ||
    lowered.includes("aborted")
  );
};

const classifyFallbackReason = (attempt: RemoteSearchAttempt): string => {
  if (!attempt.error) {
    return "empty_results";
  }

  if (isTimeoutError(attempt.error)) {
    return "timeout";
  }

  const status = readErrorStatus(attempt.error);
  if (typeof status === "number" && status >= 500 && status <= 599) {
    return "http_5xx";
  }

  return "remote_error";
};

const createRouteTrace = (params: {
  readMode: BridgeFlags["read_mode"];
  readPlan: ReturnType<typeof resolveReadPlan>;
  primaryRoute: BridgeRoute;
  selectedRoute: BridgeRoute;
}): Record<string, unknown> => {
  return {
    read_mode: params.readMode,
    reason: params.readPlan.reason,
    intent: params.readPlan.intent,
    user_route: params.readPlan.userRoute,
    candidate_route: params.readPlan.candidateRoute,
    primary_route: params.primaryRoute,
    fallback_route: params.readPlan.fallbackRoute,
    selected_route: params.selectedRoute,
  };
};

const createFallbackTrace = (params: {
  triggered: boolean;
  reason: string | null;
  primaryAttempt: RemoteSearchAttempt;
  fallbackAttempt?: RemoteSearchAttempt;
  resultRoute: BridgeRoute;
}): Record<string, unknown> => {
  const fallbackAttempt = params.fallbackAttempt;
  return {
    triggered: params.triggered,
    reason: params.reason,
    result_route: params.resultRoute,
    primary_error: params.primaryAttempt.error
      ? readErrorMessage(params.primaryAttempt.error)
      : null,
    primary_status: readErrorStatus(params.primaryAttempt.error),
    primary_latency_ms: params.primaryAttempt.latencyMs,
    fallback_attempted: Boolean(fallbackAttempt),
    fallback_route_attempted: fallbackAttempt?.route ?? null,
    fallback_error: fallbackAttempt?.error ? readErrorMessage(fallbackAttempt.error) : null,
    fallback_latency_ms: fallbackAttempt?.latencyMs ?? null,
    total_latency_ms: params.primaryAttempt.latencyMs + (fallbackAttempt?.latencyMs ?? 0),
  };
};

const createPrecisionGuardTrace = (params: {
  enabled: boolean;
  signature: QuerySignature;
  triggered: boolean;
  localExactMatchCount: number;
  remoteExactMatchCount: number | null;
  forcedLocal: boolean;
  selectedRoute: BridgeRoute;
  decision: string;
}): Record<string, unknown> => {
  const precisionKey = params.signature.precisionKey;
  return {
    enabled: params.enabled,
    triggered: params.triggered,
    decision: params.decision,
    selected_route: params.selectedRoute,
    forced_local: params.forcedLocal,
    signature: {
      version: params.signature.version,
      precision_key: precisionKey
        ? {
            kind: precisionKey.kind,
            value: precisionKey.value,
            normalized_value: precisionKey.normalizedValue,
            match_start: precisionKey.matchStart,
            match_end: precisionKey.matchEnd,
          }
        : null,
    },
    local_exact_match_count: params.localExactMatchCount,
    remote_exact_match_count: params.remoteExactMatchCount,
  };
};

const withLocalDiagnostics = (params: {
  localResult: AgentToolResult<unknown>;
  localDetails: Record<string, unknown> | undefined;
  routeTrace: Record<string, unknown>;
  fallbackTrace: Record<string, unknown>;
  signature?: QuerySignature;
  guardTrace?: Record<string, unknown>;
  resultsOverride?: Array<Record<string, unknown>>;
}): AgentToolResult<unknown> => {
  const details: Record<string, unknown> = {
    ...(params.localDetails ?? {}),
    source: "local",
    route: params.routeTrace,
    fallback: params.fallbackTrace,
  };

  if (params.signature) {
    details.signature = params.signature;
  }
  if (params.guardTrace) {
    details.guard = params.guardTrace;
  }
  if (params.resultsOverride) {
    details.results = params.resultsOverride;
  }

  return {
    ...params.localResult,
    details,
  };
};

const mapBridgeHitsToMemoryResults = (hits: BridgeSearchHit[]): Array<Record<string, unknown>> => {
  return hits.map((hit) => ({
    path: hit.path,
    startLine: hit.startLine,
    endLine: hit.endLine,
    score: hit.score,
    snippet: hit.snippet,
    source: "memory",
    structure: hit.structure,
  }));
};

const buildStructureMetrics = (hits: BridgeSearchHit[]): Record<string, number> => {
  const counts = {
    facts: 0,
    episodes: 0,
    nodes: 0,
  };

  for (const hit of hits) {
    const structure = String(hit.structure ?? "").toLowerCase();
    if (structure === "facts") {
      counts.facts += 1;
    } else if (structure === "episodes") {
      counts.episodes += 1;
    } else if (structure === "nodes") {
      counts.nodes += 1;
    }
  }

  return counts;
};

const toRemotePayload = (params: {
  localDetails: Record<string, unknown> | undefined;
  remoteRoute: BridgeRoute;
  remoteHits: BridgeSearchHit[];
  readMode: BridgeFlags["read_mode"];
  aliasNormalization: boolean;
  routeTrace: Record<string, unknown>;
  fallbackTrace: Record<string, unknown>;
  contextAssembleResult?: P3ContextAssembleResult;
  signature?: QuerySignature;
  guardTrace?: Record<string, unknown>;
}): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    ...(params.localDetails ?? {}),
    results: mapBridgeHitsToMemoryResults(params.remoteHits),
    source: params.remoteRoute,
    provider: params.remoteRoute,
    model: params.remoteRoute,
    mode: params.readMode,
    alias_normalization: params.aliasNormalization,
    structures: buildStructureMetrics(params.remoteHits),
    route: params.routeTrace,
    fallback: params.fallbackTrace,
  };

  if (params.signature) {
    payload.signature = params.signature;
  }
  if (params.guardTrace) {
    payload.guard = params.guardTrace;
  }

  if (params.contextAssembleResult) {
    payload.context_assemble = params.contextAssembleResult;
  }

  if (!Object.prototype.hasOwnProperty.call(payload, "citations")) {
    payload.citations = "auto";
  }

  return payload;
};

export function createBridgeMemorySearchTool(deps: BridgeSearchToolDeps): AnyAgentTool {
  return {
    ...deps.localTool,
    name: "memory_search",
    execute: async (toolCallId, params) => {
      if (!deps.localTool.execute) {
        throw new Error("memory_search local tool missing execute handler");
      }

      const localResult = await deps.localTool.execute(toolCallId, params);
      const localDetails = asRecord(localResult.details);
      const localResults = asArray(localDetails?.results);
      const query = readQuery(params);
      if (!query) {
        return localResult;
      }

      const querySignature = resolveQuerySignature(query);
      const precisionGuardEnabled = deps.flags.read.precision_guard.enabled;
      const precisionPattern =
        precisionGuardEnabled && querySignature.precisionKey
          ? buildPrecisionKeyPattern(querySignature.precisionKey)
          : null;

      const localReranked = precisionPattern
        ? rerankLocalResults({ rawResults: localResults, precisionPattern })
        : null;
      const localExactMatchCount = localReranked?.exactMatchCount ?? 0;
      const localResultsOverride = localReranked?.results;

      const readPlan = resolveReadPlan({
        readMode: deps.flags.read_mode,
        cutoverPercent: deps.flags.cutover_percent,
        query,
        querySignature,
        routeSeed: deps.sessionKey ?? query,
        defaultRoute: deps.flags.routing.default_route,
        timelineRoute: deps.flags.routing.timeline_route,
        semanticRoute: deps.flags.routing.semantic_route,
        fallbackRoute: deps.flags.routing.fallback_route,
      });

      const responseRoute = readPlan.userRoute;
      const aliasNormalization = deps.flags.read.alias_normalization;
      const shouldForceLocal = precisionPattern !== null && localExactMatchCount > 0;

      const guardTraceBase = (params: {
        selectedRoute: BridgeRoute;
        decision: string;
        remoteExactMatchCount: number | null;
        forcedLocal: boolean;
      }): Record<string, unknown> | undefined => {
        if (!precisionGuardEnabled) {
          return undefined;
        }
        return createPrecisionGuardTrace({
          enabled: precisionGuardEnabled,
          signature: querySignature,
          triggered: precisionPattern !== null,
          localExactMatchCount,
          remoteExactMatchCount: params.remoteExactMatchCount,
          forcedLocal: params.forcedLocal,
          selectedRoute: params.selectedRoute,
          decision: params.decision,
        });
      };

      if (deps.flags.read_mode === "shadow" && readPlan.candidateRoute !== "local") {
        const filters = readFilters(params);
        const criteria = readCriteria(params);
        const shadowConfig = deps.flags.read.mem0_filters_criteria_shadow;
        const samplePercent = clampPercent(shadowConfig.sample_percent);
        const shouldUseFiltersCriteria =
          shadowConfig.enabled &&
          readPlan.candidateRoute === "mem0" &&
          samplePercent > 0 &&
          (filters || criteria) &&
          (samplePercent >= 100 ||
            hashToPercentBucket(deps.sessionKey ?? query) < samplePercent);

        const shadowSearchOptions: RemoteSearchOptions | undefined = shouldUseFiltersCriteria
          ? {
              filters,
              criteria,
            }
          : undefined;

        const shadowAttempt = await searchRemoteWithDiagnostics({
          route: readPlan.candidateRoute,
          query,
          clients: deps.clients,
          aliasNormalization,
          searchOptions: shadowSearchOptions,
        });
        const shadowReranked = precisionPattern
          ? rerankRemoteHits({ hits: shadowAttempt.hits, precisionPattern })
          : null;
        const remoteHits = shadowReranked?.hits ?? shadowAttempt.hits;
        const remoteExactMatchCount =
          precisionPattern !== null ? (shadowReranked?.exactMatchCount ?? 0) : null;

        deps.snippetStore.setFromSearchHits(remoteHits);
        deps.shadowReporter.record({
          sessionKey: deps.sessionKey,
          query,
          readMode: deps.flags.read_mode,
          candidateRoute: readPlan.candidateRoute,
          localCount: localResults.length,
          remoteCount: remoteHits.length,
          timestamp: new Date().toISOString(),
          shadow_filters_criteria: shouldUseFiltersCriteria,
        });

        const routeTrace = createRouteTrace({
          readMode: deps.flags.read_mode,
          readPlan,
          primaryRoute: readPlan.candidateRoute,
          selectedRoute: "local",
        });
        const fallbackTrace = createFallbackTrace({
          triggered: false,
          reason: null,
          primaryAttempt: shadowAttempt,
          resultRoute: "local",
        });

        const guardTrace = guardTraceBase({
          selectedRoute: "local",
          decision: shouldUseFiltersCriteria
            ? "shadow_compare_mem0_filters_criteria"
            : "shadow_compare",
          remoteExactMatchCount,
          forcedLocal: shouldForceLocal,
        });

        return withLocalDiagnostics({
          localResult,
          localDetails,
          routeTrace,
          fallbackTrace,
          signature: querySignature,
          guardTrace,
          resultsOverride: localResultsOverride,
        });
      }

      if (shouldForceLocal && responseRoute !== "local") {
        const routeTrace = createRouteTrace({
          readMode: deps.flags.read_mode,
          readPlan,
          primaryRoute: responseRoute,
          selectedRoute: "local",
        });
        const fallbackTrace = createFallbackTrace({
          triggered: false,
          reason: null,
          primaryAttempt: {
            route: responseRoute,
            hits: [],
            latencyMs: 0,
          },
          resultRoute: "local",
        });
        const guardTrace = guardTraceBase({
          selectedRoute: "local",
          decision: "forced_local_exact_match",
          remoteExactMatchCount: null,
          forcedLocal: true,
        });
        return withLocalDiagnostics({
          localResult,
          localDetails,
          routeTrace,
          fallbackTrace,
          signature: querySignature,
          guardTrace,
          resultsOverride: localResultsOverride,
        });
      }

      if (responseRoute === "local") {
        if (!precisionPattern) {
          return localResult;
        }

        const routeTrace = createRouteTrace({
          readMode: deps.flags.read_mode,
          readPlan,
          primaryRoute: "local",
          selectedRoute: "local",
        });
        const fallbackTrace = createFallbackTrace({
          triggered: false,
          reason: null,
          primaryAttempt: {
            route: "local",
            hits: [],
            latencyMs: 0,
          },
          resultRoute: "local",
        });
        const guardTrace = guardTraceBase({
          selectedRoute: "local",
          decision: localExactMatchCount > 0 ? "local_exact_match" : "local_no_exact_match",
          remoteExactMatchCount: null,
          forcedLocal: localExactMatchCount > 0,
        });

        return withLocalDiagnostics({
          localResult,
          localDetails,
          routeTrace,
          fallbackTrace,
          signature: querySignature,
          guardTrace,
          resultsOverride: localResultsOverride,
        });
      }

      const primaryAttempt = await searchRemoteWithDiagnostics({
        route: responseRoute,
        query,
        clients: deps.clients,
        aliasNormalization,
      });
      const primaryReranked = precisionPattern
        ? rerankRemoteHits({ hits: primaryAttempt.hits, precisionPattern })
        : null;
      const primaryHits = primaryReranked?.hits ?? primaryAttempt.hits;
      const primaryRemoteExactMatchCount =
        precisionPattern !== null ? (primaryReranked?.exactMatchCount ?? 0) : null;
      const primaryFailed = Boolean(primaryAttempt.error) || primaryHits.length === 0;

      if (primaryFailed) {
        const fallbackReason = classifyFallbackReason(primaryAttempt);
        let fallbackAttempt: RemoteSearchAttempt | undefined;

        if (readPlan.fallbackRoute !== "local" && readPlan.fallbackRoute !== responseRoute) {
          fallbackAttempt = await searchRemoteWithDiagnostics({
            route: readPlan.fallbackRoute,
            query,
            clients: deps.clients,
            aliasNormalization,
          });
          const fallbackReranked = precisionPattern
            ? rerankRemoteHits({ hits: fallbackAttempt.hits, precisionPattern })
            : null;
          const fallbackHits = fallbackReranked?.hits ?? fallbackAttempt.hits;
          const fallbackRemoteExactMatchCount =
            precisionPattern !== null ? (fallbackReranked?.exactMatchCount ?? 0) : null;

          if (fallbackHits.length > 0) {
            const explicitBucket = readContextBucket(params);
            const fallbackBucket: P3ContextBucket | null =
              readPlan.intent === "timeline" ? "timeline" : null;
            const bucket = explicitBucket ?? fallbackBucket;
            const contextAssembleResult = bucket
              ? contextAssemble(
                  toContextAssembleInput({
                    toolCallId,
                    query,
                    bucket,
                    rawParams: params,
                    remoteHits: fallbackHits,
                  }),
                )
              : undefined;

            deps.snippetStore.setFromSearchHits(fallbackHits);
            const routeTrace = createRouteTrace({
              readMode: deps.flags.read_mode,
              readPlan,
              primaryRoute: responseRoute,
              selectedRoute: readPlan.fallbackRoute,
            });
            const fallbackTrace = createFallbackTrace({
              triggered: true,
              reason: fallbackReason,
              primaryAttempt,
              fallbackAttempt,
              resultRoute: readPlan.fallbackRoute,
            });
            const guardTrace = guardTraceBase({
              selectedRoute: readPlan.fallbackRoute,
              decision: "remote_fallback",
              remoteExactMatchCount: fallbackRemoteExactMatchCount,
              forcedLocal: false,
            });

            return jsonResult(
              toRemotePayload({
                localDetails,
                remoteRoute: readPlan.fallbackRoute,
                remoteHits: fallbackHits,
                readMode: deps.flags.read_mode,
                aliasNormalization,
                routeTrace,
                fallbackTrace,
                contextAssembleResult,
                signature: querySignature,
                guardTrace,
              }),
            );
          }
        }

        const localRouteTrace = createRouteTrace({
          readMode: deps.flags.read_mode,
          readPlan,
          primaryRoute: responseRoute,
          selectedRoute: "local",
        });
        const localFallbackTrace = createFallbackTrace({
          triggered: true,
          reason: fallbackReason,
          primaryAttempt,
          fallbackAttempt,
          resultRoute: "local",
        });
        const guardTrace = guardTraceBase({
          selectedRoute: "local",
          decision: "remote_failed_fallback_local",
          remoteExactMatchCount: primaryRemoteExactMatchCount,
          forcedLocal: false,
        });
        return withLocalDiagnostics({
          localResult,
          localDetails,
          routeTrace: localRouteTrace,
          fallbackTrace: localFallbackTrace,
          signature: querySignature,
          guardTrace,
          resultsOverride: localResultsOverride,
        });
      }

      const explicitBucket = readContextBucket(params);
      const fallbackBucket: P3ContextBucket | null =
        readPlan.intent === "timeline" ? "timeline" : null;
      const bucket = explicitBucket ?? fallbackBucket;
      const contextAssembleResult = bucket
        ? contextAssemble(
            toContextAssembleInput({
              toolCallId,
              query,
              bucket,
              rawParams: params,
              remoteHits: primaryHits,
            }),
          )
        : undefined;

      deps.snippetStore.setFromSearchHits(primaryHits);
      const routeTrace = createRouteTrace({
        readMode: deps.flags.read_mode,
        readPlan,
        primaryRoute: responseRoute,
        selectedRoute: responseRoute,
      });
      const fallbackTrace = createFallbackTrace({
        triggered: false,
        reason: null,
        primaryAttempt,
        resultRoute: responseRoute,
      });
      const guardTrace = guardTraceBase({
        selectedRoute: responseRoute,
        decision:
          precisionPattern !== null && primaryRemoteExactMatchCount && primaryRemoteExactMatchCount > 0
            ? "remote_exact_match_promoted"
            : precisionPattern !== null
              ? "remote_no_exact_match"
              : "disabled",
        remoteExactMatchCount: primaryRemoteExactMatchCount,
        forcedLocal: false,
      });
      return jsonResult(
        toRemotePayload({
          localDetails,
          remoteRoute: responseRoute,
          remoteHits: primaryHits,
          readMode: deps.flags.read_mode,
          aliasNormalization,
          routeTrace,
          fallbackTrace,
          contextAssembleResult,
          signature: querySignature,
          guardTrace,
        }),
      );
    },
  };
}
