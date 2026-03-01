import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createRemoteSnippetStore } from "./src/bridge/remote-snippet-store.js";
import { createGraphitiClient } from "./src/client/graphiti-client.js";
import { createMem0Client } from "./src/client/mem0-client.js";
import { mem0GraphitiBridgeConfigSchema, resolveBridgeFlags } from "./src/config/flags.js";
import { createShadowReporter } from "./src/metrics/shadow-reporter.js";
import { registerMemoryBridgeP2Cli } from "./src/p2/manual-cli.js";
import { runIndexConsistencyCheck } from "./src/p3/index-check.js";
import { registerMemoryBridgeP3Cli } from "./src/p3/manual-cli.js";
import { createOnlineIncrementalCapture } from "./src/p3/online-capture.js";
import { createP3OutboxStore } from "./src/p3/outbox-store.js";
import { createHttpBridgeWriter } from "./src/p3/remote-writer.js";
import { createP3Worker } from "./src/p3/worker.js";
import { resolveReadPlan } from "./src/router/read-router.js";
import { createBridgeMemoryGetTool } from "./src/tools/memory-get-tool.js";
import { createBridgeMemorySearchTool } from "./src/tools/memory-search-tool.js";

const INDEX_CHECK_CACHE_TTL_MS = 60_000;

const createCachedIndexCheckProvider = (params: {
  workspaceDir: string;
  indexPath: string;
  logger: Pick<OpenClawPluginApi["logger"], "warn">;
  ttlMs?: number;
}) => {
  const ttlMs = params.ttlMs ?? INDEX_CHECK_CACHE_TTL_MS;
  let cacheExpiresAt = 0;
  let cachedValue = false;
  let inFlight: Promise<boolean> | null = null;

  return async (): Promise<boolean> => {
    const nowMs = Date.now();
    if (nowMs < cacheExpiresAt) {
      return cachedValue;
    }

    if (inFlight) {
      return inFlight;
    }

    inFlight = (async () => {
      try {
        const result = await runIndexConsistencyCheck({
          workspaceDir: params.workspaceDir,
          indexPath: params.indexPath,
        });
        cachedValue = result.ok;

        if (!result.ok) {
          const reason = result.failures[0] ?? "unknown";
          params.logger.warn(
            `memory-mem0-graphiti-bridge: index consistency check not ready: ${reason}`,
          );
        }
      } catch (error) {
        cachedValue = false;
        params.logger.warn(
          `memory-mem0-graphiti-bridge: index consistency check failed: ${String(error)}`,
        );
      }

      cacheExpiresAt = Date.now() + ttlMs;
      return cachedValue;
    })();

    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  };
};

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
    const resolvedOutboxDbPath = api.resolvePath(
      flags.outbox.db_path ?? ".openclaw/memory-bridge-p3.sqlite",
    );
    const shouldCaptureWrites = flags.write_mode !== "off";
    const shouldRunServiceWorker = flags.p3.auto_worker && shouldCaptureWrites;

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

    api.registerCli(
      ({ program, workspaceDir, logger }) => {
        registerMemoryBridgeP3Cli({
          program,
          workspaceDir,
          logger,
          flags,
        });
      },
      { commands: ["memory-bridge-p3"] },
    );

    if (shouldCaptureWrites) {
      const outbox = createP3OutboxStore({
        dbPath: resolvedOutboxDbPath,
      });
      const resolvedIndexPath = api.resolvePath("MEMORY.md");
      const indexCheckProvider = createCachedIndexCheckProvider({
        workspaceDir: path.dirname(resolvedIndexPath),
        indexPath: resolvedIndexPath,
        logger: api.logger,
      });
      const capture = createOnlineIncrementalCapture({
        writeMode: flags.write_mode,
        outbox,
        effectiveModel: flags.p3.model,
        messageEnvelope: {
          enabled: flags.p3.message_envelope.enabled,
          ignoreRoles: flags.p3.message_envelope.ignore_roles,
        },
        indexCheckProvider: async (_context) => indexCheckProvider(),
      });

      api.on("agent_end", async (event, ctx) => {
        await capture.onAgentEnd(event, {
          sessionKey: ctx.sessionKey,
        });
      });
    }

    if (shouldRunServiceWorker) {
      let timer: NodeJS.Timeout | null = null;
      let serviceOutbox: ReturnType<typeof createP3OutboxStore> | null = null;

      api.registerService({
        id: "memory-mem0-graphiti-bridge-p3-worker",
        start: () => {
          serviceOutbox = createP3OutboxStore({
            dbPath: resolvedOutboxDbPath,
          });

          const worker = createP3Worker({
            outbox: serviceOutbox,
            maxAttempts: flags.p3.max_attempts,
            baseBackoffMs: flags.p3.base_backoff_ms,
            maxBackoffMs: flags.p3.max_backoff_ms,
            jitterRatio: flags.p3.jitter_ratio,
            lowConfidenceThreshold: flags.p3.low_confidence_threshold,
            admissionEnabled: flags.p3.admission_enabled,
            commitCanaryRatio: flags.p3.commit_canary_ratio,
            commitRequireIndexCheck: flags.p3.commit_require_index_check,
            commitRequireNonSensitive: flags.p3.commit_require_non_sensitive,
            commitRequireDualWriteOk: flags.p3.commit_require_dual_write_ok,
            mem0Write: createHttpBridgeWriter({
              source: "mem0",
              baseUrl: flags.mem0.base_url,
              apiKey: flags.mem0.api_key,
              timeoutMs: flags.p3.write_timeout_ms,
              path: flags.p3.mem0_write_path,
            }),
            graphitiWrite: createHttpBridgeWriter({
              source: "graphiti",
              baseUrl: flags.graphiti.base_url,
              apiKey: flags.graphiti.api_key,
              timeoutMs: flags.p3.write_timeout_ms,
              path: flags.p3.graphiti_write_path,
              ontologyV1: {
                enabled: flags.p3.graphiti_ontology_v1.enabled,
                sample_percent: flags.p3.graphiti_ontology_v1.sample_percent,
              },
            }),
          });

          const run = () => {
            worker.processOnce().catch((error) => {
              api.logger.warn(
                `memory-mem0-graphiti-bridge: p3 worker tick failed: ${String(error)}`,
              );
            });
          };

          run();
          timer = setInterval(run, flags.p3.worker_interval_ms);
          timer.unref?.();
          api.logger.info(
            `memory-mem0-graphiti-bridge: p3 worker service started (interval=${String(flags.p3.worker_interval_ms)}ms, model=${flags.p3.model})`,
          );
        },
        stop: () => {
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
          serviceOutbox?.close();
          serviceOutbox = null;
          api.logger.info("memory-mem0-graphiti-bridge: p3 worker service stopped");
        },
      });
    }

    api.logger.info(
      `memory-mem0-graphiti-bridge: Phase1 local-first active (read_mode=${flags.read_mode}, write_mode=${flags.write_mode}, model=${flags.p3.model}, candidate=${readinessPlan.candidateRoute}, user_route=${readinessPlan.userRoute})`,
    );
  },
};

export default memoryMem0GraphitiBridgePlugin;
