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
      graphiti_ontology_v1: {
        enabled: false,
        sample_percent: 0,
      },
    },
    read: {
      alias_normalization: true,
      fusion: {
        enabled: false,
        shadow_enabled: false,
        bucket_policy: "conservative",
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
      fusion: {
        ...base.read.fusion,
        ...(overrides.read?.fusion ?? {}),
      },
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
  it("always attaches route + fallback details for local-only routing", async () => {
    const localTool = createLocalTool();
    const mem0Search = vi.fn(async () => []);
    const graphitiSearch = vi.fn(async () => []);

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "local",
        routing: {
          default_route: "local",
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

    const result = await tool.execute("local-1", { query: "local only" });
    const detailsRecord = result.details as Record<string, unknown>;
    const routeRecord = detailsRecord.route as Record<string, unknown>;
    const fallbackRecord = detailsRecord.fallback as Record<string, unknown>;

    expect(mem0Search).not.toHaveBeenCalled();
    expect(graphitiSearch).not.toHaveBeenCalled();

    expect(detailsRecord.source).toBe("local");
    expect(routeRecord.primary_route).toBe("local");
    expect(routeRecord.candidate_route).toBe("local");
    expect(routeRecord.selected_route).toBe("local");
    expect(fallbackRecord.triggered).toBe(false);
    expect(fallbackRecord.reason).toBeNull();
  });

  it("injects mem0 stable identifier into remote search options when missing", async () => {
    const localTool = createLocalTool();
    const mem0Search = vi.fn(async () => []);

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "remote",
        cutover_percent: 100,
        routing: {
          default_route: "mem0",
          fallback_route: "local",
        },
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

    await tool.execute("mem0-1", { query: "semantic", oc_user_id: "user-123" });

    expect(mem0Search).toHaveBeenCalledTimes(1);
    expect(mem0Search).toHaveBeenCalledWith(
      "semantic",
      expect.objectContaining({
        user_id: "user-123",
      }),
    );
  });

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

  it("runs mem0 + graphiti shadow recall in parallel without changing local results", async () => {
    const localTool = createLocalTool();
    const shadowReporter = {
      record: vi.fn(),
    };

    const mem0Search = vi.fn(
      async (): Promise<BridgeSearchHit[]> => [
        {
          path: "bridge/mem0/m-shadow",
          startLine: 1,
          endLine: 1,
          score: 0.81,
          snippet: "mem0 shadow snippet",
          source: "mem0",
          remoteId: "m-shadow",
        },
      ],
    );

    const graphitiSearch = vi.fn(
      async (): Promise<BridgeSearchHit[]> => [
        {
          path: "bridge/graphiti/g-shadow",
          startLine: 1,
          endLine: 1,
          score: 0.8,
          snippet: "graphiti shadow snippet",
          source: "graphiti",
          remoteId: "g-shadow",
        },
      ],
    );

    const flags = createFlags({
      read_mode: "shadow",
      read: {
        alias_normalization: false,
        fusion: {
          shadow_enabled: true,
        },
      },
    });

    const tool = createBridgeMemorySearchTool({
      flags,
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
      shadowReporter,
      sessionKey: "session-1",
    });

    const result = await tool.execute("1", { query: "when did we migrate providers" });

    expect(mem0Search).toHaveBeenCalledTimes(1);
    expect(graphitiSearch).toHaveBeenCalledTimes(1);

    const detailsRecord = result.details as Record<string, unknown>;
    expect(detailsRecord.source).toBe("local");

    const results = detailsRecord.results as Array<Record<string, unknown>>;
    expect(results[0]?.path).toBe("MEMORY.md");

    const fusionShadow = detailsRecord.fusion_shadow as Record<string, unknown>;
    expect(fusionShadow).toEqual(
      expect.objectContaining({
        enabled: true,
        bucket: "temporal_relation",
        candidate_route: "graphiti",
        bucket_policy: expect.objectContaining({
          name: "conservative",
          mem0: expect.objectContaining({
            quota: 2,
            weight: 1,
          }),
          graphiti: expect.objectContaining({
            quota: 4,
            weight: 1.1,
          }),
        }),
        candidate_breakdown: expect.objectContaining({
          mem0: expect.objectContaining({
            hit_count: 1,
            after_quota_count: 1,
          }),
          graphiti: expect.objectContaining({
            hit_count: 1,
            after_quota_count: 1,
          }),
        }),
        mem0: expect.objectContaining({
          attempted: true,
          hit_count: 1,
        }),
        graphiti: expect.objectContaining({
          attempted: true,
          hit_count: 1,
        }),
      }),
    );

    const mem0Trace = fusionShadow.mem0 as Record<string, unknown>;
    const graphitiTrace = fusionShadow.graphiti as Record<string, unknown>;
    expect(Number(mem0Trace.latency_ms)).toBeGreaterThanOrEqual(0);
    expect(Number(graphitiTrace.latency_ms)).toBeGreaterThanOrEqual(0);
  });

  it("adds deterministic normalized_topk trace in fusion shadow mode", async () => {
    const localTool = createLocalTool();
    const shadowReporter = {
      record: vi.fn(),
    };

    let mem0Flip = false;
    let graphitiFlip = false;

    const mem0Search = vi.fn(async (): Promise<BridgeSearchHit[]> => {
      mem0Flip = !mem0Flip;
      const first: BridgeSearchHit = {
        path: "bridge/mem0/a-hit",
        startLine: 1,
        endLine: 1,
        score: 0,
        snippet: "mem0 a-hit",
        source: "mem0",
        remoteId: "a-hit",
      };
      const second: BridgeSearchHit = {
        path: "bridge/mem0/shared",
        startLine: 1,
        endLine: 1,
        score: 0,
        snippet: "mem0 shared",
        source: "mem0",
        remoteId: "shared",
      };
      return mem0Flip ? [first, second] : [second, first];
    });

    const graphitiSearch = vi.fn(async (): Promise<BridgeSearchHit[]> => {
      graphitiFlip = !graphitiFlip;
      const first: BridgeSearchHit = {
        path: "bridge/graphiti/shared",
        startLine: 1,
        endLine: 1,
        score: 0,
        snippet: "graphiti shared",
        source: "graphiti",
        remoteId: "SHARED",
      };
      const second: BridgeSearchHit = {
        path: "bridge/graphiti/z-hit",
        startLine: 1,
        endLine: 1,
        score: 0,
        snippet: "graphiti z-hit",
        source: "graphiti",
        remoteId: "z-hit",
      };
      return graphitiFlip ? [first, second] : [second, first];
    });

    const flags = createFlags({
      read_mode: "shadow",
      read: {
        alias_normalization: false,
        fusion: {
          shadow_enabled: true,
        },
      },
    });

    const tool = createBridgeMemorySearchTool({
      flags,
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
      shadowReporter,
      sessionKey: "session-1",
    });

    const first = await tool.execute("1", { query: "when did we migrate providers" });
    const second = await tool.execute("2", { query: "when did we migrate providers" });

    expect(mem0Search).toHaveBeenCalledTimes(2);
    expect(graphitiSearch).toHaveBeenCalledTimes(2);

    const firstDetails = first.details as Record<string, unknown>;
    const secondDetails = second.details as Record<string, unknown>;

    expect(firstDetails.source).toBe("local");
    expect(secondDetails.source).toBe("local");

    const firstResults = firstDetails.results as Array<Record<string, unknown>>;
    const secondResults = secondDetails.results as Array<Record<string, unknown>>;
    expect(firstResults[0]?.path).toBe("MEMORY.md");
    expect(secondResults[0]?.path).toBe("MEMORY.md");

    const firstFusionShadow = firstDetails.fusion_shadow as Record<string, unknown>;
    const secondFusionShadow = secondDetails.fusion_shadow as Record<string, unknown>;

    const firstTopk = firstFusionShadow.normalized_topk as Array<Record<string, unknown>>;
    const secondTopk = secondFusionShadow.normalized_topk as Array<Record<string, unknown>>;

    expect(firstTopk[0]).toEqual(
      expect.objectContaining({
        source: "mem0",
        remote_id: "a-hit",
        path: "bridge/mem0/a-hit",
        score: 0,
      }),
    );
    expect(secondTopk[0]).toEqual(firstTopk[0]);

    expect(firstFusionShadow.tie).toEqual(
      expect.objectContaining({
        all_zero: true,
        all_same_score: true,
      }),
    );
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
    const detailsRecord = result.details as Record<string, unknown>;
    const results = detailsRecord.results as Array<Record<string, unknown>>;

    expect(result.details).toEqual(
      expect.objectContaining({
        results: [
          expect.objectContaining({
            path: "bridge/graphiti/abc",
          }),
        ],
      }),
    );
    expect(results[0]?.source).toBe("graphiti");
    expect(snippetStore.get("graphiti", "abc")).toBe("remote graphiti hit");
  });

  it("maps remote mem0 hits to source-aware citations", async () => {
    const localTool = createLocalTool();
    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "remote",
        cutover_percent: 100,
        routing: {
          default_route: "mem0",
          semantic_route: "mem0",
          timeline_route: "graphiti",
        },
      }),
      localTool,
      snippetStore: createRemoteSnippetStore({ ttlMs: 10_000 }),
      clients: {
        mem0: {
          search: vi.fn(
            async (): Promise<BridgeSearchHit[]> => [
              {
                path: "bridge/mem0/m1",
                startLine: 1,
                endLine: 1,
                score: 0.95,
                snippet: "remote mem0 hit",
                source: "mem0",
                remoteId: "m1",
              },
            ],
          ),
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

    const result = await tool.execute("1", { query: "what config owner is active" });
    const detailsRecord = result.details as Record<string, unknown>;
    const results = detailsRecord.results as Array<Record<string, unknown>>;

    expect(detailsRecord.source).toBe("mem0");
    expect(results[0]?.path).toBe("bridge/mem0/m1");
    expect(results[0]?.source).toBe("mem0");
  });

  it("enables fusion primary rerank and can promote mem0 by weights", async () => {
    const localTool = createLocalTool();
    const mem0Search = vi.fn(
      async (): Promise<BridgeSearchHit[]> => [
        {
          path: "bridge/mem0/fusion-top",
          startLine: 1,
          endLine: 1,
          score: 0.86,
          snippet: "mem0 weighted top1",
          source: "mem0",
          remoteId: "fusion-top",
        },
      ],
    );
    const graphitiSearch = vi.fn(
      async (): Promise<BridgeSearchHit[]> => [
        {
          path: "bridge/graphiti/fusion-top",
          startLine: 1,
          endLine: 1,
          score: 0.92,
          snippet: "graphiti raw score higher",
          source: "graphiti",
          remoteId: "fusion-top",
        },
      ],
    );

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "primary",
        cutover_percent: 100,
        read: {
          alias_normalization: false,
          fusion: {
            enabled: true,
            bucket_policy: "mem0_focus",
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
          search: graphitiSearch,
          getById: vi.fn(async () => null),
        },
      },
      shadowReporter: {
        record: vi.fn(),
      },
      sessionKey: "session-1",
    });

    const result = await tool.execute("1", { query: "what config owner is active" });
    const detailsRecord = result.details as Record<string, unknown>;
    const routeRecord = detailsRecord.route as Record<string, unknown>;
    const results = detailsRecord.results as Array<Record<string, unknown>>;

    expect(mem0Search).toHaveBeenCalledTimes(1);
    expect(graphitiSearch).toHaveBeenCalledTimes(1);
    expect(detailsRecord.source).toBe("mem0");
    expect(routeRecord.selected_route).toBe("mem0");
    expect(results[0]?.path).toBe("bridge/mem0/fusion-top");
    expect(results[0]?.source).toBe("mem0");
  });

  it("enables fusion primary rerank and can promote graphiti by weights", async () => {
    const localTool = createLocalTool();
    const mem0Search = vi.fn(
      async (): Promise<BridgeSearchHit[]> => [
        {
          path: "bridge/mem0/temporal-top",
          startLine: 1,
          endLine: 1,
          score: 0.95,
          snippet: "mem0 raw score",
          source: "mem0",
          remoteId: "temporal-top",
        },
      ],
    );
    const graphitiSearch = vi.fn(
      async (): Promise<BridgeSearchHit[]> => [
        {
          path: "bridge/graphiti/temporal-top",
          startLine: 1,
          endLine: 1,
          score: 0.82,
          snippet: "graphiti weighted top",
          source: "graphiti",
          remoteId: "temporal-top",
        },
      ],
    );

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "remote",
        cutover_percent: 100,
        read: {
          alias_normalization: false,
          fusion: {
            enabled: true,
            bucket_policy: "graphiti_focus",
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
    const routeRecord = detailsRecord.route as Record<string, unknown>;
    const results = detailsRecord.results as Array<Record<string, unknown>>;

    expect(mem0Search).toHaveBeenCalledTimes(1);
    expect(graphitiSearch).toHaveBeenCalledTimes(1);
    expect(detailsRecord.source).toBe("graphiti");
    expect(routeRecord.selected_route).toBe("graphiti");
    expect(results[0]?.path).toBe("bridge/graphiti/temporal-top");
    expect(results[0]?.source).toBe("graphiti");
  });

  it("keeps precision guard forcing local when fusion primary is enabled", async () => {
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
    const mem0Search = vi.fn(async (): Promise<BridgeSearchHit[]> => []);
    const graphitiSearch = vi.fn(async (): Promise<BridgeSearchHit[]> => []);

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "primary",
        cutover_percent: 100,
        read: {
          precision_guard: {
            enabled: true,
          },
          fusion: {
            enabled: true,
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
    const routeRecord = detailsRecord.route as Record<string, unknown>;

    expect(mem0Search).not.toHaveBeenCalled();
    expect(graphitiSearch).not.toHaveBeenCalled();
    expect(detailsRecord.source).toBe("local");
    expect(routeRecord.selected_route).toBe("local");
  });

  it("keeps fusion primary available when one remote source fails", async () => {
    const localTool = createLocalTool();
    const mem0Search = vi.fn(async (): Promise<BridgeSearchHit[]> => {
      throw new Error("mem0 timeout");
    });
    const graphitiSearch = vi.fn(
      async (): Promise<BridgeSearchHit[]> => [
        {
          path: "bridge/graphiti/fusion-fallback",
          startLine: 1,
          endLine: 1,
          score: 0.95,
          snippet: "graphiti fallback hit",
          source: "graphiti",
          remoteId: "fusion-fallback",
        },
      ],
    );

    const tool = createBridgeMemorySearchTool({
      flags: createFlags({
        read_mode: "primary",
        cutover_percent: 100,
        routing: {
          default_route: "mem0",
          fallback_route: "local",
        },
        read: {
          alias_normalization: false,
          fusion: {
            enabled: true,
            bucket_policy: "balanced",
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
          search: graphitiSearch,
          getById: vi.fn(async () => null),
        },
      },
      shadowReporter: {
        record: vi.fn(),
      },
      sessionKey: "session-1",
    });

    const result = await tool.execute("1", { query: "what config owner is active" });
    const detailsRecord = result.details as Record<string, unknown>;
    const routeRecord = detailsRecord.route as Record<string, unknown>;
    const results = detailsRecord.results as Array<Record<string, unknown>>;

    expect(mem0Search).toHaveBeenCalledTimes(1);
    expect(graphitiSearch).toHaveBeenCalledTimes(1);
    expect(detailsRecord.source).toBe("graphiti");
    expect(routeRecord.selected_route).toBe("graphiti");
    expect(results[0]?.path).toBe("bridge/graphiti/fusion-fallback");
    expect(results[0]?.source).toBe("graphiti");
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
        read: {
          alias_normalization: false,
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

  it("keeps ontology readback disabled by default even on decision_reason graphiti route", async () => {
    const localTool = createLocalTool();
    const graphitiSearch = vi.fn(
      async (): Promise<BridgeSearchHit[]> => [
        {
          path: "bridge/graphiti/d1",
          startLine: 1,
          endLine: 1,
          score: 0.95,
          snippet:
            'decision snippet\nOC_ONTOLOGY_V1:{"version":"1","group_id":"session-1","session_key":"session-1","decision":{"type":"Decision","id":"decision:1","name":"decision.rollout","summary":"choose graphiti","source_ref":"agent_end:1","created_at":"2026-02-24T00:00:00.000Z","group_id":"session-1","session_key":"session-1"},"project":null,"reasons":[],"rejected":[],"relations":[]}',
          source: "graphiti",
          remoteId: "d1",
          structure: "facts",
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
          alias_normalization: false,
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
      shadowReporter: { record: vi.fn() },
      sessionKey: "session-1",
    });

    const result = await tool.execute("1", { query: "why did we choose graphiti architecture" });
    const detailsRecord = result.details as Record<string, unknown>;
    const ontologyRecord = detailsRecord.ontology_v1 as Record<string, unknown>;

    expect(graphitiSearch).toHaveBeenCalledTimes(1);
    expect(ontologyRecord.enabled).toBe(false);
    expect(ontologyRecord.active).toBe(false);
    expect(ontologyRecord.degrade_reason).toBe("flag_disabled");
  });

  it("parses ontology marker from graphiti topK snippets when readback is enabled", async () => {
    const localTool = createLocalTool();
    const graphitiSearch = vi.fn(
      async (): Promise<BridgeSearchHit[]> => [
        {
          path: "bridge/graphiti/d1",
          startLine: 1,
          endLine: 1,
          score: 0.95,
          snippet:
            'decision snippet\nOC_ONTOLOGY_V1:{"version":"1","group_id":"session-1","session_key":"session-1","decision":{"type":"Decision","id":"decision:1","name":"decision.rollout","summary":"choose graphiti","source_ref":"agent_end:1","created_at":"2026-02-24T00:00:00.000Z","group_id":"session-1","session_key":"session-1"},"project":{"type":"Project","id":"project:1","name":"memory-bridge","summary":"memory-bridge","source_ref":"agent_end:1","created_at":"2026-02-24T00:00:00.000Z","group_id":"session-1","session_key":"session-1"},"reasons":[{"type":"Reason","id":"reason:1","name":"auditability","summary":"auditability","source_ref":"agent_end:1","created_at":"2026-02-24T00:00:00.000Z","group_id":"session-1","session_key":"session-1"}],"rejected":[{"type":"RejectedOption","id":"rejected:1","name":"skip ontology","summary":"skip ontology","source_ref":"agent_end:1","created_at":"2026-02-24T00:00:00.000Z","group_id":"session-1","session_key":"session-1"}],"relations":[{"type":"Decision->Project","from_id":"decision:1","to_id":"project:1"},{"type":"Decision->Reason","from_id":"decision:1","to_id":"reason:1"},{"type":"Decision->RejectedOption","from_id":"decision:1","to_id":"rejected:1"}]}',
          source: "graphiti",
          remoteId: "d1",
          structure: "facts",
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
          alias_normalization: false,
          graphiti_ontology_readback: {
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
      shadowReporter: { record: vi.fn() },
      sessionKey: "session-1",
    });

    const result = await tool.execute("1", { query: "why did we choose graphiti architecture" });
    const detailsRecord = result.details as Record<string, unknown>;
    const ontologyRecord = detailsRecord.ontology_v1 as Record<string, unknown>;

    expect(graphitiSearch).toHaveBeenCalledTimes(1);
    expect(ontologyRecord.enabled).toBe(true);
    expect(ontologyRecord.active).toBe(true);
    expect(ontologyRecord.degrade_reason).toBeNull();
    expect(ontologyRecord.marker_presence_rate).toBe(1);
    expect(ontologyRecord.parse_success_rate).toBe(1);
    expect(ontologyRecord.parse_success_count).toBe(1);
    expect(ontologyRecord.parse_failure_count).toBe(0);
  });

  it("degrades ontology readback on exact_id bucket to preserve W2 gate-2", async () => {
    const localTool = createLocalTool();
    const graphitiSearch = vi.fn(
      async (): Promise<BridgeSearchHit[]> => [
        {
          path: "bridge/graphiti/d1",
          startLine: 1,
          endLine: 1,
          score: 0.95,
          snippet:
            'decision snippet\nOC_ONTOLOGY_V1:{"version":"1","group_id":"session-1","session_key":"session-1","decision":{"type":"Decision","id":"decision:1","name":"decision.rollout","summary":"choose graphiti","source_ref":"agent_end:1","created_at":"2026-02-24T00:00:00.000Z","group_id":"session-1","session_key":"session-1"},"project":null,"reasons":[],"rejected":[],"relations":[]}',
          source: "graphiti",
          remoteId: "d1",
          structure: "facts",
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
          alias_normalization: false,
          graphiti_ontology_readback: {
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
      shadowReporter: { record: vi.fn() },
      sessionKey: "session-1",
    });

    const result = await tool.execute("1", { query: "commit deadbeef" });
    const detailsRecord = result.details as Record<string, unknown>;
    const ontologyRecord = detailsRecord.ontology_v1 as Record<string, unknown>;

    expect(graphitiSearch).toHaveBeenCalledTimes(1);
    expect(ontologyRecord.enabled).toBe(true);
    expect(ontologyRecord.active).toBe(false);
    expect(ontologyRecord.degrade_reason).toBe("precision_key_bucket");
  });
});
