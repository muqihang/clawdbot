import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ApprovalApiClient } from "./approval-api.js";

export type MemoryCommitWriteMode = "off" | "propose_only" | "propose_commit";

export type MemoryCommitGateAudit = {
  request_id: string;
  trace_id: string;
  approval_id: string;
  decision_id: string;
};

export type MemoryCommitGateResult =
  | {
      ok: true;
      data: {
        status: "review_required" | "committed";
        auto_commit: boolean;
        reason_code: string;
        audit: MemoryCommitGateAudit;
      };
    }
  | {
      ok: false;
      error: {
        code: "VALIDATION_ERROR";
        message: string;
      };
    };

const CommitEnvelopeSchema = z.object({
  request_id: z.string().min(1).optional(),
  trace_id: z.string().min(1).optional(),
  tenant_id: z.string().min(1),
  workspace_id: z.string().min(1),
});

const CommitPayloadSchema = z.object({
  proposal_id: z.string().min(1),
  expected_record_version: z.coerce.number().int().min(1),
  policy_decision_ref: z.string().uuid(),
  approval_id: z.string().uuid().optional(),
  actor_id: z.string().min(1).optional(),
});

const CommitRequestSchema = z.object({
  envelope: CommitEnvelopeSchema,
  payload: CommitPayloadSchema,
});

type CommitRequest = z.infer<typeof CommitRequestSchema>;

export function mapBridgeWriteMode(rawWriteMode: string | undefined): MemoryCommitWriteMode {
  if (rawWriteMode === "propose_only") {
    return "propose_only";
  }
  if (rawWriteMode === "propose_commit" || rawWriteMode === "remote") {
    return "propose_commit";
  }
  return "off";
}

const createAudit = (request: CommitRequest): MemoryCommitGateAudit => ({
  request_id: request.envelope.request_id ?? randomUUID(),
  trace_id: request.envelope.trace_id ?? randomUUID(),
  approval_id: request.payload.approval_id ?? "00000000-0000-0000-0000-000000000000",
  decision_id: request.payload.policy_decision_ref,
});

export function createMemoryCommitGate(params: {
  approvalApi: ApprovalApiClient;
  writeMode?: MemoryCommitWriteMode;
}): {
  handleCommitRequest(input: {
    proposalId: string;
    body: unknown;
  }): Promise<MemoryCommitGateResult>;
} {
  const writeMode = params.writeMode ?? "off";

  const reviewRequired = (request: CommitRequest, reasonCode: string): MemoryCommitGateResult => ({
    ok: true,
    data: {
      status: "review_required",
      auto_commit: false,
      reason_code: reasonCode,
      audit: createAudit(request),
    },
  });

  return {
    async handleCommitRequest(input: {
      proposalId: string;
      body: unknown;
    }): Promise<MemoryCommitGateResult> {
      const parsed = CommitRequestSchema.safeParse(input.body);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.message,
          },
        };
      }

      if (input.proposalId !== parsed.data.payload.proposal_id) {
        return {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "proposal_id must match proposalId path param",
          },
        };
      }

      if (writeMode === "off" || writeMode === "propose_only") {
        return reviewRequired(parsed.data, "POLICY_REVIEW_REQUIRED");
      }

      if (!parsed.data.payload.approval_id) {
        return {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "approval_id is required when write_mode=propose_commit",
          },
        };
      }

      const ticketResult = await params.approvalApi.getApprovalTicket({
        approvalId: parsed.data.payload.approval_id,
        tenantId: parsed.data.envelope.tenant_id,
        workspaceId: parsed.data.envelope.workspace_id,
      });

      if (!ticketResult.ok) {
        return reviewRequired(parsed.data, ticketResult.error.code);
      }

      if (ticketResult.data.status !== "approved") {
        return reviewRequired(parsed.data, "POLICY_REVIEW_REQUIRED");
      }

      const audit = createAudit(parsed.data);
      audit.decision_id = ticketResult.data.latest_decision_id ?? audit.decision_id;

      return {
        ok: true,
        data: {
          status: "committed",
          auto_commit: true,
          reason_code: "OK",
          audit,
        },
      };
    },
  };
}
