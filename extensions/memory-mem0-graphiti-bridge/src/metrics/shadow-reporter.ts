import type { BridgeReadMode, BridgeRoute } from "../config/flags.js";

export type ShadowCompareRecord = {
  sessionKey?: string;
  query: string;
  readMode: BridgeReadMode;
  candidateRoute: BridgeRoute;
  localCount: number;
  remoteCount: number;
  timestamp: string;
  shadow_filters_criteria?: boolean;
};

export type ShadowReporter = {
  record(record: ShadowCompareRecord): void;
};

type ShadowReporterLogger = {
  info?: (message: string) => void;
};

export function createShadowReporter(logger?: ShadowReporterLogger): ShadowReporter {
  return {
    record(record) {
      if (!logger?.info) {
        return;
      }
      logger.info(
        [
          "memory-mem0-graphiti-bridge: shadow compare",
          `read_mode=${record.readMode}`,
          `candidate=${record.candidateRoute}`,
          `local=${record.localCount}`,
          `remote=${record.remoteCount}`,
        ].join(" "),
      );
    },
  };
}
