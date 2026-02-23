import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { createRemoteSnippetStore } from "../bridge/remote-snippet-store.js";
import { createBridgeMemoryGetTool } from "../tools/memory-get-tool.js";

const createLocalGetTool = (): AnyAgentTool => {
  return {
    name: "memory_get",
    label: "Memory Get",
    description: "local memory get",
    parameters: {},
    execute: vi.fn(async (_toolCallId, params) => ({
      content: [],
      details: {
        path: String((params as Record<string, unknown>).path ?? ""),
        text: "local file snippet",
      },
    })),
  };
};

describe("memory get bridge tool", () => {
  it("delegates local path to runtime memory_get", async () => {
    const localTool = createLocalGetTool();

    const tool = createBridgeMemoryGetTool({
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
    });

    const result = await tool.execute("1", { path: "MEMORY.md", from: 1, lines: 5 });
    expect(result.details).toEqual({
      path: "MEMORY.md",
      text: "local file snippet",
    });
    expect(localTool.execute).toHaveBeenCalledTimes(1);
  });

  it("resolves bridge path from snippet store", async () => {
    const localTool = createLocalGetTool();
    const snippetStore = createRemoteSnippetStore({ ttlMs: 10_000 });
    snippetStore.set("mem0", "abc", "stored snippet");

    const tool = createBridgeMemoryGetTool({
      localTool,
      snippetStore,
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
    });

    const result = await tool.execute("1", { path: "bridge/mem0/abc" });

    expect(result.details).toEqual({
      path: "bridge/mem0/abc",
      text: "stored snippet",
    });
    expect(localTool.execute).not.toHaveBeenCalled();
  });

  it("falls back to remote getById when snippet cache misses", async () => {
    const localTool = createLocalGetTool();
    const graphitiGetById = vi.fn(async () => ({ text: "fetched remote snippet" }));
    const tool = createBridgeMemoryGetTool({
      localTool,
      snippetStore: createRemoteSnippetStore({ ttlMs: 10_000 }),
      clients: {
        mem0: {
          search: vi.fn(async () => []),
          getById: vi.fn(async () => null),
        },
        graphiti: {
          search: vi.fn(async () => []),
          getById: graphitiGetById,
        },
      },
    });

    const result = await tool.execute("1", { path: "bridge/graphiti/t-1" });

    expect(result.details).toEqual({
      path: "bridge/graphiti/t-1",
      text: "fetched remote snippet",
    });
    expect(graphitiGetById).toHaveBeenCalledWith("t-1");
    expect(localTool.execute).not.toHaveBeenCalled();
  });
});
