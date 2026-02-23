import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { describe, expect, it, vi } from "vitest";

describe("memory-mem0-graphiti-bridge", () => {
  it("loads plugin metadata", async () => {
    const { default: plugin } = await import("./index.js");

    expect(plugin.id).toBe("memory-mem0-graphiti-bridge");
    expect(plugin.kind).toBe("memory");
    expect(plugin.configSchema).toBeDefined();
    // oxlint-disable-next-line typescript/unbound-method
    expect(plugin.register).toBeInstanceOf(Function);
  });

  it("keeps compatibility-first defaults", async () => {
    const { resolveBridgeFlags } = await import("./src/config/flags.js");
    const flags = resolveBridgeFlags(undefined);

    expect(flags.plugin_load).toBe(true);
    expect(flags.read_mode).toBe("local");
    expect(flags.write_mode).toBe("off");
    expect(flags.cutover_percent).toBe(0);
  });

  it("registers memory tools and cli in local baseline", async () => {
    const { default: plugin } = await import("./index.js");

    const searchTool = {
      name: "memory_search",
      label: "Memory Search",
      description: "local memory search",
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
        },
      })),
    };
    const getTool = {
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
    const registerTool = vi.fn();
    const registerCli = vi.fn();
    const createMemorySearchTool = vi.fn(() => searchTool);
    const createMemoryGetTool = vi.fn(() => getTool);
    const registerMemoryCli = vi.fn();

    const api = {
      pluginConfig: {
        read_mode: "remote",
        write_mode: "propose_only",
      },
      runtime: {
        tools: {
          createMemorySearchTool,
          createMemoryGetTool,
          registerMemoryCli,
        },
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      registerTool,
      registerCli,
    } as unknown as OpenClawPluginApi;

    plugin.register(api);

    expect(registerTool).toHaveBeenCalledTimes(1);
    expect(registerCli).toHaveBeenCalledTimes(1);

    const [factory, options] = registerTool.mock.calls[0] as [
      (ctx: { config?: unknown; sessionKey?: string }) => unknown,
      { names: string[] },
    ];

    expect(options.names).toEqual(["memory_search", "memory_get"]);

    const registeredTools = factory({ config: {}, sessionKey: "session-1" });
    expect(registeredTools).toHaveLength(2);
    expect(registeredTools?.[0]).not.toBe(searchTool);
    expect(registeredTools?.[1]).not.toBe(getTool);

    const bridgedSearchTool = registeredTools?.[0];
    if (!bridgedSearchTool?.execute) {
      throw new Error("expected bridged memory_search tool with execute");
    }
    const bridgedResult = await bridgedSearchTool.execute("1", { query: "my preference" });
    expect(bridgedResult.details).toEqual(
      expect.objectContaining({
        results: [
          expect.objectContaining({
            source: "memory",
          }),
        ],
      }),
    );

    const bridgedGetTool = registeredTools?.[1];
    if (!bridgedGetTool?.execute) {
      throw new Error("expected bridged memory_get tool with execute");
    }
    const bridgedGetResult = await bridgedGetTool.execute("2", { path: "MEMORY.md", lines: 5 });
    expect(bridgedGetResult.details).toEqual({
      path: "MEMORY.md",
      text: "local file snippet",
    });

    expect(createMemorySearchTool).toHaveBeenCalledTimes(1);
    expect(createMemoryGetTool).toHaveBeenCalledTimes(1);

    const [cliFactory, cliOptions] = registerCli.mock.calls[0] as [
      (ctx: { program: unknown }) => void,
      { commands: string[] },
    ];
    expect(cliOptions.commands).toEqual(["memory"]);

    const program = {};
    cliFactory({ program });
    expect(registerMemoryCli).toHaveBeenCalledWith(program);
  });
});
