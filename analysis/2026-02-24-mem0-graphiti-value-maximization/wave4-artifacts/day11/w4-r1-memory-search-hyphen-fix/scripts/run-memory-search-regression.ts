import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

type RegressionQuery = {
  id: string;
  query: string;
  expected_non_empty: boolean;
  note?: string;
};

type CliRunRecord = {
  ok: boolean;
  exit_code: number | null;
  command: string;
  stdout: string;
  stderr: string;
  parsed_json: unknown;
};

type ToolRunRecord = {
  ok: boolean;
  error: string | null;
  parsed: unknown;
};

type OneQueryRunRecord = {
  query_id: string;
  query: string;
  run_id: string;
  l1_cli: CliRunRecord;
  l1_local_tool: ToolRunRecord;
  l2_bridge: {
    read_mode_local: ToolRunRecord;
    read_mode_primary: ToolRunRecord;
  };
};

type SummaryRow = {
  query_id: string;
  query: string;
  expected_non_empty: boolean;

  l1_cli: {
    results_count: number;
    top1_path: string | null;
    provider: string | null;
    model: string | null;
    disabled: boolean;
    unavailable: boolean;
  };

  l1_local_tool: {
    results_count: number;
    top1_path: string | null;
    provider: string | null;
    model: string | null;
    disabled: boolean;
    unavailable: boolean;
  };

  l2_bridge_local: {
    results_count: number;
    top1_path: string | null;
    provider: string | null;
    model: string | null;
    disabled: boolean;
    unavailable: boolean;
  };

  l2_bridge_primary: {
    results_count: number;
    top1_path: string | null;
    provider: string | null;
    model: string | null;
    disabled: boolean;
    unavailable: boolean;
  };
};

const filePathFromUrl = (value: string): string => fileURLToPath(new URL(value));
const scriptDir = path.dirname(filePathFromUrl(import.meta.url));
const evidenceDir = path.resolve(scriptDir, "..");
const outDir = path.join(evidenceDir, "memory-search-regression");

const writeJson = async (targetPath: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const writeText = async (targetPath: string, value: string): Promise<void> => {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, value, "utf8");
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const toString = (value: unknown): string | null => {
  return typeof value === "string" ? value : null;
};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const readResultsCount = (payload: unknown): number => {
  const record = toRecord(payload);
  const results = asArray(record.results);
  return results.length;
};

const readTop1Path = (payload: unknown): string | null => {
  const record = toRecord(payload);
  const first = asArray(record.results)[0];
  return toString(toRecord(first).path);
};

const readProvider = (payload: unknown): string | null => {
  return toString(toRecord(payload).provider);
};

const readModel = (payload: unknown): string | null => {
  return toString(toRecord(payload).model);
};

const readDisabled = (payload: unknown): boolean => {
  return toRecord(payload).disabled === true;
};

const readUnavailable = (payload: unknown): boolean => {
  return toRecord(payload).unavailable === true;
};

const slugify = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  const replaced = trimmed.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return replaced.length > 0 ? replaced.slice(0, 80) : "query";
};

const runCliMemorySearch = async (query: string): Promise<CliRunRecord> => {
  const args = ["-s", "openclaw", "memory", "search", query, "--json"];
  const command = `pnpm ${args.map((item) => JSON.stringify(item)).join(" ")}`;

  return await new Promise((resolve) => {
    const child = spawn("pnpm", args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      resolve({
        ok: false,
        exit_code: null,
        command,
        stdout,
        stderr: `${stderr}${error instanceof Error ? error.message : String(error)}`,
        parsed_json: null,
      });
    });

    child.on("close", (code) => {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        parsed = null;
      }

      resolve({
        ok: code === 0 && parsed !== null,
        exit_code: typeof code === "number" ? code : null,
        command,
        stdout,
        stderr,
        parsed_json: parsed,
      });
    });
  });
};

const safeRunTool = async (
  tool: { execute: (id: string, params: unknown) => Promise<unknown> },
  query: string,
) => {
  try {
    const result = await tool.execute("regression-call", { query });
    return { ok: true, error: null, parsed: result } satisfies ToolRunRecord;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message, parsed: null } satisfies ToolRunRecord;
  }
};

const redactDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(redactDeep);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    const lowered = key.toLowerCase();
    if (
      lowered.includes("token") ||
      lowered.includes("api_key") ||
      lowered.includes("apikey") ||
      lowered.includes("secret") ||
      lowered.includes("password")
    ) {
      out[key] = val ? "<redacted>" : val;
      continue;
    }
    out[key] = redactDeep(val);
  }
  return out;
};

const QUERIES: RegressionQuery[] = [
  // A. Control (must be non-empty, otherwise tooling unusable)
  { id: "control-01", query: "muqihang", expected_non_empty: true },
  { id: "control-02", query: "documentation first freeze decision", expected_non_empty: true },

  // B. Hyphenated ID (hard gate: MUST be non-empty)
  { id: "hyphen-01", query: "DEC-2026-02-21-main-role-boundary", expected_non_empty: true },
  { id: "hyphen-02", query: "DEC-2026-02-22-documentation-first-freeze", expected_non_empty: true },

  // C. Whitespace control (attribution only; allow empty, but must persist)
  { id: "space-01", query: "DEC 2026 02 21 main role boundary", expected_non_empty: false },
  { id: "space-02", query: "DEC 2026 02 22 documentation first freeze", expected_non_empty: false },
];

const main = async (): Promise<void> => {
  await mkdir(outDir, { recursive: true });

  // --- env snapshot (redacted)
  const repoRoot = process.cwd();
  const require = createRequire(import.meta.url);
  const jitiFactory = require("jiti") as (
    filename: string,
    opts?: { interopDefault?: boolean; esmResolve?: boolean },
  ) => (id: string) => unknown;
  const jiti = jitiFactory(filePathFromUrl(import.meta.url), {
    interopDefault: true,
    esmResolve: true,
  });

  const configModule = jiti(path.join(repoRoot, "src/config/io.ts")) as {
    loadConfig: () => unknown;
  };
  const flagsModule = jiti(
    path.join(repoRoot, "extensions/memory-mem0-graphiti-bridge/src/config/flags.ts"),
  ) as { resolveBridgeFlags: (raw: unknown) => unknown };
  const toolModule = jiti(
    path.join(repoRoot, "extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts"),
  ) as {
    createBridgeMemorySearchTool: (deps: unknown) => {
      execute: (toolCallId: string, params: unknown) => Promise<{ details?: unknown }>;
    };
  };
  const remoteStoreModule = jiti(
    path.join(
      repoRoot,
      "extensions/memory-mem0-graphiti-bridge/src/bridge/remote-snippet-store.ts",
    ),
  ) as {
    createRemoteSnippetStore: (opts: { ttlMs: number }) => unknown;
  };
  const mem0ClientModule = jiti(
    path.join(repoRoot, "extensions/memory-mem0-graphiti-bridge/src/client/mem0-client.ts"),
  ) as { createMem0Client: (opts: unknown) => unknown };
  const graphitiClientModule = jiti(
    path.join(repoRoot, "extensions/memory-mem0-graphiti-bridge/src/client/graphiti-client.ts"),
  ) as { createGraphitiClient: (opts: unknown) => unknown };
  const localMemoryToolModule = jiti(path.join(repoRoot, "src/agents/tools/memory-tool.ts")) as {
    createMemorySearchTool: (opts: {
      config?: unknown;
      agentSessionKey?: string;
    }) => { execute: (toolCallId: string, params: unknown) => Promise<unknown> } | null;
  };

  const cfg = configModule.loadConfig();
  const pluginEntry =
    toRecord(cfg).plugins && toRecord(toRecord(cfg).plugins).entries
      ? toRecord(toRecord(toRecord(cfg).plugins).entries)["memory-mem0-graphiti-bridge"]
      : null;
  const pluginConfig = toRecord(pluginEntry).config ?? {};

  const baseFlags = flagsModule.resolveBridgeFlags(pluginConfig);

  const envSnapshot = {
    generated_at: new Date().toISOString(),
    repo_root: repoRoot,
    node: process.version,
    bun: process.env.BUN_VERSION ?? null,
    plugin_config_present: Boolean(pluginEntry),
    bridge_flags: redactDeep(baseFlags),
  };

  await writeJson(path.join(outDir, "env.json"), envSnapshot);
  await writeJson(path.join(outDir, "queries.json"), QUERIES);

  // --- build bridge tools (local + primary)
  const { createRemoteSnippetStore } = remoteStoreModule;
  const { createBridgeMemorySearchTool } = toolModule;
  const { createMem0Client } = mem0ClientModule;
  const { createGraphitiClient } = graphitiClientModule;
  const { createMemorySearchTool } = localMemoryToolModule;

  const sessionKey = "w4-d-gate4-memory-search-regression:direct";

  const localTool = createMemorySearchTool({ config: cfg, agentSessionKey: sessionKey });
  if (!localTool) {
    await writeText(
      path.join(outDir, "acceptance.md"),
      [
        "# memory_search regression acceptance",
        "",
        "- result: FAIL (local memory_search tool unavailable via createMemorySearchTool)",
      ].join("\n"),
    );
    process.exitCode = 2;
    return;
  }

  const buildToolForReadMode = (readMode: "local" | "primary") => {
    const flagsRecord = toRecord(baseFlags);
    const flagsOverride = {
      ...flagsRecord,
      read_mode: readMode,
      cutover_percent: 100,
    };
    const resolved = flagsModule.resolveBridgeFlags(flagsOverride);

    const resolvedRecord = toRecord(resolved);
    const mem0 = createMem0Client({
      baseUrl: toString(toRecord(resolvedRecord.mem0).base_url) ?? "http://127.0.0.1:8766",
      apiKey: toString(toRecord(resolvedRecord.mem0).api_key) ?? undefined,
      timeoutMs: toRecord(resolvedRecord.timeoutMs).search ?? 3000,
      getTimeoutMs: toRecord(resolvedRecord.timeoutMs).get ?? 3000,
    });
    const graphiti = createGraphitiClient({
      baseUrl: toString(toRecord(resolvedRecord.graphiti).base_url) ?? "http://127.0.0.1:8000",
      apiKey: toString(toRecord(resolvedRecord.graphiti).api_key) ?? undefined,
      timeoutMs: toRecord(resolvedRecord.timeoutMs).search ?? 3000,
      getTimeoutMs: toRecord(resolvedRecord.timeoutMs).get ?? 3000,
    });

    return createBridgeMemorySearchTool({
      flags: resolved,
      localTool,
      snippetStore: createRemoteSnippetStore({ ttlMs: 60_000 }),
      clients: { mem0, graphiti },
      shadowReporter: { record: () => undefined },
      sessionKey,
    });
  };

  const bridgeLocal = buildToolForReadMode("local");
  const bridgePrimary = buildToolForReadMode("primary");

  // --- runs
  const allRunRecords: OneQueryRunRecord[] = [];

  for (let i = 1; i <= 3; i += 1) {
    const runId = `run-${String(i).padStart(2, "0")}`;
    const runDir = path.join(outDir, "runs", runId);
    await mkdir(runDir, { recursive: true });

    for (const q of QUERIES) {
      const slug = `${q.id}.${slugify(q.query)}`;

      const cli = await runCliMemorySearch(q.query);
      const localToolRun = await safeRunTool(localTool, q.query);
      const bridgeLocalRun = await safeRunTool(bridgeLocal, q.query);
      const bridgePrimaryRun = await safeRunTool(bridgePrimary, q.query);

      const record: OneQueryRunRecord = {
        query_id: q.id,
        query: q.query,
        run_id: runId,
        l1_cli: cli,
        l1_local_tool: localToolRun,
        l2_bridge: {
          read_mode_local: bridgeLocalRun,
          read_mode_primary: bridgePrimaryRun,
        },
      };

      allRunRecords.push(record);
      await writeJson(path.join(runDir, `${slug}.json`), record);
    }
  }

  // --- summarize using the *last* run (run-03) as canonical summary row
  const lastRunId = "run-03";
  const rows: SummaryRow[] = [];

  for (const q of QUERIES) {
    const last = allRunRecords.findLast((r) => r.query_id === q.id && r.run_id === lastRunId);
    const cliPayload = last?.l1_cli.parsed_json ?? null;
    const localToolPayload = last?.l1_local_tool.parsed ?? null;
    const bridgeLocalPayload = last?.l2_bridge.read_mode_local.parsed ?? null;
    const bridgePrimaryPayload = last?.l2_bridge.read_mode_primary.parsed ?? null;

    // Both tools return an outer envelope; we want `.details` when present.
    const cliDetails = cliPayload;
    const localToolDetails = toRecord(localToolPayload).details ?? localToolPayload;
    const bridgeLocalDetails = toRecord(bridgeLocalPayload).details ?? bridgeLocalPayload;
    const bridgePrimaryDetails = toRecord(bridgePrimaryPayload).details ?? bridgePrimaryPayload;

    rows.push({
      query_id: q.id,
      query: q.query,
      expected_non_empty: q.expected_non_empty,
      l1_cli: {
        results_count: readResultsCount(cliDetails),
        top1_path: readTop1Path(cliDetails),
        provider: readProvider(cliDetails),
        model: readModel(cliDetails),
        disabled: readDisabled(cliDetails),
        unavailable: readUnavailable(cliDetails),
      },
      l1_local_tool: {
        results_count: readResultsCount(localToolDetails),
        top1_path: readTop1Path(localToolDetails),
        provider: readProvider(localToolDetails),
        model: readModel(localToolDetails),
        disabled: readDisabled(localToolDetails),
        unavailable: readUnavailable(localToolDetails),
      },
      l2_bridge_local: {
        results_count: readResultsCount(bridgeLocalDetails),
        top1_path: readTop1Path(bridgeLocalDetails),
        provider: readProvider(bridgeLocalDetails),
        model: readModel(bridgeLocalDetails),
        disabled: readDisabled(bridgeLocalDetails),
        unavailable: readUnavailable(bridgeLocalDetails),
      },
      l2_bridge_primary: {
        results_count: readResultsCount(bridgePrimaryDetails),
        top1_path: readTop1Path(bridgePrimaryDetails),
        provider: readProvider(bridgePrimaryDetails),
        model: readModel(bridgePrimaryDetails),
        disabled: readDisabled(bridgePrimaryDetails),
        unavailable: readUnavailable(bridgePrimaryDetails),
      },
    });
  }

  await writeJson(path.join(outDir, "summary.json"), {
    generated_at: new Date().toISOString(),
    last_run_id: lastRunId,
    rows,
  });

  // --- acceptance: hard-gate logic
  const rowById = new Map(rows.map((row) => [row.query_id, row]));

  const blockers: string[] = [];
  const diagnostics: string[] = [];
  const missing = (id: string): SummaryRow => {
    const row = rowById.get(id);
    if (!row) {
      throw new Error(`missing summary row: ${id}`);
    }
    return row;
  };

  for (const id of ["control-01", "control-02"]) {
    const row = missing(id);
    if (row.l1_local_tool.results_count <= 0) {
      blockers.push(`${id}: control query empty in L1 (local tool)`);
    }
    if (row.l2_bridge_primary.results_count <= 0) {
      blockers.push(`${id}: control query empty in L2 (bridge primary)`);
    }
    if (row.l1_cli.results_count <= 0) {
      diagnostics.push(
        `${id}: control query empty in CLI (expected if qmd scope denies session=<none>)`,
      );
    }
  }

  const hyphenPairs: Array<{ hyphenId: string; spaceId: string; label: string }> = [
    { hyphenId: "hyphen-01", spaceId: "space-01", label: "DEC-2026-02-21-main-role-boundary" },
    {
      hyphenId: "hyphen-02",
      spaceId: "space-02",
      label: "DEC-2026-02-22-documentation-first-freeze",
    },
  ];

  for (const pair of hyphenPairs) {
    const hyphenRow = missing(pair.hyphenId);
    const spaceRow = missing(pair.spaceId);

    const l1Hyphen = hyphenRow.l1_local_tool.results_count;
    const l1Space = spaceRow.l1_local_tool.results_count;
    const l2Hyphen = hyphenRow.l2_bridge_primary.results_count;
    const l2Space = spaceRow.l2_bridge_primary.results_count;

    if (l1Hyphen <= 0 && l1Space > 0) {
      blockers.push(
        `${pair.hyphenId}: L1 hyphen=0 but space>0 (tokenization/normalization regression suspected)`,
      );
    }

    if (l1Hyphen > 0 && l2Hyphen <= 0) {
      blockers.push(
        `${pair.hyphenId}: L1 hyphen>0 but L2 primary hyphen=0 (routing/bridge regression suspected)`,
      );
    }

    // Hard gate: hyphenated must be non-empty in L2 primary at minimum.
    if (l2Hyphen <= 0) {
      blockers.push(`${pair.hyphenId}: hard gate violated (L2 primary hyphen results_count=0)`);
    }

    // Attribution note only (not a blocker by itself)
    if (l2Hyphen <= 0 && l2Space > 0) {
      blockers.push(
        `${pair.hyphenId}: L2 primary hyphen=0 but space>0 (bridge-level tokenization suspected)`,
      );
    }
  }

  const pass = blockers.length === 0;
  const acceptanceText = [
    "# memory_search regression acceptance",
    "",
    `- result: ${pass ? "PASS" : "FAIL"}`,
    `- last_run_id: ${lastRunId}`,
    "",
    "## Blockers",
    ...(blockers.length > 0 ? blockers.map((b) => `- ${b}`) : ["- (none)"]),
    "",
    "## Diagnostics",
    ...(diagnostics.length > 0 ? diagnostics.map((d) => `- ${d}`) : ["- (none)"]),
    "",
    "## Evidence",
    `- summary: ${path.join(outDir, "summary.json")}`,
    `- runs: ${path.join(outDir, "runs")}`,
    `- queries: ${path.join(outDir, "queries.json")}`,
    `- env: ${path.join(outDir, "env.json")}`,
    "",
  ].join("\n");

  await writeText(path.join(outDir, "acceptance.md"), acceptanceText);

  if (!pass) {
    process.exitCode = 1;
  }
};

await main();
process.exit(typeof process.exitCode === "number" ? process.exitCode : 0);
