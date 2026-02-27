import { describe, expect, it } from "vitest";
import { resolveBridgeFlags } from "../config/flags.js";
import { resolveFactConflicts } from "../p2/conflict-resolver.js";
import type { BridgeFactRecord } from "../p2/types.js";
import { createSensitiveInterceptor } from "../p3/sensitive-interceptor.js";

const buildRecord = (overrides: Partial<BridgeFactRecord>): BridgeFactRecord => {
  return {
    memory_id: "fact-base",
    fact_key: "prefs.language",
    fact_value: "zh-CN",
    ttl_class: "conversation",
    confidence: 0.9,
    status: "active",
    source_event_id: "evt-base",
    detail_path: "memory/2026-02-23.md",
    trigger_keywords: [],
    active_context: true,
    event_time: "2026-02-23T00:00:00.000Z",
    ingest_time: "2026-02-23T00:00:00.000Z",
    ...overrides,
  };
};

describe("P3 governance", () => {
  it("creates supersede chain on high-confidence conflict", () => {
    const existing = buildRecord({
      memory_id: "fact-old",
      fact_key: "prefs.editor",
      fact_value: "vim",
      confidence: 0.95,
      ingest_time: "2026-02-23T00:00:00.000Z",
    });

    const candidate = buildRecord({
      memory_id: "fact-new",
      fact_key: "prefs.editor",
      fact_value: "zed",
      confidence: 0.92,
      ingest_time: "2026-02-24T00:00:00.000Z",
    });

    const resolved = resolveFactConflicts({
      existingRecords: [existing],
      candidates: [candidate],
      lowConfidenceThreshold: 0.7,
      now: new Date("2026-02-24T01:00:00.000Z"),
    });

    const oldRecord = resolved.records.find((entry) => entry.memory_id === "fact-old");
    const newRecord = resolved.records.find((entry) => entry.memory_id === "fact-new");

    expect(oldRecord?.status).toBe("superseded");
    expect(newRecord?.status).toBe("active");
    expect(newRecord?.supersedes_id).toBe("fact-old");
    expect(resolved.reviewQueue).toHaveLength(0);
  });

  it("marks low-confidence conflict as pending_review", () => {
    const existing = buildRecord({
      memory_id: "fact-old",
      fact_key: "prefs.editor",
      fact_value: "vim",
      confidence: 0.95,
      ingest_time: "2026-02-23T00:00:00.000Z",
    });

    const candidate = buildRecord({
      memory_id: "fact-new",
      fact_key: "prefs.editor",
      fact_value: "nano",
      confidence: 0.42,
      ingest_time: "2026-02-24T00:00:00.000Z",
    });

    const resolved = resolveFactConflicts({
      existingRecords: [existing],
      candidates: [candidate],
      lowConfidenceThreshold: 0.7,
      now: new Date("2026-02-24T01:00:00.000Z"),
    });

    const newRecord = resolved.records.find((entry) => entry.memory_id === "fact-new");

    expect(newRecord?.status).toBe("pending_review");
    expect(newRecord?.supersedes_id).toBe("fact-old");
    expect(resolved.reviewQueue).toHaveLength(1);
    expect(resolved.reviewQueue[0]?.reason).toBe("low_confidence_conflict");
  });
});

describe("P3 sensitive interceptor", () => {
  const interceptor = createSensitiveInterceptor();

  it("intercepts keyword/regex/high-entropy payloads", () => {
    expect(interceptor.inspect("my password is 123456").intercepted).toBe(true);
    expect(interceptor.inspect("ssn: 123-45-6789").intercepted).toBe(true);
    expect(
      interceptor.inspect("token=sk_live_4fA8x9KLmNoPqRsTuVwXyZ1234567890AbCdEfGhIj").intercepted,
    ).toBe(true);
  });

  it("allows normal preference text", () => {
    const decision = interceptor.inspect("I prefer dark mode and concise answers");
    expect(decision.intercepted).toBe(false);
  });
});

describe("P3 message envelope flags", () => {
  it("defaults to legacy-compatible message envelope off", () => {
    const flags = resolveBridgeFlags(undefined);
    const messageEnvelope = (
      flags.p3 as {
        message_envelope?: {
          enabled?: boolean;
          ignore_roles?: string[];
        };
      }
    ).message_envelope;

    expect(messageEnvelope).toEqual({
      enabled: false,
      ignore_roles: [],
    });
  });

  it("normalizes ignore_roles to valid deduplicated role list", () => {
    const flags = resolveBridgeFlags({
      p3: {
        message_envelope: {
          enabled: true,
          ignore_roles: ["assistant", " ASSISTANT ", "invalid", "tool"],
        },
      },
    });
    const messageEnvelope = (
      flags.p3 as {
        message_envelope?: {
          enabled?: boolean;
          ignore_roles?: string[];
        };
      }
    ).message_envelope;

    expect(messageEnvelope).toEqual({
      enabled: true,
      ignore_roles: ["assistant", "tool"],
    });
  });
});
