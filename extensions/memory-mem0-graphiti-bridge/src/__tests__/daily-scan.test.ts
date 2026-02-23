import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createInMemoryBackfillAuditStore,
  runDailyScan,
  type DailyScanCandidateSink,
} from "../p2/daily-scan.js";

const writeMemoryLog = async (params: {
  dir: string;
  date: string;
  content: string;
}): Promise<void> => {
  const memoryDir = path.join(params.dir, "memory");
  await mkdir(memoryDir, { recursive: true });
  await writeFile(path.join(memoryDir, `${params.date}.md`), params.content, "utf8");
};

describe("P2 daily scan", () => {
  it("supports --days + --dry-run and writes auditable results", async () => {
    const workspaceDir = await mkdtemp(path.join(tmpdir(), "bridge-p2-daily-scan-"));

    await writeMemoryLog({
      dir: workspaceDir,
      date: "2026-02-22",
      content: [
        "decision.locale: zh-CN [confidence=0.93]",
        "project.release_channel: beta",
        "ignored line without separator",
      ].join("\n"),
    });

    await writeMemoryLog({
      dir: workspaceDir,
      date: "2026-02-12",
      content: "decision.old_scope: deprecated",
    });

    const enqueued: string[] = [];
    const candidateSink: DailyScanCandidateSink = {
      async enqueue(candidates) {
        enqueued.push(...candidates.map((candidate) => candidate.fact_key));
      },
    };

    const auditStore = createInMemoryBackfillAuditStore();

    const result = await runDailyScan({
      workspaceDir,
      days: 3,
      dryRun: true,
      now: new Date("2026-02-23T10:00:00.000Z"),
      candidateSink,
      auditStore,
    });

    expect(result.scannedFiles).toHaveLength(1);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toEqual(
      expect.objectContaining({
        fact_key: "decision.locale",
        fact_value: "zh-CN",
        confidence: 0.93,
      }),
    );
    expect(result.audit.metrics.candidateCount).toBe(2);
    expect(result.audit.dryRun).toBe(true);
    expect(enqueued).toEqual([]);
    expect(auditStore.records).toHaveLength(1);
  });

  it("enqueues candidates when dry-run is disabled", async () => {
    const workspaceDir = await mkdtemp(path.join(tmpdir(), "bridge-p2-daily-scan-"));

    await writeMemoryLog({
      dir: workspaceDir,
      date: "2026-02-23",
      content: "decision.rollout: phase2 [confidence=0.82]",
    });

    await writeMemoryLog({
      dir: workspaceDir,
      date: "2026-02-22",
      content: "decision.rollout: phase1",
    });

    const enqueued: string[] = [];
    const candidateSink: DailyScanCandidateSink = {
      async enqueue(candidates) {
        enqueued.push(...candidates.map((candidate) => candidate.source_event_id));
      },
    };

    const result = await runDailyScan({
      workspaceDir,
      days: 1,
      dryRun: false,
      now: new Date("2026-02-23T10:00:00.000Z"),
      candidateSink,
      auditStore: createInMemoryBackfillAuditStore(),
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.fact_value).toBe("phase2");
    expect(enqueued).toEqual(["2026-02-23:1"]);
  });
});
