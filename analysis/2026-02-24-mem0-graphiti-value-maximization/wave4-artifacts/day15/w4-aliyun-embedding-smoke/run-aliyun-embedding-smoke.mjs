import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function readEnvFileValue(filePath, key) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i].trim();
      if (!line || line.startsWith("#")) {
        continue;
      }
      if (!line.startsWith(`${key}=`)) {
        continue;
      }
      return line.slice(`${key}=`.length).trim();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

const outDir = process.argv[2];
if (!outDir) {
  console.error("missing outDir");
  process.exit(2);
}

const dashscopeKey =
  process.env.DASHSCOPE_API_KEY?.trim() ||
  readEnvFileValue(
    path.join(os.homedir(), "chelingxi_workspace", "chelingxi-os", ".env.local"),
    "DASHSCOPE_API_KEY",
  );
const baseUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const model = "text-embedding-v4";

const presence = {
  has_env_DASHSCOPE_API_KEY: Boolean(process.env.DASHSCOPE_API_KEY?.trim()),
  has_file_DASHSCOPE_API_KEY: Boolean(!process.env.DASHSCOPE_API_KEY?.trim() && dashscopeKey),
  baseUrl,
  model,
};
fs.writeFileSync(path.join(outDir, "key-presence.json"), JSON.stringify(presence, null, 2));

if (!dashscopeKey) {
  fs.writeFileSync(
    path.join(outDir, "smoke.error.txt"),
    "Missing DASHSCOPE_API_KEY (env or ~/chelingxi_workspace/chelingxi-os/.env.local)",
  );
  process.exit(1);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 15_000);
let res;
let json;
try {
  res = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${dashscopeKey}`,
    },
    body: JSON.stringify({ model, input: "embedding smoke test: openclaw gate4" }),
    signal: controller.signal,
  });
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
} catch (err) {
  fs.writeFileSync(path.join(outDir, "smoke.error.txt"), String(err));
  process.exit(1);
} finally {
  clearTimeout(timeout);
}

const embedding = json?.data?.[0]?.embedding;
const dims = Array.isArray(embedding) ? embedding.length : null;
const sample = Array.isArray(embedding) ? embedding.slice(0, 5) : null;

const out = {
  ok: res.ok,
  status: res.status,
  dims,
  sample,
  model: json?.model ?? model,
  error: res.ok ? null : json,
};
fs.writeFileSync(path.join(outDir, "smoke.result.json"), JSON.stringify(out, null, 2));
process.exit(res.ok ? 0 : 1);
