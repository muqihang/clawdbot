import { access, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { resolveBridgeFlags } from "../config/flags.js";
import { registerMemoryBridgeP3Cli } from "../p3/manual-cli.js";

describe.sequential("P3 manual CLI path resolution", () => {
  it("resolves explicit relative report outputs from cwd instead of workspaceDir", async () => {
    const originalCwd = process.cwd();
    const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "openclaw-p3-workspace-"));
    const runCwd = await mkdtemp(path.join(os.tmpdir(), "openclaw-p3-cwd-"));
    const dbDir = path.join(runCwd, ".openclaw");
    const reportJsonRelativePath = path.join("analysis", "day10", "hf4-report.json");
    const reportTextRelativePath = path.join("analysis", "day10", "hf4-report.txt");
    const expectedJsonPath = path.join(runCwd, reportJsonRelativePath);
    const unexpectedJsonPath = path.join(workspaceDir, reportJsonRelativePath);

    await mkdir(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, "memory-bridge-p3.sqlite");

    const command = new Command();
    command.name("test-cli");
    registerMemoryBridgeP3Cli({
      program: command,
      workspaceDir,
      flags: resolveBridgeFlags({}),
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
      },
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      process.chdir(runCwd);
      await command.parseAsync(
        [
          "memory-bridge-p3",
          "report",
          "--run-date",
          "2026-02-27",
          "--db-path",
          dbPath,
          "--report-json",
          reportJsonRelativePath,
          "--report-text",
          reportTextRelativePath,
        ],
        { from: "user" },
      );

      const reportJsonContent = await readFile(expectedJsonPath, "utf8");
      expect(reportJsonContent).toContain('"runDate": "2026-02-27"');
      await expect(access(unexpectedJsonPath)).rejects.toThrow();
    } finally {
      process.chdir(originalCwd);
      consoleSpy.mockRestore();
      await rm(runCwd, { recursive: true, force: true });
      await rm(workspaceDir, { recursive: true, force: true });
    }
  });

  it("resolves explicit relative retrieval-eval dataset and out paths from cwd", async () => {
    const originalCwd = process.cwd();
    const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "openclaw-p3-workspace-"));
    const runCwd = await mkdtemp(path.join(os.tmpdir(), "openclaw-p3-cwd-"));
    const datasetRelativePath = path.join("analysis", "day11", "retrieval-dataset.json");
    const outputRelativePath = path.join("analysis", "day11", "retrieval-eval.json");
    const expectedDatasetPath = path.join(runCwd, datasetRelativePath);
    const expectedOutputPath = path.join(runCwd, outputRelativePath);
    const unexpectedOutputPath = path.join(workspaceDir, outputRelativePath);

    await mkdir(path.dirname(expectedDatasetPath), { recursive: true });
    await writeFile(expectedDatasetPath, "[]\n", "utf8");

    const command = new Command();
    command.name("test-cli");
    registerMemoryBridgeP3Cli({
      program: command,
      workspaceDir,
      flags: resolveBridgeFlags({}),
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
      },
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      process.chdir(runCwd);
      await command.parseAsync(
        [
          "memory-bridge-p3",
          "retrieval-eval",
          "--dataset",
          datasetRelativePath,
          "--out",
          outputRelativePath,
        ],
        { from: "user" },
      );

      const outputContent = await readFile(expectedOutputPath, "utf8");
      const report = JSON.parse(outputContent) as Record<string, unknown>;
      expect(await realpath(String(report.dataset_path))).toBe(await realpath(expectedDatasetPath));
      expect(report.sample_size).toBe(0);
      await expect(access(unexpectedOutputPath)).rejects.toThrow();
    } finally {
      process.chdir(originalCwd);
      consoleSpy.mockRestore();
      await rm(runCwd, { recursive: true, force: true });
      await rm(workspaceDir, { recursive: true, force: true });
    }
  });

  it("uses graphiti local default base URL for retrieval-eval when flags and env are absent", async () => {
    const originalCwd = process.cwd();
    const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "openclaw-p3-workspace-"));
    const runCwd = await mkdtemp(path.join(os.tmpdir(), "openclaw-p3-cwd-"));
    const datasetRelativePath = path.join("analysis", "day11", "retrieval-dataset.json");
    const outputRelativePath = path.join("analysis", "day11", "retrieval-eval.graphiti.json");
    const expectedDatasetPath = path.join(runCwd, datasetRelativePath);

    await mkdir(path.dirname(expectedDatasetPath), { recursive: true });
    await writeFile(
      expectedDatasetPath,
      `${JSON.stringify([{ id: "s1", query: "graphiti query" }])}\n`,
      "utf8",
    );

    const previousMem0BaseUrl = process.env.MEM0_BASE_URL;
    const previousGraphitiBaseUrl = process.env.GRAPHITI_BASE_URL;
    delete process.env.MEM0_BASE_URL;
    delete process.env.GRAPHITI_BASE_URL;

    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ facts: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const command = new Command();
    command.name("test-cli");
    registerMemoryBridgeP3Cli({
      program: command,
      workspaceDir,
      flags: resolveBridgeFlags({}),
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
      },
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);

    try {
      process.chdir(runCwd);
      await command.parseAsync(
        [
          "memory-bridge-p3",
          "retrieval-eval",
          "--route",
          "graphiti",
          "--dataset",
          datasetRelativePath,
          "--out",
          outputRelativePath,
        ],
        { from: "user" },
      );

      expect(fetchMock).toHaveBeenCalled();
      expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8000/search");
    } finally {
      process.chdir(originalCwd);
      consoleSpy.mockRestore();
      vi.unstubAllGlobals();
      if (previousMem0BaseUrl === undefined) {
        delete process.env.MEM0_BASE_URL;
      } else {
        process.env.MEM0_BASE_URL = previousMem0BaseUrl;
      }
      if (previousGraphitiBaseUrl === undefined) {
        delete process.env.GRAPHITI_BASE_URL;
      } else {
        process.env.GRAPHITI_BASE_URL = previousGraphitiBaseUrl;
      }
      await rm(runCwd, { recursive: true, force: true });
      await rm(workspaceDir, { recursive: true, force: true });
    }
  });

  it("uses mem0 local default base URL for retrieval-eval when flags and env are absent", async () => {
    const originalCwd = process.cwd();
    const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "openclaw-p3-workspace-"));
    const runCwd = await mkdtemp(path.join(os.tmpdir(), "openclaw-p3-cwd-"));
    const datasetRelativePath = path.join("analysis", "day11", "retrieval-dataset.json");
    const outputRelativePath = path.join("analysis", "day11", "retrieval-eval.mem0.json");
    const expectedDatasetPath = path.join(runCwd, datasetRelativePath);

    await mkdir(path.dirname(expectedDatasetPath), { recursive: true });
    await writeFile(
      expectedDatasetPath,
      `${JSON.stringify([{ id: "s1", query: "mem0 query" }])}\n`,
      "utf8",
    );

    const previousMem0BaseUrl = process.env.MEM0_BASE_URL;
    const previousGraphitiBaseUrl = process.env.GRAPHITI_BASE_URL;
    delete process.env.MEM0_BASE_URL;
    delete process.env.GRAPHITI_BASE_URL;

    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const command = new Command();
    command.name("test-cli");
    registerMemoryBridgeP3Cli({
      program: command,
      workspaceDir,
      flags: resolveBridgeFlags({}),
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
      },
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);

    try {
      process.chdir(runCwd);
      await command.parseAsync(
        [
          "memory-bridge-p3",
          "retrieval-eval",
          "--route",
          "mem0",
          "--dataset",
          datasetRelativePath,
          "--out",
          outputRelativePath,
        ],
        { from: "user" },
      );

      expect(fetchMock).toHaveBeenCalled();
      expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8766/search");
    } finally {
      process.chdir(originalCwd);
      consoleSpy.mockRestore();
      vi.unstubAllGlobals();
      if (previousMem0BaseUrl === undefined) {
        delete process.env.MEM0_BASE_URL;
      } else {
        process.env.MEM0_BASE_URL = previousMem0BaseUrl;
      }
      if (previousGraphitiBaseUrl === undefined) {
        delete process.env.GRAPHITI_BASE_URL;
      } else {
        process.env.GRAPHITI_BASE_URL = previousGraphitiBaseUrl;
      }
      await rm(runCwd, { recursive: true, force: true });
      await rm(workspaceDir, { recursive: true, force: true });
    }
  });
});
