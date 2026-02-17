import type { JarvisBridgeFlags } from "../config/flags.js";

type FetchLike = typeof fetch;

export type JarvisClient = {
  canReadRemote(): boolean;
  canWriteRemote(): boolean;
  read(query: string): Promise<unknown[] | null>;
  write(payload: unknown): Promise<boolean>;
};

type CreateJarvisClientOptions = {
  fetchImpl?: FetchLike;
};

const buildHeaders = (flags: JarvisBridgeFlags): Record<string, string> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (flags.jarvis_api_key) {
    headers.Authorization = `Bearer ${flags.jarvis_api_key}`;
  }
  return headers;
};

const trimRightSlash = (value: string): string => value.replace(/\/$/, "");

export function createJarvisClient(
  flags: JarvisBridgeFlags,
  options: CreateJarvisClientOptions = {},
): JarvisClient {
  const baseUrl = flags.jarvis_base_url ? trimRightSlash(flags.jarvis_base_url) : undefined;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  const canReadRemote = (): boolean => flags.read_mode === "remote" && Boolean(baseUrl);
  const canWriteRemote = (): boolean => flags.write_mode === "remote" && Boolean(baseUrl);

  return {
    canReadRemote,
    canWriteRemote,
    async read(query: string): Promise<unknown[] | null> {
      if (!canReadRemote() || !baseUrl) {
        return null;
      }

      const response = await fetchImpl(`${baseUrl}/memory/read`, {
        method: "POST",
        headers: buildHeaders(flags),
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(flags.request_timeout_ms),
      });

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as { items?: unknown[] };
      return Array.isArray(payload.items) ? payload.items : [];
    },
    async write(payload: unknown): Promise<boolean> {
      if (!canWriteRemote() || !baseUrl) {
        return false;
      }

      const response = await fetchImpl(`${baseUrl}/memory/write`, {
        method: "POST",
        headers: buildHeaders(flags),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(flags.request_timeout_ms),
      });

      return response.ok;
    },
  };
}
