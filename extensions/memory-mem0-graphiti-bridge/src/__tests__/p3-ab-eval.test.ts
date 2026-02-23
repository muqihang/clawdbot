import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runWritePathAbEvaluation } from "../p3/ab-eval.js";

type MockServerHandle = {
  close: () => Promise<void>;
  url: string;
  requests: Array<{ method: string; path: string; body: unknown }>;
};

async function startMockServer(params: {
  responder: (input: { path: string; method: string; body: unknown }) => {
    status: number;
    payload: unknown;
  };
}): Promise<MockServerHandle> {
  const requests: Array<{ method: string; path: string; body: unknown }> = [];

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const body = raw ? (JSON.parse(raw) as unknown) : null;
      requests.push({
        method: req.method ?? "",
        path: req.url ?? "",
        body,
      });

      const response = params.responder({
        path: req.url ?? "",
        method: req.method ?? "",
        body,
      });

      res.statusCode = response.status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(response.payload));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind mock server");
  }

  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    requests,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

describe("P3 write-path A/B evaluation", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "openclaw-p3-ab-eval-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("produces side-by-side metrics for two models", async () => {
    const report = await runWritePathAbEvaluation({
      mode: "simulated",
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

    expect(report.evaluationMode).toBe("simulated");
    expect(report.dataSource).toBe("local_simulated_estimator");

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

  it("runs real mode through outbox + worker + remote writers", async () => {
    const mem0 = await startMockServer({
      responder: () => ({
        status: 200,
        payload: {
          id: "mem0-ok",
        },
      }),
    });

    const graphiti = await startMockServer({
      responder: () => ({
        status: 202,
        payload: {
          success: true,
        },
      }),
    });

    try {
      const report = await runWritePathAbEvaluation({
        mode: "real",
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
        realOptions: {
          dbPathPrefix: path.join(tempDir, "ab-real"),
          mem0BaseUrl: mem0.url,
          graphitiBaseUrl: graphiti.url,
          timeoutMs: 500,
          mem0Path: "/memories",
          graphitiPath: "/messages",
        },
      });

      expect(report.evaluationMode).toBe("real");
      expect(report.dataSource).toBe("outbox_attempts + proposal_state + audit_counters");
      expect(report.modelA.metrics.p95WriteLatencyMs).toBeGreaterThanOrEqual(0);
      expect(report.modelB.metrics.p95WriteLatencyMs).toBeGreaterThanOrEqual(0);
      expect(mem0.requests.length).toBeGreaterThan(0);
      expect(graphiti.requests.length).toBeGreaterThan(0);
    } finally {
      await mem0.close();
      await graphiti.close();
    }
  });
});
