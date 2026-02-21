import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createApprovalApiClient } from "./src/approval-api.js";
import { createJarvisClient } from "./src/client/jarvis-client.js";
import { jarvisBridgeConfigSchema, resolveJarvisBridgeFlags } from "./src/config/flags.js";
import { createMemoryCommitGate, mapBridgeWriteMode } from "./src/memory-commit-gate.js";

const MEMORY_COMMIT_ROUTE_PATTERN = /^\/v0\/memory\/proposals\/([^/]+)\/commit$/;

const readJsonBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw) as unknown;
};

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown): void => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
};

const memoryJarvisBridgePlugin = {
  id: "memory-jarvis-bridge",
  name: "Memory (Jarvis Bridge)",
  description:
    "Compatibility-first memory bridge. Defaults to local memory-core route with remote write disabled.",
  kind: "memory" as const,
  configSchema: jarvisBridgeConfigSchema,

  register(api: OpenClawPluginApi) {
    const flags = resolveJarvisBridgeFlags(api.pluginConfig);
    const jarvisClient = createJarvisClient(flags);
    const approvalApi = createApprovalApiClient({
      baseUrl: flags.jarvis_base_url ?? "http://127.0.0.1:65535",
      apiKey: flags.jarvis_api_key,
      timeoutMs: flags.request_timeout_ms,
    });
    const commitGate = createMemoryCommitGate({
      approvalApi,
      writeMode: mapBridgeWriteMode(flags.write_mode),
    });

    if (!flags.plugin_load) {
      api.logger.info("memory-jarvis-bridge: plugin_load=false, skipping registration");
      return;
    }

    api.registerHttpHandler(async (req, res) => {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      const pathMatch = MEMORY_COMMIT_ROUTE_PATTERN.exec(pathname);
      if (!pathMatch) {
        return false;
      }

      if ((req.method ?? "GET").toUpperCase() !== "POST") {
        writeJson(res, 405, {
          error: {
            code: "METHOD_NOT_ALLOWED",
            message: "Only POST is allowed for memory proposal commit",
          },
        });
        return true;
      }

      let body: unknown;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        writeJson(res, 422, {
          error: {
            code: "VALIDATION_ERROR",
            message: error instanceof Error ? error.message : "invalid request body",
          },
        });
        return true;
      }

      const proposalId = decodeURIComponent(pathMatch[1] ?? "");
      const gateResult = await commitGate.handleCommitRequest({
        proposalId,
        body,
      });

      if (!gateResult.ok) {
        writeJson(res, 422, {
          error: gateResult.error,
        });
        return true;
      }

      const statusCode = gateResult.data.status === "committed" ? 200 : 202;
      writeJson(res, statusCode, {
        data: gateResult.data,
      });
      return true;
    });

    api.registerTool(
      (ctx) => {
        const memorySearchTool = api.runtime.tools.createMemorySearchTool({
          config: ctx.config,
          agentSessionKey: ctx.sessionKey,
        });
        const memoryGetTool = api.runtime.tools.createMemoryGetTool({
          config: ctx.config,
          agentSessionKey: ctx.sessionKey,
        });

        if (!memorySearchTool || !memoryGetTool) {
          return null;
        }

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

    if (jarvisClient.canReadRemote() || jarvisClient.canWriteRemote()) {
      api.logger.info(
        `memory-jarvis-bridge: remote ready (default_route=${flags.default_route}, read_mode=${flags.read_mode}, write_mode=${flags.write_mode})`,
      );
      return;
    }

    api.logger.info(
      "memory-jarvis-bridge: compatibility mode active (default_route=local, read_mode=local, write_mode=off)",
    );
  },
};

export default memoryJarvisBridgePlugin;
