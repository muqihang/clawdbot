import { describe, expect, it, vi } from "vitest";
import { createOnlineIncrementalCapture } from "../p3/online-capture.js";

describe("createOnlineIncrementalCapture", () => {
  const buildEvent = () => ({
    success: true,
    messages: [
      { role: "user", content: "my editor is vim" },
      { role: "assistant", content: "Noted" },
    ],
  });

  it("writes metadata.indexCheckOk=true when provider passes", async () => {
    const enqueue = vi.fn();
    const provider = vi.fn(async () => true);
    const capture = createOnlineIncrementalCapture({
      writeMode: "propose_only",
      outbox: { enqueue } as unknown as Parameters<
        typeof createOnlineIncrementalCapture
      >[0]["outbox"],
      effectiveModel: "gpt-5.3-codex",
      indexCheckProvider: provider,
      now: () => Date.parse("2026-02-24T06:00:00.000Z"),
    });

    await capture.onAgentEnd(buildEvent(), { sessionKey: "session-1" });

    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "session-1",
        sourceRef: expect.stringContaining("agent_end:session-1"),
      }),
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          metadata: expect.objectContaining({
            indexCheckOk: true,
          }),
        }),
      }),
    );
  });

  it("fails closed when provider throws", async () => {
    const enqueue = vi.fn();
    const capture = createOnlineIncrementalCapture({
      writeMode: "propose_only",
      outbox: { enqueue } as unknown as Parameters<
        typeof createOnlineIncrementalCapture
      >[0]["outbox"],
      effectiveModel: "gpt-5.3-codex",
      indexCheckProvider: vi.fn(async () => {
        throw new Error("index-check exploded");
      }),
      now: () => Date.parse("2026-02-24T06:00:00.000Z"),
    });

    await capture.onAgentEnd(buildEvent(), { sessionKey: "session-2" });

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          metadata: expect.objectContaining({
            indexCheckOk: false,
          }),
        }),
      }),
    );
  });

  it("defaults indexCheckOk=false when provider is absent", async () => {
    const enqueue = vi.fn();
    const capture = createOnlineIncrementalCapture({
      writeMode: "propose_only",
      outbox: { enqueue } as unknown as Parameters<
        typeof createOnlineIncrementalCapture
      >[0]["outbox"],
      effectiveModel: "gpt-5.3-codex",
      now: () => Date.parse("2026-02-24T06:00:00.000Z"),
    });

    await capture.onAgentEnd(buildEvent(), { sessionKey: "session-3" });

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          metadata: expect.objectContaining({
            indexCheckOk: false,
          }),
        }),
      }),
    );
  });
});
