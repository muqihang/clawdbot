import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { createRemoteSnippetStore } from "../../../../../../extensions/memory-mem0-graphiti-bridge/src/bridge/remote-snippet-store.js";
import type { BridgeSearchHit } from "../../../../../../extensions/memory-mem0-graphiti-bridge/src/client/mem0-client.js";
import { resolveBridgeFlags } from "../../../../../../extensions/memory-mem0-graphiti-bridge/src/config/flags.js";
import { createBridgeMemorySearchTool } from "../../../../../../extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.js";

type ToolDetails = Record<string, unknown>;

const filePathFromUrl = (value: string): string => fileURLToPath(new URL(value));

const scriptDir = path.dirname(filePathFromUrl(import.meta.url));
const evidenceDir = path.resolve(scriptDir, "..");
const retrievalDir = path.join(evidenceDir, "retrieval");

const writeJson = async (targetPath: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const createLocalTool = (): AnyAgentTool => {
  return {
    name: "memory_search",
    label: "Memory Search",
    description: "local search tool",
    parameters: {},
    execute: async () => ({
      content: [],
      details: {
        results: [
          {
            path: "MEMORY.md",
            startLine: 1,
            endLine: 1,
            score: 0.9,
            snippet: "local snippet",
            source: "memory",
          },
        ],
        provider: "builtin",
        model: "builtin",
        citations: "auto",
      },
    }),
  };
};

const buildHit = (source: "mem0" | "graphiti", id: string): BridgeSearchHit => {
  return {
    path: `bridge/${source}/${id}`,
    startLine: 1,
    endLine: 1,
    score: 0.8,
    snippet: `${source} snippet ${id}`,
    source,
    remoteId: id,
  };
};

const runToolOnce = async (params: {
  query: string;
  sessionKey: string;
  fusionShadowEnabled: boolean;
}): Promise<ToolDetails> => {
  const flags = resolveBridgeFlags({
    read_mode: "shadow",
    cutover_percent: 0,
    read: {
      alias_normalization: false,
      fusion: {
        shadow_enabled: params.fusionShadowEnabled,
      },
    },
  });

  const localTool = createLocalTool();
  const mem0Search = async (): Promise<BridgeSearchHit[]> => [buildHit("mem0", "m-shadow")];
  const graphitiSearch = async (): Promise<BridgeSearchHit[]> => [buildHit("graphiti", "g-shadow")];

  const tool = createBridgeMemorySearchTool({
    flags,
    localTool,
    snippetStore: createRemoteSnippetStore({ ttlMs: 10_000 }),
    clients: {
      mem0: {
        search: mem0Search,
        getById: async () => null,
      },
      graphiti: {
        search: graphitiSearch,
        getById: async () => null,
      },
    },
    shadowReporter: {
      record: () => {},
    },
    sessionKey: params.sessionKey,
  });

  const result = await tool.execute("tool-call", { query: params.query });
  return (result.details as ToolDetails) ?? {};
};

const readTop1Path = (details: ToolDetails): string => {
  const results = details.results;
  if (!Array.isArray(results)) {
    return "";
  }
  const first = results[0] as Record<string, unknown> | undefined;
  return typeof first?.path === "string" ? first.path : "";
};

const boundedQueries = [
  "when did we migrate providers",
  "timeline migration history",
  "why did we choose graphiti architecture",
  "what preferences did we store",
  "how did we implement memory upgrade",
] as const;

const runBounded = async (): Promise<void> => {
  for (let index = 0; index < 5; index += 1) {
    const runId = String(index + 1).padStart(2, "0");
    const runDir = path.join(retrievalDir, `bounded-${runId}`);
    const query = boundedQueries[index] ?? boundedQueries[0];

    const baseline = await runToolOnce({
      query,
      sessionKey: `bounded-${runId}`,
      fusionShadowEnabled: false,
    });
    const variant = await runToolOnce({
      query,
      sessionKey: `bounded-${runId}`,
      fusionShadowEnabled: true,
    });

    await writeJson(path.join(runDir, "baseline.details.json"), baseline);
    await writeJson(path.join(runDir, "variant.details.json"), variant);
  }
};

const runStability = async (): Promise<{
  baselineTop1: string[];
  variantTop1: string[];
}> => {
  const baselineTop1: string[] = [];
  const variantTop1: string[] = [];

  for (let index = 0; index < 10; index += 1) {
    const runId = String(index + 1).padStart(2, "0");
    const runDir = path.join(retrievalDir, `stability-${runId}`);
    const query = "when did we migrate providers";

    const baseline = await runToolOnce({
      query,
      sessionKey: `stability-${runId}`,
      fusionShadowEnabled: false,
    });
    const variant = await runToolOnce({
      query,
      sessionKey: `stability-${runId}`,
      fusionShadowEnabled: true,
    });

    baselineTop1.push(readTop1Path(baseline));
    variantTop1.push(readTop1Path(variant));

    await writeJson(path.join(runDir, "baseline.details.json"), baseline);
    await writeJson(path.join(runDir, "variant.details.json"), variant);
  }

  return { baselineTop1, variantTop1 };
};

const main = async (): Promise<void> => {
  await mkdir(retrievalDir, { recursive: true });

  await runBounded();
  const stability = await runStability();

  const baselineUnique = new Set(stability.baselineTop1.filter(Boolean));
  const variantUnique = new Set(stability.variantTop1.filter(Boolean));
  const invariantTop1 =
    stability.baselineTop1.length === stability.variantTop1.length &&
    stability.baselineTop1.every((value, idx) => value === stability.variantTop1[idx]);

  const summary = {
    generated_at: new Date().toISOString(),
    bounded_runs: 5,
    stability_runs: 10,
    baseline: {
      top1_paths_unique: baselineUnique.size,
      top1_paths: stability.baselineTop1,
    },
    variant: {
      top1_paths_unique: variantUnique.size,
      top1_paths: stability.variantTop1,
    },
    invariant_top1: invariantTop1,
  };

  await writeJson(path.join(retrievalDir, "stability-summary.json"), summary);

  console.log(JSON.stringify(summary, null, 2));

  if (baselineUnique.size !== 1 || variantUnique.size !== 1 || !invariantTop1) {
    process.exitCode = 1;
  }
};

await main();
