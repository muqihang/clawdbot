import { describe, expect, it } from "vitest";
import { runWritePathAbEvaluation } from "../p3/ab-eval.js";

describe("P3 write-path A/B evaluation", () => {
  it("produces side-by-side metrics for two models", async () => {
    const report = await runWritePathAbEvaluation({
      modelA: "gpt-5.1-codex-mini",
      modelB: "gpt-5.3-codex",
      validationSet: [
        {
          id: "sample-1",
          user: "my editor is vim",
          assistant: "已记录你偏好 vim",
          expected: {
            extractable: true,
            conflict: false,
            pendingReview: false,
            supersedeCorrect: true,
          },
        },
        {
          id: "sample-2",
          user: "my editor is emacs",
          assistant: "收到，你现在更偏好 emacs",
          expected: {
            extractable: true,
            conflict: true,
            pendingReview: false,
            supersedeCorrect: true,
          },
        },
      ],
    });

    expect(report.modelA.model).toBe("gpt-5.1-codex-mini");
    expect(report.modelB.model).toBe("gpt-5.3-codex");

    expect(report.modelA.metrics).toMatchObject({
      extractionPrecision: expect.any(Number),
      conflictFalsePositiveRate: expect.any(Number),
      pendingReviewRatio: expect.any(Number),
      supersedeCorrectnessRate: expect.any(Number),
      p95WriteLatencyMs: expect.any(Number),
      estimatedCostPer1kChunksUsd: expect.any(Number),
    });

    expect(report.modelB.metrics).toMatchObject({
      extractionPrecision: expect.any(Number),
      conflictFalsePositiveRate: expect.any(Number),
      pendingReviewRatio: expect.any(Number),
      supersedeCorrectnessRate: expect.any(Number),
      p95WriteLatencyMs: expect.any(Number),
      estimatedCostPer1kChunksUsd: expect.any(Number),
    });
  });
});
