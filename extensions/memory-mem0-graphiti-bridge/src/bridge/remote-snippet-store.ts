import type { BridgeSearchHit } from "../client/mem0-client.js";
import type { BridgeRemoteSource } from "../client/mem0-client.js";
import { decodeBridgePath } from "./path-codec.js";

export type CreateRemoteSnippetStoreOptions = {
  ttlMs: number;
  now?: () => number;
};

export type RemoteSnippetStore = {
  set(source: BridgeRemoteSource, id: string, snippet: string): void;
  setFromSearchHits(hits: BridgeSearchHit[]): void;
  get(source: BridgeRemoteSource, id: string): string | null;
  getByPath(path: string): string | null;
};

type SnippetRecord = {
  snippet: string;
  expiresAt: number;
};

const makeKey = (source: BridgeRemoteSource, id: string): string => `${source}:${id}`;

export function createRemoteSnippetStore(
  options: CreateRemoteSnippetStoreOptions,
): RemoteSnippetStore {
  const now = options.now ?? Date.now;
  const records = new Map<string, SnippetRecord>();

  const get = (source: BridgeRemoteSource, id: string): string | null => {
    const key = makeKey(source, id);
    const record = records.get(key);
    if (!record) {
      return null;
    }
    if (record.expiresAt <= now()) {
      records.delete(key);
      return null;
    }
    return record.snippet;
  };

  return {
    set(source, id, snippet) {
      if (!id) {
        return;
      }

      records.set(makeKey(source, id), {
        snippet,
        expiresAt: now() + options.ttlMs,
      });
    },

    setFromSearchHits(hits) {
      for (const hit of hits) {
        this.set(hit.source, hit.remoteId, hit.snippet);
      }
    },

    get,

    getByPath(path) {
      const decoded = decodeBridgePath(path);
      if (!decoded) {
        return null;
      }
      return get(decoded.source, decoded.id);
    },
  };
}
