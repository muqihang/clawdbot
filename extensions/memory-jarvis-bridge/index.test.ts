import { describe, expect, it } from "vitest";

describe("memory-jarvis-bridge", () => {
  it("loads plugin metadata", async () => {
    const { default: plugin } = await import("./index.js");

    expect(plugin.id).toBe("memory-jarvis-bridge");
    expect(plugin.kind).toBe("memory");
    expect(plugin.configSchema).toBeDefined();
    // oxlint-disable-next-line typescript/unbound-method
    expect(plugin.register).toBeInstanceOf(Function);
  });

  it("uses compatibility-first defaults", async () => {
    const { resolveJarvisBridgeFlags } = await import("./src/config/flags.js");

    const flags = resolveJarvisBridgeFlags(undefined);
    expect(flags.plugin_load).toBe(true);
    expect(flags.default_route).toBe("local");
    expect(flags.read_mode).toBe("local");
    expect(flags.write_mode).toBe("off");
  });

  it("keeps remote write path disabled by default", async () => {
    const { createJarvisClient } = await import("./src/client/jarvis-client.js");
    const { resolveJarvisBridgeFlags } = await import("./src/config/flags.js");

    const client = createJarvisClient(resolveJarvisBridgeFlags(undefined));
    expect(client.canReadRemote()).toBe(false);
    expect(client.canWriteRemote()).toBe(false);
  });
});
