import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createRemoteSnippetStore } from "./src/bridge/remote-snippet-store.js";
import { createGraphitiClient } from "./src/client/graphiti-client.js";
import { createMem0Client } from "./src/client/mem0-client.js";
import { mem0GraphitiBridgeConfigSchema, resolveBridgeFlags } from "./src/config/flags.js";
import { createShadowReporter } from "./src/metrics/shadow-reporter.js";
import { registerMemoryBridgeP2Cli } from "./src/p2/manual-cli.js";
import { resolveReadPlan } from "./src/router/read-router.js";
import { createBridgeMemoryGetTool } from "./src/tools/memory-get-tool.js";
import { createBridgeMemorySearchTool } from "./src/tools/memory-search-tool.js";

const memoryMem0GraphitiBridgePlugin = {
  id: "memory-mem0-graphiti-bridge",
  name: "Memory (Mem0 + Graphiti Bridge)",
  description:
    "Phased memory bridge for mem0 + graphiti rollout. Phase1 keeps local-first behavior and enables optional primary/remote read routing.",
  kind: "memory" as const,
  configSchema: mem0GraphitiBridgeConfigSchema,

  register(api: OpenClawPluginApi) {
    const flags = resolveBridgeFlags(api.pluginConfig);
    const mem0Client = createMem0Client({
      baseUrl: flags.mem0.base_url,
      apiKey: flags.mem0.api_key,
      timeoutMs: flags.timeoutMs.search,
      getTimeoutMs: flags.timeoutMs.get,
      errorReporter: (error) => {
        api.logger.warn(
          `memory-mem0-graphiti-bridge: mem0 ${error.operation} degraded (${error.code}) ${error.message}`,
        );
      },
    });
    const graphitiClient = createGraphitiClient({
      baseUrl: flags.graphiti.base_url,
      apiKey: flags.graphiti.api_key,
      timeoutMs: flags.timeoutMs.search,
      getTimeoutMs: flags.timeoutMs.get,
      errorReporter: (error) => {
        api.logger.warn(
          `memory-mem0-graphiti-bridge: graphiti ${error.operation} degraded (${error.code}) ${error.message}`,
        );
      },
    });
    const snippetStore = createRemoteSnippetStore({
      ttlMs: 5 * 60 * 1000,
    });
    const shadowReporter = createShadowReporter(api.logger);

    if (!flags.plugin_load) {
      api.logger.info("memory-mem0-graphiti-bridge: plugin_load=false, skipping registration");
      return;
    }

    const readinessPlan = resolveReadPlan({
      readMode: flags.read_mode,
      cutoverPercent: flags.cutover_percent,
      query: "phase1-readiness-check",
      defaultRoute: flags.routing.default_route,
      timelineRoute: flags.routing.timeline_route,
      semanticRoute: flags.routing.semantic_route,
    });

    api.registerTool(
      (ctx) => {
        const localMemorySearchTool = api.runtime.tools.createMemorySearchTool({
          config: ctx.config,
          agentSessionKey: ctx.sessionKey,
        });
        const localMemoryGetTool = api.runtime.tools.createMemoryGetTool({
          config: ctx.config,
          agentSessionKey: ctx.sessionKey,
        });

        if (!localMemorySearchTool || !localMemoryGetTool) {
          return null;
        }

        const memorySearchTool = createBridgeMemorySearchTool({
          flags,
          localTool: localMemorySearchTool,
          snippetStore,
          clients: {
            mem0: mem0Client,
            graphiti: graphitiClient,
          },
          shadowReporter,
          sessionKey: ctx.sessionKey,
        });

        const memoryGetTool = createBridgeMemoryGetTool({
          localTool: localMemoryGetTool,
          snippetStore,
          clients: {
            mem0: mem0Client,
            graphiti: graphitiClient,
          },
        });

        return [memorySearchTool, memoryGetTool];
      },
      { names: ["memory_search", "memory_get"] },
    );

    api.registerCli(
      ({ program }) => {
        api.runtime.tools.registerMemoryCli(program);
      },
      { commands: ["memory"] },
    );

    api.registerCli(
      ({ program, workspaceDir, logger }) => {
        registerMemoryBridgeP2Cli({
          program,
          workspaceDir,
          logger,
        });
      },
      { commands: ["memory-bridge-p2"] },
    );

    api.logger.info(
      `memory-mem0-graphiti-bridge: Phase1 local-first active (read_mode=${flags.read_mode}, candidate=${readinessPlan.candidateRoute}, user_route=${readinessPlan.userRoute})`,
    );
  },
};

export default memoryMem0GraphitiBridgePlugin;
