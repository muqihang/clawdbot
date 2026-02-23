import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeBridgePath, encodeBridgePath } from "../bridge/path-codec.js";
import { createRemoteSnippetStore } from "../bridge/remote-snippet-store.js";

describe("bridge path codec", () => {
  it("encodes and decodes bridge paths", () => {
    const path = encodeBridgePath("mem0", "abc123");

    expect(path).toBe("bridge/mem0/abc123");
    expect(decodeBridgePath(path)).toEqual({ source: "mem0", id: "abc123" });
  });

  it("returns null for invalid bridge paths", () => {
    expect(decodeBridgePath("memory/abc")).toBeNull();
    expect(decodeBridgePath("bridge/mem0")).toBeNull();
    expect(decodeBridgePath("bridge/unknown/abc")).toBeNull();
  });
});

describe("remote snippet store", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("expires snippet cache by ttl", () => {
    vi.useFakeTimers();
    const store = createRemoteSnippetStore({ ttlMs: 1_000 });

    store.set("mem0", "abc123", "stored snippet");
    expect(store.get("mem0", "abc123")).toBe("stored snippet");

    vi.advanceTimersByTime(1_001);
    expect(store.get("mem0", "abc123")).toBeNull();
  });

  it("reads snippet by bridge path", () => {
    const store = createRemoteSnippetStore({ ttlMs: 5_000 });

    store.set("graphiti", "t-100", "timeline snippet");
    expect(store.getByPath("bridge/graphiti/t-100")).toBe("timeline snippet");
  });
});
