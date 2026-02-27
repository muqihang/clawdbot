import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { decodeBridgePath } from "../bridge/path-codec.js";
import type { RemoteSnippetStore } from "../bridge/remote-snippet-store.js";
import type { RemoteMemoryClient } from "../client/mem0-client.js";

type BridgeGetToolDeps = {
  localTool: AnyAgentTool;
  snippetStore: RemoteSnippetStore;
  clients: {
    mem0: RemoteMemoryClient;
    graphiti: RemoteMemoryClient;
  };
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const readString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const readInteger = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const clampBridgeText = (params: { text: string; from?: number; lines?: number }): string => {
  if (params.from === undefined && params.lines === undefined) {
    return params.text;
  }

  const allLines = params.text.split(/\r?\n/);
  const startIndex = Math.max(0, (params.from ?? 1) - 1);
  const maxLines = params.lines && params.lines > 0 ? params.lines : allLines.length - startIndex;
  return allLines.slice(startIndex, startIndex + maxLines).join("\n");
};

const jsonResult = (payload: unknown): AgentToolResult<unknown> => {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    details: payload,
  };
};

export function createBridgeMemoryGetTool(deps: BridgeGetToolDeps): AnyAgentTool {
  return {
    ...deps.localTool,
    name: "memory_get",
    execute: async (toolCallId, params) => {
      if (!deps.localTool.execute) {
        throw new Error("memory_get local tool missing execute handler");
      }

      const raw = asRecord(params);
      const path = readString(raw?.path);
      if (!path) {
        return await deps.localTool.execute(toolCallId, params);
      }

      const decoded = decodeBridgePath(path);
      if (!decoded) {
        return await deps.localTool.execute(toolCallId, params);
      }

      const from = readInteger(raw?.from);
      const lines = readInteger(raw?.lines);

      const cachedSnippet = deps.snippetStore.get(decoded.source, decoded.id);
      if (cachedSnippet !== null) {
        return jsonResult({
          path,
          text: clampBridgeText({ text: cachedSnippet, from, lines }),
        });
      }

      const client = decoded.source === "mem0" ? deps.clients.mem0 : deps.clients.graphiti;
      const remoteRecord = await client.getById(decoded.id);
      const remoteText = remoteRecord?.text ?? "";
      if (remoteText) {
        deps.snippetStore.set(decoded.source, decoded.id, remoteText);
      }

      return jsonResult({
        path,
        text: clampBridgeText({ text: remoteText, from, lines }),
      });
    },
  };
}
