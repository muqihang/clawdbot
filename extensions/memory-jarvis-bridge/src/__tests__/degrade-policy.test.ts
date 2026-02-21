import { describe, expect, it } from "vitest";
import { applyQuotaDegradePolicy } from "../quota/degrade-policy.js";
import { createQuotaAlertSink } from "../quota/quota-alert.js";

describe("quota degrade policy", () => {
  it("clips top_k and keeps degraded_reason non-empty when top_k exceeds policy", () => {
    const alertSink = createQuotaAlertSink();

    const decision = applyQuotaDegradePolicy(
      {
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        requestedTopK: 80,
        currentQps: 20,
        currentEmbeddingSpendUsd: 0.5,
        policy: {
          qpsLimit: 100,
          topKMax: 40,
          embeddingBudgetUsdDaily: 5,
          hardBlockEnabled: false,
        },
      },
      {
        alertSink,
      },
    );

    expect(decision.effectiveTopK).toBe(40);
    expect(decision.status).toBe("degraded");
    expect(decision.degradedReason?.length).toBeGreaterThan(0);
    expect(alertSink.getAlerts().length).toBe(1);
  });

  it("throttles qps overflow in soft mode and returns non-empty degraded_reason", () => {
    const decision = applyQuotaDegradePolicy({
      tenantId: "tenant-2",
      workspaceId: "workspace-2",
      requestedTopK: 20,
      currentQps: 160,
      currentEmbeddingSpendUsd: 0.8,
      policy: {
        qpsLimit: 100,
        topKMax: 40,
        embeddingBudgetUsdDaily: 5,
        hardBlockEnabled: false,
      },
    });

    expect(decision.status).toBe("throttled");
    expect(decision.allowRequest).toBe(true);
    expect(decision.throttleDelayMs).toBeGreaterThan(0);
    expect(decision.degradedReason?.trim().length).toBeGreaterThan(0);
  });

  it("blocks qps overflow when hard block is enabled", () => {
    const decision = applyQuotaDegradePolicy({
      tenantId: "tenant-3",
      workspaceId: "workspace-3",
      requestedTopK: 20,
      currentQps: 220,
      currentEmbeddingSpendUsd: 0.8,
      policy: {
        qpsLimit: 100,
        topKMax: 40,
        embeddingBudgetUsdDaily: 5,
        hardBlockEnabled: true,
      },
    });

    expect(decision.status).toBe("blocked");
    expect(decision.allowRequest).toBe(false);
    expect(decision.degradedReason).toBe("qps_limit_blocked");
  });

  it("keeps alert latency within 300 seconds and degraded_reason non-empty rate at 100%", () => {
    const frozenNow = new Date("2026-02-18T12:30:00.000Z");
    const alertSink = createQuotaAlertSink({
      now: () => frozenNow,
    });

    const decisions = [
      applyQuotaDegradePolicy(
        {
          tenantId: "tenant-metric",
          workspaceId: "workspace-metric",
          requestedTopK: 80,
          currentQps: 220,
          currentEmbeddingSpendUsd: 12,
          policy: {
            qpsLimit: 100,
            topKMax: 40,
            embeddingBudgetUsdDaily: 3,
            hardBlockEnabled: false,
          },
          observedAt: new Date("2026-02-18T12:26:30.000Z"),
        },
        {
          alertSink,
        },
      ),
      applyQuotaDegradePolicy(
        {
          tenantId: "tenant-metric",
          workspaceId: "workspace-metric",
          requestedTopK: 20,
          currentQps: 180,
          currentEmbeddingSpendUsd: 1,
          policy: {
            qpsLimit: 100,
            topKMax: 40,
            embeddingBudgetUsdDaily: 3,
            hardBlockEnabled: false,
          },
          observedAt: new Date("2026-02-18T12:27:45.000Z"),
        },
        {
          alertSink,
        },
      ),
    ];

    const total = decisions.length;
    const nonEmptyReason = decisions.filter(
      (decision) => (decision.degradedReason ?? "").trim().length > 0,
    ).length;

    const alerts = alertSink.getAlerts();
    const maxLatencySeconds = Math.max(...alerts.map((alert) => alert.alertLatencySeconds));

    expect(total).toBeGreaterThan(0);
    expect(nonEmptyReason).toBe(total);
    expect(maxLatencySeconds).toBeLessThanOrEqual(300);
  });
});
