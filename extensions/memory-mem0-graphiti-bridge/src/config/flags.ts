export type BridgeRoute = "local" | "mem0" | "graphiti";
export type BridgeRemoteRoute = "mem0" | "graphiti";
export type BridgeReadMode = "local" | "shadow" | "primary" | "remote";
export type BridgeWriteMode = "off" | "propose_only" | "propose_commit";

export type BridgeRoutingFlags = {
  default_route: BridgeRoute;
  timeline_route: BridgeRemoteRoute;
  semantic_route: BridgeRemoteRoute;
  fallback_route: BridgeRoute;
};

export type BridgeTimeoutFlags = {
  search: number;
  get: number;
};

export type BridgeRemoteServiceFlags = {
  base_url?: string;
  api_key?: string;
};

export type BridgeOutboxFlags = {
  enabled: boolean;
  db_path?: string;
};

export type BridgeFlags = {
  plugin_load: boolean;
  read_mode: BridgeReadMode;
  write_mode: BridgeWriteMode;
  cutover_percent: number;
  request_timeout_ms: number;
  routing: BridgeRoutingFlags;
  timeoutMs: BridgeTimeoutFlags;
  mem0: BridgeRemoteServiceFlags;
  graphiti: BridgeRemoteServiceFlags;
  outbox: BridgeOutboxFlags;
  localHierarchy: {
    enabled: boolean;
  };
  contract: {
    enforce_compat: boolean;
  };
};

const ROUTES: BridgeRoute[] = ["local", "mem0", "graphiti"];
const REMOTE_ROUTES: BridgeRemoteRoute[] = ["mem0", "graphiti"];
const READ_MODES: BridgeReadMode[] = ["local", "shadow", "primary", "remote"];
const WRITE_MODES: BridgeWriteMode[] = ["off", "propose_only", "propose_commit"];

const DEFAULT_TIMEOUT_MS = 3000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 120_000;

const DEFAULT_FLAGS: BridgeFlags = {
  plugin_load: true,
  read_mode: "local",
  write_mode: "off",
  cutover_percent: 0,
  request_timeout_ms: DEFAULT_TIMEOUT_MS,
  routing: {
    default_route: "local",
    timeline_route: "graphiti",
    semantic_route: "mem0",
    fallback_route: "local",
  },
  timeoutMs: {
    search: DEFAULT_TIMEOUT_MS,
    get: DEFAULT_TIMEOUT_MS,
  },
  mem0: {},
  graphiti: {},
  outbox: {
    enabled: false,
  },
  localHierarchy: {
    enabled: true,
  },
  contract: {
    enforce_compat: true,
  },
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const readRawValue = (raw: Record<string, unknown>, keys: readonly string[]): unknown => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      return raw[key];
    }
  }
  return undefined;
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

const readTimeout = (value: unknown, fallback: number): number => {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  const normalized = Math.floor(numericValue);
  if (normalized < MIN_TIMEOUT_MS) {
    return MIN_TIMEOUT_MS;
  }
  if (normalized > MAX_TIMEOUT_MS) {
    return MAX_TIMEOUT_MS;
  }
  return normalized;
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

const readRemoteServiceFlags = (value: unknown): BridgeRemoteServiceFlags => {
  const raw = asRecord(value);
  return {
    base_url: normalizeString(raw.base_url),
    api_key: normalizeString(raw.api_key),
  };
};

export function resolveBridgeFlags(value: unknown): BridgeFlags {
  const raw = asRecord(value);
  const routingRaw = asRecord(raw.routing);
  const timeoutRaw = asRecord(raw.timeoutMs);
  const outboxRaw = asRecord(raw.outbox);
  const localHierarchyRaw = asRecord(raw.localHierarchy);
  const contractRaw = asRecord(raw.contract);

  const envMem0BaseUrl = normalizeString(process.env.MEM0_BASE_URL);
  const envMem0ApiKey = normalizeString(process.env.MEM0_API_KEY);
  const envGraphitiBaseUrl = normalizeString(process.env.GRAPHITI_BASE_URL);
  const envGraphitiApiKey = normalizeString(process.env.GRAPHITI_API_KEY);

  const mem0Config = readRemoteServiceFlags(raw.mem0);
  const graphitiConfig = readRemoteServiceFlags(raw.graphiti);

  return {
    plugin_load: readBoolean(
      readRawValue(raw, ["plugin_load", "pluginLoad"]),
      DEFAULT_FLAGS.plugin_load,
    ),
    read_mode: readEnum(
      readRawValue(raw, ["read_mode", "readMode"]),
      READ_MODES,
      DEFAULT_FLAGS.read_mode,
    ),
    write_mode: readEnum(
      readRawValue(raw, ["write_mode", "writeMode"]),
      WRITE_MODES,
      DEFAULT_FLAGS.write_mode,
    ),
    cutover_percent: readPercent(readRawValue(raw, ["cutover_percent", "cutoverPercent"])),
    request_timeout_ms: readTimeout(
      readRawValue(raw, ["request_timeout_ms", "requestTimeoutMs"]),
      DEFAULT_FLAGS.request_timeout_ms,
    ),
    routing: {
      default_route: readEnum(
        routingRaw.default_route,
        ROUTES,
        DEFAULT_FLAGS.routing.default_route,
      ),
      timeline_route: readEnum(
        readRawValue(routingRaw, ["timeline_route", "timelineRoute"]),
        REMOTE_ROUTES,
        DEFAULT_FLAGS.routing.timeline_route,
      ),
      semantic_route: readEnum(
        readRawValue(routingRaw, ["semantic_route", "semanticRoute"]),
        REMOTE_ROUTES,
        DEFAULT_FLAGS.routing.semantic_route,
      ),
      fallback_route: readEnum(
        readRawValue(routingRaw, ["fallback_route", "fallbackRoute"]),
        ROUTES,
        DEFAULT_FLAGS.routing.fallback_route,
      ),
    },
    timeoutMs: {
      search: readTimeout(readRawValue(timeoutRaw, ["search"]), DEFAULT_FLAGS.timeoutMs.search),
      get: readTimeout(readRawValue(timeoutRaw, ["get"]), DEFAULT_FLAGS.timeoutMs.get),
    },
    mem0: {
      base_url: mem0Config.base_url ?? envMem0BaseUrl,
      api_key: mem0Config.api_key ?? envMem0ApiKey,
    },
    graphiti: {
      base_url: graphitiConfig.base_url ?? envGraphitiBaseUrl,
      api_key: graphitiConfig.api_key ?? envGraphitiApiKey,
    },
    outbox: {
      enabled: readBoolean(outboxRaw.enabled, DEFAULT_FLAGS.outbox.enabled),
      db_path: normalizeString(readRawValue(outboxRaw, ["db_path", "dbPath"])),
    },
    localHierarchy: {
      enabled: readBoolean(localHierarchyRaw.enabled, DEFAULT_FLAGS.localHierarchy.enabled),
    },
    contract: {
      enforce_compat: readBoolean(
        contractRaw.enforce_compat,
        DEFAULT_FLAGS.contract.enforce_compat,
      ),
    },
  };
}

export const mem0GraphitiBridgeConfigSchema = {
  parse(value: unknown): BridgeFlags {
    return resolveBridgeFlags(value);
  },
  uiHints: {
    plugin_load: {
      label: "Plugin Load",
      help: "Enable/disable bridge registration without changing memory slot",
    },
    read_mode: {
      label: "Read Mode",
      help: "Requested read policy; Phase0 still enforces local-only user route",
    },
    write_mode: {
      label: "Write Mode",
      help: "off/propose_only/propose_commit writes",
    },
    cutover_percent: {
      label: "Cutover Percent",
      help: "Canary percentage for primary mode (0-100)",
    },
    request_timeout_ms: {
      label: "Request Timeout (ms)",
      help: "Remote timeout budget for later phases",
    },
  },
};
