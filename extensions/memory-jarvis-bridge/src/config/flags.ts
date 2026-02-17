export type JarvisBridgeRoute = "local" | "jarvis";
export type JarvisBridgeReadMode = "local" | "remote";
export type JarvisBridgeWriteMode = "off" | "remote";

export type JarvisBridgeFlags = {
  plugin_load: boolean;
  default_route: JarvisBridgeRoute;
  read_mode: JarvisBridgeReadMode;
  write_mode: JarvisBridgeWriteMode;
  jarvis_base_url?: string;
  jarvis_api_key?: string;
  request_timeout_ms: number;
};

const DEFAULT_TIMEOUT_MS = 3000;

const DEFAULT_FLAGS: JarvisBridgeFlags = {
  plugin_load: true,
  default_route: "local",
  read_mode: "local",
  write_mode: "off",
  request_timeout_ms: DEFAULT_TIMEOUT_MS,
};

const ROUTES: JarvisBridgeRoute[] = ["local", "jarvis"];
const READ_MODES: JarvisBridgeReadMode[] = ["local", "remote"];
const WRITE_MODES: JarvisBridgeWriteMode[] = ["off", "remote"];

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const readEnum = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return fallback;
  }
  if (allowed.includes(normalized as T)) {
    return normalized as T;
  }
  return fallback;
};

const readTimeout = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TIMEOUT_MS;
  }
  const normalized = Math.floor(value);
  if (normalized < 100) {
    return 100;
  }
  if (normalized > 120_000) {
    return 120_000;
  }
  return normalized;
};

const readBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value !== "boolean") {
    return fallback;
  }
  return value;
};

export function resolveJarvisBridgeFlags(value: unknown): JarvisBridgeFlags {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const envBaseUrl = normalizeString(process.env.JARVIS_BASE_URL);
  const envApiKey = normalizeString(process.env.JARVIS_API_KEY);

  return {
    plugin_load: readBoolean(raw.plugin_load, DEFAULT_FLAGS.plugin_load),
    default_route: readEnum(raw.default_route, ROUTES, DEFAULT_FLAGS.default_route),
    read_mode: readEnum(raw.read_mode, READ_MODES, DEFAULT_FLAGS.read_mode),
    write_mode: readEnum(raw.write_mode, WRITE_MODES, DEFAULT_FLAGS.write_mode),
    jarvis_base_url: normalizeString(raw.jarvis_base_url) ?? envBaseUrl,
    jarvis_api_key: normalizeString(raw.jarvis_api_key) ?? envApiKey,
    request_timeout_ms: readTimeout(raw.request_timeout_ms),
  };
}

export const jarvisBridgeConfigSchema = {
  parse(value: unknown): JarvisBridgeFlags {
    return resolveJarvisBridgeFlags(value);
  },
  uiHints: {
    plugin_load: {
      label: "Plugin Load",
      help: "Enable/disable bridge registration without touching memory-core",
    },
    default_route: {
      label: "Default Route",
      help: "Default route for bridge mode; local keeps memory-core as source of truth",
    },
    read_mode: {
      label: "Read Mode",
      help: "local or remote reads",
    },
    write_mode: {
      label: "Write Mode",
      help: "off or remote writes",
    },
    jarvis_base_url: {
      label: "Jarvis Base URL",
      placeholder: "https://jarvis.example.com",
    },
    jarvis_api_key: {
      label: "Jarvis API Key",
      sensitive: true,
    },
  },
};
