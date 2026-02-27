import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
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

  it("logs non-local user route when primary mode cutover is 100%", async () => {
    const { default: plugin } = await import("./index.js");

    const registerTool = vi.fn();
    const registerCli = vi.fn();
    const registerService = vi.fn();
    const registerTypedHook = vi.fn();
    const createMemorySearchTool = vi.fn(() => ({
      name: "memory_search",
      label: "Memory Search",
      description: "local memory search",
      parameters: {},
      execute: vi.fn(async () => ({ content: [], details: {} })),
    }));
    const createMemoryGetTool = vi.fn(() => ({
      name: "memory_get",
      label: "Memory Get",
      description: "local memory get",
      parameters: {},
      execute: vi.fn(async () => ({ content: [], details: {} })),
    }));
    const registerMemoryCli = vi.fn();

    const loggerInfo = vi.fn();
    const api = {
      pluginConfig: {
        read_mode: "primary",
        cutover_percent: 100,
      },
      runtime: {
        tools: {
          createMemorySearchTool,
          createMemoryGetTool,
          registerMemoryCli,
        },
      },
      logger: {
        info: loggerInfo,
        warn: vi.fn(),
        error: vi.fn(),
      },
      resolvePath: (input: string) => input,
      on: registerTypedHook,
      registerTool,
      registerCli,
      registerService,
    } as unknown as OpenClawPluginApi;

    plugin.register(api);

    const readinessLog = loggerInfo.mock.calls
      .map(([message]) => String(message))
      .find((message) =>
        message.includes("memory-mem0-graphiti-bridge: Phase1 local-first active"),
      );

    expect(readinessLog).toBeDefined();
    expect(readinessLog).toContain("read_mode=primary");
    expect(readinessLog).toContain("candidate=mem0");
    expect(readinessLog).toContain("user_route=mem0");
    expect(readinessLog).not.toContain("user_route=local");
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
    const registerService = vi.fn();
    const registerTypedHook = vi.fn();
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
      resolvePath: (input: string) => input,
      on: registerTypedHook,
      registerTool,
      registerCli,
      registerService,
    } as unknown as OpenClawPluginApi;

    plugin.register(api);

    expect(registerTool).toHaveBeenCalledTimes(1);
    expect(registerCli).toHaveBeenCalledTimes(3);
    expect(registerTypedHook).toHaveBeenCalledTimes(1);
    expect(registerTypedHook).toHaveBeenCalledWith("agent_end", expect.any(Function));
    expect(registerService).not.toHaveBeenCalled();

    const [factory, options] = registerTool.mock.calls[0] as [
      (ctx: { config?: unknown; sessionKey?: string }) => AnyAgentTool[],
      { names: string[] },
    ];

    expect(options.names).toEqual(["memory_search", "memory_get"]);

    const registeredTools = factory({ config: {}, sessionKey: "session-1" });
    expect(registeredTools).toHaveLength(2);
    expect(registeredTools[0]).not.toBe(searchTool);
    expect(registeredTools[1]).not.toBe(getTool);

    const bridgedSearchTool = registeredTools[0];
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

    const bridgedGetTool = registeredTools[1];
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

    const [_p2CliFactory, p2CliOptions] = registerCli.mock.calls[1] as [
      (ctx: { program: unknown }) => void,
      { commands: string[] },
    ];
    expect(p2CliOptions.commands).toEqual(["memory-bridge-p2"]);

    const [_p3CliFactory, p3CliOptions] = registerCli.mock.calls[2] as [
      (ctx: { program: unknown }) => void,
      { commands: string[] },
    ];
    expect(p3CliOptions.commands).toEqual(["memory-bridge-p3"]);
  });

  it("caches index consistency checks for online capture", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-24T06:00:00.000Z"));
    vi.resetModules();

    try {
      const runIndexConsistencyCheck = vi.fn(async () => ({
        ok: true,
        failures: [],
        metrics: {
          indexReferenceCount: 0,
          missingReferenceCount: 0,
          missingMetadataCount: 0,
          topicRuleViolationCount: 0,
        },
      }));

      const createOnlineIncrementalCapture = vi.fn(
        (_params: {
          indexCheckProvider?: (input: {
            sessionKey: string;
            sourceRef: string;
          }) => Promise<boolean>;
        }) => ({
          onAgentEnd: vi.fn(async () => undefined),
        }),
      );

      vi.doMock("./src/p3/index-check.js", () => ({
        runIndexConsistencyCheck,
      }));
      vi.doMock("./src/p3/online-capture.js", () => ({
        createOnlineIncrementalCapture,
      }));
      vi.doMock("./src/p3/outbox-store.js", () => ({
        createP3OutboxStore: vi.fn(() => ({
          enqueue: vi.fn(),
          close: vi.fn(),
        })),
      }));

      const { default: plugin } = await import("./index.js");
      const api = {
        pluginConfig: {
          write_mode: "propose_only",
        },
        runtime: {
          tools: {
            createMemorySearchTool: vi.fn(() => null),
            createMemoryGetTool: vi.fn(() => null),
            registerMemoryCli: vi.fn(),
          },
        },
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
        resolvePath: (input: string) =>
          input === "MEMORY.md" ? "/tmp/test-workspace/MEMORY.md" : input,
        on: vi.fn(),
        registerTool: vi.fn(),
        registerCli: vi.fn(),
        registerService: vi.fn(),
      } as unknown as OpenClawPluginApi;

      plugin.register(api);

      expect(createOnlineIncrementalCapture).toHaveBeenCalledTimes(1);
      const captureParams = createOnlineIncrementalCapture.mock.calls[0]?.[0];
      expect(captureParams).toBeDefined();
      const indexCheckProvider = captureParams?.indexCheckProvider;
      if (!indexCheckProvider) {
        throw new Error("expected indexCheckProvider");
      }

      await expect(
        indexCheckProvider({
          sessionKey: "session-1",
          sourceRef: "agent_end:session-1",
        }),
      ).resolves.toBe(true);

      vi.setSystemTime(new Date("2026-02-24T06:00:30.000Z"));
      await expect(
        indexCheckProvider({
          sessionKey: "session-2",
          sourceRef: "agent_end:session-2",
        }),
      ).resolves.toBe(true);

      expect(runIndexConsistencyCheck).toHaveBeenCalledTimes(1);

      vi.setSystemTime(new Date("2026-02-24T06:01:01.000Z"));
      await expect(
        indexCheckProvider({
          sessionKey: "session-3",
          sourceRef: "agent_end:session-3",
        }),
      ).resolves.toBe(true);

      expect(runIndexConsistencyCheck).toHaveBeenCalledTimes(2);
    } finally {
      vi.doUnmock("./src/p3/index-check.js");
      vi.doUnmock("./src/p3/online-capture.js");
      vi.doUnmock("./src/p3/outbox-store.js");
      vi.useRealTimers();
      vi.resetModules();
    }
  });
});
