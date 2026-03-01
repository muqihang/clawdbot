import type { BridgeReadMode, BridgeRemoteRoute, BridgeRoute } from "../config/flags.js";
import { resolveQuerySignature, type QuerySignature } from "./query-signature.js";

export type QueryIntent = "timeline" | "semantic";
export type QueryType = "temporal_relation" | "entity_attribute" | "decision_reason" | "other";
export type QueryBucket = "exact_id" | QueryType;

export type ReadPlanInput = {
  readMode: BridgeReadMode;
  cutoverPercent: number;
  query: string;
  querySignature?: QuerySignature;
  routeSeed?: string;
  defaultRoute?: BridgeRoute;
  timelineRoute?: BridgeRemoteRoute;
  semanticRoute?: BridgeRemoteRoute;
  fallbackRoute?: BridgeRoute;
};

export type ReadPlan = {
  userRoute: BridgeRoute;
  candidateRoute: BridgeRoute;
  fallbackRoute: BridgeRoute;
  shadowCompare: boolean;
  intent: QueryIntent;
  queryType: QueryType;
  queryBucket: QueryBucket;
  signature: QuerySignature | null;
  readMode: BridgeReadMode;
  cutoverPercent: number;
  phase0LocalOnly: boolean;
  reason: "phase0_local_default" | "phase0_local_only_guard" | "read_cutover_candidate_enabled";
};

const TEMPORAL_RELATION_QUERY_PATTERN =
  /\b(when|timeline|history|before|after|earlier|later|then|first|next|yesterday|last\s+week|switch(?:ed)?|migrat(?:e|ed|ion)|change(?:d)?|precede(?:s|d)?|follow(?:s|ed)?|day\s*\d+)\b|[先前之].*(后|後)|之后|之后发生|之前|先于|后于|里程碑|第\d+天|触发后|随后/i;
const ENTITY_ATTRIBUTE_QUERY_PATTERN =
  /\b(what\s+is|who\s+is|which|owner|maintainer|config|setting|version|status|profile|attribute|property)\b|属性|配置|版本|负责人|维护者|参数|状态/i;
const DECISION_REASON_QUERY_PATTERN =
  /\b(why|reason|because|decision|trade-?off|chose|choose|reject(?:ed)?|rationale)\b|为什么|原因|因为|决策|取舍|选型|拒绝方案/i;

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
    // Keep deterministic sampling cheap and stable for canary reads.
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % 100;
};

export const classifyQueryType = (query: string): QueryType => {
  if (TEMPORAL_RELATION_QUERY_PATTERN.test(query)) {
    return "temporal_relation";
  }
  if (DECISION_REASON_QUERY_PATTERN.test(query)) {
    return "decision_reason";
  }
  if (ENTITY_ATTRIBUTE_QUERY_PATTERN.test(query)) {
    return "entity_attribute";
  }
  return "other";
};

const resolveRemoteRoute = (params: {
  defaultRoute: BridgeRoute;
  timelineRoute: BridgeRemoteRoute;
  semanticRoute: BridgeRemoteRoute;
  intent: QueryIntent;
}): BridgeRemoteRoute => {
  if (params.defaultRoute === "mem0" || params.defaultRoute === "graphiti") {
    return params.defaultRoute;
  }
  return params.intent === "timeline" ? params.timelineRoute : params.semanticRoute;
};

const resolveCandidateRoute = (params: {
  readMode: BridgeReadMode;
  cutoverPercent: number;
  routeSeed: string;
  defaultRoute: BridgeRoute;
  timelineRoute: BridgeRemoteRoute;
  semanticRoute: BridgeRemoteRoute;
  intent: QueryIntent;
}): BridgeRoute => {
  if (params.readMode === "local") {
    return "local";
  }

  const remoteRoute = resolveRemoteRoute({
    defaultRoute: params.defaultRoute,
    timelineRoute: params.timelineRoute,
    semanticRoute: params.semanticRoute,
    intent: params.intent,
  });

  if (params.readMode === "shadow" || params.readMode === "remote") {
    return remoteRoute;
  }

  if (params.cutoverPercent <= 0) {
    return "local";
  }
  if (params.cutoverPercent >= 100) {
    return remoteRoute;
  }

  const bucket = hashToPercentBucket(params.routeSeed);
  return bucket < params.cutoverPercent ? remoteRoute : "local";
};

const resolveUserRoute = (params: {
  readMode: BridgeReadMode;
  candidateRoute: BridgeRoute;
}): BridgeRoute => {
  if (params.readMode === "local" || params.readMode === "shadow") {
    return "local";
  }
  return params.candidateRoute;
};

export function resolveReadPlan(input: ReadPlanInput): ReadPlan {
  const cutoverPercent = clampPercent(input.cutoverPercent);
  const signature = input.querySignature ?? resolveQuerySignature(input.query);
  const queryType = signature?.precisionKey ? "other" : classifyQueryType(input.query);
  const queryBucket: QueryBucket = signature?.precisionKey ? "exact_id" : queryType;
  const intent = queryBucket === "temporal_relation" ? "timeline" : "semantic";
  const defaultRoute = input.defaultRoute ?? "local";
  const timelineRoute = input.timelineRoute ?? "graphiti";
  const semanticRoute = input.semanticRoute ?? "mem0";
  const fallbackRoute = input.fallbackRoute ?? "local";
  const routeSeed = input.routeSeed?.trim() || input.query;

  const candidateRoute = resolveCandidateRoute({
    readMode: input.readMode,
    cutoverPercent,
    routeSeed,
    defaultRoute,
    timelineRoute,
    semanticRoute,
    intent,
  });
  const userRoute = resolveUserRoute({
    readMode: input.readMode,
    candidateRoute,
  });

  const shadowCompare = input.readMode === "shadow" && candidateRoute !== "local";
  const phase0LocalOnly = userRoute === "local";
  const reason =
    phase0LocalOnly && candidateRoute !== "local"
      ? "phase0_local_only_guard"
      : phase0LocalOnly
        ? "phase0_local_default"
        : "read_cutover_candidate_enabled";

  return {
    userRoute,
    candidateRoute,
    fallbackRoute,
    shadowCompare,
    intent,
    queryType,
    queryBucket,
    signature,
    readMode: input.readMode,
    cutoverPercent,
    phase0LocalOnly,
    reason,
  };
}
