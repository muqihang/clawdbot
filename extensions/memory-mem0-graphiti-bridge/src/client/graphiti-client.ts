import {
  createRemoteClient,
  type CreateRemoteClientOptions,
  type RemoteMemoryClient,
} from "./mem0-client.js";

export type CreateGraphitiClientOptions = Omit<CreateRemoteClientOptions, "source">;

export function createGraphitiClient(options: CreateGraphitiClientOptions): RemoteMemoryClient {
  return createRemoteClient({
    source: "graphiti",
    searchPath: "/search",
    getPath: (id) => `/items/${encodeURIComponent(id)}`,
    ...options,
  });
}
