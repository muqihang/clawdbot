import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { createRemoteSnippetStore } from "../bridge/remote-snippet-store.js";
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
          search: vi.fn(async () => [
            {
              path: "bridge/graphiti/g1",
              startLine: 1,
              endLine: 1,
              score: 0.8,
              snippet: "remote timeline snippet",
              source: "graphiti",
              remoteId: "g1",
            },
          ]),
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
          search: vi.fn(async () => [
            {
              path: "bridge/graphiti/abc",
              startLine: 1,
              endLine: 1,
              score: 0.95,
              snippet: "remote graphiti hit",
              source: "graphiti",
              remoteId: "abc",
            },
          ]),
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
});
