import { describe, expect, it, vi } from "vitest";
import { createTokenIssuer, decodeJwtPayload } from "../auth/token-issuer.js";
import { createJarvisClient } from "../client/jarvis-client.js";
import { resolveJarvisBridgeFlags } from "../config/flags.js";

const toJsonResponse = (status: number, payload: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }) as Response;

describe("memory-jarvis-bridge auth e2e", () => {
  it("injects jwt claims on remote write request", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(toJsonResponse(200, { ok: true }));

    const tokenIssuer = createTokenIssuer({
      issuer: "https://clawdbot.example.com",
      audience: "jarvis-kb-v0",
      signingKey: "test-signing-key",
      nowEpochSeconds: () => 1_900_000_000,
      ttlSeconds: 900,
    });

    const client = createJarvisClient(
      resolveJarvisBridgeFlags({
        read_mode: "remote",
        write_mode: "remote",
        jarvis_base_url: "https://jarvis.example.com",
      }),
      {
        fetchImpl: fetchMock,
        tokenIssuer,
      },
    );

    await client.write(
      {
        envelope: {
          tenant_id: "tenant-alpha",
          workspace_id: "workspace-main",
        },
        payload: {
          proposal_id: "proposal-1",
        },
      },
      {
        sub: "agent-user-1",
        tenant_id: "tenant-alpha",
        workspace_id: "workspace-main",
        actor_role: "reviewer",
        scope: ["kb:write"],
      },
    );

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = requestInit.headers as Record<string, string>;
    const token = headers.Authorization.replace(/^Bearer\s+/i, "");
    const claims = decodeJwtPayload(token);

    expect(claims).toMatchObject({
      sub: "agent-user-1",
      tenant_id: "tenant-alpha",
      workspace_id: "workspace-main",
      actor_role: "reviewer",
      scope: ["kb:write"],
      iss: "https://clawdbot.example.com",
      aud: "jarvis-kb-v0",
      exp: 1_900_000_900,
      iat: 1_900_000_000,
    });
  });

  it("rejects cross-tenant request in integration flow", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const token = headers.Authorization.replace(/^Bearer\s+/i, "");
      const claims = decodeJwtPayload(token);
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        envelope?: {
          tenant_id?: string;
        };
      };

      const tenantMatches = claims?.tenant_id === body.envelope?.tenant_id;
      if (!tenantMatches) {
        return toJsonResponse(403, {
          error: {
            code: "AUTH_TENANT_SCOPE_MISMATCH",
          },
        });
      }

      return toJsonResponse(200, { ok: true });
    });

    const tokenIssuer = createTokenIssuer({
      issuer: "https://clawdbot.example.com",
      audience: "jarvis-kb-v0",
      signingKey: "test-signing-key",
      nowEpochSeconds: () => 1_900_000_000,
      ttlSeconds: 900,
    });

    const client = createJarvisClient(
      resolveJarvisBridgeFlags({
        read_mode: "remote",
        write_mode: "remote",
        jarvis_base_url: "https://jarvis.example.com",
      }),
      {
        fetchImpl: fetchMock,
        tokenIssuer,
      },
    );

    const success = await client.write(
      {
        envelope: {
          tenant_id: "tenant-beta",
          workspace_id: "workspace-main",
        },
        payload: {
          proposal_id: "proposal-2",
        },
      },
      {
        sub: "agent-user-1",
        tenant_id: "tenant-alpha",
        workspace_id: "workspace-main",
        actor_role: "reviewer",
        scope: ["kb:write"],
      },
    );

    expect(success).toBe(false);
  });

  it("rejects cross-workspace request in integration flow", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const token = headers.Authorization.replace(/^Bearer\s+/i, "");
      const claims = decodeJwtPayload(token);
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        envelope?: {
          workspace_id?: string;
        };
      };

      const workspaceMatches = claims?.workspace_id === body.envelope?.workspace_id;
      if (!workspaceMatches) {
        return toJsonResponse(403, {
          error: {
            code: "AUTH_WORKSPACE_SCOPE_MISMATCH",
          },
        });
      }

      return toJsonResponse(200, { ok: true });
    });

    const tokenIssuer = createTokenIssuer({
      issuer: "https://clawdbot.example.com",
      audience: "jarvis-kb-v0",
      signingKey: "test-signing-key",
      nowEpochSeconds: () => 1_900_000_000,
      ttlSeconds: 900,
    });

    const client = createJarvisClient(
      resolveJarvisBridgeFlags({
        read_mode: "remote",
        write_mode: "remote",
        jarvis_base_url: "https://jarvis.example.com",
      }),
      {
        fetchImpl: fetchMock,
        tokenIssuer,
      },
    );

    const success = await client.write(
      {
        envelope: {
          tenant_id: "tenant-alpha",
          workspace_id: "workspace-other",
        },
        payload: {
          proposal_id: "proposal-3",
        },
      },
      {
        sub: "agent-user-1",
        tenant_id: "tenant-alpha",
        workspace_id: "workspace-main",
        actor_role: "reviewer",
        scope: ["kb:write"],
      },
    );

    expect(success).toBe(false);
  });
});
