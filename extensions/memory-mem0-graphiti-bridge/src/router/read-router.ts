import type { BridgeReadMode, BridgeRemoteRoute, BridgeRoute } from "../config/flags.js";

export type QueryIntent = "timeline" | "semantic";

export type ReadPlanInput = {
  readMode: BridgeReadMode;
  cutoverPercent: number;
  query: string;
  routeSeed?: string;
  defaultRoute?: BridgeRoute;
  timelineRoute?: BridgeRemoteRoute;
  semanticRoute?: BridgeRemoteRoute;
};

export type ReadPlan = {
  userRoute: "local";
  candidateRoute: BridgeRoute;
  shadowCompare: boolean;
  intent: QueryIntent;
  readMode: BridgeReadMode;
  cutoverPercent: number;
  phase0LocalOnly: true;
  reason: "phase0_local_default" | "phase0_local_only_guard";
};

const TIMELINE_QUERY_PATTERN =
  /\b(when|timeline|history|before|after|yesterday|last\s+week|switched|switch|migration|migrated|change)\b/i;

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

const classifyIntent = (query: string): QueryIntent => {
  return TIMELINE_QUERY_PATTERN.test(query) ? "timeline" : "semantic";
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

export function resolveReadPlan(input: ReadPlanInput): ReadPlan {
  const cutoverPercent = clampPercent(input.cutoverPercent);
  const intent = classifyIntent(input.query);
  const defaultRoute = input.defaultRoute ?? "local";
  const timelineRoute = input.timelineRoute ?? "graphiti";
  const semanticRoute = input.semanticRoute ?? "mem0";
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

  // Phase0 guardrail: never return remote user route, only surface shadow intent.
  const shadowCompare = input.readMode === "shadow" && candidateRoute !== "local";

  return {
    userRoute: "local",
    candidateRoute,
    shadowCompare,
    intent,
    readMode: input.readMode,
    cutoverPercent,
    phase0LocalOnly: true,
    reason: candidateRoute === "local" ? "phase0_local_default" : "phase0_local_only_guard",
  };
}
