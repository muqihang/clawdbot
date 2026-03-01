import { describe, expect, it } from "vitest";
import { createHttpBridgeWriter, type GraphitiOntologyV1WriteTrace } from "../p3/remote-writer.js";
import type { P3RemoteWriteInput } from "../p3/remote-writer.js";

const baseInput = (): P3RemoteWriteInput => {
  return {
    event: {
      event_id: "evt-1",
      idempotency_key: "idem-1",
      session_key: "session-1",
      source_ref: "agent_end:session-1",
      source_tier: "online_incremental",
      write_mode: "propose_only",
      effective_model: "gpt-5.1-codex-mini",
      status: "pending",
      mem0_status: "pending",
      graphiti_status: "pending",
      attempt_count: 0,
      next_retry_at: 1,
      last_error: null,
      created_at: "2026-02-24T00:00:00.000Z",
      updated_at: "2026-02-24T00:00:00.000Z",
      closed_at: null,
      payload: {
        candidate: {
          memory_id: "fact-1",
          fact_key: "decision.rollout",
          fact_value: "Adopt ontology v1 marker for write-side audit",
          ttl_class: "conversation",
          confidence: 0.91,
          status: "active",
          source_event_id: "source-1",
          detail_path: "memory/2026-02-24.md",
          trigger_keywords: [],
          active_context: true,
          event_time: "2026-02-24T00:00:00.000Z",
          ingest_time: "2026-02-24T00:00:00.000Z",
        },
        metadata: {
          userText: "为什么我们要做 ontology v1?",
          assistantText: "因为需要稳定可审计的决策检索信号。",
        },
      },
    },
    payload: {
      candidate: {
        memory_id: "fact-1",
        fact_key: "decision.rollout",
        fact_value: "Adopt ontology v1 marker for write-side audit",
        ttl_class: "conversation",
        confidence: 0.91,
        status: "active",
        source_event_id: "source-1",
        detail_path: "memory/2026-02-24.md",
        trigger_keywords: [],
        active_context: true,
        event_time: "2026-02-24T00:00:00.000Z",
        ingest_time: "2026-02-24T00:00:00.000Z",
      },
      metadata: {
        userText: "为什么我们要做 ontology v1?",
        assistantText: "因为需要稳定可审计的决策检索信号。",
      },
    },
  };
};

describe("p3 remote writer ontology marker", () => {
  it("keeps graphiti /messages body unchanged when ontology flag is disabled", async () => {
    let requestBody: Record<string, unknown> | null = null;
    let trace: GraphitiOntologyV1WriteTrace | null = null;
    const writer = createHttpBridgeWriter({
      source: "graphiti",
      baseUrl: "http://example.test",
      path: "/messages",
      timeoutMs: 500,
      ontologyV1: {
        enabled: false,
        sample_percent: 100,
        onTrace: (next) => {
          trace = next;
        },
      },
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return new Response(JSON.stringify({ id: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    await writer(baseInput());
    const messages = Array.isArray(requestBody?.messages)
      ? (requestBody?.messages as Array<Record<string, unknown>>)
      : [];

    expect(messages[1]?.content).toBe("因为需要稳定可审计的决策检索信号。");
    expect(trace).toEqual(
      expect.objectContaining({
        enabled: false,
        sampled: true,
        sample_percent: 100,
        active: false,
        degrade_reason: "flag_disabled",
      }),
    );
  });

  it("appends ontology marker when enabled, sampled, and decision tags are present", async () => {
    let requestBody: Record<string, unknown> | null = null;
    let trace: GraphitiOntologyV1WriteTrace | null = null;
    const input = baseInput();
    input.payload.metadata = {
      ...(input.payload.metadata ?? {}),
      tags: [
        "decision",
        "project:memory-bridge",
        "reason:retain auditable graph context",
        "rejected:skip ontology extraction",
      ],
    };

    const writer = createHttpBridgeWriter({
      source: "graphiti",
      baseUrl: "http://example.test",
      path: "/messages",
      timeoutMs: 500,
      ontologyV1: {
        enabled: true,
        sample_percent: 100,
        onTrace: (next) => {
          trace = next;
        },
      },
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return new Response(JSON.stringify({ id: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    await writer(input);
    const messages = Array.isArray(requestBody?.messages)
      ? (requestBody?.messages as Array<Record<string, unknown>>)
      : [];
    const content = String(messages[1]?.content ?? "");
    const markerLine = content.split("\n").find((line) => line.startsWith("OC_ONTOLOGY_V1:"));

    expect(markerLine).toBeTruthy();
    expect(trace).toEqual(
      expect.objectContaining({
        enabled: true,
        sampled: true,
        sample_percent: 100,
        active: true,
        degrade_reason: null,
      }),
    );
    expect(trace?.ontology_summary).toEqual(
      expect.objectContaining({
        decision_count: 1,
        project_count: 1,
        reason_count: 1,
        rejected_option_count: 1,
        relation_count: 3,
        has_rejected_options: true,
      }),
    );
  });

  it("degrades ontology marker on precision_key_bucket to protect W2 gate-2", async () => {
    let requestBody: Record<string, unknown> | null = null;
    let trace: GraphitiOntologyV1WriteTrace | null = null;
    const input = baseInput();
    input.payload.metadata = {
      ...(input.payload.metadata ?? {}),
      tags: [
        "decision",
        "precision_key_bucket",
        "project:memory-bridge",
        "reason:retain auditable graph context",
      ],
    };

    const writer = createHttpBridgeWriter({
      source: "graphiti",
      baseUrl: "http://example.test",
      path: "/messages",
      timeoutMs: 500,
      ontologyV1: {
        enabled: true,
        sample_percent: 100,
        onTrace: (next) => {
          trace = next;
        },
      },
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return new Response(JSON.stringify({ id: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    await writer(input);
    const messages = Array.isArray(requestBody?.messages)
      ? (requestBody?.messages as Array<Record<string, unknown>>)
      : [];

    expect(String(messages[1]?.content ?? "")).not.toContain("OC_ONTOLOGY_V1:");
    expect(trace).toEqual(
      expect.objectContaining({
        enabled: true,
        sampled: true,
        sample_percent: 100,
        active: false,
        degrade_reason: "precision_key_bucket",
      }),
    );
  });
});
