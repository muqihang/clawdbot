import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOnlineIncrementalCapture } from "../p3/online-capture.js";
import { createP3OutboxStore } from "../p3/outbox-store.js";
import { createHttpBridgeWriter } from "../p3/remote-writer.js";
import { createP3Worker } from "../p3/worker.js";

type MockServerHandle = {
  close: () => Promise<void>;
  url: string;
  requests: Array<{ method: string; path: string; body: unknown }>;
};

const OC_USER_ID_RE =
  /^ocu_v1:(telegram|whatsapp|discord|irc|googlechat|slack|signal|imessage):[a-z0-9][a-z0-9:_\-.]{0,127}$/;
const OC_THREAD_ID_RE =
  /^oct_v1:(telegram|whatsapp|discord|irc|googlechat|slack|signal|imessage):[a-z0-9][a-z0-9:_\-.]{0,191}$/;
const OC_MESSAGE_ID_RE =
  /^ocm_v1:(telegram|whatsapp|discord|irc|googlechat|slack|signal|imessage):[a-z0-9][a-z0-9:_\-.]{0,191}$/;

async function startMockServer(params: {
  responder: (input: {
    path: string;
    method: string;
    body: unknown;
    count: number;
  }) => Promise<{ status: number; payload: unknown }> | { status: number; payload: unknown };
}): Promise<MockServerHandle> {
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  let count = 0;

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });
    req.on("end", async () => {
      count += 1;
      const raw = Buffer.concat(chunks).toString("utf8");
      const body = raw ? (JSON.parse(raw) as unknown) : null;
      requests.push({
        method: req.method ?? "",
        path: req.url ?? "",
        body,
      });

      const response = await params.responder({
        path: req.url ?? "",
        method: req.method ?? "",
        body,
        count,
      });

      res.statusCode = response.status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(response.payload));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind mock server");
  }

  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    requests,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    },
  };
}

describe("P3 integration", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "openclaw-p3-integration-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("supports propose_only and propose_commit without blocking capture path", async () => {
    let now = 1_700_000_000_000;
    const outbox = createP3OutboxStore({
      dbPath: path.join(tempDir, "p3.sqlite"),
      now: () => now,
    });

    const mem0 = await startMockServer({
      responder: () => ({ status: 200, payload: { id: "mem0-ok" } }),
    });
    const graphiti = await startMockServer({
      responder: () => ({ status: 200, payload: { id: "graphiti-ok" } }),
    });

    try {
      const capture = createOnlineIncrementalCapture({
        writeMode: "propose_only",
        outbox,
        now: () => now,
        effectiveModel: "gpt-5.1-codex-mini",
      });

      const startedAt = Date.now();
      await capture.onAgentEnd(
        {
          messages: [
            { role: "user", content: "my editor is vim" },
            { role: "assistant", content: "已记录：你偏好 vim" },
          ],
          success: true,
        },
        { sessionKey: "session-capture" },
      );
      const elapsedMs = Date.now() - startedAt;
      expect(elapsedMs).toBeLessThan(50);
      expect(outbox.listEvents()).toHaveLength(1);

      const capturedEvent = outbox.listEvents()[0];
      expect(capturedEvent?.payload.metadata?.oc_user_id).toMatch(OC_USER_ID_RE);
      expect(capturedEvent?.payload.metadata?.oc_thread_id).toMatch(OC_THREAD_ID_RE);
      expect(capturedEvent?.payload.metadata?.oc_message_id).toMatch(OC_MESSAGE_ID_RE);
      expect(capturedEvent?.payload.message_envelope).toBeUndefined();

      const worker = createP3Worker({
        outbox,
        now: () => now,
        maxAttempts: 3,
        baseBackoffMs: 50,
        maxBackoffMs: 10_000,
        jitterRatio: 0,
        mem0Write: createHttpBridgeWriter({
          source: "mem0",
          baseUrl: mem0.url,
          timeoutMs: 500,
          path: "/memories",
        }),
        graphitiWrite: createHttpBridgeWriter({
          source: "graphiti",
          baseUrl: graphiti.url,
          timeoutMs: 500,
          path: "/messages",
        }),
        onReport: async () => undefined,
      });

      const once = await worker.processOnce();
      expect(once.succeeded).toBe(1);
      expect(outbox.listCanonicalFacts()).toHaveLength(0);
      expect(mem0.requests[0]).toEqual(
        expect.objectContaining({
          method: "POST",
          path: "/memories",
          body: expect.objectContaining({
            messages: [
              expect.objectContaining({ role: "user" }),
              expect.objectContaining({ role: "assistant" }),
            ],
            user_id: "session-capture",
            run_id: expect.any(String),
            metadata: expect.objectContaining({
              source: "openclaw-memory-bridge-p3",
              event_id: expect.any(String),
              session_key: "session-capture",
              model: "gpt-5.1-codex-mini",
              write_mode: "propose_only",
              source_ref: expect.stringContaining("agent_end:session-capture"),
              source_tier: "online_incremental",
              candidate_memory_id: expect.any(String),
              fact_key: "prefs.editor",
              oc_user_id: expect.stringMatching(OC_USER_ID_RE),
              oc_thread_id: expect.stringMatching(OC_THREAD_ID_RE),
              oc_message_id: expect.stringMatching(OC_MESSAGE_ID_RE),
            }),
          }),
        }),
      );
      expect(graphiti.requests[0]).toEqual(
        expect.objectContaining({
          method: "POST",
          path: "/messages",
          body: expect.objectContaining({
            group_id: "session-capture",
            messages: [
              expect.objectContaining({ role_type: "user", role: "user" }),
              expect.objectContaining({ role_type: "assistant", role: "assistant" }),
            ],
          }),
        }),
      );

      outbox.enqueue({
        idempotencyKey: "session-commit:1",
        sessionKey: "session-commit",
        sourceRef: "agent_end:1",
        sourceTier: "online_incremental",
        writeMode: "propose_commit",
        effectiveModel: "gpt-5.1-codex-mini",
        payload: {
          candidate: {
            memory_id: "fact-commit-1",
            fact_key: "prefs.editor",
            fact_value: "vim",
            ttl_class: "conversation",
            confidence: 0.95,
            status: "active",
            source_event_id: "evt-commit-1",
            detail_path: "memory/2026-02-23.md",
            trigger_keywords: [],
            active_context: true,
            event_time: "2026-02-23T00:00:00.000Z",
            ingest_time: "2026-02-23T00:00:00.000Z",
          },
        },
      });
      await worker.processOnce();

      now += 1_000;
      outbox.enqueue({
        idempotencyKey: "session-commit:2",
        sessionKey: "session-commit",
        sourceRef: "agent_end:2",
        sourceTier: "online_incremental",
        writeMode: "propose_commit",
        effectiveModel: "gpt-5.1-codex-mini",
        payload: {
          candidate: {
            memory_id: "fact-commit-2",
            fact_key: "prefs.editor",
            fact_value: "zed",
            ttl_class: "conversation",
            confidence: 0.93,
            status: "active",
            source_event_id: "evt-commit-2",
            detail_path: "memory/2026-02-24.md",
            trigger_keywords: [],
            active_context: true,
            event_time: "2026-02-24T00:00:00.000Z",
            ingest_time: "2026-02-24T00:00:00.000Z",
          },
        },
      });
      await worker.processOnce();

      const canonical = outbox.listCanonicalFacts();
      const oldRecord = canonical.find((item) => item.memory_id === "fact-commit-1");
      const newRecord = canonical.find((item) => item.memory_id === "fact-commit-2");

      expect(oldRecord?.status).toBe("superseded");
      expect(newRecord?.status).toBe("active");
      expect(newRecord?.supersedes_id).toBe("fact-commit-1");
      expect(mem0.requests.length).toBeGreaterThan(0);
      expect(graphiti.requests.length).toBeGreaterThan(0);
    } finally {
      await mem0.close();
      await graphiti.close();
    }
  });

  it("applies ignore_roles filtering with auditable envelope fields when enabled", async () => {
    let now = 1_700_000_050_000;
    const outbox = createP3OutboxStore({
      dbPath: path.join(tempDir, "p3-envelope.sqlite"),
      now: () => now,
    });

    const mem0 = await startMockServer({
      responder: () => ({ status: 200, payload: { id: "mem0-ok" } }),
    });
    const graphiti = await startMockServer({
      responder: () => ({ status: 200, payload: { id: "graphiti-ok" } }),
    });

    try {
      const captureOptions = {
        writeMode: "propose_only",
        outbox,
        now: () => now,
        effectiveModel: "gpt-5.1-codex-mini",
        messageEnvelope: {
          enabled: true,
          ignoreRoles: ["assistant", "assistant", "invalid"],
        },
      } as unknown as Parameters<typeof createOnlineIncrementalCapture>[0];
      const capture = createOnlineIncrementalCapture(captureOptions);

      await capture.onAgentEnd(
        {
          messages: [
            { role: "user", content: "my editor is vim" },
            { role: "assistant", content: "已记录：你偏好 vim" },
          ],
          success: true,
        },
        { sessionKey: "session-envelope" },
      );

      const capturedEvent = outbox.listEvents()[0];
      expect(capturedEvent?.payload.message_envelope).toEqual(
        expect.objectContaining({
          role: "user",
          name: expect.stringMatching(OC_USER_ID_RE),
          created_at: expect.any(String),
          metadata: expect.objectContaining({
            session_key: "session-envelope",
            model: "gpt-5.1-codex-mini",
          }),
          ignore_roles: ["assistant"],
        }),
      );

      const worker = createP3Worker({
        outbox,
        now: () => now,
        maxAttempts: 3,
        baseBackoffMs: 50,
        maxBackoffMs: 10_000,
        jitterRatio: 0,
        mem0Write: createHttpBridgeWriter({
          source: "mem0",
          baseUrl: mem0.url,
          timeoutMs: 500,
          path: "/memories",
        }),
        graphitiWrite: createHttpBridgeWriter({
          source: "graphiti",
          baseUrl: graphiti.url,
          timeoutMs: 500,
          path: "/messages",
        }),
        onReport: async () => undefined,
      });

      const once = await worker.processOnce();
      expect(once.succeeded).toBe(1);

      const mem0Body = mem0.requests[0]?.body as Record<string, unknown>;
      const mem0Messages = mem0Body.messages as Array<Record<string, unknown>>;
      expect(mem0Messages).toHaveLength(1);
      expect(mem0Messages[0]?.role).toBe("user");
      expect(mem0Body.metadata).toEqual(
        expect.objectContaining({
          message_envelope: expect.objectContaining({
            ignore_roles: ["assistant"],
            filtered_roles: ["assistant"],
            effective_roles: ["user"],
          }),
        }),
      );

      const graphitiBody = graphiti.requests[0]?.body as Record<string, unknown>;
      const graphitiMessages = graphitiBody.messages as Array<Record<string, unknown>>;
      expect(graphitiMessages).toHaveLength(1);
      expect(graphitiMessages[0]?.role).toBe("user");
    } finally {
      await mem0.close();
      await graphiti.close();
    }
  });

  it("retries failed target and preserves successful target writes", async () => {
    let now = 1_700_000_100_000;
    const outbox = createP3OutboxStore({
      dbPath: path.join(tempDir, "p3.sqlite"),
      now: () => now,
    });

    const mem0 = await startMockServer({
      responder: () => ({ status: 200, payload: { id: "mem0-ok" } }),
    });

    const graphiti = await startMockServer({
      responder: async ({ count }) => {
        if (count === 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return { status: 200, payload: { id: "graphiti-ok" } };
      },
    });

    try {
      outbox.enqueue({
        idempotencyKey: "session-retry:1",
        sessionKey: "session-retry",
        sourceRef: "agent_end:1",
        sourceTier: "online_incremental",
        writeMode: "propose_only",
        effectiveModel: "gpt-5.1-codex-mini",
        payload: {
          candidate: {
            memory_id: "fact-retry-1",
            fact_key: "prefs.language",
            fact_value: "zh-CN",
            ttl_class: "conversation",
            confidence: 0.9,
            status: "active",
            source_event_id: "evt-retry-1",
            detail_path: "memory/2026-02-23.md",
            trigger_keywords: [],
            active_context: true,
            event_time: "2026-02-23T00:00:00.000Z",
            ingest_time: "2026-02-23T00:00:00.000Z",
          },
        },
      });

      const worker = createP3Worker({
        outbox,
        now: () => now,
        maxAttempts: 3,
        baseBackoffMs: 25,
        maxBackoffMs: 5_000,
        jitterRatio: 0,
        mem0Write: createHttpBridgeWriter({
          source: "mem0",
          baseUrl: mem0.url,
          timeoutMs: 500,
          path: "/memories",
        }),
        graphitiWrite: createHttpBridgeWriter({
          source: "graphiti",
          baseUrl: graphiti.url,
          timeoutMs: 20,
          path: "/messages",
        }),
        onReport: async () => undefined,
      });

      const first = await worker.processOnce();
      expect(first.failed).toBe(1);

      const partial = outbox.listEvents()[0];
      expect(partial?.mem0_status).toBe("succeeded");
      expect(partial?.graphiti_status).toBe("failed");

      now += 25;
      const second = await worker.processOnce();
      expect(second.succeeded).toBe(1);

      const done = outbox.listEvents()[0];
      expect(done?.status).toBe("succeeded");
      expect(mem0.requests).toHaveLength(1);
      expect(graphiti.requests).toHaveLength(2);
    } finally {
      await mem0.close();
      await graphiti.close();
    }
  });
});
