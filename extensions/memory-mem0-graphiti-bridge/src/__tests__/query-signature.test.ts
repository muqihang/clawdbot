import { describe, expect, it } from "vitest";
import { resolveQuerySignature } from "../router/query-signature.js";

describe("mem0-graphiti query signature", () => {
  it("detects precision-key signatures deterministically", () => {
    const cases = [
      { query: "/memories", kind: "endpoint_path", value: "/memories" },
      { query: "commit deadbeef", kind: "commit_sha", value: "deadbeef" },
      { query: "OC-1234", kind: "ticket_id", value: "OC-1234" },
      { query: "HTTP 404", kind: "error_code", value: "404" },
      { query: "-1001234567890", kind: "group_id", value: "-1001234567890" },
    ] as const;

    for (const item of cases) {
      const first = resolveQuerySignature(item.query);
      const second = resolveQuerySignature(item.query);

      expect(first).toEqual(second);
      expect(first.precisionKey).toEqual(
        expect.objectContaining({
          kind: item.kind,
          value: item.value,
        }),
      );
    }
  });
});

