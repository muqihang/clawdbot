import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { createRemoteSnippetStore } from "../bridge/remote-snippet-store.js";
import type { BridgeSearchHit } from "../client/mem0-client.js";
import type { BridgeFlags } from "../config/flags.js";
import { createBridgeMemorySearchTool } from "../tools/memory-search-tool.js";

const createFlags = (overrides: Partial<BridgeFlags> = {}): BridgeFlags => {
  const base: BridgeFlags = {
    plugin_load: true,
    read_mode: "remote",
    write_mode: "off",
    cutover_percent: 100,
    request_timeout_ms: 3_000,
    routing: {
      default_route: "mem0",
      timeline_route: "graphiti",
      semantic_route: "mem0",
      fallback_route: "local",
    },
    timeoutMs: {
      search: 3_000,
      get: 3_000,
    },
    mem0: {},
    graphiti: {},
    outbox: {
      enabled: false,
    },
    p3: {
      model: "gpt-5.1-codex-mini",
      max_attempts: 5,
      base_backoff_ms: 1000,
      max_backoff_ms: 300000,
      jitter_ratio: 0.15,
      low_confidence_threshold: 0.7,
      write_timeout_ms: 5000,
      mem0_write_path: "/memories",
      graphiti_write_path: "/messages",
      worker_interval_ms: 60000,
      auto_worker: false,
      admission_enabled: false,
      commit_canary_ratio: 0,
      commit_require_index_check: true,
      commit_require_non_sensitive: true,
      commit_require_dual_write_ok: true,
      graphiti_ontology_v1: {
        enabled: false,
        sample_percent: 0,
      },
    },
    read: {
      alias_normalization: false,
      fusion: {
        shadow_enabled: false,
      },
      precision_guard: {
        enabled: false,
      },
      mem0_filters_criteria_shadow: {
        enabled: false,
        sample_percent: 0,
      },
      graphiti_recipe_routing: {
        enabled: false,
        sample_percent: 0,
      },
      graphiti_focal_node: {
        enabled: false,
        sample_percent: 0,
      },
      graphiti_temporal_filters: {
        enabled: false,
        sample_percent: 0,
      },
      graphiti_ontology_readback: {
        enabled: false,
        sample_percent: 0,
      },
    },
    localHierarchy: {
      enabled: true,
    },
    contract: {
      enforce_compat: true,
    },
  };

  return {
    ...base,
    ...overrides,
    routing: {
      ...base.routing,
      ...(overrides.routing ?? {}),
    },
    timeoutMs: {
      ...base.timeoutMs,
      ...(overrides.timeoutMs ?? {}),
    },
    p3: {
      ...base.p3,
      ...(overrides.p3 ?? {}),
    },
    read: {
      ...base.read,
      ...(overrides.read ?? {}),
    },
  };
};

const createLocalTool = (): AnyAgentTool => {
  return {
    name: "memory_search",
    label: "Memory Search",
    description: "local search tool",
    parameters: {},
    execute: vi.fn(async () => ({
      content: [],
      details: {
        results: [
          {
            path: "MEMORY.md",
            startLine: 1,
            endLine: 1,
            score: 0.9,
            snippet: "local snippet",
            source: "memory",
          },
        ],
        provider: "builtin",
        model: "builtin",
        citations: "auto",
      },
    })),
  };
};

const graphitiHit = (id: string): BridgeSearchHit => ({
  path: `bridge/graphiti/${id}`,
  startLine: 1,
  endLine: 1,
  score: 0.8,
  snippet: `graphiti snippet ${id}`,
  source: "graphiti",
  remoteId: id,
});

describe("fallback fault injection", () => {
  it("injects timeout fault and routes to fallback_route", async () => {
    const localTool = createLocalTool();
    const mem0Search = vi.fn(async (): Promise<BridgeSearchHit[]> => {
      throw new Error("request timed out while searching mem0");
    });
    const graphitiSearch = vi.fn(async (): Promise<BridgeSearchHit[]> => [graphitiHit("timeout")]);

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        routing: {
          default_route: "mem0",
          fallback_route: "graphiti",
        },
      }),
      localTool,
      snippetStore: createRemoteSnippetStore({ ttlMs: 10_000 }),
      clients: {
        mem0: {
          search: mem0Search,
          getById: vi.fn(async () => null),
        },
        graphiti: {
          search: graphitiSearch,
          getById: vi.fn(async () => null),
        },
      },
      shadowReporter: {
        record: vi.fn(),
      },
    });

    const result = await tool.execute("timeout-1", { query: "why did we switch provider" });
    const detailsRecord = result.details as Record<string, unknown>;
    const routeRecord = detailsRecord.route as Record<string, unknown>;
    const fallbackRecord = detailsRecord.fallback as Record<string, unknown>;

    expect(mem0Search).toHaveBeenCalledTimes(1);
    expect(graphitiSearch).toHaveBeenCalledTimes(1);
    expect(detailsRecord.provider).toBe("graphiti");
    expect(detailsRecord.source).toBe("graphiti");
    expect(routeRecord.primary_route).toBe("mem0");
    expect(routeRecord.fallback_route).toBe("graphiti");
    expect(routeRecord.selected_route).toBe("graphiti");
    expect(fallbackRecord.triggered).toBe(true);
    expect(fallbackRecord.reason).toBe("timeout");
    expect(Number(fallbackRecord.primary_latency_ms)).toBeGreaterThanOrEqual(0);
    expect(Number(fallbackRecord.fallback_latency_ms)).toBeGreaterThanOrEqual(0);
  });

  it("injects 5xx fault and degrades to local fallback", async () => {
    const localTool = createLocalTool();
    const mem0Search = vi.fn(async (): Promise<BridgeSearchHit[]> => {
      const error = new Error("remote mem0 search failed with status 503");
      (error as Error & { status?: number }).status = 503;
      throw error;
    });

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        routing: {
          default_route: "mem0",
          fallback_route: "local",
        },
      }),
      localTool,
      snippetStore: createRemoteSnippetStore({ ttlMs: 10_000 }),
      clients: {
        mem0: {
          search: mem0Search,
          getById: vi.fn(async () => null),
        },
        graphiti: {
          search: vi.fn(async (): Promise<BridgeSearchHit[]> => [graphitiHit("unused")]),
          getById: vi.fn(async () => null),
        },
      },
      shadowReporter: {
        record: vi.fn(),
      },
    });

    const result = await tool.execute("5xx-1", { query: "find semantic memory" });
    const detailsRecord = result.details as Record<string, unknown>;
    const routeRecord = detailsRecord.route as Record<string, unknown>;
    const fallbackRecord = detailsRecord.fallback as Record<string, unknown>;

    expect(mem0Search).toHaveBeenCalledTimes(1);
    expect(detailsRecord.provider).toBe("builtin");
    expect(detailsRecord.source).toBe("local");
    expect(routeRecord.primary_route).toBe("mem0");
    expect(routeRecord.selected_route).toBe("local");
    expect(fallbackRecord.triggered).toBe(true);
    expect(fallbackRecord.reason).toBe("http_5xx");
    expect(fallbackRecord.primary_status).toBe(503);
  });

  it("injects empty-result fault and returns diagnostic local fallback", async () => {
    const localTool = createLocalTool();
    const mem0Search = vi.fn(async (): Promise<BridgeSearchHit[]> => []);

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        routing: {
          default_route: "mem0",
          fallback_route: "local",
        },
      }),
      localTool,
      snippetStore: createRemoteSnippetStore({ ttlMs: 10_000 }),
      clients: {
        mem0: {
          search: mem0Search,
          getById: vi.fn(async () => null),
        },
        graphiti: {
          search: vi.fn(async (): Promise<BridgeSearchHit[]> => []),
          getById: vi.fn(async () => null),
        },
      },
      shadowReporter: {
        record: vi.fn(),
      },
    });

    const result = await tool.execute("empty-1", { query: "find semantic memory" });
    const detailsRecord = result.details as Record<string, unknown>;
    const routeRecord = detailsRecord.route as Record<string, unknown>;
    const fallbackRecord = detailsRecord.fallback as Record<string, unknown>;

    expect(mem0Search).toHaveBeenCalledTimes(1);
    expect(detailsRecord.provider).toBe("builtin");
    expect(detailsRecord.source).toBe("local");
    expect(routeRecord.primary_route).toBe("mem0");
    expect(routeRecord.selected_route).toBe("local");
    expect(fallbackRecord.triggered).toBe(true);
    expect(fallbackRecord.reason).toBe("empty_results");
    expect(Number(fallbackRecord.primary_latency_ms)).toBeGreaterThanOrEqual(0);
    expect(Number(fallbackRecord.total_latency_ms)).toBeGreaterThanOrEqual(0);
  });
});
