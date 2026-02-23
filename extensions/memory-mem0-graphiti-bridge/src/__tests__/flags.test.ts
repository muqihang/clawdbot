import { describe, expect, it } from "vitest";
import { resolveBridgeFlags } from "../config/flags.js";

describe("mem0-graphiti bridge flags", () => {
  it("uses safe defaults", () => {
    const flags = resolveBridgeFlags(undefined);

    expect(flags.plugin_load).toBe(true);
    expect(flags.read_mode).toBe("local");
    expect(flags.write_mode).toBe("off");
    expect(flags.cutover_percent).toBe(0);
    expect(flags.request_timeout_ms).toBe(3000);
    expect(flags.routing.default_route).toBe("local");
    expect(flags.routing.timeline_route).toBe("graphiti");
    expect(flags.routing.semantic_route).toBe("mem0");
  });

  it("accepts read/write mode combinations", () => {
    const flags = resolveBridgeFlags({
      read_mode: "shadow",
      write_mode: "propose_only",
      cutover_percent: 35,
      routing: {
        default_route: "local",
        timeline_route: "graphiti",
        semantic_route: "mem0",
      },
    });

    expect(flags.read_mode).toBe("shadow");
    expect(flags.write_mode).toBe("propose_only");
    expect(flags.cutover_percent).toBe(35);
  });

  it("resolves P3 model selection from config/env", () => {
    const previous = process.env.MEMORY_BRIDGE_P3_MODEL;
    process.env.MEMORY_BRIDGE_P3_MODEL = "gpt-5.3-codex";

    try {
      const fromEnv = resolveBridgeFlags(undefined);
      expect(fromEnv.p3.model).toBe("gpt-5.3-codex");

      const fromConfig = resolveBridgeFlags({
        p3: {
          model: "gpt-5.1-codex-mini",
        },
      });
      expect(fromConfig.p3.model).toBe("gpt-5.1-codex-mini");
    } finally {
      if (typeof previous === "string") {
        process.env.MEMORY_BRIDGE_P3_MODEL = previous;
      } else {
        delete process.env.MEMORY_BRIDGE_P3_MODEL;
      }
    }
  });

  it("clamps invalid percent and timeout values", () => {
    const flags = resolveBridgeFlags({
      cutover_percent: 150,
      request_timeout_ms: 10,
      timeoutMs: {
        search: 999999,
        get: 50,
      },
    });

    expect(flags.cutover_percent).toBe(100);
    expect(flags.request_timeout_ms).toBe(100);
    expect(flags.timeoutMs.search).toBe(120000);
    expect(flags.timeoutMs.get).toBe(100);
  });
});
