import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { RemoteSnippetStore } from "../bridge/remote-snippet-store.js";
import type {
  BridgeSearchHit,
  RemoteMemoryClient,
  RemoteSearchOptions,
} from "../client/mem0-client.js";
import type { BridgeFlags, BridgeRoute } from "../config/flags.js";
import { normalizeAndRankCandidates, type RankedCandidate } from "../fusion/normalize.js";
import type { ShadowReporter } from "../metrics/shadow-reporter.js";
import { contextAssemble } from "../p3/context-assemble.js";
import { parseOntologyV1MarkerFromSnippet } from "../p3/ontology-v1.js";
import type {
  P3ContextAssembleInput,
  P3ContextAssembleResult,
  P3ContextBucket,
  P3MessageEnvelope,
} from "../p3/types.js";
import type { PrecisionKeyMatch, QuerySignature } from "../router/query-signature.js";
import { resolveQuerySignature } from "../router/query-signature.js";
import { resolveReadPlan, type QueryBucket, type QueryType } from "../router/read-router.js";

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

const isPrecisionKeyHit = (params: { pattern: RegExp; snippet: string; path: string }): boolean => {
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

type SearchRecipe = "edge" | "node" | "hybrid";

type RecipeRoutingDecision = {
  enabled: boolean;
  sampled: boolean;
  samplePercent: number;
  queryType: QueryType;
  queryBucket: QueryBucket;
  selectedRecipe: SearchRecipe;
  route: BridgeRoute;
  active: boolean;
  degradeReason: string | null;
};

type FocalNodeDiscoveryStrategy = "node" | "hybrid";

type FocalNodeDecision = {
  enabled: boolean;
  sampled: boolean;
  samplePercent: number;
  queryType: QueryType;
  queryBucket: QueryBucket;
  route: BridgeRoute;
  active: boolean;
  focalNodeUuid: string | null;
  discoveryStrategy: FocalNodeDiscoveryStrategy;
  degradeReason: string | null;
};

type TemporalFilterKind = "relative_window";

type TemporalFiltersDecision = {
  enabled: boolean;
  sampled: boolean;
  samplePercent: number;
  queryType: QueryType;
  queryBucket: QueryBucket;
  route: BridgeRoute;
  active: boolean;
  kind: TemporalFilterKind | null;
  windowDays: number | null;
  matchedPhrase: string | null;
  degradeReason: string | null;
};

type OntologyReadbackDecision = {
  enabled: boolean;
  sampled: boolean;
  samplePercent: number;
  queryType: QueryType;
  queryBucket: QueryBucket;
  route: BridgeRoute;
  active: boolean;
  degradeReason: string | null;
};

type OntologyReadbackTrace = {
  enabled: boolean;
  sampled: boolean;
  sample_percent: number;
  query_type: QueryType;
  query_bucket: QueryBucket;
  route: BridgeRoute;
  active: boolean;
  top_k: number;
  marker_presence_count: number;
  marker_presence_rate: number;
  parse_success_count: number;
  parse_failure_count: number;
  parse_success_rate: number;
  entity_summary: {
    decision_count: number;
    project_count: number;
    reason_count: number;
    rejected_option_count: number;
    relation_count: number;
    has_rejected_options: boolean;
  };
  parse_failures: Array<{
    remote_id: string;
    path: string;
    rank: number;
    error: string;
  }>;
  degrade_reason: string | null;
};

const ONTOLOGY_READBACK_TOP_K = 3;

const normalizeStructure = (value: string | undefined): string => {
  return value?.trim().toLowerCase() ?? "";
};

const parseDayWindow = (value: number): number => {
  if (value <= 1) {
    return 1;
  }
  if (value <= 7) {
    return 7;
  }
  return 30;
};

const parseTemporalWindow = (
  query: string,
): { kind: TemporalFilterKind; windowDays: number; matchedPhrase: string } | null => {
  const dayMatch =
    query.match(/\bday\s*(\d{1,3})\b/i) ??
    query.match(/第\s*(\d{1,3})\s*天/i) ??
    query.match(/d(?:ay)?\s*([0-9]{1,3})\b/i);
  if (dayMatch && dayMatch[1]) {
    const parsed = Number.parseInt(dayMatch[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return {
        kind: "relative_window",
        windowDays: parseDayWindow(parsed),
        matchedPhrase: dayMatch[0],
      };
    }
  }

  const windows: Array<{ pattern: RegExp; windowDays: number }> = [
    { pattern: /\b(yesterday|last\s+day|previous\s+day)\b/i, windowDays: 1 },
    { pattern: /(昨天|昨日|前一天)/i, windowDays: 1 },
    { pattern: /\b(last\s+week|previous\s+week|past\s+week)\b/i, windowDays: 7 },
    { pattern: /(上周|上一周|近一周)/i, windowDays: 7 },
    { pattern: /\b(last\s+month|past\s+30\s+days|recent\s+30\s+days)\b/i, windowDays: 30 },
    { pattern: /(上个月|近30天|最近30天|近一个月)/i, windowDays: 30 },
  ];

  for (const windowCandidate of windows) {
    const matched = query.match(windowCandidate.pattern);
    if (!matched) {
      continue;
    }
    return {
      kind: "relative_window",
      windowDays: windowCandidate.windowDays,
      matchedPhrase: matched[0],
    };
  }

  return null;
};

const selectRecipeForQueryType = (queryType: QueryType): SearchRecipe => {
  if (queryType === "temporal_relation") {
    return "edge";
  }
  if (queryType === "entity_attribute") {
    return "node";
  }
  return "hybrid";
};

const resolveRecipeRoutingDecision = (params: {
  enabled: boolean;
  samplePercent: number;
  route: BridgeRoute;
  queryType: QueryType;
  queryBucket: QueryBucket;
  sampleSeed: string;
}): RecipeRoutingDecision => {
  const samplePercent = clampPercent(params.samplePercent);
  const selectedRecipe = selectRecipeForQueryType(params.queryType);
  const sampled = samplePercent >= 100 || hashToPercentBucket(params.sampleSeed) < samplePercent;

  let degradeReason: string | null = null;
  if (!params.enabled) {
    degradeReason = "flag_disabled";
  } else if (params.route !== "graphiti") {
    degradeReason = "non_graphiti_route";
  } else if (params.queryBucket === "exact_id") {
    degradeReason = "precision_key_bucket";
  } else if (samplePercent <= 0) {
    degradeReason = "sample_percent_zero";
  } else if (!sampled) {
    degradeReason = "sample_skipped";
  }

  return {
    enabled: params.enabled,
    sampled,
    samplePercent,
    queryType: params.queryType,
    queryBucket: params.queryBucket,
    selectedRecipe,
    route: params.route,
    active: degradeReason === null,
    degradeReason,
  };
};

const resolveFocalNodeDecisionBase = (params: {
  enabled: boolean;
  samplePercent: number;
  route: BridgeRoute;
  queryType: QueryType;
  queryBucket: QueryBucket;
  sampleSeed: string;
}): FocalNodeDecision => {
  const samplePercent = clampPercent(params.samplePercent);
  const sampled = samplePercent >= 100 || hashToPercentBucket(params.sampleSeed) < samplePercent;
  const temporalQuery =
    params.queryType === "temporal_relation" || params.queryBucket === "temporal_relation";

  let degradeReason: string | null = null;
  if (!params.enabled) {
    degradeReason = "flag_disabled";
  } else if (params.route !== "graphiti") {
    degradeReason = "non_graphiti_route";
  } else if (params.queryBucket === "exact_id") {
    degradeReason = "precision_key_bucket";
  } else if (!temporalQuery) {
    degradeReason = "non_temporal_query";
  } else if (samplePercent <= 0) {
    degradeReason = "sample_percent_zero";
  } else if (!sampled) {
    degradeReason = "sample_skipped";
  }

  return {
    enabled: params.enabled,
    sampled,
    samplePercent,
    queryType: params.queryType,
    queryBucket: params.queryBucket,
    route: params.route,
    active: false,
    focalNodeUuid: null,
    discoveryStrategy: "node",
    degradeReason,
  };
};

const resolveFocalNodeCandidate = (hits: BridgeSearchHit[]): BridgeSearchHit | null => {
  if (hits.length === 0) {
    return null;
  }

  for (const hit of hits) {
    const structure = normalizeStructure(hit.structure);
    if (structure === "nodes" || structure === "node") {
      return hit;
    }
  }

  return hits[0] ?? null;
};

const resolveTemporalFiltersDecision = (params: {
  enabled: boolean;
  samplePercent: number;
  route: BridgeRoute;
  queryType: QueryType;
  queryBucket: QueryBucket;
  sampleSeed: string;
  query: string;
}): TemporalFiltersDecision => {
  const samplePercent = clampPercent(params.samplePercent);
  const sampled = samplePercent >= 100 || hashToPercentBucket(params.sampleSeed) < samplePercent;
  const temporalQuery =
    params.queryType === "temporal_relation" || params.queryBucket === "temporal_relation";

  let degradeReason: string | null = null;
  if (!params.enabled) {
    degradeReason = "flag_disabled";
  } else if (params.route !== "graphiti") {
    degradeReason = "non_graphiti_route";
  } else if (params.queryBucket === "exact_id") {
    degradeReason = "precision_key_bucket";
  } else if (!temporalQuery) {
    degradeReason = "non_temporal_query";
  } else if (samplePercent <= 0) {
    degradeReason = "sample_percent_zero";
  } else if (!sampled) {
    degradeReason = "sample_skipped";
  }

  if (degradeReason !== null) {
    return {
      enabled: params.enabled,
      sampled,
      samplePercent,
      queryType: params.queryType,
      queryBucket: params.queryBucket,
      route: params.route,
      active: false,
      kind: null,
      windowDays: null,
      matchedPhrase: null,
      degradeReason,
    };
  }

  const parsed = parseTemporalWindow(params.query);
  if (!parsed) {
    return {
      enabled: params.enabled,
      sampled,
      samplePercent,
      queryType: params.queryType,
      queryBucket: params.queryBucket,
      route: params.route,
      active: false,
      kind: null,
      windowDays: null,
      matchedPhrase: null,
      degradeReason: "no_pattern",
    };
  }

  return {
    enabled: params.enabled,
    sampled,
    samplePercent,
    queryType: params.queryType,
    queryBucket: params.queryBucket,
    route: params.route,
    active: true,
    kind: parsed.kind,
    windowDays: parsed.windowDays,
    matchedPhrase: parsed.matchedPhrase,
    degradeReason: null,
  };
};

const resolveOntologyReadbackDecision = (params: {
  enabled: boolean;
  samplePercent: number;
  route: BridgeRoute;
  queryType: QueryType;
  queryBucket: QueryBucket;
  sampleSeed: string;
}): OntologyReadbackDecision => {
  const samplePercent = clampPercent(params.samplePercent);
  const sampled = samplePercent >= 100 || hashToPercentBucket(params.sampleSeed) < samplePercent;
  const isDecisionReasonQuery =
    params.queryType === "decision_reason" || params.queryBucket === "decision_reason";

  let degradeReason: string | null = null;
  if (!params.enabled) {
    degradeReason = "flag_disabled";
  } else if (params.route !== "graphiti") {
    degradeReason = "non_graphiti_route";
  } else if (params.queryBucket === "exact_id") {
    degradeReason = "precision_key_bucket";
  } else if (!isDecisionReasonQuery) {
    degradeReason = "non_decision_reason_query";
  } else if (samplePercent <= 0) {
    degradeReason = "sample_percent_zero";
  } else if (!sampled) {
    degradeReason = "sample_skipped";
  }

  return {
    enabled: params.enabled,
    sampled,
    samplePercent,
    queryType: params.queryType,
    queryBucket: params.queryBucket,
    route: params.route,
    active: degradeReason === null,
    degradeReason,
  };
};

const createOntologyReadbackTrace = (params: {
  decision: OntologyReadbackDecision;
  hits: BridgeSearchHit[];
}): OntologyReadbackTrace => {
  const topHits = params.hits.slice(0, ONTOLOGY_READBACK_TOP_K);

  if (!params.decision.active) {
    return {
      enabled: params.decision.enabled,
      sampled: params.decision.sampled,
      sample_percent: params.decision.samplePercent,
      query_type: params.decision.queryType,
      query_bucket: params.decision.queryBucket,
      route: params.decision.route,
      active: false,
      top_k: topHits.length,
      marker_presence_count: 0,
      marker_presence_rate: 0,
      parse_success_count: 0,
      parse_failure_count: 0,
      parse_success_rate: 0,
      entity_summary: {
        decision_count: 0,
        project_count: 0,
        reason_count: 0,
        rejected_option_count: 0,
        relation_count: 0,
        has_rejected_options: false,
      },
      parse_failures: [],
      degrade_reason: params.decision.degradeReason,
    };
  }

  let markerPresenceCount = 0;
  let parseSuccessCount = 0;
  let parseFailureCount = 0;
  const parseFailures: OntologyReadbackTrace["parse_failures"] = [];
  const entitySummary = {
    decision_count: 0,
    project_count: 0,
    reason_count: 0,
    rejected_option_count: 0,
    relation_count: 0,
    has_rejected_options: false,
  };

  for (const [index, hit] of topHits.entries()) {
    const parsed = parseOntologyV1MarkerFromSnippet(hit.snippet);
    if (!parsed.marker_present) {
      continue;
    }

    markerPresenceCount += 1;
    if (parsed.payload) {
      parseSuccessCount += 1;
      entitySummary.decision_count += 1;
      entitySummary.project_count += parsed.payload.project ? 1 : 0;
      entitySummary.reason_count += parsed.payload.reasons.length;
      entitySummary.rejected_option_count += parsed.payload.rejected.length;
      entitySummary.relation_count += parsed.payload.relations.length;
      entitySummary.has_rejected_options =
        entitySummary.has_rejected_options || parsed.payload.rejected.length > 0;
      continue;
    }

    parseFailureCount += 1;
    parseFailures.push({
      remote_id: hit.remoteId,
      path: hit.path,
      rank: index + 1,
      error: parsed.error ?? "unknown_parse_error",
    });
  }

  const topK = topHits.length;
  return {
    enabled: params.decision.enabled,
    sampled: params.decision.sampled,
    sample_percent: params.decision.samplePercent,
    query_type: params.decision.queryType,
    query_bucket: params.decision.queryBucket,
    route: params.decision.route,
    active: true,
    top_k: topK,
    marker_presence_count: markerPresenceCount,
    marker_presence_rate: topK > 0 ? markerPresenceCount / topK : 0,
    parse_success_count: parseSuccessCount,
    parse_failure_count: parseFailureCount,
    parse_success_rate: markerPresenceCount > 0 ? parseSuccessCount / markerPresenceCount : 0,
    entity_summary: entitySummary,
    parse_failures: parseFailures,
    degrade_reason: null,
  };
};

const recipeStructurePriority = (recipe: SearchRecipe, structure: string | undefined): number => {
  const normalized = String(structure ?? "")
    .trim()
    .toLowerCase();

  if (recipe === "edge") {
    if (normalized === "episodes" || normalized === "episode") {
      return 0;
    }
    if (normalized === "facts" || normalized === "fact") {
      return 1;
    }
    if (normalized === "nodes" || normalized === "node") {
      return 2;
    }
    return 3;
  }

  if (recipe === "node") {
    if (normalized === "nodes" || normalized === "node") {
      return 0;
    }
    if (normalized === "facts" || normalized === "fact") {
      return 1;
    }
    if (normalized === "episodes" || normalized === "episode") {
      return 2;
    }
    return 3;
  }

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

type RecipeRankedHit = {
  index: number;
  hit: BridgeSearchHit;
  structurePriority: number;
};

const applyRecipeRerank = (params: {
  hits: BridgeSearchHit[];
  decision: RecipeRoutingDecision;
}): BridgeSearchHit[] => {
  if (!params.decision.active || params.hits.length <= 1) {
    return params.hits;
  }

  const ranked: RecipeRankedHit[] = params.hits.map((hit, index) => ({
    index,
    hit,
    structurePriority: recipeStructurePriority(params.decision.selectedRecipe, hit.structure),
  }));

  ranked.sort((left, right) => {
    if (left.structurePriority !== right.structurePriority) {
      return left.structurePriority < right.structurePriority ? -1 : 1;
    }

    const scoreCompare = compareNumbersDesc(left.hit.score, right.hit.score);
    if (scoreCompare !== 0) {
      return scoreCompare;
    }

    const remoteLowerCompare = compareAsciiStrings(
      left.hit.remoteId.toLowerCase(),
      right.hit.remoteId.toLowerCase(),
    );
    if (remoteLowerCompare !== 0) {
      return remoteLowerCompare;
    }
    const remoteCompare = compareAsciiStrings(left.hit.remoteId, right.hit.remoteId);
    if (remoteCompare !== 0) {
      return remoteCompare;
    }

    const pathLowerCompare = compareAsciiStrings(
      left.hit.path.toLowerCase(),
      right.hit.path.toLowerCase(),
    );
    if (pathLowerCompare !== 0) {
      return pathLowerCompare;
    }
    const pathCompare = compareAsciiStrings(left.hit.path, right.hit.path);
    if (pathCompare !== 0) {
      return pathCompare;
    }

    const snippetLowerCompare = compareAsciiStrings(
      left.hit.snippet.toLowerCase(),
      right.hit.snippet.toLowerCase(),
    );
    if (snippetLowerCompare !== 0) {
      return snippetLowerCompare;
    }
    const snippetCompare = compareAsciiStrings(left.hit.snippet, right.hit.snippet);
    if (snippetCompare !== 0) {
      return snippetCompare;
    }

    return left.index - right.index;
  });

  return ranked.map((item) => item.hit);
};

const mergeSearchOptions = (
  ...options: Array<RemoteSearchOptions | undefined>
): RemoteSearchOptions | undefined => {
  const output: RemoteSearchOptions = {};

  for (const option of options) {
    if (!option) {
      continue;
    }
    if (option.filters !== undefined) {
      output.filters = option.filters;
    }
    if (option.criteria !== undefined) {
      output.criteria = option.criteria;
    }
    if (option.strategy !== undefined) {
      output.strategy = option.strategy;
    }
    if (option.focal_node_uuid !== undefined) {
      output.focal_node_uuid = option.focal_node_uuid;
    }
    if (option.temporal_filters !== undefined) {
      output.temporal_filters = option.temporal_filters;
    }
  }

  return Object.keys(output).length > 0 ? output : undefined;
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

const readMaxResults = (params: unknown): number => {
  const record = asRecord(params);
  const raw = asNumber(record?.maxResults ?? record?.max_results);
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return 5;
  }
  if (raw <= 1) {
    return 1;
  }
  return Math.min(50, Math.floor(raw));
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

type FusionShadowAttemptTrace = {
  attempted: boolean;
  hit_count: number;
  latency_ms: number;
  error_kind: string | null;
};

type FusionShadowTrace = {
  enabled: boolean;
  candidate_route: BridgeRoute;
  mem0: FusionShadowAttemptTrace;
  graphiti: FusionShadowAttemptTrace;
  normalized_topk: Array<{
    source: BridgeRoute;
    remote_id: string;
    path: string;
    score: number;
    score_source: string;
  }>;
  tie: Record<string, unknown>;
  dedupe: Record<string, unknown>;
  score_source_counts: Record<string, unknown>;
};

const classifyErrorKind = (error: unknown): string => {
  if (isTimeoutError(error)) {
    return "timeout";
  }

  const status = readErrorStatus(error);
  if (typeof status === "number") {
    if (status >= 500 && status <= 599) {
      return "http_5xx";
    }
    if (status >= 400 && status <= 499) {
      return "http_4xx";
    }
  }

  return "remote_error";
};

const toFusionShadowAttemptTrace = (
  attempt: RemoteSearchAttempt | null,
): FusionShadowAttemptTrace => {
  if (!attempt) {
    return {
      attempted: false,
      hit_count: 0,
      latency_ms: 0,
      error_kind: null,
    };
  }

  return {
    attempted: true,
    hit_count: attempt.hits.length,
    latency_ms: attempt.latencyMs,
    error_kind: attempt.error ? classifyErrorKind(attempt.error) : null,
  };
};

const toNormalizedCandidateTrace = (candidate: RankedCandidate): Record<string, unknown> => {
  return {
    source: candidate.source,
    remote_id: candidate.remoteId,
    path: candidate.path,
    score: candidate.score,
    score_source: candidate.score_source,
  };
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
    query_type: params.readPlan.queryType,
    query_bucket: params.readPlan.queryBucket,
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
  fusionShadowTrace?: FusionShadowTrace;
  signature?: QuerySignature;
  guardTrace?: Record<string, unknown>;
  recipeTrace?: Record<string, unknown>;
  focalNodeTrace?: Record<string, unknown>;
  temporalFiltersTrace?: Record<string, unknown>;
  ontologyTrace?: OntologyReadbackTrace;
  resultsOverride?: Array<Record<string, unknown>>;
}): AgentToolResult<unknown> => {
  const details: Record<string, unknown> = {
    ...(params.localDetails ?? {}),
    source: "local",
    route: params.routeTrace,
    fallback: params.fallbackTrace,
  };

  if (params.fusionShadowTrace) {
    details.fusion_shadow = params.fusionShadowTrace;
  }

  if (params.signature) {
    details.signature = params.signature;
  }
  if (params.guardTrace) {
    details.guard = params.guardTrace;
  }
  if (params.recipeTrace) {
    details.recipe = params.recipeTrace;
  }
  if (params.focalNodeTrace) {
    details.focal_node = params.focalNodeTrace;
  }
  if (params.temporalFiltersTrace) {
    details.temporal_filters = params.temporalFiltersTrace;
  }
  if (params.ontologyTrace) {
    details.ontology_v1 = params.ontologyTrace;
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

const createRecipeTrace = (params: {
  decision: RecipeRoutingDecision;
  hits: BridgeSearchHit[];
}): Record<string, unknown> => {
  const topHit = params.hits[0];
  return {
    enabled: params.decision.enabled,
    sampled: params.decision.sampled,
    sample_percent: params.decision.samplePercent,
    query_type: params.decision.queryType,
    query_bucket: params.decision.queryBucket,
    selected_recipe: params.decision.selectedRecipe,
    requested_strategy: params.decision.active ? params.decision.selectedRecipe : null,
    active: params.decision.active,
    degraded: params.decision.degradeReason !== null,
    degrade_reason: params.decision.degradeReason,
    route: params.decision.route,
    top1_source: topHit?.source ?? null,
    top1_remote_id: topHit?.remoteId ?? null,
    top1_structure: topHit?.structure ?? null,
    structures: buildStructureMetrics(params.hits),
  };
};

const createFocalNodeTrace = (decision: FocalNodeDecision): Record<string, unknown> => {
  return {
    enabled: decision.enabled,
    sampled: decision.sampled,
    sample_percent: decision.samplePercent,
    query_type: decision.queryType,
    query_bucket: decision.queryBucket,
    route: decision.route,
    active: decision.active,
    focal_node_uuid: decision.focalNodeUuid,
    discovery_strategy: decision.discoveryStrategy,
    degrade_reason: decision.degradeReason,
  };
};

const createTemporalFiltersTrace = (decision: TemporalFiltersDecision): Record<string, unknown> => {
  return {
    enabled: decision.enabled,
    sampled: decision.sampled,
    sample_percent: decision.samplePercent,
    query_type: decision.queryType,
    query_bucket: decision.queryBucket,
    route: decision.route,
    active: decision.active,
    kind: decision.kind,
    window_days: decision.windowDays,
    matched_phrase: decision.matchedPhrase,
    degrade_reason: decision.degradeReason,
  };
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
  recipeTrace?: Record<string, unknown>;
  focalNodeTrace?: Record<string, unknown>;
  temporalFiltersTrace?: Record<string, unknown>;
  ontologyTrace?: OntologyReadbackTrace;
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
  if (params.recipeTrace) {
    payload.recipe = params.recipeTrace;
  }
  if (params.focalNodeTrace) {
    payload.focal_node = params.focalNodeTrace;
  }
  if (params.temporalFiltersTrace) {
    payload.temporal_filters = params.temporalFiltersTrace;
  }
  if (params.ontologyTrace) {
    payload.ontology_v1 = params.ontologyTrace;
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
      const recipeRoutingConfig = deps.flags.read.graphiti_recipe_routing;
      const focalNodeConfig = deps.flags.read.graphiti_focal_node;
      const temporalFiltersConfig = deps.flags.read.graphiti_temporal_filters;
      const ontologyReadbackConfig = deps.flags.read.graphiti_ontology_readback;
      const recipeSeed = deps.sessionKey ?? query;
      const focalSeed = `${deps.sessionKey ?? query}:focal-node`;
      const temporalFiltersSeed = `${deps.sessionKey ?? query}:temporal-filters`;
      const ontologyReadbackSeed = `${deps.sessionKey ?? query}:ontology-readback`;

      const resolveRecipeForRoute = (route: BridgeRoute): RecipeRoutingDecision => {
        return resolveRecipeRoutingDecision({
          enabled: recipeRoutingConfig.enabled,
          samplePercent: recipeRoutingConfig.sample_percent,
          route,
          queryType: readPlan.queryType,
          queryBucket: readPlan.queryBucket,
          sampleSeed: recipeSeed,
        });
      };

      const buildRecipeSearchOptions = (
        decision: RecipeRoutingDecision,
      ): RemoteSearchOptions | undefined => {
        return decision.active
          ? {
              strategy: decision.selectedRecipe,
            }
          : undefined;
      };

      const resolveFocalNodeForRoute = async (route: BridgeRoute): Promise<FocalNodeDecision> => {
        const baseDecision = resolveFocalNodeDecisionBase({
          enabled: focalNodeConfig.enabled,
          samplePercent: focalNodeConfig.sample_percent,
          route,
          queryType: readPlan.queryType,
          queryBucket: readPlan.queryBucket,
          sampleSeed: `${focalSeed}:${route}`,
        });

        if (baseDecision.degradeReason !== null) {
          return baseDecision;
        }

        const discoveryAttempt = await searchRemoteWithDiagnostics({
          route: "graphiti",
          query,
          clients: deps.clients,
          aliasNormalization,
          searchOptions: {
            strategy: baseDecision.discoveryStrategy,
          },
        });

        const candidate = resolveFocalNodeCandidate(discoveryAttempt.hits);
        if (!candidate?.remoteId) {
          return {
            ...baseDecision,
            active: false,
            focalNodeUuid: null,
            degradeReason: "no_candidate",
          };
        }

        return {
          ...baseDecision,
          active: true,
          focalNodeUuid: candidate.remoteId,
          degradeReason: null,
        };
      };

      const buildFocalNodeSearchOptions = (
        decision: FocalNodeDecision,
      ): RemoteSearchOptions | undefined => {
        return decision.active && decision.focalNodeUuid
          ? {
              focal_node_uuid: decision.focalNodeUuid,
            }
          : undefined;
      };

      const resolveTemporalFiltersForRoute = (route: BridgeRoute): TemporalFiltersDecision => {
        return resolveTemporalFiltersDecision({
          enabled: temporalFiltersConfig.enabled,
          samplePercent: temporalFiltersConfig.sample_percent,
          route,
          queryType: readPlan.queryType,
          queryBucket: readPlan.queryBucket,
          sampleSeed: `${temporalFiltersSeed}:${route}`,
          query,
        });
      };

      const buildTemporalFiltersSearchOptions = (
        decision: TemporalFiltersDecision,
      ): RemoteSearchOptions | undefined => {
        if (!decision.active || !decision.kind || !decision.windowDays || !decision.matchedPhrase) {
          return undefined;
        }

        return {
          temporal_filters: {
            kind: decision.kind,
            window_days: decision.windowDays,
            matched_phrase: decision.matchedPhrase,
          },
        };
      };

      const resolveOntologyReadbackForRoute = (route: BridgeRoute): OntologyReadbackDecision => {
        return resolveOntologyReadbackDecision({
          enabled: ontologyReadbackConfig.enabled,
          samplePercent: ontologyReadbackConfig.sample_percent,
          route,
          queryType: readPlan.queryType,
          queryBucket: readPlan.queryBucket,
          sampleSeed: `${ontologyReadbackSeed}:${route}`,
        });
      };

      const createOntologyTraceForRoute = (
        route: BridgeRoute,
        hits: BridgeSearchHit[],
      ): OntologyReadbackTrace => {
        const decision = resolveOntologyReadbackForRoute(route);
        return createOntologyReadbackTrace({
          decision,
          hits,
        });
      };

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
        const fusionShadowEnabled = deps.flags.read.fusion.shadow_enabled;
        const fusionOtherRoute: BridgeRoute =
          readPlan.candidateRoute === "mem0" ? "graphiti" : "mem0";

        const shadowRecipeDecision = resolveRecipeForRoute(readPlan.candidateRoute);
        const shadowFocalDecision = await resolveFocalNodeForRoute(readPlan.candidateRoute);
        const shadowTemporalFiltersDecision = resolveTemporalFiltersForRoute(
          readPlan.candidateRoute,
        );
        const filters = readFilters(params);
        const criteria = readCriteria(params);
        const shadowConfig = deps.flags.read.mem0_filters_criteria_shadow;
        const samplePercent = clampPercent(shadowConfig.sample_percent);
        const shouldUseFiltersCriteria =
          shadowConfig.enabled &&
          readPlan.candidateRoute === "mem0" &&
          samplePercent > 0 &&
          (filters || criteria) &&
          (samplePercent >= 100 || hashToPercentBucket(deps.sessionKey ?? query) < samplePercent);

        const shadowFiltersCriteriaSearchOptions: RemoteSearchOptions | undefined =
          shouldUseFiltersCriteria
            ? {
                filters,
                criteria,
              }
            : undefined;

        const shadowAttemptPromise = searchRemoteWithDiagnostics({
          route: readPlan.candidateRoute,
          query,
          clients: deps.clients,
          aliasNormalization,
          searchOptions: mergeSearchOptions(
            shadowFiltersCriteriaSearchOptions,
            buildRecipeSearchOptions(shadowRecipeDecision),
            buildFocalNodeSearchOptions(shadowFocalDecision),
            buildTemporalFiltersSearchOptions(shadowTemporalFiltersDecision),
          ),
        });

        const [shadowAttempt, fusionOtherAttempt] = fusionShadowEnabled
          ? await Promise.all([
              shadowAttemptPromise,
              searchRemoteWithDiagnostics({
                route: fusionOtherRoute,
                query,
                clients: deps.clients,
                aliasNormalization,
              }),
            ])
          : [await shadowAttemptPromise, null];

        const fusionShadowTrace: FusionShadowTrace | undefined = fusionShadowEnabled
          ? (() => {
              const requestedTopK = readMaxResults(params);
              const combinedCandidates = [
                ...shadowAttempt.hits,
                ...(fusionOtherAttempt?.hits ?? []),
              ].map((hit) => ({
                source: hit.source,
                remoteId: hit.remoteId,
                path: hit.path,
                score: hit.score,
                score_source: hit.score_source,
              }));

              const normalized = normalizeAndRankCandidates({
                candidates: combinedCandidates,
                topK: requestedTopK,
              });

              const collisions = normalized.dedupe.collisions.map((collision) => ({
                normalized_key: collision.normalized_key,
                kept: toNormalizedCandidateTrace(collision.kept),
                dropped: collision.dropped.map((candidate) =>
                  toNormalizedCandidateTrace(candidate),
                ),
              }));

              return {
                enabled: true,
                candidate_route: readPlan.candidateRoute,
                mem0: toFusionShadowAttemptTrace(
                  readPlan.candidateRoute === "mem0" ? shadowAttempt : fusionOtherAttempt,
                ),
                graphiti: toFusionShadowAttemptTrace(
                  readPlan.candidateRoute === "graphiti" ? shadowAttempt : fusionOtherAttempt,
                ),
                normalized_topk: normalized.topk.map((candidate) =>
                  toNormalizedCandidateTrace(candidate),
                ),
                tie: normalized.tie,
                dedupe: {
                  input_count: normalized.dedupe.input_count,
                  unique_count: normalized.dedupe.unique_count,
                  collisions,
                },
                score_source_counts: normalized.score_source_counts,
              };
            })()
          : undefined;

        const shadowReranked = precisionPattern
          ? rerankRemoteHits({ hits: shadowAttempt.hits, precisionPattern })
          : null;
        const shadowHits = shadowReranked?.hits ?? shadowAttempt.hits;
        const remoteHits = applyRecipeRerank({
          hits: shadowHits,
          decision: shadowRecipeDecision,
        });
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
        const recipeTrace = createRecipeTrace({
          decision: shadowRecipeDecision,
          hits: remoteHits,
        });
        const focalNodeTrace = createFocalNodeTrace(shadowFocalDecision);
        const temporalFiltersTrace = createTemporalFiltersTrace(shadowTemporalFiltersDecision);
        const ontologyTrace = createOntologyTraceForRoute(readPlan.candidateRoute, remoteHits);

        return withLocalDiagnostics({
          localResult,
          localDetails,
          routeTrace,
          fallbackTrace,
          fusionShadowTrace,
          signature: querySignature,
          guardTrace,
          recipeTrace,
          focalNodeTrace,
          temporalFiltersTrace,
          ontologyTrace,
          resultsOverride: localResultsOverride,
        });
      }

      if (shouldForceLocal && responseRoute !== "local") {
        const focalNodeDecision = await resolveFocalNodeForRoute(responseRoute);
        const temporalFiltersDecision = resolveTemporalFiltersForRoute(responseRoute);
        const recipeTrace = createRecipeTrace({
          decision: resolveRecipeForRoute(responseRoute),
          hits: [],
        });
        const focalNodeTrace = createFocalNodeTrace(focalNodeDecision);
        const temporalFiltersTrace = createTemporalFiltersTrace(temporalFiltersDecision);
        const ontologyTrace = createOntologyTraceForRoute(responseRoute, []);
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
          recipeTrace,
          focalNodeTrace,
          temporalFiltersTrace,
          ontologyTrace,
          resultsOverride: localResultsOverride,
        });
      }

      if (responseRoute === "local") {
        if (!precisionPattern) {
          return localResult;
        }

        const focalNodeDecision = await resolveFocalNodeForRoute(responseRoute);
        const temporalFiltersDecision = resolveTemporalFiltersForRoute(responseRoute);
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
        const recipeTrace = createRecipeTrace({
          decision: resolveRecipeForRoute("local"),
          hits: [],
        });
        const focalNodeTrace = createFocalNodeTrace(focalNodeDecision);
        const temporalFiltersTrace = createTemporalFiltersTrace(temporalFiltersDecision);
        const ontologyTrace = createOntologyTraceForRoute("local", []);

        return withLocalDiagnostics({
          localResult,
          localDetails,
          routeTrace,
          fallbackTrace,
          signature: querySignature,
          guardTrace,
          recipeTrace,
          focalNodeTrace,
          temporalFiltersTrace,
          ontologyTrace,
          resultsOverride: localResultsOverride,
        });
      }

      const primaryRecipeDecision = resolveRecipeForRoute(responseRoute);
      const primaryFocalNodeDecision = await resolveFocalNodeForRoute(responseRoute);
      const primaryTemporalFiltersDecision = resolveTemporalFiltersForRoute(responseRoute);
      const primaryAttempt = await searchRemoteWithDiagnostics({
        route: responseRoute,
        query,
        clients: deps.clients,
        aliasNormalization,
        searchOptions: mergeSearchOptions(
          buildRecipeSearchOptions(primaryRecipeDecision),
          buildFocalNodeSearchOptions(primaryFocalNodeDecision),
          buildTemporalFiltersSearchOptions(primaryTemporalFiltersDecision),
        ),
      });
      const primaryReranked = precisionPattern
        ? rerankRemoteHits({ hits: primaryAttempt.hits, precisionPattern })
        : null;
      const primaryRawHits = primaryReranked?.hits ?? primaryAttempt.hits;
      const primaryHits = applyRecipeRerank({
        hits: primaryRawHits,
        decision: primaryRecipeDecision,
      });
      const primaryRemoteExactMatchCount =
        precisionPattern !== null ? (primaryReranked?.exactMatchCount ?? 0) : null;
      const primaryFailed = Boolean(primaryAttempt.error) || primaryHits.length === 0;

      if (primaryFailed) {
        const fallbackReason = classifyFallbackReason(primaryAttempt);
        let fallbackAttempt: RemoteSearchAttempt | undefined;
        let fallbackRecipeDecision: RecipeRoutingDecision | undefined;
        let fallbackFocalNodeDecision: FocalNodeDecision | undefined;
        let fallbackTemporalFiltersDecision: TemporalFiltersDecision | undefined;

        if (readPlan.fallbackRoute !== "local" && readPlan.fallbackRoute !== responseRoute) {
          fallbackRecipeDecision = resolveRecipeForRoute(readPlan.fallbackRoute);
          fallbackFocalNodeDecision = await resolveFocalNodeForRoute(readPlan.fallbackRoute);
          fallbackTemporalFiltersDecision = resolveTemporalFiltersForRoute(readPlan.fallbackRoute);
          fallbackAttempt = await searchRemoteWithDiagnostics({
            route: readPlan.fallbackRoute,
            query,
            clients: deps.clients,
            aliasNormalization,
            searchOptions: mergeSearchOptions(
              buildRecipeSearchOptions(fallbackRecipeDecision),
              buildFocalNodeSearchOptions(fallbackFocalNodeDecision),
              buildTemporalFiltersSearchOptions(fallbackTemporalFiltersDecision),
            ),
          });
          const fallbackReranked = precisionPattern
            ? rerankRemoteHits({ hits: fallbackAttempt.hits, precisionPattern })
            : null;
          const fallbackRawHits = fallbackReranked?.hits ?? fallbackAttempt.hits;
          const fallbackHits = applyRecipeRerank({
            hits: fallbackRawHits,
            decision: fallbackRecipeDecision,
          });
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
            const recipeTrace = createRecipeTrace({
              decision: fallbackRecipeDecision,
              hits: fallbackHits,
            });
            const focalNodeTrace = createFocalNodeTrace(
              fallbackFocalNodeDecision ?? (await resolveFocalNodeForRoute(readPlan.fallbackRoute)),
            );
            const temporalFiltersTrace = createTemporalFiltersTrace(
              fallbackTemporalFiltersDecision ??
                resolveTemporalFiltersForRoute(readPlan.fallbackRoute),
            );
            const ontologyTrace = createOntologyTraceForRoute(readPlan.fallbackRoute, fallbackHits);

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
                recipeTrace,
                focalNodeTrace,
                temporalFiltersTrace,
                ontologyTrace,
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
        const fallbackRecipeTraceDecision =
          fallbackRecipeDecision ?? resolveRecipeForRoute(readPlan.fallbackRoute);
        const fallbackFocalNodeTraceDecision =
          fallbackFocalNodeDecision ?? (await resolveFocalNodeForRoute(readPlan.fallbackRoute));
        const fallbackTemporalFiltersTraceDecision =
          fallbackTemporalFiltersDecision ?? resolveTemporalFiltersForRoute(readPlan.fallbackRoute);
        const recipeTrace = createRecipeTrace({
          decision: fallbackRecipeTraceDecision.active
            ? fallbackRecipeTraceDecision
            : primaryRecipeDecision,
          hits: [],
        });
        const focalNodeTrace = createFocalNodeTrace(
          fallbackFocalNodeTraceDecision.active
            ? fallbackFocalNodeTraceDecision
            : primaryFocalNodeDecision,
        );
        const temporalFiltersTrace = createTemporalFiltersTrace(
          fallbackTemporalFiltersTraceDecision.active
            ? fallbackTemporalFiltersTraceDecision
            : primaryTemporalFiltersDecision,
        );
        const ontologyTrace = createOntologyTraceForRoute("local", []);
        return withLocalDiagnostics({
          localResult,
          localDetails,
          routeTrace: localRouteTrace,
          fallbackTrace: localFallbackTrace,
          signature: querySignature,
          guardTrace,
          recipeTrace,
          focalNodeTrace,
          temporalFiltersTrace,
          ontologyTrace,
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
          precisionPattern !== null &&
          primaryRemoteExactMatchCount &&
          primaryRemoteExactMatchCount > 0
            ? "remote_exact_match_promoted"
            : precisionPattern !== null
              ? "remote_no_exact_match"
              : "disabled",
        remoteExactMatchCount: primaryRemoteExactMatchCount,
        forcedLocal: false,
      });
      const recipeTrace = createRecipeTrace({
        decision: primaryRecipeDecision,
        hits: primaryHits,
      });
      const focalNodeTrace = createFocalNodeTrace(primaryFocalNodeDecision);
      const temporalFiltersTrace = createTemporalFiltersTrace(primaryTemporalFiltersDecision);
      const ontologyTrace = createOntologyTraceForRoute(responseRoute, primaryHits);
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
          recipeTrace,
          focalNodeTrace,
          temporalFiltersTrace,
          ontologyTrace,
        }),
      );
    },
  };
}
