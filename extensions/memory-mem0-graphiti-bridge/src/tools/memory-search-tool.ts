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

const resolveResponseRoute = (
  readMode: BridgeFlags["read_mode"],
  candidateRoute: BridgeRoute,
): BridgeRoute => {
  if (readMode === "local" || readMode === "shadow") {
    return "local";
  }
  return candidateRoute;
};

const searchRemote = async (params: {
  route: BridgeRoute;
  query: string;
  clients: BridgeSearchToolDeps["clients"];
}): Promise<BridgeSearchHit[]> => {
  if (params.route === "mem0") {
    return await params.clients.mem0.search(params.query);
  }
  if (params.route === "graphiti") {
    return await params.clients.graphiti.search(params.query);
  }
  return [];
};

const mapBridgeHitsToMemoryResults = (hits: BridgeSearchHit[]): Array<Record<string, unknown>> => {
  return hits.map((hit) => ({
    path: hit.path,
    startLine: hit.startLine,
    endLine: hit.endLine,
    score: hit.score,
    snippet: hit.snippet,
    source: "memory",
  }));
};

const toRemotePayload = (params: {
  localDetails: Record<string, unknown> | undefined;
  remoteRoute: BridgeRoute;
  remoteHits: BridgeSearchHit[];
  readMode: BridgeFlags["read_mode"];
}): Record<string, unknown> => {
  const payload = {
    ...(params.localDetails ?? {}),
    results: mapBridgeHitsToMemoryResults(params.remoteHits),
    provider: params.remoteRoute,
    model: params.remoteRoute,
    mode: params.readMode,
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

      const responseRoute = resolveResponseRoute(deps.flags.read_mode, readPlan.candidateRoute);

      if (deps.flags.read_mode === "shadow" && readPlan.candidateRoute !== "local") {
        const remoteHits = await searchRemote({
          route: readPlan.candidateRoute,
          query,
          clients: deps.clients,
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
        }),
      );
    },
  };
}
