import { randomUUID } from "node:crypto";

export type QuotaAlertSeverity = "warning" | "critical";

export type QuotaAlertEvent = {
  tenantId: string;
  workspaceId: string;
  quotaState: "throttled" | "degraded" | "blocked";
  degradedReason: string;
  observedAt?: Date;
};

export type QuotaAlertRecord = {
  alertId: string;
  tenantId: string;
  workspaceId: string;
  quotaState: "throttled" | "degraded" | "blocked";
  severity: QuotaAlertSeverity;
  degradedReason: string;
  observedAt: string;
  emittedAt: string;
  alertLatencySeconds: number;
};

export type QuotaAlertSink = {
  emit(event: QuotaAlertEvent): QuotaAlertRecord;
  getAlerts(): QuotaAlertRecord[];
};

export function createQuotaAlertSink(params?: {
  now?: () => Date;
  onAlert?: (alert: QuotaAlertRecord) => void;
}): QuotaAlertSink {
  const now = params?.now ?? (() => new Date());
  const alerts: QuotaAlertRecord[] = [];

  return {
    emit(event: QuotaAlertEvent): QuotaAlertRecord {
      const emittedAt = now();
      const observedAt = event.observedAt ?? emittedAt;
      const latencyMs = Math.max(0, emittedAt.getTime() - observedAt.getTime());
      const alert: QuotaAlertRecord = {
        alertId: randomUUID(),
        tenantId: event.tenantId,
        workspaceId: event.workspaceId,
        quotaState: event.quotaState,
        severity: event.quotaState === "blocked" ? "critical" : "warning",
        degradedReason: event.degradedReason,
        observedAt: observedAt.toISOString(),
        emittedAt: emittedAt.toISOString(),
        alertLatencySeconds: Math.floor(latencyMs / 1000),
      };

      alerts.push(alert);
      params?.onAlert?.(alert);
      return alert;
    },

    getAlerts(): QuotaAlertRecord[] {
      return alerts.map((alert) => ({ ...alert }));
    },
  };
}
