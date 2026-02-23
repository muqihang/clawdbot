import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCheckpointStore } from "../p3/checkpoint-store.js";
import { runIndexConsistencyCheck } from "../p3/index-check.js";

describe("P3 checkpoint store", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "openclaw-p3-checkpoint-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("saves and restores checkpoints with default 4h ttl", () => {
    let now = Date.parse("2026-02-23T10:00:00.000Z");
    const store = createCheckpointStore({
      dbPath: path.join(tempDir, "p3.sqlite"),
      now: () => now,
    });

    store.save({
      taskId: "task-123",
      intent: "finish p3 rollout",
      state: { step: "worker-validation" },
      expectedOutcome: "all p3 probes green",
      workingFiles: [
        "extensions/memory-mem0-graphiti-bridge/index.ts",
        "extensions/memory-mem0-graphiti-bridge/src/p3/worker.ts",
      ],
    });

    const restored = store.restore({ taskId: "task-123" });
    expect(restored).toBeTruthy();
    expect(restored?.task_id).toBe("task-123");

    now += 4 * 60 * 60 * 1000 + 1;
    const expired = store.restore({ taskId: "task-123" });
    expect(expired).toBeNull();
  });
});

describe("P3 index consistency check", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "openclaw-p3-index-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("passes when MEMORY.md references exist and topic is derived_view", async () => {
    await mkdir(path.join(tempDir, "memory", "canonical"), { recursive: true });
    await mkdir(path.join(tempDir, "memory", "topics"), { recursive: true });

    await writeFile(
      path.join(tempDir, "MEMORY.md"),
      [
        "# Memory Index",
        "",
        "- [Canonical](memory/canonical/editor.md)",
        "- [Topics](memory/topics/editor.md)",
        "",
      ].join("\n"),
      "utf8",
    );

    await writeFile(
      path.join(tempDir, "memory", "canonical", "editor.md"),
      [
        "---",
        "memory_id: fact-editor-1",
        "source_event_id: evt-1",
        "status: active",
        "---",
        "",
        "fact: prefers vim",
        "",
      ].join("\n"),
      "utf8",
    );

    await writeFile(
      path.join(tempDir, "memory", "topics", "editor.md"),
      ["---", "derived_view: true", "authoritative: false", "---", "", "topic summary", ""].join(
        "\n",
      ),
      "utf8",
    );

    const result = await runIndexConsistencyCheck({ workspaceDir: tempDir });

    expect(result.ok).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.metrics.indexReferenceCount).toBe(2);
  });

  it("fails when topic file is authoritative or reference is missing", async () => {
    await mkdir(path.join(tempDir, "memory", "topics"), { recursive: true });

    await writeFile(
      path.join(tempDir, "MEMORY.md"),
      ["# Memory Index", "", "- [Missing](memory/canonical/missing.md)", ""].join("\n"),
      "utf8",
    );

    await writeFile(
      path.join(tempDir, "memory", "topics", "oops.md"),
      ["---", "derived_view: false", "authoritative: true", "---", ""].join("\n"),
      "utf8",
    );

    const result = await runIndexConsistencyCheck({ workspaceDir: tempDir });

    expect(result.ok).toBe(false);
    expect(result.failures.some((failure) => failure.includes("missing referenced file"))).toBe(
      true,
    );
    expect(
      result.failures.some((failure) => failure.includes("topic file must be derived_view")),
    ).toBe(true);
  });
});
