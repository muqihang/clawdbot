import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOnlineIncrementalCapture } from "../p3/online-capture.js";
import { createP3OutboxStore } from "../p3/outbox-store.js";
import { createP3Worker } from "../p3/worker.js";

const OC_USER_ID_RE =
  /^ocu_v1:(telegram|whatsapp|discord|irc|googlechat|slack|signal|imessage):[a-z0-9][a-z0-9:_\-.]{0,127}$/;
const OC_THREAD_ID_RE =
  /^oct_v1:(telegram|whatsapp|discord|irc|googlechat|slack|signal|imessage):[a-z0-9][a-z0-9:_\-.]{0,191}$/;
const OC_MESSAGE_ID_RE =
  /^ocm_v1:(telegram|whatsapp|discord|irc|googlechat|slack|signal|imessage):[a-z0-9][a-z0-9:_\-.]{0,191}$/;

describe("P3 outbox + worker", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "openclaw-p3-outbox-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("deduplicates enqueue by idempotency_key", () => {
    const outbox = createP3OutboxStore({
      dbPath: path.join(tempDir, "p3.sqlite"),
      now: () => 1_700_000_000_000,
    });

    const first = outbox.enqueue({
      idempotencyKey: "session-1:evt-1",
      sessionKey: "session-1",
      sourceRef: "agent_end:1",
      sourceTier: "online_incremental",
      writeMode: "propose_only",
      effectiveModel: "gpt-5.1-codex-mini",
      payload: {
        candidate: {
          memory_id: "fact-1",
          fact_key: "prefs.language",
          fact_value: "zh-CN",
          ttl_class: "conversation",
          confidence: 0.88,
          status: "active",
          source_event_id: "evt-1",
          detail_path: "memory/2026-02-23.md",
          trigger_keywords: [],
          active_context: true,
          event_time: "2026-02-23T00:00:00.000Z",
          ingest_time: "2026-02-23T00:00:00.000Z",
        },
      },
    });

    const second = outbox.enqueue({
      idempotencyKey: "session-1:evt-1",
      sessionKey: "session-1",
      sourceRef: "agent_end:1",
      sourceTier: "online_incremental",
      writeMode: "propose_only",
      effectiveModel: "gpt-5.1-codex-mini",
      payload: {
        candidate: {
          memory_id: "fact-2",
          fact_key: "prefs.language",
          fact_value: "en-US",
          ttl_class: "conversation",
          confidence: 0.9,
          status: "active",
          source_event_id: "evt-1",
          detail_path: "memory/2026-02-23.md",
          trigger_keywords: [],
          active_context: true,
          event_time: "2026-02-23T00:00:00.000Z",
          ingest_time: "2026-02-23T00:00:00.000Z",
        },
      },
    });

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(second.eventId).toBe(first.eventId);
    expect(outbox.listEvents()).toHaveLength(1);
  });

  it("retries with backoff and moves to dead-letter after max attempts", async () => {
    let now = 1_700_000_000_000;
    const outbox = createP3OutboxStore({
      dbPath: path.join(tempDir, "p3.sqlite"),
      now: () => now,
    });

    const enqueued = outbox.enqueue({
      idempotencyKey: "session-1:evt-dead",
      sessionKey: "session-1",
      sourceRef: "agent_end:2",
      sourceTier: "online_incremental",
      writeMode: "propose_only",
      effectiveModel: "gpt-5.1-codex-mini",
      payload: {
        candidate: {
          memory_id: "fact-dead",
          fact_key: "prefs.shell",
          fact_value: "zsh",
          ttl_class: "conversation",
          confidence: 0.92,
          status: "active",
          source_event_id: "evt-dead",
          detail_path: "memory/2026-02-23.md",
          trigger_keywords: [],
          active_context: true,
          event_time: "2026-02-23T00:00:00.000Z",
          ingest_time: "2026-02-23T00:00:00.000Z",
        },
      },
    });

    const writer = vi.fn(async () => {
      throw new Error("upstream unavailable");
    });

    const worker = createP3Worker({
      outbox,
      now: () => now,
      maxAttempts: 2,
      baseBackoffMs: 500,
      maxBackoffMs: 60_000,
      jitterRatio: 0,
      mem0Write: writer,
      graphitiWrite: writer,
      onReport: async () => undefined,
    });

    const first = await worker.processOnce();
    expect(first.processed).toBe(1);
    expect(first.failed).toBe(1);

    const afterFirst = outbox.getEvent(enqueued.eventId);
    expect(afterFirst?.status).toBe("failed");
    expect(afterFirst?.attempt_count).toBe(1);
    expect(afterFirst?.next_retry_at).toBe(now + 500);

    now += 500;

    const second = await worker.processOnce();
    expect(second.dead).toBe(1);

    const afterSecond = outbox.getEvent(enqueued.eventId);
    expect(afterSecond?.status).toBe("dead");
    expect(afterSecond?.attempt_count).toBe(2);
    expect(outbox.listDeadLetters()).toHaveLength(1);

    const attempts = outbox.listAttempts(enqueued.eventId);
    expect(attempts).toHaveLength(4);
    expect(attempts.every((entry) => entry.status === "error")).toBe(true);
  });

  it("keeps target-level success when only one upstream fails", async () => {
    let now = 1_700_000_000_000;
    const outbox = createP3OutboxStore({
      dbPath: path.join(tempDir, "p3.sqlite"),
      now: () => now,
    });

    outbox.enqueue({
      idempotencyKey: "session-2:evt-partial",
      sessionKey: "session-2",
      sourceRef: "agent_end:3",
      sourceTier: "online_incremental",
      writeMode: "propose_only",
      effectiveModel: "gpt-5.1-codex-mini",
      payload: {
        candidate: {
          memory_id: "fact-partial",
          fact_key: "prefs.editor",
          fact_value: "vim",
          ttl_class: "conversation",
          confidence: 0.84,
          status: "active",
          source_event_id: "evt-partial",
          detail_path: "memory/2026-02-23.md",
          trigger_keywords: [],
          active_context: true,
          event_time: "2026-02-23T00:00:00.000Z",
          ingest_time: "2026-02-23T00:00:00.000Z",
        },
      },
    });

    const mem0Write = vi.fn(async () => ({ remoteId: "mem0-1" }));
    let graphitiFail = true;
    const graphitiWrite = vi.fn(async () => {
      if (graphitiFail) {
        throw new Error("graphiti timeout");
      }
      return { remoteId: "graphiti-1" };
    });

    const worker = createP3Worker({
      outbox,
      now: () => now,
      maxAttempts: 3,
      baseBackoffMs: 1_000,
      maxBackoffMs: 60_000,
      jitterRatio: 0,
      mem0Write,
      graphitiWrite,
      onReport: async () => undefined,
    });

    await worker.processOnce();
    const pending = outbox.listEvents()[0];
    expect(pending?.mem0_status).toBe("succeeded");
    expect(pending?.graphiti_status).toBe("failed");

    graphitiFail = false;
    now += 1_000;
    await worker.processOnce();

    const done = outbox.listEvents()[0];
    expect(done?.status).toBe("succeeded");
    expect(done?.mem0_status).toBe("succeeded");
    expect(done?.graphiti_status).toBe("succeeded");
    expect(mem0Write).toHaveBeenCalledTimes(1);
    expect(graphitiWrite).toHaveBeenCalledTimes(2);
  });

  it("commits canary samples in propose_only when admission passes", async () => {
    const now = 1_700_000_020_000;
    const outbox = createP3OutboxStore({
      dbPath: path.join(tempDir, "p3.sqlite"),
      now: () => now,
    });

    outbox.enqueue({
      idempotencyKey: "session-3:evt-canary",
      sessionKey: "session-3",
      sourceRef: "agent_end:4",
      sourceTier: "online_incremental",
      writeMode: "propose_only",
      effectiveModel: "gpt-5.1-codex-mini",
      payload: {
        candidate: {
          memory_id: "fact-canary-1",
          fact_key: "prefs.terminal",
          fact_value: "iTerm2",
          ttl_class: "conversation",
          confidence: 0.95,
          status: "active",
          source_event_id: "evt-canary-1",
          detail_path: "memory/2026-02-24.md",
          trigger_keywords: [],
          active_context: true,
          event_time: "2026-02-24T00:00:00.000Z",
          ingest_time: "2026-02-24T00:00:00.000Z",
        },
      },
    });

    const worker = createP3Worker({
      outbox,
      now: () => now,
      maxAttempts: 3,
      baseBackoffMs: 1_000,
      maxBackoffMs: 60_000,
      jitterRatio: 0,
      mem0Write: vi.fn(async () => ({ remoteId: "mem0-canary" })),
      graphitiWrite: vi.fn(async () => ({ remoteId: "graphiti-canary" })),
      admissionEnabled: true,
      commitCanaryRatio: 1,
      commitRequireIndexCheck: false,
      commitRequireNonSensitive: true,
      commitRequireDualWriteOk: true,
      onReport: async () => undefined,
    });

    const summary = await worker.processOnce();
    expect(summary.succeeded).toBe(1);

    const runDate = new Date(now).toISOString().slice(0, 10);
    const counters = outbox.getAuditCounters(runDate);
    expect(counters.addedCount).toBe(1);

    const proposals = outbox.listProposalStates();
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.status).toBe("committed");
  });

  it("keeps legacy metadata and carries oc_* ids for captured events", async () => {
    let now = 1_700_000_025_000;
    const outbox = createP3OutboxStore({
      dbPath: path.join(tempDir, "p3.sqlite"),
      now: () => now,
    });

    const capture = createOnlineIncrementalCapture({
      writeMode: "propose_only",
      outbox,
      now: () => now,
      effectiveModel: "gpt-5.1-codex-mini",
    });

    await capture.onAgentEnd(
      {
        success: true,
        messages: [
          { role: "user", content: "my editor is helix" },
          { role: "assistant", content: "好的，记住你用 helix。" },
        ],
      },
      { sessionKey: "agent:main:slack:direct:u01abc" },
    );

    const captured = outbox.listEvents()[0];
    expect(captured?.payload.metadata?.userText).toBe("my editor is helix");
    expect(captured?.payload.metadata?.assistantText).toBe("好的，记住你用 helix。");
    expect(captured?.payload.metadata?.oc_user_id).toBe("ocu_v1:slack:u01abc");
    expect(captured?.payload.metadata?.oc_thread_id).toBe("oct_v1:slack:slack:direct:u01abc");
    expect(captured?.payload.metadata?.oc_message_id).toMatch(OC_MESSAGE_ID_RE);
    expect(captured?.payload.metadata?.oc_message_id).toContain(
      "ocm_v1:slack:agent_end:agent:main:slack:direct:u01abc:",
    );

    const mem0Write = vi.fn(async () => ({ remoteId: "mem0-oc" }));
    const graphitiWrite = vi.fn(async () => ({ remoteId: "graphiti-oc" }));
    const worker = createP3Worker({
      outbox,
      now: () => now,
      maxAttempts: 2,
      baseBackoffMs: 100,
      maxBackoffMs: 1_000,
      jitterRatio: 0,
      mem0Write,
      graphitiWrite,
      onReport: async () => undefined,
    });

    const result = await worker.processOnce();
    expect(result.succeeded).toBe(1);
    expect(mem0Write).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          metadata: expect.objectContaining({
            userText: "my editor is helix",
            assistantText: "好的，记住你用 helix。",
            oc_user_id: expect.stringMatching(OC_USER_ID_RE),
            oc_thread_id: expect.stringMatching(OC_THREAD_ID_RE),
            oc_message_id: expect.stringMatching(OC_MESSAGE_ID_RE),
          }),
        }),
      }),
    );
  });

  it("records error buckets for timeout and contract failures", async () => {
    let now = 1_700_000_030_000;
    const outbox = createP3OutboxStore({
      dbPath: path.join(tempDir, "p3.sqlite"),
      now: () => now,
    });

    const enqueued = outbox.enqueue({
      idempotencyKey: "session-4:evt-bucket",
      sessionKey: "session-4",
      sourceRef: "agent_end:5",
      sourceTier: "online_incremental",
      writeMode: "propose_only",
      effectiveModel: "gpt-5.1-codex-mini",
      payload: {
        candidate: {
          memory_id: "fact-bucket",
          fact_key: "prefs.keyboard",
          fact_value: "HHKB",
          ttl_class: "conversation",
          confidence: 0.9,
          status: "active",
          source_event_id: "evt-bucket",
          detail_path: "memory/2026-02-24.md",
          trigger_keywords: [],
          active_context: true,
          event_time: "2026-02-24T00:00:00.000Z",
          ingest_time: "2026-02-24T00:00:00.000Z",
        },
      },
    });

    const worker = createP3Worker({
      outbox,
      now: () => now,
      maxAttempts: 2,
      baseBackoffMs: 100,
      maxBackoffMs: 100,
      jitterRatio: 0,
      mem0Write: vi.fn(async () => {
        throw new Error("remote mem0 write failed: status 422");
      }),
      graphitiWrite: vi.fn(async () => {
        throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
      }),
      onReport: async () => undefined,
    });

    await worker.processOnce();

    const attempts = outbox.listAttempts(enqueued.eventId);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.error_bucket).toBe("contract");
    expect(attempts[1]?.error_bucket).toBe("timeout");
  });
});
