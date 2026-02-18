import { randomUUID } from 'node:crypto';

export type ApprovalTicketStatus = 'pending' | 'approved' | 'rejected' | 'canceled' | 'expired';
export type ApprovalDecisionStatus = Exclude<ApprovalTicketStatus, 'pending'>;
export type ApprovalAction = 'approve' | 'reject' | 'expire' | 'cancel';

type FetchLike = typeof fetch;

export type ApprovalApiMeta = {
  request_id: string;
  trace_id: string;
};

export type ApprovalApiError = {
  code: string;
  message: string;
  status?: number;
};

export type ApprovalApiResult<TData> =
  | {
      ok: true;
      meta: ApprovalApiMeta;
      data: TData;
    }
  | {
      ok: false;
      error: ApprovalApiError;
    };

export type ApprovalTicketRecord = {
  approval_id: string;
  status: ApprovalTicketStatus;
  latest_decision_id?: string | null;
};

export type ApprovalActionRecord = {
  approval_id: string;
  decision_id: string;
  status: ApprovalDecisionStatus;
  resolved_at?: string;
};

export type ListApprovalTicketsParams = {
  tenantId: string;
  workspaceId: string;
  status?: ApprovalTicketStatus;
  subjectType?: string;
  limit?: number;
};

export type GetApprovalTicketParams = {
  approvalId: string;
  tenantId: string;
  workspaceId: string;
};

export type ResolveApprovalTicketParams = {
  approvalId: string;
  action: ApprovalAction;
  tenantId: string;
  workspaceId: string;
  actorId: string;
  actionIdempotencyKey: string;
  comment?: string;
  requestId: string;
  traceId: string;
};

export type ApprovalApiClient = {
  listApprovalTickets(params: ListApprovalTicketsParams): Promise<ApprovalApiResult<{ items: ApprovalTicketRecord[] }>>;
  getApprovalTicket(params: GetApprovalTicketParams): Promise<ApprovalApiResult<ApprovalTicketRecord>>;
  resolveApprovalTicket(
    params: ResolveApprovalTicketParams,
  ): Promise<ApprovalApiResult<ApprovalActionRecord>>;
};

export type CreateApprovalApiClientOptions = {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
};

type ApprovalApiEnvelope<TData> = {
  meta?: {
    request_id?: string;
    trace_id?: string;
  };
  data?: TData;
  error?: {
    code?: string;
    message?: string;
  };
};

const DEFAULT_TIMEOUT_MS = 3_000;

const trimRightSlash = (value: string): string => value.replace(/\/+$/, '');

const buildMeta = (meta: ApprovalApiEnvelope<unknown>['meta']): ApprovalApiMeta => ({
  request_id: meta?.request_id ?? randomUUID(),
  trace_id: meta?.trace_id ?? randomUUID(),
});

const parseErrorMessage = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') {
    return 'approval_api_request_failed';
  }

  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (!error || typeof error !== 'object') {
    return 'approval_api_request_failed';
  }

  const message = (error as Record<string, unknown>).message;
  return typeof message === 'string' && message.trim().length > 0
    ? message
    : 'approval_api_request_failed';
};

const parseErrorCode = (payload: unknown, fallback: string): string => {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (!error || typeof error !== 'object') {
    return fallback;
  }

  const code = (error as Record<string, unknown>).code;
  return typeof code === 'string' && code.trim().length > 0 ? code : fallback;
};

const parseJsonSafely = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export function createApprovalApiClient(options: CreateApprovalApiClientOptions): ApprovalApiClient {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = trimRightSlash(options.baseUrl);

  const request = async <TData>(params: {
    path: string;
    method: 'GET' | 'POST';
    query?: Record<string, string | number | undefined>;
    body?: Record<string, unknown>;
  }): Promise<ApprovalApiResult<TData>> => {
    const url = new URL(`${baseUrl}${params.path}`);
    if (params.query) {
      for (const [key, value] of Object.entries(params.query)) {
        if (value === undefined || value === null) {
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (options.apiKey) {
      headers.authorization = `Bearer ${options.apiKey}`;
    }

    try {
      const response = await fetchImpl(url.toString(), {
        method: params.method,
        headers,
        ...(params.body ? { body: JSON.stringify(params.body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const payload = await parseJsonSafely(response);
      if (!response.ok) {
        return {
          ok: false,
          error: {
            code: parseErrorCode(payload, response.status >= 500 ? 'DEG_JARVIS_UNREACHABLE' : 'APPROVAL_API_ERROR'),
            message: parseErrorMessage(payload),
            status: response.status,
          },
        };
      }

      const envelope = payload as ApprovalApiEnvelope<TData>;
      if (!envelope || typeof envelope !== 'object' || envelope.data === undefined) {
        return {
          ok: false,
          error: {
            code: 'APPROVAL_API_INVALID_RESPONSE',
            message: 'approval api response missing data',
            status: response.status,
          },
        };
      }

      return {
        ok: true,
        meta: buildMeta(envelope.meta),
        data: envelope.data,
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'DEG_JARVIS_UNREACHABLE',
          message: error instanceof Error ? error.message : 'approval api unavailable',
        },
      };
    }
  };

  return {
    listApprovalTickets(params: ListApprovalTicketsParams): Promise<
      ApprovalApiResult<{ items: ApprovalTicketRecord[] }>
    > {
      return request<{ items: ApprovalTicketRecord[] }>({
        path: '/v0/approval-tickets',
        method: 'GET',
        query: {
          tenant_id: params.tenantId,
          workspace_id: params.workspaceId,
          status: params.status,
          subject_type: params.subjectType,
          limit: params.limit,
        },
      });
    },

    getApprovalTicket(params: GetApprovalTicketParams): Promise<ApprovalApiResult<ApprovalTicketRecord>> {
      return request<ApprovalTicketRecord>({
        path: `/v0/approval-tickets/${params.approvalId}`,
        method: 'GET',
        query: {
          tenant_id: params.tenantId,
          workspace_id: params.workspaceId,
        },
      });
    },

    resolveApprovalTicket(
      params: ResolveApprovalTicketParams,
    ): Promise<ApprovalApiResult<ApprovalActionRecord>> {
      return request<ApprovalActionRecord>({
        path: `/v0/approval-tickets/${params.approvalId}/${params.action}`,
        method: 'POST',
        body: {
          tenant_id: params.tenantId,
          workspace_id: params.workspaceId,
          actor_id: params.actorId,
          action_idempotency_key: params.actionIdempotencyKey,
          request_id: params.requestId,
          trace_id: params.traceId,
          ...(params.comment ? { comment: params.comment } : {}),
        },
      });
    },
  };
}
