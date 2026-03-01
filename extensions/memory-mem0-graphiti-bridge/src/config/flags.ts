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

export type BridgeReadFlags = {
  alias_normalization: boolean;
  precision_guard: {
    enabled: boolean;
  };
  mem0_filters_criteria_shadow: {
    enabled: boolean;
    sample_percent: number;
  };
  graphiti_recipe_routing: {
    enabled: boolean;
    sample_percent: number;
  };
  graphiti_focal_node: {
    enabled: boolean;
    sample_percent: number;
  };
  graphiti_temporal_filters: {
    enabled: boolean;
    sample_percent: number;
  };
};

type BridgeMessageEnvelopeRole = "user" | "assistant" | "system" | "tool";

export type BridgeP3MessageEnvelopeFlags = {
  enabled: boolean;
  ignore_roles: BridgeMessageEnvelopeRole[];
};

export type BridgeP3Flags = {
  model: string;
  max_attempts: number;
  base_backoff_ms: number;
  max_backoff_ms: number;
  jitter_ratio: number;
  low_confidence_threshold: number;
  write_timeout_ms: number;
  mem0_write_path: string;
  graphiti_write_path: string;
  worker_interval_ms: number;
  auto_worker: boolean;
  admission_enabled: boolean;
  commit_canary_ratio: number;
  commit_require_index_check: boolean;
  commit_require_non_sensitive: boolean;
  commit_require_dual_write_ok: boolean;
  message_envelope: BridgeP3MessageEnvelopeFlags;
  graphiti_ontology_v1: {
    enabled: boolean;
    sample_percent: number;
  };
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
  read: BridgeReadFlags;
  p3: BridgeP3Flags;
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
const MESSAGE_ENVELOPE_ROLES: BridgeMessageEnvelopeRole[] = ["user", "assistant", "system", "tool"];

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
  read: {
    alias_normalization: true,
    precision_guard: {
      enabled: false,
    },
    mem0_filters_criteria_shadow: {
      enabled: false,
      sample_percent: 0,
    },
    graphiti_recipe_routing: {
      enabled: false,
      sample_percent: 0,
    },
    graphiti_focal_node: {
      enabled: false,
      sample_percent: 0,
    },
    graphiti_temporal_filters: {
      enabled: false,
      sample_percent: 0,
    },
  },
  p3: {
    model: "gpt-5.1-codex-mini",
    max_attempts: 5,
    base_backoff_ms: 1000,
    max_backoff_ms: 300000,
    jitter_ratio: 0.15,
    low_confidence_threshold: 0.7,
    write_timeout_ms: 5000,
    mem0_write_path: "/memories",
    graphiti_write_path: "/messages",
    worker_interval_ms: 60000,
    auto_worker: false,
    admission_enabled: false,
    commit_canary_ratio: 0,
    commit_require_index_check: true,
    commit_require_non_sensitive: true,
    commit_require_dual_write_ok: true,
    message_envelope: {
      enabled: false,
      ignore_roles: [],
    },
    graphiti_ontology_v1: {
      enabled: false,
      sample_percent: 0,
    },
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

const normalizeGraphitiWritePath = (value: unknown): string | undefined => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return undefined;
  }

  return /^\/?items\/?$/i.test(normalized) ? "/messages" : normalized;
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

const readPercentWithFallback = (value: unknown, fallback: number): number => {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  if (numericValue <= 0) {
    return 0;
  }
  if (numericValue >= 100) {
    return 100;
  }
  return Math.floor(numericValue);
};

const readPositiveInt = (
  value: unknown,
  fallback: number,
  minimum = 1,
  maximum = 1_000_000,
): number => {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  const normalized = Math.floor(numericValue);
  if (normalized < minimum) {
    return minimum;
  }
  if (normalized > maximum) {
    return maximum;
  }
  return normalized;
};

const readRatio = (value: unknown, fallback: number): number => {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  if (numericValue <= 0) {
    return 0;
  }
  if (numericValue >= 1) {
    return 1;
  }
  return Math.round(numericValue * 1000) / 1000;
};

const readRemoteServiceFlags = (value: unknown): BridgeRemoteServiceFlags => {
  const raw = asRecord(value);
  return {
    base_url: normalizeString(raw.base_url),
    api_key: normalizeString(raw.api_key),
  };
};

const readMessageEnvelopeRoles = (
  value: unknown,
  fallback: BridgeMessageEnvelopeRole[],
): BridgeMessageEnvelopeRole[] => {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const deduped = new Set<BridgeMessageEnvelopeRole>();
  for (const item of value) {
    const normalized = normalizeString(item)?.toLowerCase();
    if (normalized && MESSAGE_ENVELOPE_ROLES.includes(normalized as BridgeMessageEnvelopeRole)) {
      deduped.add(normalized as BridgeMessageEnvelopeRole);
    }
  }

  return Array.from(deduped);
};

export function resolveBridgeFlags(value: unknown): BridgeFlags {
  const raw = asRecord(value);
  const routingRaw = asRecord(raw.routing);
  const timeoutRaw = asRecord(raw.timeoutMs);
  const outboxRaw = asRecord(raw.outbox);
  const readRaw = asRecord(raw.read);
  const precisionGuardRaw = asRecord(readRawValue(readRaw, ["precision_guard", "precisionGuard"]));
  const mem0FiltersCriteriaShadowRaw = asRecord(
    readRawValue(readRaw, ["mem0_filters_criteria_shadow", "mem0FiltersCriteriaShadow"]),
  );
  const graphitiRecipeRoutingRaw = asRecord(
    readRawValue(readRaw, ["graphiti_recipe_routing", "graphitiRecipeRouting"]),
  );
  const graphitiFocalNodeRaw = asRecord(
    readRawValue(readRaw, ["graphiti_focal_node", "graphitiFocalNode"]),
  );
  const graphitiTemporalFiltersRaw = asRecord(
    readRawValue(readRaw, ["graphiti_temporal_filters", "graphitiTemporalFilters"]),
  );
  const p3Raw = asRecord(raw.p3);
  const p3MessageEnvelopeRaw = asRecord(
    readRawValue(p3Raw, ["message_envelope", "messageEnvelope"]),
  );
  const p3GraphitiOntologyV1Raw = asRecord(
    readRawValue(p3Raw, ["graphiti_ontology_v1", "graphitiOntologyV1"]),
  );
  const localHierarchyRaw = asRecord(raw.localHierarchy);
  const contractRaw = asRecord(raw.contract);

  const envMem0BaseUrl = normalizeString(process.env.MEM0_BASE_URL);
  const envMem0ApiKey = normalizeString(process.env.MEM0_API_KEY);
  const envGraphitiBaseUrl = normalizeString(process.env.GRAPHITI_BASE_URL);
  const envGraphitiApiKey = normalizeString(process.env.GRAPHITI_API_KEY);
  const envP3Model = normalizeString(process.env.MEMORY_BRIDGE_P3_MODEL);

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
    read: {
      alias_normalization: readBoolean(
        readRawValue(readRaw, ["alias_normalization", "aliasNormalization"]),
        DEFAULT_FLAGS.read.alias_normalization,
      ),
      precision_guard: {
        enabled: readBoolean(precisionGuardRaw.enabled, DEFAULT_FLAGS.read.precision_guard.enabled),
      },
      mem0_filters_criteria_shadow: {
        enabled: readBoolean(
          mem0FiltersCriteriaShadowRaw.enabled,
          DEFAULT_FLAGS.read.mem0_filters_criteria_shadow.enabled,
        ),
        sample_percent: readPercentWithFallback(
          readRawValue(mem0FiltersCriteriaShadowRaw, ["sample_percent", "samplePercent"]),
          DEFAULT_FLAGS.read.mem0_filters_criteria_shadow.sample_percent,
        ),
      },
      graphiti_recipe_routing: {
        enabled: readBoolean(
          graphitiRecipeRoutingRaw.enabled,
          DEFAULT_FLAGS.read.graphiti_recipe_routing.enabled,
        ),
        sample_percent: readPercentWithFallback(
          readRawValue(graphitiRecipeRoutingRaw, ["sample_percent", "samplePercent"]),
          DEFAULT_FLAGS.read.graphiti_recipe_routing.sample_percent,
        ),
      },
      graphiti_focal_node: {
        enabled: readBoolean(
          graphitiFocalNodeRaw.enabled,
          DEFAULT_FLAGS.read.graphiti_focal_node.enabled,
        ),
        sample_percent: readPercentWithFallback(
          readRawValue(graphitiFocalNodeRaw, ["sample_percent", "samplePercent"]),
          DEFAULT_FLAGS.read.graphiti_focal_node.sample_percent,
        ),
      },
      graphiti_temporal_filters: {
        enabled: readBoolean(
          graphitiTemporalFiltersRaw.enabled,
          DEFAULT_FLAGS.read.graphiti_temporal_filters.enabled,
        ),
        sample_percent: readPercentWithFallback(
          readRawValue(graphitiTemporalFiltersRaw, ["sample_percent", "samplePercent"]),
          DEFAULT_FLAGS.read.graphiti_temporal_filters.sample_percent,
        ),
      },
    },
    p3: {
      model:
        normalizeString(readRawValue(p3Raw, ["model", "write_model", "writeModel"])) ??
        envP3Model ??
        DEFAULT_FLAGS.p3.model,
      max_attempts: readPositiveInt(
        readRawValue(p3Raw, ["max_attempts", "maxAttempts"]),
        DEFAULT_FLAGS.p3.max_attempts,
        1,
        50,
      ),
      base_backoff_ms: readTimeout(
        readRawValue(p3Raw, ["base_backoff_ms", "baseBackoffMs"]),
        DEFAULT_FLAGS.p3.base_backoff_ms,
      ),
      max_backoff_ms: readTimeout(
        readRawValue(p3Raw, ["max_backoff_ms", "maxBackoffMs"]),
        DEFAULT_FLAGS.p3.max_backoff_ms,
      ),
      jitter_ratio: readRatio(
        readRawValue(p3Raw, ["jitter_ratio", "jitterRatio"]),
        DEFAULT_FLAGS.p3.jitter_ratio,
      ),
      low_confidence_threshold: readRatio(
        readRawValue(p3Raw, ["low_confidence_threshold", "lowConfidenceThreshold"]),
        DEFAULT_FLAGS.p3.low_confidence_threshold,
      ),
      write_timeout_ms: readTimeout(
        readRawValue(p3Raw, ["write_timeout_ms", "writeTimeoutMs"]),
        DEFAULT_FLAGS.p3.write_timeout_ms,
      ),
      mem0_write_path:
        normalizeString(readRawValue(p3Raw, ["mem0_write_path", "mem0WritePath"])) ??
        DEFAULT_FLAGS.p3.mem0_write_path,
      graphiti_write_path:
        normalizeGraphitiWritePath(
          readRawValue(p3Raw, ["graphiti_write_path", "graphitiWritePath"]),
        ) ?? DEFAULT_FLAGS.p3.graphiti_write_path,
      worker_interval_ms: readTimeout(
        readRawValue(p3Raw, ["worker_interval_ms", "workerIntervalMs"]),
        DEFAULT_FLAGS.p3.worker_interval_ms,
      ),
      auto_worker: readBoolean(
        readRawValue(p3Raw, ["auto_worker", "autoWorker"]),
        DEFAULT_FLAGS.p3.auto_worker,
      ),
      admission_enabled: readBoolean(
        readRawValue(p3Raw, ["admission_enabled", "admissionEnabled"]),
        DEFAULT_FLAGS.p3.admission_enabled,
      ),
      commit_canary_ratio: readRatio(
        readRawValue(p3Raw, ["commit_canary_ratio", "commitCanaryRatio"]),
        DEFAULT_FLAGS.p3.commit_canary_ratio,
      ),
      commit_require_index_check: readBoolean(
        readRawValue(p3Raw, ["commit_require_index_check", "commitRequireIndexCheck"]),
        DEFAULT_FLAGS.p3.commit_require_index_check,
      ),
      commit_require_non_sensitive: readBoolean(
        readRawValue(p3Raw, ["commit_require_non_sensitive", "commitRequireNonSensitive"]),
        DEFAULT_FLAGS.p3.commit_require_non_sensitive,
      ),
      commit_require_dual_write_ok: readBoolean(
        readRawValue(p3Raw, ["commit_require_dual_write_ok", "commitRequireDualWriteOk"]),
        DEFAULT_FLAGS.p3.commit_require_dual_write_ok,
      ),
      message_envelope: {
        enabled: readBoolean(
          readRawValue(p3MessageEnvelopeRaw, ["enabled"]),
          DEFAULT_FLAGS.p3.message_envelope.enabled,
        ),
        ignore_roles: readMessageEnvelopeRoles(
          readRawValue(p3MessageEnvelopeRaw, ["ignore_roles", "ignoreRoles"]),
          DEFAULT_FLAGS.p3.message_envelope.ignore_roles,
        ),
      },
      graphiti_ontology_v1: {
        enabled: readBoolean(
          readRawValue(p3GraphitiOntologyV1Raw, ["enabled"]),
          DEFAULT_FLAGS.p3.graphiti_ontology_v1.enabled,
        ),
        sample_percent: readPercentWithFallback(
          readRawValue(p3GraphitiOntologyV1Raw, ["sample_percent", "samplePercent"]),
          DEFAULT_FLAGS.p3.graphiti_ontology_v1.sample_percent,
        ),
      },
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
    p3: {
      label: "P3 Governance",
      help: "P3 outbox/worker governance settings",
    },
  },
};
