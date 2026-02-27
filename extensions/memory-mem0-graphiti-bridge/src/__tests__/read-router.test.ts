import { describe, expect, it } from "vitest";
import { resolveReadPlan } from "../router/read-router.js";

describe("mem0-graphiti read router", () => {
  it("returns local route in local mode", () => {
    const plan = resolveReadPlan({
      readMode: "local",
      cutoverPercent: 100,
      query: "what preferences did we store",
    });

    expect(plan.userRoute).toBe("local");
    expect(plan.candidateRoute).toBe("local");
    expect(plan.fallbackRoute).toBe("local");
    expect(plan.shadowCompare).toBe(false);
    expect(plan.phase0LocalOnly).toBe(true);
  });

  it("keeps user route local in shadow mode and marks compare", () => {
    const plan = resolveReadPlan({
      readMode: "shadow",
      cutoverPercent: 30,
      query: "when did we switch providers",
    });

    expect(plan.userRoute).toBe("local");
    expect(plan.candidateRoute).toBe("graphiti");
    expect(plan.fallbackRoute).toBe("local");
    expect(plan.shadowCompare).toBe(true);
    expect(plan.phase0LocalOnly).toBe(true);
  });

  it("routes primary mode with 100% cutover to remote route by intent", () => {
    const timelinePlan = resolveReadPlan({
      readMode: "primary",
      cutoverPercent: 100,
      query: "timeline migration",
      routeSeed: "always-remote-if-not-guarded",
    });

    const semanticPlan = resolveReadPlan({
      readMode: "primary",
      cutoverPercent: 100,
      query: "search memory profile",
      routeSeed: "always-remote-if-not-guarded",
    });

    expect(timelinePlan.userRoute).toBe("graphiti");
    expect(timelinePlan.candidateRoute).toBe("graphiti");
    expect(timelinePlan.fallbackRoute).toBe("local");
    expect(timelinePlan.shadowCompare).toBe(false);
    expect(timelinePlan.phase0LocalOnly).toBe(false);

    expect(semanticPlan.userRoute).toBe("mem0");
    expect(semanticPlan.candidateRoute).toBe("mem0");
    expect(semanticPlan.fallbackRoute).toBe("local");
    expect(semanticPlan.shadowCompare).toBe(false);
    expect(semanticPlan.phase0LocalOnly).toBe(false);
  });

  it("keeps primary mode on local route with 0% cutover", () => {
    const plan = resolveReadPlan({
      readMode: "primary",
      cutoverPercent: 0,
      query: "timeline migration",
    });

    expect(plan.userRoute).toBe("local");
    expect(plan.candidateRoute).toBe("local");
    expect(plan.fallbackRoute).toBe("local");
    expect(plan.phase0LocalOnly).toBe(true);
  });

  it("keeps configured fallback route for runtime fallback decisions", () => {
    const plan = resolveReadPlan({
      readMode: "primary",
      cutoverPercent: 100,
      query: "find semantic memory",
      fallbackRoute: "graphiti",
    });

    expect(plan.userRoute).toBe("mem0");
    expect(plan.candidateRoute).toBe("mem0");
    expect(plan.fallbackRoute).toBe("graphiti");
  });
});
