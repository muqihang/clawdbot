import { RequestClient } from "@buape/carbon";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { loadConfig } from "../config/config.js";
import { createDiscordRetryRunner, type RetryRunner } from "../infra/retry-policy.js";
import type { RetryConfig } from "../infra/retry.js";
import { resolveDiscordAccount } from "./accounts.js";
import { normalizeDiscordToken } from "./token.js";

let discordProxyFetchInstalled = false;
let discordProxyUrlInstalled: string | null = null;
let discordProxyAgent: ProxyAgent | null = null;
let discordOriginalFetch: typeof fetch | null = null;

function shouldProxyDiscordRequest(input: RequestInfo | URL): boolean {
  try {
    const url =
      typeof input === "string"
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url);
    return url.hostname === "discord.com" || url.hostname.endsWith(".discord.com");
  } catch {
    return false;
  }
}

function installDiscordProxyFetch(proxyUrl: string | undefined) {
  const proxy = proxyUrl?.trim();
  if (!proxy) {
    return;
  }
  if (discordProxyFetchInstalled && discordProxyUrlInstalled === proxy) {
    return;
  }
  if (typeof globalThis.fetch !== "function") {
    return;
  }

  try {
    discordProxyAgent = new ProxyAgent(proxy);
  } catch {
    return;
  }

  if (!discordOriginalFetch) {
    discordOriginalFetch = globalThis.fetch.bind(globalThis);
  }

  const baseFetch = discordOriginalFetch;
  const agent = discordProxyAgent;

  const wrapped = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (agent && shouldProxyDiscordRequest(input)) {
      return undiciFetch(input as string | URL, {
        ...(init as Record<string, unknown>),
        dispatcher: agent,
      }) as unknown as Promise<Response>;
    }
    return baseFetch(input, init);
  }) as typeof fetch;

  globalThis.fetch = wrapped;
  discordProxyFetchInstalled = true;
  discordProxyUrlInstalled = proxy;
}

export type DiscordClientOpts = {
  token?: string;
  accountId?: string;
  rest?: RequestClient;
  timeoutMs?: number;
  retry?: RetryConfig;
  verbose?: boolean;
};

function resolveToken(params: { explicit?: string; accountId: string; fallbackToken?: string }) {
  const explicit = normalizeDiscordToken(params.explicit);
  if (explicit) {
    return explicit;
  }
  const fallback = normalizeDiscordToken(params.fallbackToken);
  if (!fallback) {
    throw new Error(
      `Discord bot token missing for account "${params.accountId}" (set discord.accounts.${params.accountId}.token or DISCORD_BOT_TOKEN for default).`,
    );
  }
  return fallback;
}

function resolveRest(token: string, rest?: RequestClient, timeoutMs?: number) {
  if (rest) {
    return rest;
  }
  const timeout = typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : undefined;
  return new RequestClient(token, timeout ? { timeout } : undefined);
}

export function createDiscordRestClient(opts: DiscordClientOpts, cfg = loadConfig()) {
  const account = resolveDiscordAccount({ cfg, accountId: opts.accountId });
  installDiscordProxyFetch(account.config.proxy);
  const token = resolveToken({
    explicit: opts.token,
    accountId: account.accountId,
    fallbackToken: account.token,
  });
  const rest = resolveRest(token, opts.rest, opts.timeoutMs);
  return { token, rest, account };
}

export function createDiscordClient(
  opts: DiscordClientOpts,
  cfg = loadConfig(),
): { token: string; rest: RequestClient; request: RetryRunner } {
  const { token, rest, account } = createDiscordRestClient(opts, cfg);
  const request = createDiscordRetryRunner({
    retry: opts.retry,
    configRetry: account.config.retry,
    verbose: opts.verbose,
  });
  return { token, rest, request };
}

export function resolveDiscordRest(opts: DiscordClientOpts) {
  return createDiscordRestClient(opts).rest;
}
