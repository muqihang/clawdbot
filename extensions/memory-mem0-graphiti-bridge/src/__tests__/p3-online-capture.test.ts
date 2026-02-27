import { describe, expect, it, vi } from "vitest";
import { createOnlineIncrementalCapture } from "../p3/online-capture.js";

const OC_USER_ID_RE =
  /^ocu_v1:(telegram|whatsapp|discord|irc|googlechat|slack|signal|imessage):[a-z0-9][a-z0-9:_\-.]{0,127}$/;
const OC_THREAD_ID_RE =
  /^oct_v1:(telegram|whatsapp|discord|irc|googlechat|slack|signal|imessage):[a-z0-9][a-z0-9:_\-.]{0,191}$/;
const OC_MESSAGE_ID_RE =
  /^ocm_v1:(telegram|whatsapp|discord|irc|googlechat|slack|signal|imessage):[a-z0-9][a-z0-9:_\-.]{0,191}$/;

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
            oc_user_id: expect.stringMatching(OC_USER_ID_RE),
            oc_thread_id: expect.stringMatching(OC_THREAD_ID_RE),
            oc_message_id: expect.stringMatching(OC_MESSAGE_ID_RE),
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
            oc_user_id: expect.stringMatching(OC_USER_ID_RE),
            oc_thread_id: expect.stringMatching(OC_THREAD_ID_RE),
            oc_message_id: expect.stringMatching(OC_MESSAGE_ID_RE),
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

    const enqueueArg = enqueue.mock.calls[0]?.[0] as
      | {
          payload?: {
            message_envelope?: unknown;
          };
        }
      | undefined;
    expect(enqueueArg?.payload?.message_envelope).toBeUndefined();

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          metadata: expect.objectContaining({
            indexCheckOk: false,
            oc_user_id: expect.stringMatching(OC_USER_ID_RE),
            oc_thread_id: expect.stringMatching(OC_THREAD_ID_RE),
            oc_message_id: expect.stringMatching(OC_MESSAGE_ID_RE),
          }),
        }),
      }),
    );
  });

  it("writes auditable message_envelope minimal fields when enabled", async () => {
    const enqueue = vi.fn();
    const captureOptions = {
      writeMode: "propose_only",
      outbox: { enqueue } as unknown as Parameters<
        typeof createOnlineIncrementalCapture
      >[0]["outbox"],
      effectiveModel: "gpt-5.3-codex",
      now: () => Date.parse("2026-02-24T06:00:00.000Z"),
      messageEnvelope: {
        enabled: true,
        ignoreRoles: ["assistant", "ASSISTANT", " tool ", "invalid"],
      },
    } as unknown as Parameters<typeof createOnlineIncrementalCapture>[0];
    const capture = createOnlineIncrementalCapture(captureOptions);

    await capture.onAgentEnd(buildEvent(), { sessionKey: "slack:direct:u01abc" });

    const enqueueArg = enqueue.mock.calls[0]?.[0] as
      | {
          payload?: {
            message_envelope?: {
              role?: string;
              name?: string;
              created_at?: string;
              metadata?: Record<string, unknown>;
              ignore_roles?: string[];
            };
          };
        }
      | undefined;
    const envelope = enqueueArg?.payload?.message_envelope;
    expect(envelope).toEqual(
      expect.objectContaining({
        role: "user",
        name: expect.stringMatching(OC_USER_ID_RE),
        created_at: "2026-02-24T06:00:00.000Z",
        metadata: expect.objectContaining({
          session_key: "slack:direct:u01abc",
          model: "gpt-5.3-codex",
          source_ref: expect.stringContaining("agent_end:slack:direct:u01abc"),
          oc_user_id: expect.stringMatching(OC_USER_ID_RE),
          oc_thread_id: expect.stringMatching(OC_THREAD_ID_RE),
          oc_message_id: expect.stringMatching(OC_MESSAGE_ID_RE),
        }),
      }),
    );
    expect(envelope?.ignore_roles).toEqual(["assistant", "tool"]);
  });

  it("falls back to telegram channel and request-key seed for unknown session key", async () => {
    const enqueue = vi.fn();
    const capture = createOnlineIncrementalCapture({
      writeMode: "propose_only",
      outbox: { enqueue } as unknown as Parameters<
        typeof createOnlineIncrementalCapture
      >[0]["outbox"],
      effectiveModel: "gpt-5.3-codex",
      now: () => Date.parse("2026-02-24T06:00:00.000Z"),
    });

    await capture.onAgentEnd(buildEvent(), { sessionKey: "mystery-session-42" });

    const enqueueArg = enqueue.mock.calls[0]?.[0] as
      | {
          payload?: {
            metadata?: {
              oc_user_id?: string;
              oc_thread_id?: string;
              oc_message_id?: string;
            };
          };
        }
      | undefined;
    const metadata = enqueueArg?.payload?.metadata;
    expect(metadata?.oc_user_id).toBe("ocu_v1:telegram:mystery-session-42");
    expect(metadata?.oc_thread_id).toBe("oct_v1:telegram:mystery-session-42");
    expect(metadata?.oc_message_id).toMatch(/^ocm_v1:telegram:agent_end:mystery-session-42:2:/);
  });
});
