import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { createRemoteSnippetStore } from "../bridge/remote-snippet-store.js";
import type { BridgeSearchHit } from "../client/mem0-client.js";
import type { BridgeFlags } from "../config/flags.js";
import { createBridgeMemorySearchTool } from "../tools/memory-search-tool.js";

const createFlags = (overrides: Partial<BridgeFlags> = {}): BridgeFlags => {
  const base: BridgeFlags = {
    plugin_load: true,
    read_mode: "local",
    write_mode: "off",
    cutover_percent: 0,
    request_timeout_ms: 3_000,
    routing: {
      default_route: "local",
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
    },
    read: {
      alias_normalization: true,
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
        fallback: undefined,
        citations: "auto",
      },
    })),
  };
};

describe("memory search bridge tool", () => {
  it("keeps precision guard deterministic across repeated calls and stable on ties", async () => {
    let flipOrder = false;
    const localTool: AnyAgentTool = {
      name: "memory_search",
      label: "Memory Search",
      description: "local search tool",
      parameters: {},
      execute: vi.fn(async () => {
        flipOrder = !flipOrder;
        const first = {
          path: "MEMORY-A.md",
          startLine: 1,
          endLine: 1,
          score: 0.9,
          snippet: "commit deadbeef touched router/read-router.ts",
          source: "memory",
        };
        const second = {
          path: "MEMORY-B.md",
          startLine: 2,
          endLine: 2,
          score: 0.9,
          snippet: "commit deadbeef fixed error_code handling",
          source: "memory",
        };
        const results = flipOrder ? [first, second] : [second, first];

        return {
          content: [],
          details: {
            results,
            provider: "builtin",
            model: "builtin",
            citations: "auto",
          },
        };
      }),
    };

    const shadowReporter = {
      record: vi.fn(),
    };

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "remote",
        cutover_percent: 100,
        read: {
          precision_guard: {
            enabled: true,
          },
        },
      }),
      localTool,
      snippetStore: createRemoteSnippetStore({ ttlMs: 10_000 }),
      clients: {
        mem0: {
          search: vi.fn(async () => []),
          getById: vi.fn(async () => null),
        },
        graphiti: {
          search: vi.fn(async () => []),
          getById: vi.fn(async () => null),
        },
      },
      shadowReporter,
      sessionKey: "session-1",
    });

    const first = await tool.execute("1", { query: "commit deadbeef" });
    const second = await tool.execute("2", { query: "commit deadbeef" });

    const firstDetails = first.details as Record<string, unknown>;
    const secondDetails = second.details as Record<string, unknown>;
    const firstResults = firstDetails.results as Array<Record<string, unknown>>;
    const secondResults = secondDetails.results as Array<Record<string, unknown>>;

    expect(String(firstDetails.source ?? "")).toBe("local");
    expect(String(secondDetails.source ?? "")).toBe("local");

    expect(firstResults[0]?.path).toBe("MEMORY-A.md");
    expect(secondResults[0]?.path).toBe("MEMORY-A.md");

    expect(firstDetails.guard).toEqual(secondDetails.guard);
  });

  it("returns local result in shadow mode and still runs remote compare", async () => {
    const localTool = createLocalTool();
    const shadowReporter = {
      record: vi.fn(),
    };

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({ read_mode: "shadow" }),
      localTool,
      snippetStore: createRemoteSnippetStore({ ttlMs: 10_000 }),
      clients: {
        mem0: {
          search: vi.fn(async () => []),
          getById: vi.fn(async () => null),
        },
        graphiti: {
          search: vi.fn(
            async (): Promise<BridgeSearchHit[]> => [
              {
                path: "bridge/graphiti/g1",
                startLine: 1,
                endLine: 1,
                score: 0.8,
                snippet: "remote timeline snippet",
                source: "graphiti",
                remoteId: "g1",
              },
            ],
          ),
          getById: vi.fn(async () => null),
        },
      },
      shadowReporter,
      sessionKey: "session-1",
    });

    const result = await tool.execute("1", { query: "when did we migrate providers" });

    expect(result.details).toEqual(
      expect.objectContaining({
        results: [
          expect.objectContaining({
            source: "memory",
          }),
        ],
      }),
    );
    expect(shadowReporter.record).toHaveBeenCalledTimes(1);
  });

  it("sends mem0 filters+criteria during shadow compare without impacting user route", async () => {
    const localTool = createLocalTool();
    const shadowReporter = {
      record: vi.fn(),
    };

    const mem0Search = vi.fn(async () => []);
    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "shadow",
        cutover_percent: 100,
        read: {
          mem0_filters_criteria_shadow: {
            enabled: true,
            sample_percent: 100,
          },
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
          search: vi.fn(async () => []),
          getById: vi.fn(async () => null),
        },
      },
      shadowReporter,
      sessionKey: "session-1",
    });

    const filters = { oc_user_id: "ocu_v1:telegram:123456" };
    const criteria = { mode: "shadow", strict: true };

    const result = await tool.execute("1", {
      query: "what preferences did we store",
      filters,
      criteria,
    });

    expect(result.details).toEqual(
      expect.objectContaining({
        provider: "builtin",
      }),
    );
    expect(mem0Search).toHaveBeenCalledWith(
      "what preferences did we store",
      expect.objectContaining({
        filters,
        criteria,
      }),
    );
    expect(shadowReporter.record).toHaveBeenCalledWith(
      expect.objectContaining({
        shadow_filters_criteria: true,
      }),
    );
  });

  it("returns remote result in primary mode when route selected", async () => {
    const localTool = createLocalTool();
    const snippetStore = createRemoteSnippetStore({ ttlMs: 10_000 });

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "primary",
        cutover_percent: 100,
      }),
      localTool,
      snippetStore,
      clients: {
        mem0: {
          search: vi.fn(async () => []),
          getById: vi.fn(async () => null),
        },
        graphiti: {
          search: vi.fn(
            async (): Promise<BridgeSearchHit[]> => [
              {
                path: "bridge/graphiti/abc",
                startLine: 1,
                endLine: 1,
                score: 0.95,
                snippet: "remote graphiti hit",
                source: "graphiti",
                remoteId: "abc",
              },
            ],
          ),
          getById: vi.fn(async () => null),
        },
      },
      shadowReporter: {
        record: vi.fn(),
      },
      sessionKey: "session-1",
    });

    const result = await tool.execute("1", { query: "timeline before migration" });

    expect(result.details).toEqual(
      expect.objectContaining({
        results: [
          expect.objectContaining({
            path: "bridge/graphiti/abc",
          }),
        ],
      }),
    );
    expect(snippetStore.get("graphiti", "abc")).toBe("remote graphiti hit");
  });

  it("expands alias queries when alias normalization is enabled", async () => {
    const localTool = createLocalTool();
    const mem0Search = vi.fn(async (query: string) => {
      if (query.includes("telegram")) {
        return [
          {
            path: "bridge/mem0/m1",
            startLine: 1,
            endLine: 1,
            score: 0.9,
            snippet: "telegram preferred",
            source: "mem0" as const,
            remoteId: "m1",
          },
        ];
      }
      return [];
    });

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "remote",
        cutover_percent: 100,
      }),
      localTool,
      snippetStore: createRemoteSnippetStore({ ttlMs: 10_000 }),
      clients: {
        mem0: {
          search: mem0Search,
          getById: vi.fn(async () => null),
        },
        graphiti: {
          search: vi.fn(async () => []),
          getById: vi.fn(async () => null),
        },
      },
      shadowReporter: {
        record: vi.fn(),
      },
      sessionKey: "session-1",
    });

    const result = await tool.execute("1", { query: "tg priority" });
    expect(mem0Search.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(result.details).toEqual(
      expect.objectContaining({
        results: [
          expect.objectContaining({
            path: "bridge/mem0/m1",
          }),
        ],
      }),
    );
  });

  it("can disable alias normalization and keep single query", async () => {
    const localTool = createLocalTool();
    const mem0Search = vi.fn(async () => []);

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "remote",
        cutover_percent: 100,
        read: {
          alias_normalization: false,
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
          search: vi.fn(async () => []),
          getById: vi.fn(async () => null),
        },
      },
      shadowReporter: {
        record: vi.fn(),
      },
      sessionKey: "session-1",
    });

    const result = await tool.execute("1", { query: "tg priority" });
    expect(mem0Search).toHaveBeenCalledTimes(1);
    expect(result.details).toEqual(
      expect.objectContaining({
        provider: "builtin",
      }),
    );
  });

  it("uses fallback_route after primary remote empty results", async () => {
    const localTool = createLocalTool();
    const mem0Search = vi.fn(async (): Promise<BridgeSearchHit[]> => []);
    const graphitiSearch = vi.fn(
      async (): Promise<BridgeSearchHit[]> => [
        {
          path: "bridge/graphiti/fallback-1",
          startLine: 1,
          endLine: 1,
          score: 0.89,
          snippet: "fallback graphiti hit",
          source: "graphiti",
          remoteId: "fallback-1",
        },
      ],
    );

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "remote",
        cutover_percent: 100,
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
      sessionKey: "session-1",
    });

    const result = await tool.execute("1", { query: "semantic lookup" });
    const detailsRecord = result.details as Record<string, unknown>;
    const routeRecord = detailsRecord.route as Record<string, unknown>;
    const fallbackRecord = detailsRecord.fallback as Record<string, unknown>;

    expect(mem0Search).toHaveBeenCalledTimes(1);
    expect(graphitiSearch).toHaveBeenCalledTimes(1);
    expect(result.details).toEqual(
      expect.objectContaining({
        provider: "graphiti",
        source: "graphiti",
        results: [
          expect.objectContaining({
            path: "bridge/graphiti/fallback-1",
          }),
        ],
      }),
    );
    expect(routeRecord.primary_route).toBe("mem0");
    expect(routeRecord.fallback_route).toBe("graphiti");
    expect(routeRecord.selected_route).toBe("graphiti");
    expect(fallbackRecord.triggered).toBe(true);
    expect(fallbackRecord.reason).toBe("empty_results");
    expect(Number(fallbackRecord.primary_latency_ms)).toBeGreaterThanOrEqual(0);
  });

  it("attaches context_assemble output for exact_id without breaking baseline schema", async () => {
    const localTool = createLocalTool();
    const mem0Search = vi.fn(
      async (): Promise<BridgeSearchHit[]> => [
        {
          path: "bridge/mem0/id-hit",
          startLine: 1,
          endLine: 1,
          score: 0.97,
          snippet: "resolved identity record",
          source: "mem0",
          remoteId: "id-hit",
        },
      ],
    );

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "remote",
        cutover_percent: 100,
      }),
      localTool,
      snippetStore: createRemoteSnippetStore({ ttlMs: 10_000 }),
      clients: {
        mem0: {
          search: mem0Search,
          getById: vi.fn(async () => null),
        },
        graphiti: {
          search: vi.fn(async () => []),
          getById: vi.fn(async () => null),
        },
      },
      shadowReporter: {
        record: vi.fn(),
      },
      sessionKey: "session-1",
    });

    const result = await tool.execute("1", {
      query: "find exact id",
      bucket: "exact_id",
      oc_user_id: "ocu_v1:telegram:123456",
      message_envelope: {
        role: "user",
        created_at: "2026-02-02T10:00:00Z",
      },
    });

    expect(result.details).toEqual(
      expect.objectContaining({
        results: [
          expect.objectContaining({
            path: "bridge/mem0/id-hit",
          }),
        ],
        provider: "mem0",
        model: "mem0",
      }),
    );
    const detailsRecord = result.details as Record<string, unknown>;
    const assembled = detailsRecord.context_assemble as Record<string, unknown>;
    expect(assembled.template_id).toBe("T1");
    expect(assembled.decision).toBe("answer");
  });

  it("attaches explainable degrade result when timeline inputs are insufficient", async () => {
    const localTool = createLocalTool();

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "remote",
        cutover_percent: 100,
      }),
      localTool,
      snippetStore: createRemoteSnippetStore({ ttlMs: 10_000 }),
      clients: {
        mem0: {
          search: vi.fn(async (): Promise<BridgeSearchHit[]> => []),
          getById: vi.fn(async () => null),
        },
        graphiti: {
          search: vi.fn(
            async (): Promise<BridgeSearchHit[]> => [
              {
                path: "bridge/graphiti/tl-1",
                startLine: 1,
                endLine: 1,
                score: 0.78,
                snippet: "one timeline event",
                source: "graphiti",
                remoteId: "tl-1",
              },
            ],
          ),
          getById: vi.fn(async () => null),
        },
      },
      shadowReporter: {
        record: vi.fn(),
      },
      sessionKey: "session-1",
    });

    const result = await tool.execute("1", {
      query: "timeline migration",
      bucket: "timeline",
    });

    const detailsRecord = result.details as Record<string, unknown>;
    const assembled = detailsRecord.context_assemble as Record<string, unknown>;
    expect(assembled.template_id).toBe("T2");
    expect(assembled.decision).toBe("degrade");
    expect(typeof assembled.degrade_reason).toBe("string");
    expect(String(assembled.degrade_reason).length).toBeGreaterThan(0);
  });

  it("routes temporal queries to edge recipe when graphiti recipe routing is enabled", async () => {
    const localTool = createLocalTool();

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "remote",
        cutover_percent: 100,
        routing: {
          default_route: "graphiti",
        },
        read: {
          graphiti_recipe_routing: {
            enabled: true,
            sample_percent: 100,
          },
        },
      }),
      localTool,
      snippetStore: createRemoteSnippetStore({ ttlMs: 10_000 }),
      clients: {
        mem0: {
          search: vi.fn(async () => []),
          getById: vi.fn(async () => null),
        },
        graphiti: {
          search: vi.fn(
            async (): Promise<BridgeSearchHit[]> => [
              {
                path: "bridge/graphiti/facts-1",
                startLine: 1,
                endLine: 1,
                score: 0.95,
                snippet: "facts top1 before rerank",
                source: "graphiti",
                remoteId: "facts-1",
                structure: "facts",
              },
              {
                path: "bridge/graphiti/episodes-1",
                startLine: 1,
                endLine: 1,
                score: 0.92,
                snippet: "episodes candidate",
                source: "graphiti",
                remoteId: "episodes-1",
                structure: "episodes",
              },
              {
                path: "bridge/graphiti/nodes-1",
                startLine: 1,
                endLine: 1,
                score: 0.9,
                snippet: "nodes candidate",
                source: "graphiti",
                remoteId: "nodes-1",
                structure: "nodes",
              },
            ],
          ),
          getById: vi.fn(async () => null),
        },
      },
      shadowReporter: {
        record: vi.fn(),
      },
      sessionKey: "session-1",
    });

    const result = await tool.execute("1", { query: "在迁移之后 timeline 发生了什么" });
    const detailsRecord = result.details as Record<string, unknown>;
    const recipeRecord = detailsRecord.recipe as Record<string, unknown>;
    const results = detailsRecord.results as Array<Record<string, unknown>>;

    expect(results[0]?.path).toBe("bridge/graphiti/episodes-1");
    expect(recipeRecord.query_type).toBe("temporal_relation");
    expect(recipeRecord.query_bucket).toBe("temporal_relation");
    expect(recipeRecord.selected_recipe).toBe("edge");
    expect(recipeRecord.active).toBe(true);
    expect(recipeRecord.degrade_reason).toBeNull();
  });

  it("uses graphiti focal-node discovery for temporal_relation queries when enabled", async () => {
    const localTool = createLocalTool();
    const graphitiSearch = vi
      .fn()
      .mockResolvedValueOnce([
        {
          path: "bridge/graphiti/focal-node-1",
          startLine: 1,
          endLine: 1,
          score: 0.93,
          snippet: "candidate focal node",
          source: "graphiti" as const,
          remoteId: "focal-node-1",
          structure: "nodes",
        },
      ])
      .mockResolvedValueOnce([
        {
          path: "bridge/graphiti/episode-1",
          startLine: 1,
          endLine: 1,
          score: 0.95,
          snippet: "episode result using focal node",
          source: "graphiti" as const,
          remoteId: "episode-1",
          structure: "episodes",
        },
      ]);

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "remote",
        cutover_percent: 100,
        routing: {
          default_route: "graphiti",
          timeline_route: "graphiti",
          semantic_route: "graphiti",
        },
        read: {
          graphiti_recipe_routing: {
            enabled: true,
            sample_percent: 100,
          },
          graphiti_focal_node: {
            enabled: true,
            sample_percent: 100,
          },
        },
      }),
      localTool,
      snippetStore: createRemoteSnippetStore({ ttlMs: 10_000 }),
      clients: {
        mem0: {
          search: vi.fn(async () => []),
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
      sessionKey: "session-1",
    });

    const result = await tool.execute("1", { query: "when did we migrate providers" });
    const detailsRecord = result.details as Record<string, unknown>;
    const focalNodeRecord = detailsRecord.focal_node as Record<string, unknown>;

    expect(graphitiSearch).toHaveBeenCalledTimes(2);
    expect(graphitiSearch.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        strategy: "node",
      }),
    );
    expect(graphitiSearch.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        strategy: "edge",
        focal_node_uuid: "focal-node-1",
      }),
    );
    expect(focalNodeRecord.enabled).toBe(true);
    expect(focalNodeRecord.active).toBe(true);
    expect(focalNodeRecord.focal_node_uuid).toBe("focal-node-1");
    expect(focalNodeRecord.discovery_strategy).toBe("node");
    expect(focalNodeRecord.degrade_reason).toBeNull();
  });

  it("degrades focal-node on exact_id bucket to protect W2 gate-2 behavior", async () => {
    const localTool = createLocalTool();
    const graphitiSearch = vi.fn(async (): Promise<BridgeSearchHit[]> => []);

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "remote",
        cutover_percent: 100,
        routing: {
          default_route: "graphiti",
          timeline_route: "graphiti",
          semantic_route: "graphiti",
        },
        read: {
          graphiti_focal_node: {
            enabled: true,
            sample_percent: 100,
          },
        },
      }),
      localTool,
      snippetStore: createRemoteSnippetStore({ ttlMs: 10_000 }),
      clients: {
        mem0: {
          search: vi.fn(async () => []),
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
      sessionKey: "session-1",
    });

    const result = await tool.execute("1", { query: "commit deadbeef" });
    const detailsRecord = result.details as Record<string, unknown>;
    const focalNodeRecord = detailsRecord.focal_node as Record<string, unknown>;

    expect(graphitiSearch).toHaveBeenCalledTimes(1);
    expect(graphitiSearch.mock.calls[0]?.[1]).toEqual(undefined);
    expect(focalNodeRecord.enabled).toBe(true);
    expect(focalNodeRecord.active).toBe(false);
    expect(focalNodeRecord.focal_node_uuid).toBeNull();
    expect(focalNodeRecord.degrade_reason).toBe("precision_key_bucket");
  });

  it("keeps focal-node disabled by default", async () => {
    const localTool = createLocalTool();
    const graphitiSearch = vi.fn(async (): Promise<BridgeSearchHit[]> => []);

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "remote",
        cutover_percent: 100,
        routing: {
          default_route: "graphiti",
          timeline_route: "graphiti",
          semantic_route: "graphiti",
        },
      }),
      localTool,
      snippetStore: createRemoteSnippetStore({ ttlMs: 10_000 }),
      clients: {
        mem0: {
          search: vi.fn(async () => []),
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
      sessionKey: "session-1",
    });

    const result = await tool.execute("1", { query: "when did we migrate providers" });
    const detailsRecord = result.details as Record<string, unknown>;
    const focalNodeRecord = detailsRecord.focal_node as Record<string, unknown>;

    expect(graphitiSearch).toHaveBeenCalledTimes(1);
    expect(graphitiSearch.mock.calls[0]?.[1]).toEqual(undefined);
    expect(focalNodeRecord.enabled).toBe(false);
    expect(focalNodeRecord.active).toBe(false);
    expect(focalNodeRecord.focal_node_uuid).toBeNull();
    expect(focalNodeRecord.degrade_reason).toBe("flag_disabled");
  });

  it("applies temporal filters when temporal window phrases are matched", async () => {
    const localTool = createLocalTool();
    const graphitiSearch = vi.fn(
      async (): Promise<BridgeSearchHit[]> => [
        {
          path: "bridge/graphiti/episode-1",
          startLine: 1,
          endLine: 1,
          score: 0.95,
          snippet: "episode result with temporal filters",
          source: "graphiti",
          remoteId: "episode-1",
          structure: "episodes",
        },
      ],
    );

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "remote",
        cutover_percent: 100,
        routing: {
          default_route: "graphiti",
          timeline_route: "graphiti",
          semantic_route: "graphiti",
        },
        read: {
          graphiti_recipe_routing: {
            enabled: true,
            sample_percent: 100,
          },
          graphiti_temporal_filters: {
            enabled: true,
            sample_percent: 100,
          },
        },
      }),
      localTool,
      snippetStore: createRemoteSnippetStore({ ttlMs: 10_000 }),
      clients: {
        mem0: {
          search: vi.fn(async () => []),
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
      sessionKey: "session-1",
    });

    const result = await tool.execute("1", { query: "what changed yesterday in timeline" });
    const detailsRecord = result.details as Record<string, unknown>;
    const temporalFiltersRecord = detailsRecord.temporal_filters as Record<string, unknown>;

    expect(graphitiSearch).toHaveBeenCalledTimes(1);
    expect(graphitiSearch.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        strategy: "edge",
        temporal_filters: expect.objectContaining({
          kind: "relative_window",
          window_days: 1,
        }),
      }),
    );
    expect(temporalFiltersRecord.enabled).toBe(true);
    expect(temporalFiltersRecord.active).toBe(true);
    expect(temporalFiltersRecord.kind).toBe("relative_window");
    expect(temporalFiltersRecord.window_days).toBe(1);
    expect(temporalFiltersRecord.matched_phrase).toBe("yesterday");
    expect(temporalFiltersRecord.degrade_reason).toBeNull();
  });

  it("degrades temporal filters when no relative window phrase is matched", async () => {
    const localTool = createLocalTool();
    const graphitiSearch = vi.fn(async (): Promise<BridgeSearchHit[]> => []);

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "remote",
        cutover_percent: 100,
        routing: {
          default_route: "graphiti",
          timeline_route: "graphiti",
          semantic_route: "graphiti",
        },
        read: {
          graphiti_temporal_filters: {
            enabled: true,
            sample_percent: 100,
          },
        },
      }),
      localTool,
      snippetStore: createRemoteSnippetStore({ ttlMs: 10_000 }),
      clients: {
        mem0: {
          search: vi.fn(async () => []),
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
      sessionKey: "session-1",
    });

    const result = await tool.execute("1", { query: "timeline migration history" });
    const detailsRecord = result.details as Record<string, unknown>;
    const temporalFiltersRecord = detailsRecord.temporal_filters as Record<string, unknown>;

    expect(graphitiSearch).toHaveBeenCalledTimes(1);
    expect(graphitiSearch.mock.calls[0]?.[1]).toEqual(undefined);
    expect(temporalFiltersRecord.enabled).toBe(true);
    expect(temporalFiltersRecord.active).toBe(false);
    expect(temporalFiltersRecord.kind).toBeNull();
    expect(temporalFiltersRecord.window_days).toBeNull();
    expect(temporalFiltersRecord.matched_phrase).toBeNull();
    expect(temporalFiltersRecord.degrade_reason).toBe("no_pattern");
  });

  it("keeps W2 exact-id bucket protected when recipe routing is enabled", async () => {
    const localTool: AnyAgentTool = {
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
              score: 0.95,
              snippet: "commit deadbeef rollout decision",
              source: "memory",
            },
          ],
          provider: "builtin",
          model: "builtin",
          citations: "auto",
        },
      })),
    };

    const graphitiSearch = vi.fn(async (): Promise<BridgeSearchHit[]> => []);
    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "remote",
        cutover_percent: 100,
        routing: {
          default_route: "graphiti",
        },
        read: {
          precision_guard: {
            enabled: true,
          },
          graphiti_recipe_routing: {
            enabled: true,
            sample_percent: 100,
          },
        },
      }),
      localTool,
      snippetStore: createRemoteSnippetStore({ ttlMs: 10_000 }),
      clients: {
        mem0: {
          search: vi.fn(async () => []),
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
      sessionKey: "session-1",
    });

    const result = await tool.execute("1", { query: "commit deadbeef" });
    const detailsRecord = result.details as Record<string, unknown>;
    const recipeRecord = detailsRecord.recipe as Record<string, unknown>;
    const guardRecord = detailsRecord.guard as Record<string, unknown>;

    expect(graphitiSearch).not.toHaveBeenCalled();
    expect(detailsRecord.source).toBe("local");
    expect(guardRecord.forced_local).toBe(true);
    expect(recipeRecord.query_bucket).toBe("exact_id");
    expect(recipeRecord.active).toBe(false);
    expect(recipeRecord.degrade_reason).toBe("precision_key_bucket");
  });
});
