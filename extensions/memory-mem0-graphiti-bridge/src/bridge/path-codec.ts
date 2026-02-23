import type { BridgeRemoteSource } from "../client/mem0-client.js";

export type DecodedBridgePath = {
  source: BridgeRemoteSource;
  id: string;
};

const BRIDGE_PATH_PATTERN = /^bridge\/(mem0|graphiti)\/(.+)$/;

export function encodeBridgePath(source: BridgeRemoteSource, id: string): string {
  return `bridge/${source}/${id}`;
}

export function decodeBridgePath(path: string): DecodedBridgePath | null {
  const normalizedPath = path.trim();
  const match = BRIDGE_PATH_PATTERN.exec(normalizedPath);
  if (!match) {
    return null;
  }

  const source = match[1] as BridgeRemoteSource;
  const id = match[2]?.trim();
  if (!id) {
    return null;
  }

  return {
    source,
    id,
  };
}
