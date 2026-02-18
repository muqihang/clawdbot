import { describe, expect, it } from 'vitest';
import { createTokenIssuer, decodeJwtPayload } from '../auth/token-issuer.js';

const nowEpochSeconds = () => 1_900_000_000;

describe('token-issuer', () => {
  it('issues JWT with required claims', () => {
    const issuer = createTokenIssuer({
      issuer: 'https://clawdbot.example.com',
      audience: 'jarvis-kb-v0',
      signingKey: 'test-signing-key',
      ttlSeconds: 900,
      nowEpochSeconds,
    });

    const result = issuer.issueToken({
      sub: 'agent-user-1',
      tenant_id: 'tenant-alpha',
      workspace_id: 'workspace-main',
      actor_role: 'reviewer',
      scope: ['kb:read', 'kb:write'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected token issue to succeed');
    }

    const decoded = decodeJwtPayload(result.token);
    expect(decoded).toMatchObject({
      sub: 'agent-user-1',
      tenant_id: 'tenant-alpha',
      workspace_id: 'workspace-main',
      actor_role: 'reviewer',
      scope: ['kb:read', 'kb:write'],
      iss: 'https://clawdbot.example.com',
      aud: 'jarvis-kb-v0',
      iat: 1_900_000_000,
      exp: 1_900_000_900,
    });
  });

  it.each([
    'sub',
    'tenant_id',
    'workspace_id',
    'actor_role',
    'scope',
  ] as const)('fails closed when required claim %s is missing', (claimKey) => {
    const issuer = createTokenIssuer({
      issuer: 'https://clawdbot.example.com',
      audience: 'jarvis-kb-v0',
      signingKey: 'test-signing-key',
      ttlSeconds: 900,
      nowEpochSeconds,
    });

    const candidate = {
      sub: 'agent-user-1',
      tenant_id: 'tenant-alpha',
      workspace_id: 'workspace-main',
      actor_role: 'reviewer',
      scope: ['kb:read', 'kb:write'],
    } as Record<string, unknown>;

    delete candidate[claimKey];

    const result = issuer.issueToken(candidate);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected token issue to fail');
    }

    expect(result.error.code).toBe('AUTH_INVALID_TOKEN');
  });

  it('normalizes string scopes into array claims', () => {
    const issuer = createTokenIssuer({
      issuer: 'https://clawdbot.example.com',
      audience: 'jarvis-kb-v0',
      signingKey: 'test-signing-key',
      ttlSeconds: 900,
      nowEpochSeconds,
    });

    const result = issuer.issueToken({
      sub: 'agent-user-1',
      tenant_id: 'tenant-alpha',
      workspace_id: 'workspace-main',
      actor_role: 'reviewer',
      scope: 'kb:read kb:write',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected token issue to succeed');
    }

    const decoded = decodeJwtPayload(result.token);
    expect(decoded?.scope).toEqual(['kb:read', 'kb:write']);
  });
});
