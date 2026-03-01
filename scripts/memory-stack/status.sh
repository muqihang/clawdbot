#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

print_service() {
  local name="$1"
  local port="$2"
  local health_url="$3"
  local pid_file
  pid_file="$(pid_file_for "$name")"

  local pid=""
  local alive="no"
  if [[ -f "$pid_file" ]]; then
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && is_pid_alive "$pid"; then
      alive="yes"
    fi
  fi

  local health="down"
  if curl -fsS "$health_url" >/dev/null 2>&1; then
    health="ok"
  fi

  if [[ "$alive" == "no" ]] && [[ "$health" == "ok" ]]; then
    alive="yes"
  fi

  printf '%-10s pid=%-8s alive=%-3s port=%-5s health=%s\n' "$name" "${pid:-n/a}" "$alive" "$port" "$health"
}

print_service "graphiti" "$GRAPHITI_PORT" "http://127.0.0.1:${GRAPHITI_PORT}/healthcheck"
print_service "mem0" "$MEM0_PORT" "http://127.0.0.1:${MEM0_PORT}/docs"
print_service "embeddings" "$LOCAL_EMBEDDING_PORT" "http://127.0.0.1:${LOCAL_EMBEDDING_PORT}/healthz"
