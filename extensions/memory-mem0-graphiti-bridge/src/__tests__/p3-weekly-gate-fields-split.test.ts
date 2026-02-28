import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveBridgeFlags } from "../config/flags.js";
import { registerMemoryBridgeP3Cli } from "../p3/manual-cli.js";
import { createP3OutboxStore } from "../p3/outbox-store.js";
import * as reporting from "../p3/reporting.js";

type WeeklyGateFields = Record<string, unknown>;

const REQUIRED_SPLIT_FIELDS = [
  "proposal_count",
  "canary_commit_count",
  "manual_propose_commit_count",
  "pending_review_count",
  "failed_count",
  "dead_count",
] as const;

const makeProgram = (params: { workspaceDir: string }) => {
  const program = new Command();
  program.exitOverride();

  const flags = resolveBridgeFlags({
    write_mode: "propose_only",
    p3: {
      admission_enabled: true,
      commit_canary_ratio: 0.5,
      model: "gpt-5.1-codex-mini",
    },
  });

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  registerMemoryBridgeP3Cli({
    program,
    workspaceDir: params.workspaceDir,
    logger,
    flags,
  });

  return program;
};

const readWeeklyGateFields = async (reportJsonPath: string): Promise<WeeklyGateFields> => {
  const raw = await readFile(reportJsonPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const weekly = parsed.weekly_gate_fields;
  if (!weekly || typeof weekly !== "object" || Array.isArray(weekly)) {
    throw new Error("weekly_gate_fields missing in report JSON");
  }
  return weekly as WeeklyGateFields;
};

const makeCandidatePayload = (id: string) => {
  return {
    candidate: {
      memory_id: `fact-${id}`,
      fact_key: "prefs.test",
      fact_value: `value-${id}`,
      ttl_class: "conversation",
      confidence: 0.91,
      status: "active",
      source_event_id: `evt-${id}`,
      detail_path: `memory/${id}.md`,
      trigger_keywords: [],
      active_context: true,
      event_time: "2026-02-27T00:00:00.000Z",
      ingest_time: "2026-02-27T00:00:00.000Z",
    },
  };
};

describe("P3 weekly_gate_fields split accounting", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "openclaw-p3-weekly-gate-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("outputs the 6 frozen split fields as numbers in report JSON", async () => {
    const program = makeProgram({ workspaceDir: tempDir });
    const dbPath = path.join(tempDir, "p3.sqlite");
    const reportJsonPath = path.join(tempDir, "report.json");
    const reportTextPath = path.join(tempDir, "report.txt");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await program.parseAsync([
      "node",
      "test",
      "memory-bridge-p3",
      "report",
      "--run-date",
      "2026-02-27",
      "--db-path",
      dbPath,
      "--report-json",
      reportJsonPath,
      "--report-text",
      reportTextPath,
      "--model",
      "gpt-5.1-codex-mini",
    ]);
    logSpy.mockRestore();

    const weekly = await readWeeklyGateFields(reportJsonPath);

    for (const field of REQUIRED_SPLIT_FIELDS) {
      expect(typeof weekly[field]).toBe("number");
      expect(Number.isFinite(weekly[field])).toBe(true);
    }
  });

  it("keeps proposal vs canonical split buckets isolated (no mixed semantics)", async () => {
    const now = 1_700_000_000_000;
    const dbPath = path.join(tempDir, "p3.sqlite");
    const outbox = createP3OutboxStore({
      dbPath,
      now: () => now,
    });

    const enqueue = (params: {
      id: string;
      writeMode: "propose_only" | "propose_commit";
      outboxStatus: "succeeded" | "failed" | "dead";
      proposalStatus: "committed" | "pending_review" | "proposed" | "failed";
    }) => {
      const payload = makeCandidatePayload(params.id);
      const result = outbox.enqueue({
        idempotencyKey: `session-test:${params.id}`,
        sessionKey: "session-test",
        sourceRef: `agent_end:${params.id}`,
        sourceTier: "online_incremental",
        writeMode: params.writeMode,
        effectiveModel: "gpt-5.1-codex-mini",
        payload,
      });

      outbox.upsertProposalState({
        eventId: result.eventId,
        sessionKey: "session-test",
        payload,
        status: params.proposalStatus,
      });

      const status =
        params.outboxStatus === "succeeded"
          ? {
              status: "succeeded" as const,
              closedAt: new Date(now).toISOString(),
              nextRetryAt: now,
              attemptCount: 1,
              lastError: null,
            }
          : params.outboxStatus === "failed"
            ? {
                status: "failed" as const,
                closedAt: null,
                nextRetryAt: now + 1000,
                attemptCount: 1,
                lastError: "write failed",
              }
            : {
                status: "dead" as const,
                closedAt: new Date(now).toISOString(),
                nextRetryAt: now,
                attemptCount: 5,
                lastError: "dead-lettered",
              };

      outbox.updateEvent({
        eventId: result.eventId,
        status: status.status,
        mem0Status: status.status === "succeeded" ? "succeeded" : "failed",
        graphitiStatus: status.status === "succeeded" ? "succeeded" : "failed",
        attemptCount: status.attemptCount,
        nextRetryAt: status.nextRetryAt,
        lastError: status.lastError,
        closedAt: status.closedAt,
      });

      if (params.outboxStatus === "dead") {
        outbox.moveToDeadLetter(result.eventId, "dead-lettered");
      }

      return result.eventId;
    };

    enqueue({
      id: "canary-committed",
      writeMode: "propose_only",
      outboxStatus: "succeeded",
      proposalStatus: "committed",
    });

    enqueue({
      id: "manual-committed",
      writeMode: "propose_commit",
      outboxStatus: "succeeded",
      proposalStatus: "committed",
    });

    // Succeeded remote writes but no canonical commit applied (should NOT count as commit).
    enqueue({
      id: "blocked-proposal",
      writeMode: "propose_commit",
      outboxStatus: "succeeded",
      proposalStatus: "proposed",
    });

    enqueue({
      id: "pending-review",
      writeMode: "propose_only",
      outboxStatus: "succeeded",
      proposalStatus: "pending_review",
    });

    enqueue({
      id: "retryable-failed",
      writeMode: "propose_only",
      outboxStatus: "failed",
      proposalStatus: "proposed",
    });

    enqueue({
      id: "dead-letter",
      writeMode: "propose_only",
      outboxStatus: "dead",
      proposalStatus: "failed",
    });

    outbox.close();

    const program = makeProgram({ workspaceDir: tempDir });
    const reportJsonPath = path.join(tempDir, "report.json");
    const reportTextPath = path.join(tempDir, "report.txt");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await program.parseAsync([
      "node",
      "test",
      "memory-bridge-p3",
      "report",
      "--run-date",
      "2026-02-27",
      "--db-path",
      dbPath,
      "--report-json",
      reportJsonPath,
      "--report-text",
      reportTextPath,
      "--model",
      "gpt-5.1-codex-mini",
    ]);
    logSpy.mockRestore();

    const weekly = await readWeeklyGateFields(reportJsonPath);

    expect(weekly.proposal_count).toBe(6);
    expect(weekly.pending_review_count).toBe(1);
    expect(weekly.failed_count).toBe(1);
    expect(weekly.dead_count).toBe(1);

    // Canonical commits must be split by write_mode:
    // - canary_commit_count: committed + propose_only
    // - manual_propose_commit_count: committed + propose_commit
    expect(weekly.canary_commit_count).toBe(1);
    expect(weekly.manual_propose_commit_count).toBe(1);
  });

  it("rejects weekly_gate_fields missing any frozen split field (Gate red line)", () => {
    const validator = (reporting as unknown as Record<string, unknown>)
      .validateP3WeeklyGateFieldsStrict;
    expect(typeof validator).toBe("function");
    if (typeof validator !== "function") {
      return;
    }

    const result = (validator as (value: unknown) => { ok: boolean; issues?: string[] })({
      proposal_count: 1,
      canary_commit_count: 0,
      // manual_propose_commit_count missing on purpose
      pending_review_count: 0,
      failed_count: 0,
      dead_count: 0,
      admission_enabled: true,
      commit_canary_ratio: 0.5,
      effective_write_mode: "propose_only",
    });

    expect(result.ok).toBe(false);
    expect(result.issues?.join(" ")).toContain("manual_propose_commit_count");
  });
});
