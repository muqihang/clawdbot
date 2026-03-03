import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  GatewayIntents,
  GatewayPlugin,
  HttpsProxyAgent,
  connectSpy,
  getLastAgent,
  proxyAgentSpy,
  registerClientSpy,
  resetLastAgent,
  resetGatewayPluginSpies,
  webSocketSpy,
} = vi.hoisted(() => {
  const connectSpy = vi.fn();
  const proxyAgentSpy = vi.fn();
  const registerClientSpy = vi.fn(async () => undefined);
  const webSocketSpy = vi.fn();

  const GatewayIntents = {
    Guilds: 1 << 0,
    GuildMessages: 1 << 1,
    MessageContent: 1 << 2,
    DirectMessages: 1 << 3,
    GuildMessageReactions: 1 << 4,
    DirectMessageReactions: 1 << 5,
    GuildPresences: 1 << 6,
    GuildMembers: 1 << 7,
  } as const;

  class GatewayPlugin {
    async registerClient(client: unknown) {
      return await registerClientSpy(client);
    }
    connect(resume = false) {
      connectSpy(resume);
    }
  }

  class HttpsProxyAgent {
    static lastCreated: HttpsProxyAgent | undefined;
    proxyUrl: string;
    constructor(proxyUrl: string) {
      if (proxyUrl === "bad-proxy") {
        throw new Error("bad proxy");
      }
      this.proxyUrl = proxyUrl;
      HttpsProxyAgent.lastCreated = this;
      proxyAgentSpy(proxyUrl);
    }
  }

  return {
    GatewayIntents,
    GatewayPlugin,
    HttpsProxyAgent,
    connectSpy,
    getLastAgent: () => HttpsProxyAgent.lastCreated,
    proxyAgentSpy,
    registerClientSpy,
    resetLastAgent: () => {
      HttpsProxyAgent.lastCreated = undefined;
    },
    resetGatewayPluginSpies: () => {
      connectSpy.mockClear();
      registerClientSpy.mockReset();
      registerClientSpy.mockResolvedValue(undefined);
    },
    webSocketSpy,
  };
});

// Unit test: don't import Carbon just to check the prototype chain.
vi.mock("@buape/carbon/gateway", () => ({
  GatewayIntents,
  GatewayPlugin,
}));

vi.mock("https-proxy-agent", () => ({
  HttpsProxyAgent,
}));

vi.mock("ws", () => ({
  default: class MockWebSocket {
    constructor(url: string, options?: { agent?: unknown }) {
      webSocketSpy(url, options);
    }
  },
}));

describe("createDiscordGatewayPlugin", () => {
  let createDiscordGatewayPlugin: typeof import("./gateway-plugin.js").createDiscordGatewayPlugin;

  beforeAll(async () => {
    ({ createDiscordGatewayPlugin } = await import("./gateway-plugin.js"));
  });

  function createRuntime() {
    return {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn(() => {
        throw new Error("exit");
      }),
    };
  }

  beforeEach(() => {
    resetGatewayPluginSpies();
    proxyAgentSpy.mockClear();
    webSocketSpy.mockClear();
    resetLastAgent();
  });

  it("uses proxy agent for gateway WebSocket when configured", async () => {
    const runtime = createRuntime();

    const plugin = createDiscordGatewayPlugin({
      discordConfig: { proxy: "http://proxy.test:8080" },
      runtime,
    });

    expect(Object.getPrototypeOf(plugin)).not.toBe(GatewayPlugin.prototype);

    const createWebSocket = (plugin as unknown as { createWebSocket: (url: string) => unknown })
      .createWebSocket;
    createWebSocket("wss://gateway.discord.gg");

    expect(proxyAgentSpy).toHaveBeenCalledWith("http://proxy.test:8080");
    expect(webSocketSpy).toHaveBeenCalledWith(
      "wss://gateway.discord.gg",
      expect.objectContaining({ agent: getLastAgent() }),
    );
    expect(runtime.log).toHaveBeenCalledWith("discord: gateway proxy enabled");
    expect(runtime.error).not.toHaveBeenCalled();
  });

  it("falls back to the default gateway plugin when proxy is invalid", async () => {
    const runtime = createRuntime();

    const plugin = createDiscordGatewayPlugin({
      discordConfig: { proxy: "bad-proxy" },
      runtime,
    });

    expect(Object.getPrototypeOf(plugin)).toBe(GatewayPlugin.prototype);
    expect(runtime.error).toHaveBeenCalled();
    expect(runtime.log).not.toHaveBeenCalled();
  });

  it("guards gateway registerClient failures to avoid unhandled rejections", async () => {
    const runtime = createRuntime();
    registerClientSpy.mockRejectedValueOnce(
      new Error("Failed to get gateway information from Discord: fetch failed"),
    );

    const plugin = createDiscordGatewayPlugin({
      discordConfig: { proxy: "http://proxy.test:8080" },
      runtime,
    });

    await expect(plugin.registerClient({} as never)).resolves.toBeUndefined();
    expect(runtime.error).toHaveBeenCalledWith(
      expect.stringContaining("discord: failed to initialize gateway client"),
    );
    expect(connectSpy).toHaveBeenCalledWith(false);
  });
});
