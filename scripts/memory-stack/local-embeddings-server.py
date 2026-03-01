#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse


def _tokenize(text: str) -> list[str]:
    # Simple, dependency-free tokenizer:
    # - ASCII word/number runs
    # - Single CJK Unified Ideographs characters
    # This intentionally favors determinism over linguistic completeness.
    pattern = re.compile(r"[A-Za-z0-9]+|[\u4e00-\u9fff]")
    return pattern.findall((text or "").lower())


def _hash_embedding(text: str, dim: int) -> list[float]:
    vec = [0.0] * dim
    tokens = _tokenize(text)
    if not tokens:
        return vec

    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        idx = int.from_bytes(digest[0:4], "big") % dim
        sign = 1.0 if (digest[4] & 1) == 0 else -1.0
        vec[idx] += sign

    norm = math.sqrt(sum(v * v for v in vec))
    if norm > 0:
        vec = [v / norm for v in vec]
    return vec


class EmbeddingsHandler(BaseHTTPRequestHandler):
    server_version = "openclaw-local-embeddings/0.1"

    def _send_json(self, status: int, payload: Any) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path in ("/health", "/healthz", "/v1/health", "/v1/healthz"):
            self._send_json(200, {"status": "ok"})
            return
        self._send_json(404, {"error": {"message": "not found"}})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path not in ("/embeddings", "/v1/embeddings"):
            self._send_json(404, {"error": {"message": "not found"}})
            return

        content_length = int(self.headers.get("content-length", "0") or "0")
        raw = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            req = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._send_json(400, {"error": {"message": "invalid json"}})
            return

        dim = int(getattr(self.server, "embedding_dim", 1536))
        model = req.get("model") or "local-hash-embeddings"
        input_value = req.get("input", "")

        inputs: list[str]
        if isinstance(input_value, str):
            inputs = [input_value]
        elif isinstance(input_value, list):
            inputs = [str(x) for x in input_value]
        else:
            self._send_json(400, {"error": {"message": "invalid input"}})
            return

        data = []
        for idx, text in enumerate(inputs):
            data.append(
                {
                    "object": "embedding",
                    "index": idx,
                    "embedding": _hash_embedding(text, dim),
                }
            )

        self._send_json(
            200,
            {
                "object": "list",
                "data": data,
                "model": model,
                "usage": {"prompt_tokens": 0, "total_tokens": 0},
            },
        )

    def log_message(self, fmt: str, *args: Any) -> None:
        # Keep logs concise and deterministic (no client IP/port spam in evidence).
        sys.stderr.write(f"[local-embeddings] {fmt % args}\n")


def main() -> int:
    host = os.getenv("LOCAL_EMBEDDING_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = int(os.getenv("LOCAL_EMBEDDING_PORT", "18082"))
    dim = int(os.getenv("EMBEDDING_DIM", "1536"))

    httpd = ThreadingHTTPServer((host, port), EmbeddingsHandler)
    httpd.embedding_dim = dim  # type: ignore[attr-defined]
    sys.stderr.write(f"[local-embeddings] listening on http://{host}:{port} dim={dim}\n")
    httpd.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

