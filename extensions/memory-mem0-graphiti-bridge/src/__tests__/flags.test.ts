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
    expect(flags.routing.fallback_route).toBe("local");
    expect(flags.read.alias_normalization).toBe(true);
    expect(flags.read.precision_guard.enabled).toBe(false);
    expect(flags.read.mem0_filters_criteria_shadow.enabled).toBe(false);
    expect(flags.read.mem0_filters_criteria_shadow.sample_percent).toBe(0);
    expect(flags.read.graphiti_recipe_routing.enabled).toBe(false);
    expect(flags.read.graphiti_recipe_routing.sample_percent).toBe(0);
    expect(flags.read.graphiti_focal_node.enabled).toBe(false);
    expect(flags.read.graphiti_focal_node.sample_percent).toBe(0);
    expect(flags.p3.graphiti_write_path).toBe("/messages");
    expect(flags.p3.admission_enabled).toBe(false);
    expect(flags.p3.commit_canary_ratio).toBe(0);
    expect(flags.p3.commit_require_index_check).toBe(true);
    expect(flags.p3.commit_require_non_sensitive).toBe(true);
    expect(flags.p3.commit_require_dual_write_ok).toBe(true);
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
        fallback_route: "graphiti",
      },
    });

    expect(flags.read_mode).toBe("shadow");
    expect(flags.write_mode).toBe("propose_only");
    expect(flags.cutover_percent).toBe(35);
    expect(flags.routing.fallback_route).toBe("graphiti");
  });

  it("normalizes legacy graphiti write path /items to /messages", () => {
    const snakeCase = resolveBridgeFlags({
      p3: {
        graphiti_write_path: "/items",
      },
    });
    const camelCase = resolveBridgeFlags({
      p3: {
        graphitiWritePath: "items/",
      },
    });

    expect(snakeCase.p3.graphiti_write_path).toBe("/messages");
    expect(camelCase.p3.graphiti_write_path).toBe("/messages");
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

  it("parses P3 admission and canary flags", () => {
    const flags = resolveBridgeFlags({
      p3: {
        admission_enabled: true,
        commit_canary_ratio: 1.5,
        commit_require_index_check: false,
        commit_require_non_sensitive: false,
        commit_require_dual_write_ok: false,
      },
      read: {
        alias_normalization: false,
      },
    });

    expect(flags.p3.admission_enabled).toBe(true);
    expect(flags.p3.commit_canary_ratio).toBe(1);
    expect(flags.p3.commit_require_index_check).toBe(false);
    expect(flags.p3.commit_require_non_sensitive).toBe(false);
    expect(flags.p3.commit_require_dual_write_ok).toBe(false);
    expect(flags.read.alias_normalization).toBe(false);
  });

  it("parses graphiti recipe routing shadow flags", () => {
    const flags = resolveBridgeFlags({
      read: {
        graphiti_recipe_routing: {
          enabled: true,
          sample_percent: 150,
        },
      },
    });

    expect(flags.read.graphiti_recipe_routing.enabled).toBe(true);
    expect(flags.read.graphiti_recipe_routing.sample_percent).toBe(100);
  });

  it("parses graphiti focal-node flags", () => {
    const flags = resolveBridgeFlags({
      read: {
        graphiti_focal_node: {
          enabled: true,
          sample_percent: 124,
        },
      },
    });

    expect(flags.read.graphiti_focal_node.enabled).toBe(true);
    expect(flags.read.graphiti_focal_node.sample_percent).toBe(100);
  });
});
