import { describe, expect, it, vi } from 'vitest';
import type { ApprovalApiClient } from '../approval-api.js';
import { createMemoryCommitGate } from '../memory-commit-gate.js';

const baseRequest = {
  envelope: {
    request_id: 'req-1',
    trace_id: 'trace-1',
    tenant_id: 'tenant-1',
    workspace_id: 'workspace-1',
  },
  payload: {
    proposal_id: 'proposal-1',
    expected_record_version: 1,
    policy_decision_ref: 'ac4cbf76-5548-47d7-a6ea-bf55d9d0b667',
    approval_id: 'd4137d47-b2f5-4038-9925-b6df9973f7de',
    actor_id: 'reviewer-1',
  },
};

const createApprovalApiMock = (): ApprovalApiClient => ({
  listApprovalTickets: vi.fn(),
  getApprovalTicket: vi.fn(),
  resolveApprovalTicket: vi.fn(),
});

describe('memory-commit-gate', () => {
  it('returns VALIDATION_ERROR when proposalId mismatches payload.proposal_id', async () => {
    const gate = createMemoryCommitGate({
      approvalApi: createApprovalApiMock(),
      writeMode: 'propose_commit',
    });

    const result = await gate.handleCommitRequest({
      proposalId: 'proposal-path',
      body: {
        ...baseRequest,
        payload: {
          ...baseRequest.payload,
          proposal_id: 'proposal-body',
        },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected validation error');
    }

    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('keeps default write_mode=off in review_required state', async () => {
    const gate = createMemoryCommitGate({
      approvalApi: createApprovalApiMock(),
      writeMode: 'off',
    });

    const result = await gate.handleCommitRequest({
      proposalId: 'proposal-1',
      body: baseRequest,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected success result');
    }

    expect(result.data.status).toBe('review_required');
    expect(result.data.auto_commit).toBe(false);
    expect(result.data.reason_code).toBe('POLICY_REVIEW_REQUIRED');
  });

  it('degrades to review_required when approval api is unavailable', async () => {
    const approvalApi = createApprovalApiMock();
    vi.mocked(approvalApi.getApprovalTicket).mockResolvedValue({
      ok: false,
      error: {
        code: 'DEG_JARVIS_UNREACHABLE',
        message: 'network unavailable',
      },
    });

    const gate = createMemoryCommitGate({
      approvalApi,
      writeMode: 'propose_commit',
    });

    const result = await gate.handleCommitRequest({
      proposalId: 'proposal-1',
      body: baseRequest,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected success result');
    }

    expect(result.data.status).toBe('review_required');
    expect(result.data.auto_commit).toBe(false);
    expect(result.data.reason_code).toBe('DEG_JARVIS_UNREACHABLE');
  });

  it('commits when write_mode=propose_commit and approval status is approved', async () => {
    const approvalApi = createApprovalApiMock();
    vi.mocked(approvalApi.getApprovalTicket).mockResolvedValue({
      ok: true,
      meta: {
        request_id: 'req-approval',
        trace_id: 'trace-approval',
      },
      data: {
        approval_id: 'd4137d47-b2f5-4038-9925-b6df9973f7de',
        status: 'approved',
        latest_decision_id: 'ac4cbf76-5548-47d7-a6ea-bf55d9d0b667',
      },
    });

    const gate = createMemoryCommitGate({
      approvalApi,
      writeMode: 'propose_commit',
    });

    const result = await gate.handleCommitRequest({
      proposalId: 'proposal-1',
      body: baseRequest,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected commit result');
    }

    expect(result.data.status).toBe('committed');
    expect(result.data.auto_commit).toBe(true);
    expect(result.data.audit.request_id).toBe('req-1');
    expect(result.data.audit.trace_id).toBe('trace-1');
    expect(result.data.audit.approval_id).toBe('d4137d47-b2f5-4038-9925-b6df9973f7de');
    expect(result.data.audit.decision_id).toBe('ac4cbf76-5548-47d7-a6ea-bf55d9d0b667');
  });
});
