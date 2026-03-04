import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRemoteEmbeddingVectors } from "./embeddings-remote-fetch.js";
import { createRemoteEmbeddingProvider } from "./embeddings-remote-provider.js";

vi.mock("./embeddings-remote-fetch.js", () => ({
  fetchRemoteEmbeddingVectors: vi.fn(async () => [[1, 2, 3]]),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("createRemoteEmbeddingProvider", () => {
  it("adds dimensions=1536 for text-embedding-v4", async () => {
    const provider = createRemoteEmbeddingProvider({
      id: "openai",
      client: {
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        headers: { Authorization: "Bearer test" },
        model: "text-embedding-v4",
      },
      errorPrefix: "remote embeddings",
    });

    await provider.embedQuery("ping");

    expect(fetchRemoteEmbeddingVectors).toHaveBeenCalledTimes(1);
    const call = vi.mocked(fetchRemoteEmbeddingVectors).mock.calls[0];
    expect(call?.[0]).toMatchObject({
      body: {
        model: "text-embedding-v4",
        input: ["ping"],
        dimensions: 1536,
      },
    });
  });

  it("does not force dimensions for non-v4 models", async () => {
    const provider = createRemoteEmbeddingProvider({
      id: "openai",
      client: {
        baseUrl: "https://api.openai.com/v1",
        headers: { Authorization: "Bearer test" },
        model: "text-embedding-3-small",
      },
      errorPrefix: "remote embeddings",
    });

    await provider.embedQuery("ping");

    expect(fetchRemoteEmbeddingVectors).toHaveBeenCalledTimes(1);
    const call = vi.mocked(fetchRemoteEmbeddingVectors).mock.calls[0];
    expect(call?.[0]).toMatchObject({
      body: {
        model: "text-embedding-3-small",
        input: ["ping"],
      },
    });
    expect(call?.[0]?.body).not.toHaveProperty("dimensions");
  });
});
