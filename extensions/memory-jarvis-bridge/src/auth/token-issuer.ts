import { createHmac } from 'node:crypto';

export type TokenIssuerErrorCode = 'AUTH_INVALID_TOKEN';

export type TokenIssueInput = {
  sub: string;
  tenant_id: string;
  workspace_id: string;
  actor_role: string;
  scope: string | string[];
};

export type IssuedTokenClaims = {
  sub: string;
  tenant_id: string;
  workspace_id: string;
  actor_role: string;
  scope: string[];
  iss: string;
  aud: string;
  exp: number;
  iat: number;
};

type TokenIssueSuccess = {
  ok: true;
  token: string;
  claims: IssuedTokenClaims;
};

type TokenIssueFailure = {
  ok: false;
  error: {
    code: TokenIssuerErrorCode;
    message: string;
  };
};

export type TokenIssueResult = TokenIssueSuccess | TokenIssueFailure;

export type TokenIssuer = {
  issueToken(input: unknown): TokenIssueResult;
};

export type CreateTokenIssuerOptions = {
  issuer: string;
  audience: string;
  signingKey: string;
  ttlSeconds?: number;
  nowEpochSeconds?: () => number;
};

const DEFAULT_TTL_SECONDS = 900;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toBase64Url = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeScope = (value: unknown): string[] | undefined => {
  if (typeof value === 'string') {
    const normalized = value
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    return normalized.length > 0 ? normalized : undefined;
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
    return normalized.length > 0 ? normalized : undefined;
  }

  return undefined;
};

const issueFailure = (message: string): TokenIssueFailure => ({
  ok: false,
  error: {
    code: 'AUTH_INVALID_TOKEN',
    message,
  },
});

export const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const segments = token.split('.');
  if (segments.length < 2 || !segments[1]) {
    return null;
  }

  try {
    const payload = Buffer.from(segments[1], 'base64url').toString('utf8');
    const parsed = JSON.parse(payload) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export function createTokenIssuer(options: CreateTokenIssuerOptions): TokenIssuer {
  const issuer = normalizeString(options.issuer);
  const audience = normalizeString(options.audience);
  const signingKey = normalizeString(options.signingKey);
  const ttlSeconds = Number.isFinite(options.ttlSeconds)
    ? Math.max(60, Math.floor(options.ttlSeconds ?? DEFAULT_TTL_SECONDS))
    : DEFAULT_TTL_SECONDS;
  const now = options.nowEpochSeconds ?? (() => Math.floor(Date.now() / 1000));

  return {
    issueToken(input: unknown): TokenIssueResult {
      if (!issuer || !audience || !signingKey) {
        return issueFailure('issuer/audience/signingKey are required to issue token');
      }

      if (!isRecord(input)) {
        return issueFailure('token claims must be an object');
      }

      const sub = normalizeString(input.sub);
      const tenantId = normalizeString(input.tenant_id);
      const workspaceId = normalizeString(input.workspace_id);
      const actorRole = normalizeString(input.actor_role);
      const scope = normalizeScope(input.scope);

      if (!sub) {
        return issueFailure('required claim sub is missing');
      }
      if (!tenantId) {
        return issueFailure('required claim tenant_id is missing');
      }
      if (!workspaceId) {
        return issueFailure('required claim workspace_id is missing');
      }
      if (!actorRole) {
        return issueFailure('required claim actor_role is missing');
      }
      if (!scope) {
        return issueFailure('required claim scope is missing');
      }

      const iat = now();
      const exp = iat + ttlSeconds;
      const claims: IssuedTokenClaims = {
        sub,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        actor_role: actorRole,
        scope,
        iss: issuer,
        aud: audience,
        iat,
        exp,
      };

      const header = {
        alg: 'HS256',
        typ: 'JWT',
      };

      const encodedHeader = toBase64Url(header);
      const encodedClaims = toBase64Url(claims);
      const signingInput = `${encodedHeader}.${encodedClaims}`;
      const signature = createHmac('sha256', signingKey).update(signingInput).digest('base64url');

      return {
        ok: true,
        token: `${signingInput}.${signature}`,
        claims,
      };
    },
  };
}
