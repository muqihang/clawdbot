import { ProxyAgent, fetch as undiciFetch } from "undici";

let installed = false;
let installedProxy: string | null = null;
let agent: ProxyAgent | null = null;
let originalFetch: typeof fetch | null = null;

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

export function installDiscordProxyFetch(proxyUrl: string | undefined) {
  const proxy = proxyUrl?.trim();
  if (!proxy) {
    return;
  }
  if (installed && installedProxy === proxy) {
    return;
  }
  if (typeof globalThis.fetch !== "function") {
    return;
  }

  try {
    agent = new ProxyAgent(proxy);
  } catch {
    return;
  }

  if (!originalFetch) {
    originalFetch = globalThis.fetch.bind(globalThis);
  }
  const baseFetch = originalFetch;
  const proxyAgent = agent;

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (proxyAgent && shouldProxyDiscordRequest(input)) {
      return undiciFetch(input as string | URL, {
        ...(init as Record<string, unknown>),
        dispatcher: proxyAgent,
      }) as unknown as Promise<Response>;
    }
    return baseFetch(input, init);
  }) as typeof fetch;

  installed = true;
  installedProxy = proxy;
}
