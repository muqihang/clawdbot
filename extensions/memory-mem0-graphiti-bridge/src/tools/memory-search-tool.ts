import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { RemoteSnippetStore } from "../bridge/remote-snippet-store.js";
import type { BridgeSearchHit, RemoteMemoryClient } from "../client/mem0-client.js";
import type { BridgeFlags, BridgeRoute } from "../config/flags.js";
import type { ShadowReporter } from "../metrics/shadow-reporter.js";
import { resolveReadPlan } from "../router/read-router.js";

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

type JsonResult = {
  content: Array<{ type: string; text: string }>;
  details: unknown;
};

const ALIAS_GROUPS = [
  ["telegram", "tg", "电报"],
  ["imessage", "苹果短信"],
  ["graphiti", "知识图谱", "图谱"],
  ["topology", "拓扑"],
  ["memory upgrade", "记忆升级"],
  ["openclaw", "clawdbot", "open claw"],
] as const;

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const asArray = (value: unknown): unknown[] => {
  return Array.isArray(value) ? value : [];
};

const jsonResult = (payload: unknown): JsonResult => {
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
}): Promise<BridgeSearchHit[]> => {
  const searchQueries = params.aliasNormalization
    ? expandAliasQueries(params.query)
    : [params.query];
  const allHits: BridgeSearchHit[] = [];

  for (const query of searchQueries) {
    const hits =
      params.route === "mem0"
        ? await params.clients.mem0.search(query)
        : params.route === "graphiti"
          ? await params.clients.graphiti.search(query)
          : [];

    allHits.push(...hits);
  }

  return dedupeHits(allHits);
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
}): Record<string, unknown> => {
  const payload = {
    ...(params.localDetails ?? {}),
    results: mapBridgeHitsToMemoryResults(params.remoteHits),
    provider: params.remoteRoute,
    model: params.remoteRoute,
    mode: params.readMode,
    alias_normalization: params.aliasNormalization,
    structures: buildStructureMetrics(params.remoteHits),
  };

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

      const readPlan = resolveReadPlan({
        readMode: deps.flags.read_mode,
        cutoverPercent: deps.flags.cutover_percent,
        query,
        routeSeed: deps.sessionKey ?? query,
        defaultRoute: deps.flags.routing.default_route,
        timelineRoute: deps.flags.routing.timeline_route,
        semanticRoute: deps.flags.routing.semantic_route,
      });

      const responseRoute = readPlan.userRoute;
      const aliasNormalization = deps.flags.read.alias_normalization;

      if (deps.flags.read_mode === "shadow" && readPlan.candidateRoute !== "local") {
        const remoteHits = await searchRemote({
          route: readPlan.candidateRoute,
          query,
          clients: deps.clients,
          aliasNormalization,
        });

        deps.snippetStore.setFromSearchHits(remoteHits);
        deps.shadowReporter.record({
          sessionKey: deps.sessionKey,
          query,
          readMode: deps.flags.read_mode,
          candidateRoute: readPlan.candidateRoute,
          localCount: localResults.length,
          remoteCount: remoteHits.length,
          timestamp: new Date().toISOString(),
        });

        return localResult;
      }

      if (responseRoute === "local") {
        return localResult;
      }

      const remoteHits = await searchRemote({
        route: responseRoute,
        query,
        clients: deps.clients,
        aliasNormalization,
      });
      if (remoteHits.length === 0) {
        return localResult;
      }

      deps.snippetStore.setFromSearchHits(remoteHits);
      return jsonResult(
        toRemotePayload({
          localDetails,
          remoteRoute: responseRoute,
          remoteHits,
          readMode: deps.flags.read_mode,
          aliasNormalization,
        }),
      );
    },
  };
}
