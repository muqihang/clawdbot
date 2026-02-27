import type { QuotaAlertRecord, QuotaAlertSink } from "./quota-alert.js";

export type QuotaPolicySnapshot = {
  qpsLimit: number;
  topKMax: number;
  embeddingBudgetUsdDaily: number;
  hardBlockEnabled: boolean;
};

export type QuotaDegradeInput = {
  tenantId: string;
  workspaceId: string;
  requestedTopK: number;
  currentQps: number;
  currentEmbeddingSpendUsd: number;
  policy: QuotaPolicySnapshot;
  observedAt?: Date;
};

export type QuotaDegradeDecision = {
  status: "within_budget" | "throttled" | "degraded" | "blocked";
  allowRequest: boolean;
  effectiveTopK: number;
  degradedReason: string | null;
  throttleDelayMs: number;
  alert: QuotaAlertRecord | null;
};

function clampTopK(requestedTopK: number, topKMax: number): number {
  const normalizedRequested = Number.isFinite(requestedTopK) ? Math.floor(requestedTopK) : 1;
  const normalizedTopKMax = Number.isFinite(topKMax) ? Math.max(1, Math.floor(topKMax)) : 1;

  if (normalizedRequested < 1) {
    return 1;
  }

  return Math.min(normalizedRequested, normalizedTopKMax);
}

function computeThrottleDelayMs(currentQps: number, qpsLimit: number): number {
  const overflow = Math.max(0, currentQps - qpsLimit);
  if (overflow === 0) {
    return 0;
  }

  return Math.min(5_000, 100 + overflow * 10);
}

export function applyQuotaDegradePolicy(
  input: QuotaDegradeInput,
  options?: {
    alertSink?: QuotaAlertSink;
  },
): QuotaDegradeDecision {
  const reasonCodes: string[] = [];
  const effectiveTopK = clampTopK(input.requestedTopK, input.policy.topKMax);

  let status: QuotaDegradeDecision["status"] = "within_budget";
  let allowRequest = true;
  let throttleDelayMs = 0;

  if (effectiveTopK < input.requestedTopK) {
    reasonCodes.push("top_k_exceeded");
    status = "degraded";
  }

  if (
    input.policy.embeddingBudgetUsdDaily > 0 &&
    input.currentEmbeddingSpendUsd > input.policy.embeddingBudgetUsdDaily
  ) {
    reasonCodes.push("embedding_budget_exceeded");
    if (status === "within_budget") {
      status = "degraded";
    }
  }

  if (input.currentQps > input.policy.qpsLimit) {
    if (input.policy.hardBlockEnabled) {
      reasonCodes.push("qps_limit_blocked");
      status = "blocked";
      allowRequest = false;
      throttleDelayMs = 0;
    } else {
      reasonCodes.push("qps_limit_exceeded");
      allowRequest = true;
      throttleDelayMs = computeThrottleDelayMs(input.currentQps, input.policy.qpsLimit);
      if (status === "within_budget") {
        status = "throttled";
      } else {
        status = "degraded";
      }
    }
  }

  const degradedReason = reasonCodes.length > 0 ? reasonCodes.join("+") : null;

  let alert: QuotaAlertRecord | null = null;
  if (status !== "within_budget" && degradedReason) {
    alert =
      options?.alertSink?.emit({
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        quotaState: status,
        degradedReason,
        observedAt: input.observedAt,
      }) ?? null;
  }

  return {
    status,
    allowRequest,
    effectiveTopK,
    degradedReason,
    throttleDelayMs,
    alert,
  };
}
