export type JarvisBridgeRoute = "local" | "jarvis";
export type JarvisBridgeReadMode = "local" | "shadow" | "primary" | "remote";
export type JarvisBridgeWriteMode = "off" | "remote" | "propose_only" | "propose_commit";

export type JarvisBridgeFlags = {
  plugin_load: boolean;
  default_route: JarvisBridgeRoute;
  read_mode: JarvisBridgeReadMode;
  backfill_enabled: boolean;
  cutover_percent: number;
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
  backfill_enabled: false,
  cutover_percent: 0,
  write_mode: "off",
  request_timeout_ms: DEFAULT_TIMEOUT_MS,
};

const ROUTES: JarvisBridgeRoute[] = ["local", "jarvis"];
const READ_MODES: JarvisBridgeReadMode[] = ["local", "shadow", "primary", "remote"];
const WRITE_MODES: JarvisBridgeWriteMode[] = ["off", "remote", "propose_only", "propose_commit"];

const readRawValue = (raw: Record<string, unknown>, keys: readonly string[]): unknown => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      return raw[key];
    }
  }
  return undefined;
};

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const readEnum = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => {
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
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    return DEFAULT_TIMEOUT_MS;
  }

  const normalized = Math.floor(numericValue);
  if (normalized < 100) {
    return 100;
  }
  if (normalized > 120_000) {
    return 120_000;
  }
  return normalized;
};

const readBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return fallback;
};

const readPercent = (value: unknown): number => {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    return DEFAULT_FLAGS.cutover_percent;
  }

  if (numericValue <= 0) {
    return 0;
  }

  if (numericValue >= 100) {
    return 100;
  }

  return Math.floor(numericValue);
};

export function resolveJarvisBridgeFlags(value: unknown): JarvisBridgeFlags {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const envBaseUrl = normalizeString(process.env.JARVIS_BASE_URL);
  const envApiKey = normalizeString(process.env.JARVIS_API_KEY);

  const pluginLoadValue = readRawValue(raw, ["plugin_load", "memory.jarvis.enabled"]);
  const readModeValue = readRawValue(raw, ["read_mode", "memory.jarvis.read_mode"]);
  const backfillEnabledValue = readRawValue(raw, [
    "backfill_enabled",
    "memory.jarvis.backfill.enabled",
  ]);
  const cutoverPercentValue = readRawValue(raw, [
    "cutover_percent",
    "memory.jarvis.cutover_percent",
  ]);
  const writeModeValue = readRawValue(raw, ["write_mode", "memory.jarvis.write_mode"]);
  const timeoutValue = readRawValue(raw, ["request_timeout_ms"]);

  return {
    plugin_load: readBoolean(pluginLoadValue, DEFAULT_FLAGS.plugin_load),
    default_route: readEnum(raw.default_route, ROUTES, DEFAULT_FLAGS.default_route),
    read_mode: readEnum(readModeValue, READ_MODES, DEFAULT_FLAGS.read_mode),
    backfill_enabled: readBoolean(backfillEnabledValue, DEFAULT_FLAGS.backfill_enabled),
    cutover_percent: readPercent(cutoverPercentValue),
    write_mode: readEnum(writeModeValue, WRITE_MODES, DEFAULT_FLAGS.write_mode),
    jarvis_base_url: normalizeString(raw.jarvis_base_url) ?? envBaseUrl,
    jarvis_api_key: normalizeString(raw.jarvis_api_key) ?? envApiKey,
    request_timeout_ms: readTimeout(timeoutValue),
  };
}

export function buildLocalRollbackFlags(flags: JarvisBridgeFlags): JarvisBridgeFlags {
  return {
    ...flags,
    read_mode: "local",
    cutover_percent: 0,
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
      help: "local/shadow/primary/remote reads",
    },
    backfill_enabled: {
      label: "Backfill Enabled",
      help: "Enable historical backfill ingestion window",
    },
    cutover_percent: {
      label: "Cutover Percent",
      help: "Sample percentage for primary canary routing (0-100)",
    },
    write_mode: {
      label: "Write Mode",
      help: "off/remote/propose_only/propose_commit writes",
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
