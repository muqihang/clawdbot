import { GatewayIntents, GatewayPlugin } from "@buape/carbon/gateway";
import { HttpsProxyAgent } from "https-proxy-agent";
import WebSocket from "ws";
import type { DiscordAccountConfig } from "../../config/types.js";
import { danger } from "../../globals.js";
import type { RuntimeEnv } from "../../runtime.js";

function withSafeGatewayRegister(params: {
  plugin: GatewayPlugin;
  runtime: RuntimeEnv;
}): GatewayPlugin {
  const { plugin, runtime } = params;
  const originalRegisterClient = plugin.registerClient.bind(plugin);
  plugin.registerClient = async (
    client: Parameters<GatewayPlugin["registerClient"]>[0],
  ): Promise<void> => {
    try {
      await originalRegisterClient(client);
    } catch (err) {
      runtime.error?.(danger(`discord: failed to initialize gateway client: ${String(err)}`));
      try {
        // Fallback to direct gateway connect without requiring /gateway/bot preflight.
        plugin.connect(false);
      } catch (connectErr) {
        runtime.error?.(danger(`discord: fallback gateway connect failed: ${String(connectErr)}`));
      }
    }
  };
  return plugin;
}

export function resolveDiscordGatewayIntents(
  intentsConfig?: import("../../config/types.discord.js").DiscordIntentsConfig,
): number {
  let intents =
    GatewayIntents.Guilds |
    GatewayIntents.GuildMessages |
    GatewayIntents.MessageContent |
    GatewayIntents.DirectMessages |
    GatewayIntents.GuildMessageReactions |
    GatewayIntents.DirectMessageReactions |
    GatewayIntents.GuildVoiceStates;
  if (intentsConfig?.presence) {
    intents |= GatewayIntents.GuildPresences;
  }
  if (intentsConfig?.guildMembers) {
    intents |= GatewayIntents.GuildMembers;
  }
  return intents;
}

export function createDiscordGatewayPlugin(params: {
  discordConfig: DiscordAccountConfig;
  runtime: RuntimeEnv;
}): GatewayPlugin {
  const intents = resolveDiscordGatewayIntents(params.discordConfig?.intents);
  const proxy = params.discordConfig?.proxy?.trim();
  const options = {
    reconnect: { maxAttempts: 50 },
    intents,
    autoInteractions: true,
  };

  if (!proxy) {
    return withSafeGatewayRegister({ plugin: new GatewayPlugin(options), runtime: params.runtime });
  }

  try {
    const agent = new HttpsProxyAgent<string>(proxy);

    params.runtime.log?.("discord: gateway proxy enabled");

    class ProxyGatewayPlugin extends GatewayPlugin {
      constructor() {
        super(options);
      }

      createWebSocket(url: string) {
        return new WebSocket(url, { agent });
      }
    }

    return withSafeGatewayRegister({ plugin: new ProxyGatewayPlugin(), runtime: params.runtime });
  } catch (err) {
    params.runtime.error?.(danger(`discord: invalid gateway proxy: ${String(err)}`));
    return withSafeGatewayRegister({ plugin: new GatewayPlugin(options), runtime: params.runtime });
  }
}
