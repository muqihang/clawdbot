import { describe, expect, it } from "vitest";
import { resolveReadPlan } from "../router/read-router.js";

describe("mem0-graphiti read router (Phase0 local baseline)", () => {
  it("returns local route in local mode", () => {
    const plan = resolveReadPlan({
      readMode: "local",
      cutoverPercent: 100,
      query: "what preferences did we store",
    });

    expect(plan.userRoute).toBe("local");
    expect(plan.candidateRoute).toBe("local");
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
    expect(plan.shadowCompare).toBe(true);
    expect(plan.reason).toBe("phase0_local_only_guard");
  });

  it("keeps user route local in primary canary mode", () => {
    const plan = resolveReadPlan({
      readMode: "primary",
      cutoverPercent: 100,
      query: "timeline migration",
      routeSeed: "always-remote-if-not-guarded",
    });

    expect(plan.userRoute).toBe("local");
    expect(plan.candidateRoute).toBe("graphiti");
    expect(plan.shadowCompare).toBe(false);
    expect(plan.phase0LocalOnly).toBe(true);
  });

  it("keeps user route local even when read mode is remote", () => {
    const plan = resolveReadPlan({
      readMode: "remote",
      cutoverPercent: 100,
      query: "search memory profile",
    });

    expect(plan.userRoute).toBe("local");
    expect(plan.candidateRoute).toBe("mem0");
    expect(plan.phase0LocalOnly).toBe(true);
  });
});
