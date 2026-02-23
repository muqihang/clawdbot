import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createP3OutboxStore } from "../p3/outbox-store.js";
import { createP3Worker } from "../p3/worker.js";

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
});
