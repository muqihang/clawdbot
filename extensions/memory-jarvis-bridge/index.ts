import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createJarvisClient } from "./src/client/jarvis-client.js";
import { jarvisBridgeConfigSchema, resolveJarvisBridgeFlags } from "./src/config/flags.js";

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

    if (!flags.plugin_load) {
      api.logger.info("memory-jarvis-bridge: plugin_load=false, skipping registration");
      return;
    }

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
