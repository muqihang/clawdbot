import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const repoRoot = process.cwd();
const sourceDir = path.join(
  repoRoot,
  "analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/retrieval/bounded-01/graphiti",
);
const port = Number.parseInt(process.env.MOCK_GRAPHITI_PORT ?? "18000", 10) || 18000;

const toJson = (value) => `${JSON.stringify(value)}\n`;

const loadPayloadMap = async () => {
  const files = await readdir(sourceDir);
  const payloadByQuery = new Map();

  for (const fileName of files) {
    if (!fileName.startsWith("search.raw.") || !fileName.endsWith(".json")) {
      continue;
    }

    const filePath = path.join(sourceDir, fileName);
    const parsed = JSON.parse(await readFile(filePath, "utf8"));

    const query = typeof parsed?.query === "string" ? parsed.query : "";
    if (!query || payloadByQuery.has(query)) {
      continue;
    }

    payloadByQuery.set(query, parsed?.payload ?? { facts: [], episodes: [], nodes: [] });
  }

  return payloadByQuery;
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return null;
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const payloadByQuery = await loadPayloadMap();

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/openapi.json") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      toJson({
        openapi: "3.1.0",
        info: { title: "graphiti-replay-mock", version: "1.0.0" },
      }),
    );
    return;
  }

  if (req.method === "POST" && req.url === "/search") {
    const body = await readBody(req);
    const query = typeof body?.query === "string" ? body.query : "";
    const payload = payloadByQuery.get(query) ?? { facts: [], episodes: [], nodes: [] };

    res.writeHead(200, { "content-type": "application/json" });
    res.end(toJson(payload));
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/entity-edge/")) {
    const uuid = decodeURIComponent(req.url.slice("/entity-edge/".length));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(toJson({ uuid, fact: "" }));
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(toJson({ error: "not found" }));
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `mock_graphiti_replay listening on 127.0.0.1:${port}, queries=${payloadByQuery.size}\n`,
  );
});

const shutdown = () => {
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
