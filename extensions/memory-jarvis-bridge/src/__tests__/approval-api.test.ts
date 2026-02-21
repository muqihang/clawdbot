import { describe, expect, it, vi } from "vitest";
import { createApprovalApiClient } from "../approval-api.js";

const createJsonResponse = (payload: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }) as Response;

describe("approval-api client", () => {
  it("fetches approval ticket and preserves trace fields", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        meta: {
          request_id: "req-ticket",
          trace_id: "trace-ticket",
          status: "ok",
          timestamp: "2026-02-18T00:00:00.000Z",
        },
        data: {
          approval_id: "8b70b183-6b73-4e07-a7a6-f5ceba897b5f",
          status: "approved",
          latest_decision_id: "0cb45f39-c4de-46ce-bff6-6e20f4d27d1b",
        },
      }),
    );

    const client = createApprovalApiClient({
      baseUrl: "https://jarvis.test",
      fetchImpl: fetchMock,
    });

    const result = await client.getApprovalTicket({
      approvalId: "8b70b183-6b73-4e07-a7a6-f5ceba897b5f",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected success result");
    }

    expect(result.data.approval_id).toBe("8b70b183-6b73-4e07-a7a6-f5ceba897b5f");
    expect(result.meta.request_id).toBe("req-ticket");
    expect(result.meta.trace_id).toBe("trace-ticket");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://jarvis.test/v0/approval-tickets/8b70b183-6b73-4e07-a7a6-f5ceba897b5f?tenant_id=tenant-1&workspace_id=workspace-1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("returns decision_id on approval action", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        meta: {
          request_id: "req-action",
          trace_id: "trace-action",
          status: "ok",
          timestamp: "2026-02-18T00:00:00.000Z",
        },
        data: {
          approval_id: "8b70b183-6b73-4e07-a7a6-f5ceba897b5f",
          decision_id: "df5854f0-6564-471f-95b4-f4f58d6f22e4",
          status: "approved",
          resolved_at: "2026-02-18T00:00:00.000Z",
        },
      }),
    );

    const client = createApprovalApiClient({
      baseUrl: "https://jarvis.test",
      fetchImpl: fetchMock,
    });

    const result = await client.resolveApprovalTicket({
      approvalId: "8b70b183-6b73-4e07-a7a6-f5ceba897b5f",
      action: "approve",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      actorId: "reviewer-1",
      actionIdempotencyKey: "idem-1",
      requestId: "req-action",
      traceId: "trace-action",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected success result");
    }
    expect(result.data.decision_id).toBe("df5854f0-6564-471f-95b4-f4f58d6f22e4");
  });

  it("maps network failure to DEG_JARVIS_UNREACHABLE", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("connect ECONNREFUSED"));

    const client = createApprovalApiClient({
      baseUrl: "https://jarvis.unreachable",
      fetchImpl: fetchMock,
    });

    const result = await client.getApprovalTicket({
      approvalId: "8b70b183-6b73-4e07-a7a6-f5ceba897b5f",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected failed result");
    }

    expect(result.error.code).toBe("DEG_JARVIS_UNREACHABLE");
  });
});
